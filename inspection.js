/* BEM Incoming Inspection System - inspection.js
   Receipt entry, inspection entry (dimensional / visual / other), photographs,
   Quality Head review and final decision, automatic NCR creation. */
'use strict';

let INSP = null;                     /* inspection currently open on the inspection screen */
let INSP_CTX = { instruments: [], defects: [], plan: null, photos: {} };
let inspSaveTimer = null;

/* ================= Calculation logic ================= */

/* LSL = nominal + lower tolerance, USL = nominal + upper tolerance */
function limits(r) {
  const dec = Math.max(2, decs(r.nominal), decs(r.lowTol), decs(r.upTol));
  const nom = Number(r.nominal), lt = Number(r.lowTol), ut = Number(r.upTol);
  const lslS = (nom + lt).toFixed(dec), uslS = (nom + ut).toFixed(dec);
  return { lsl: Number(lslS), usl: Number(uslS), lslS, uslS, dec };
}
/* '' = not entered, 'INVALID' = not a number, otherwise OK / NOK */
function evalSample(v, L) {
  if (v === '' || v === null || v === undefined) return '';
  if (!isNum(v)) return 'INVALID';
  const n = Number(Number(v).toFixed(L.dec + 3));
  return n >= L.lsl && n <= L.usl ? 'OK' : 'NOK';
}
/* Automatic characteristic result. The inspector cannot override it. */
function computeDim(r) {
  const L = limits(r);
  const res = r.samples.map(v => evalSample(v, L));
  if (res.includes('NOK')) r.result = 'NOK';
  else if (res.length && res.every(x => x === 'OK')) r.result = 'OK';
  else r.result = '';
  return res;
}
function isCriticalNok(r) {
  return r.result === 'NOK' && (r.cls === 'Critical' || (r.type === 'Visual' && r.def && r.def.severity === 'Critical'));
}
function instrumentExpired(inst) {
  return !inst.calDue || inst.calDue < todayISO() || (inst.status && inst.status !== 'Active');
}
function instMatches(inst, name) {
  const a = String(inst.name || '').toLowerCase(), b = String(name || '').toLowerCase();
  return !!a && !!b && (a.includes(b) || b.includes(a));
}
function defectCategory(r) {
  if (r.type === 'Dimensional') return 'Out of tolerance';
  if (r.type === 'Visual') return r.finding === 'Other defect' ? (r.otherName || 'Other defect') : (r.finding || 'Visual defect');
  if (r.finding === 'Other defect') return r.otherName || 'Other defect';
  return r.finding || `${r.type} NOK`;
}
function defectSeverity(r) { return r.type === 'Visual' ? (r.def.severity || r.cls) : r.cls; }
function defectDescription(r) {
  if (r.type === 'Visual') return [defectCategory(r), r.def.location ? `Location: ${r.def.location}` : '', r.def.remark].filter(Boolean).join('. ');
  return r.def.desc;
}
function specText(r) { return r.type === 'Dimensional' ? (r.spec || `${r.nominal} ${r.unit}`.trim()) : (r.spec || ''); }
function tolText(r) {
  if (r.type !== 'Dimensional') return '—';
  const L = limits(r);
  return `${fmtTol(r.lowTol)} / ${fmtTol(r.upTol)} ${r.unit} (${L.lslS} to ${L.uslS})`;
}
function observedText(r) {
  if (r.type === 'Dimensional') {
    const L = limits(r);
    const vals = r.samples.filter(v => v !== '').map(v => (evalSample(v, L) === 'NOK' ? `${v} (NOK)` : v));
    return vals.length ? vals.join(', ') + (r.unit ? ' ' + r.unit : '') : '';
  }
  if (r.result === 'NA') return 'Not applicable';
  if (r.result === 'NOK') return [defectCategory(r), r.def.location ? 'at ' + r.def.location : '', r.observation].filter(Boolean).join(' – ');
  if (r.result === 'OK') return r.observation || 'Conforming';
  return '';
}
function resultRemarks(r) {
  const p = [];
  if (r.type === 'Dimensional' && r.instrumentId) p.push('Instrument ' + r.instrumentId + (r.instOverride ? ' (expired – QH override)' : ''));
  if (r.result === 'NA' && r.observation) p.push(r.observation);
  if (r.result === 'NOK') p.push(r.def.remark || r.def.desc || '');
  if (r.deviation) p.push(`Deviation approved by ${r.deviation.by}: ${r.deviation.reason}`);
  return p.filter(Boolean).join('; ');
}
function photoDefaultCaption(r) {
  return `${r.name}: ${r.type === 'Dimensional' ? 'Out of tolerance' : defectCategory(r)}`;
}
function isCompletedLot(i) { return !['Draft', 'Pending Inspection', 'Inspection in Progress'].includes(i.status); }
function defectChoices(type, current) {
  const list = INSP_CTX.defects.filter(d => d.type === type).map(d => d.name);
  if (type === 'Visual' && !list.includes('Other defect')) list.push('Other defect');
  if (type !== 'Visual' && list.length && !list.includes('Other defect')) list.push('Other defect');
  if (current && !list.includes(current)) list.push(current);
  return list;
}

/* ================= Receipt ================= */

function validateReceipt(d) {
  const e = [];
  if (!d.receiptDate) e.push('Enter the receipt date and time.');
  if (!d.supplierCode) e.push('Select the supplier.');
  if (!d.partNo) e.push('Select the part number.');
  if (!d.partName) e.push('Enter the part name.');
  if (!d.category) e.push('Select the part category.');
  if (!d.poNo) e.push('Enter the purchase order number.');
  if (!d.invoiceNo) e.push('Enter the invoice or challan number.');
  if (!isNum(d.qtyReceived) || Number(d.qtyReceived) <= 0) e.push('Quantity received must be a number greater than zero.');
  if (!d.uom) e.push('Select the unit of measurement.');
  if (!d.vehicleType) e.push('Select the vehicle type (EV, LNG or Common).');
  if (!d.inspectorName) e.push('Enter the inspector name.');
  return e;
}
function validateReceiptDraft(d) {
  const e = [];
  if (d.qtyReceived && (!isNum(d.qtyReceived) || Number(d.qtyReceived) <= 0)) e.push('Quantity received must be a number greater than zero.');
  return e;
}

async function renderReceipt(m) {
  const no = m && m[1] && m[1] !== 'new' ? decodeURIComponent(m[1]) : null;
  let insp = null;
  if (no) {
    insp = await DB.get('inspections', no);
    if (!insp) { view(notFoundHtml('Inspection ' + no)); return; }
    if (!['Draft', 'Pending Inspection'].includes(insp.status)) { redirect('#/view/' + enc(no)); return; }
  }
  const [suppliers, parts, plans, inspectors, catsSaved] = await Promise.all([
    DB.getAll('suppliers'), DB.getAll('parts'), DB.getAll('plans'), DB.getAll('inspectors'), DB.getSetting('categories', DEFAULT_CATEGORIES)
  ]);
  const planMap = {};
  plans.forEach(p => { planMap[p.partNo] = p; });
  const r = insp || { receiptDate: nowLocalInput(), inspectorName: App.role === 'INSPECTOR' ? App.user : '', uom: 'Nos', vehicleType: '', category: '' };
  const cats = catsSaved.slice();
  if (r.category && !cats.includes(r.category)) cats.push(r.category);
  const shownNo = insp ? insp.inspNo : await DB.peekNumber('IQC', 'inspections');
  const sups = suppliers.filter(s => !['Inactive', 'Blocked'].includes(s.status) || s.code === r.supplierCode).sort((a, b) => a.name.localeCompare(b.name));
  const partList = parts.slice().sort((a, b) => a.partNo.localeCompare(b.partNo));

  view(`<h2>${insp ? 'Edit Receipt' : 'New Receipt'}</h2>
  <form id="rcpt" class="card" novalidate autocomplete="off">
    ${fld('Inspection number', `<input class="ro" value="${esc(shownNo)}" readonly>`, insp ? '' : 'The number is confirmed when the receipt is saved.')}
    ${fld('Receipt date and time *', `<input type="datetime-local" name="receiptDate" value="${esc(r.receiptDate)}">`, 'Captured automatically. Change it if the material arrived earlier.')}
    ${fld('Supplier name *', `<select name="supplierCode">${opts(sups.map(s => ({ value: s.code, label: s.name })), r.supplierCode, '— Select supplier —')}</select>`)}
    ${fld('Supplier code', `<input name="supplierCodeShow" class="ro" readonly value="${esc(r.supplierCode || '')}">`)}
    ${fld('Part number *', `<select name="partNo">${opts(partList.map(p => ({ value: p.partNo, label: `${p.partNo} – ${p.partName}` })), r.partNo, '— Select part number —')}</select>`)}
    <div id="planInfo"></div>
    ${fld('Part name *', `<input name="partName" value="${esc(r.partName || '')}">`)}
    ${fld('Part category *', `<select name="category">${opts(cats, r.category, '— Select category —')}</select>`)}
    ${fld('Purchase order number *', `<input name="poNo" value="${esc(r.poNo || '')}">`)}
    ${fld('Invoice or challan number *', `<input name="invoiceNo" value="${esc(r.invoiceNo || '')}">`)}
    ${fld('Supplier batch number', `<input name="batchNo" value="${esc(r.batchNo || '')}">`)}
    <div class="grid2">
      ${fld('Quantity received *', `<input name="qtyReceived" inputmode="decimal" value="${esc(r.qtyReceived || '')}">`)}
      ${fld('Unit *', `<select name="uom">${opts(UOMS, r.uom)}</select>`)}
    </div>
    <div class="grid2">
      ${fld('Drawing number', `<input name="drawingNo" value="${esc(r.drawingNo || '')}">`)}
      ${fld('Drawing revision', `<input name="drawingRev" value="${esc(r.drawingRev || '')}">`)}
    </div>
    ${fld('Vehicle type *', `<select name="vehicleType">${opts(VEHICLE_TYPES, r.vehicleType, '— Select —')}</select>`)}
    ${fld('Inspector name *', `<input name="inspectorName" list="inspList" value="${esc(r.inspectorName || '')}"><datalist id="inspList">${inspectors.filter(x => x.active !== 'Inactive').map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>`)}
    ${fld('Storage or hold location', `<input name="location" value="${esc(r.location || '')}" placeholder="e.g. IQC hold rack 2">`)}
    ${fld('Remarks', `<textarea name="remarks" rows="2">${esc(r.remarks || '')}</textarea>`)}
  </form>
  <div class="btn-bar">
    <button type="button" class="btn" id="bDraft">Save Draft</button>
    <button type="button" class="btn primary" id="bSave">Save Receipt</button>
    <button type="button" class="btn primary" id="bStart">Save and Start Inspection</button>
  </div>`);

  const f = $('#rcpt');
  const showPlan = () => {
    const pn = f.partNo.value;
    const p = planMap[pn];
    $('#planInfo').innerHTML = !pn ? '' : (p && p.chars && p.chars.length
      ? `<div class="alert green"><b>Inspection plan loaded: ${p.chars.length} characteristics</b><ul class="plan-mini">${p.chars.map(c => `<li>${esc(c.sn)}. ${esc(c.name)} <span class="muted">(${esc(c.type)}, ${esc(c.cls)})</span></li>`).join('')}</ul></div>`
      : `<div class="alert red">No inspection plan is saved for this part. The Quality Head must create it in Masters → Inspection Plans before the inspection can start.</div>`);
  };
  f.supplierCode.addEventListener('change', () => { f.supplierCodeShow.value = f.supplierCode.value; });
  f.partNo.addEventListener('change', () => {
    const p = parts.find(x => x.partNo === f.partNo.value);
    if (p) {
      f.partName.value = p.partName || '';
      if (p.category && !$$('option', f.category).some(o => o.value === p.category)) f.category.insertAdjacentHTML('beforeend', `<option value="${esc(p.category)}">${esc(p.category)}</option>`);
      f.category.value = p.category || '';
      f.drawingNo.value = p.drawingNo || '';
      f.drawingRev.value = p.drawingRev || '';
      f.vehicleType.value = p.vehicleType || '';
      if (p.supplierCode && sups.some(s => s.code === p.supplierCode)) {
        f.supplierCode.value = p.supplierCode;
        f.supplierCodeShow.value = p.supplierCode;
      }
    }
    showPlan();
  });
  showPlan();

  const read = () => {
    const d = {};
    ['receiptDate', 'supplierCode', 'partNo', 'partName', 'category', 'poNo', 'invoiceNo', 'batchNo', 'qtyReceived', 'uom', 'drawingNo', 'drawingRev', 'vehicleType', 'inspectorName', 'location', 'remarks']
      .forEach(k => { d[k] = String(f.elements[k].value || '').trim(); });
    const s = suppliers.find(x => x.code === d.supplierCode);
    d.supplierName = s ? s.name : '';
    return d;
  };
  let busy = false;
  const save = async mode => {
    if (busy) return;
    const d = read();
    const errs = mode === 'draft' ? validateReceiptDraft(d) : validateReceipt(d);
    if (mode === 'start' && !errs.length && !(planMap[d.partNo] && planMap[d.partNo].chars.length)) {
      errs.push('No inspection plan is saved for this part number. Press "Save Receipt" and ask the Quality Head to create the plan.');
    }
    if (errs.length) { UI.errors(errs); return; }
    busy = true;
    try {
      let rec = insp;
      if (!rec) rec = { inspNo: await DB.nextNumber('IQC', 'inspections'), createdAt: nowStamp(), createdBy: App.user, results: [], history: [] };
      Object.assign(rec, d);
      rec.status = mode === 'draft' ? 'Draft' : 'Pending Inspection';
      rec.history = rec.history || [];
      rec.history.push({ at: nowStamp(), by: App.user, text: mode === 'draft' ? 'Receipt saved as draft' : 'Receipt saved' });
      await DB.put('inspections', rec);
      UI.toast(`Saved ${rec.inspNo}`, 'ok');
      go(mode === 'start' ? '#/inspect/' + enc(rec.inspNo) : '#/pending');
    } finally { busy = false; }
  };
  $('#bDraft').onclick = () => save('draft');
  $('#bSave').onclick = () => save('save');
  $('#bStart').onclick = () => save('start');
}

/* ================= Lists ================= */

function lotCardHtml(i, href, actionLabel) {
  return `<a class="lot-card" href="${href}">
    <div class="lc-top"><b>${esc(i.inspNo)}</b>${statusBadge(i.status)}</div>
    <div class="lc-line">${esc(i.partNo || '—')} · ${esc(i.partName || '')}</div>
    <div class="lc-line muted">${esc(i.supplierName || '—')} · Qty ${esc(i.qtyReceived || '—')} ${esc(i.uom || '')} · ${fmtDateTime(i.receiptDate)}</div>
    ${i.ncrNo ? `<div class="lc-line t-nok">${esc(i.ncrNo)}</div>` : ''}
    ${actionLabel ? `<div class="lc-act">${esc(actionLabel)} ›</div>` : ''}
  </a>`;
}

async function renderPending() {
  const all = (await DB.getAll('inspections')).sort((a, b) => String(b.receiptDate).localeCompare(String(a.receiptDate)));
  const groups = [
    ['Draft', 'Drafts (receipt not complete)', 'Complete receipt', i => '#/receipt/' + enc(i.inspNo)],
    ['Pending Inspection', 'Waiting for inspection', 'Start inspection', i => '#/inspect/' + enc(i.inspNo)],
    ['Inspection in Progress', 'Inspection in progress', 'Continue inspection', i => '#/inspect/' + enc(i.inspNo)],
    ['Pending Quality Head Review', 'Waiting for Quality Head review', App.role === 'QH' ? 'Review and decide' : 'View', i => '#/view/' + enc(i.inspNo)]
  ];
  view(`<h2>Pending Inspections</h2>
    ${groups.map(([st, title, act, href]) => {
      const list = all.filter(i => i.status === st);
      return `<h3>${esc(title)} (${list.length})</h3>${list.length ? list.map(i => lotCardHtml(i, href(i), act)).join('') : '<p class="muted">None</p>'}`;
    }).join('')}
    <a class="btn primary block" href="#/receipt/new">+ New Receipt</a>`);
}

async function renderStart() {
  const all = (await DB.getAll('inspections')).filter(i => ['Pending Inspection', 'Inspection in Progress'].includes(i.status))
    .sort((a, b) => String(a.receiptDate).localeCompare(String(b.receiptDate)));
  view(`<h2>Start Inspection</h2>
    <div class="card">${fld('Inspection number', '<input id="stNo" placeholder="BEM-IQC-YYYYMM-0001" autocapitalize="characters">')}
      <button type="button" class="btn primary block" id="stGo">Open</button></div>
    <h3>Lots ready for inspection (${all.length})</h3>
    ${all.length ? all.map(i => lotCardHtml(i, '#/inspect/' + enc(i.inspNo), i.status === 'Inspection in Progress' ? 'Continue inspection' : 'Start inspection')).join('') : '<p class="muted">No lots are waiting. Create a New Receipt first.</p>'}
    <a class="btn block" href="#/receipt/new">+ New Receipt</a>`);
  $('#stGo').onclick = async () => {
    const no = $('#stNo').value.trim().toUpperCase();
    if (!no) { UI.alert('Enter the inspection number.'); return; }
    const insp = await DB.get('inspections', no);
    if (!insp) { UI.alert(`Inspection ${no} was not found.`); return; }
    go((['Draft'].includes(insp.status) ? '#/receipt/' : ['Pending Inspection', 'Inspection in Progress'].includes(insp.status) ? '#/inspect/' : '#/view/') + enc(no));
  };
}

/* ================= Inspection entry ================= */

function newResult(c) {
  const n = Math.max(1, parseInt(c.sampleSize, 10) || 1);
  return {
    sn: c.sn, type: c.type, name: c.name, spec: c.spec || '', nominal: c.nominal === undefined ? '' : String(c.nominal),
    lowTol: c.lowTol === undefined ? '' : String(c.lowTol), upTol: c.upTol === undefined ? '' : String(c.upTol), unit: c.unit || '',
    method: c.method || '', instrument: c.instrument || '', sampleSize: n, cls: c.cls || 'Major', refNote: c.refNote || '',
    samples: c.type === 'Dimensional' ? Array(n).fill('') : [], result: '', finding: '', otherName: '', observation: '',
    def: { desc: '', qty: '', cause: '', action: '', location: '', severity: c.cls || 'Major', remark: '' },
    photos: [], obsSaved: false, instrumentId: '', instOverride: null, deviation: null
  };
}

/* Loads the saved plan into the lot (snapshot) and sets status to Inspection in Progress */
async function prepareInspection(insp) {
  if (insp.status === 'Draft') {
    const errs = validateReceipt(insp);
    if (errs.length) return 'Complete the receipt before starting the inspection:\n• ' + errs.join('\n• ');
  }
  if (!insp.results || !insp.results.length) {
    const plan = await DB.get('plans', insp.partNo);
    if (!plan || !plan.chars || !plan.chars.length) return `No inspection plan is saved for part number ${insp.partNo}. Ask the Quality Head to create it in Masters → Inspection Plans.`;
    insp.results = plan.chars.map(newResult);
    const maxSample = Math.max(...insp.results.map(r => r.sampleSize));
    if (!insp.qtyInspected) insp.qtyInspected = String(Math.min(Number(insp.qtyReceived) || maxSample, maxSample));
    if (!insp.qtyRejected) insp.qtyRejected = '0';
  }
  insp.status = 'Inspection in Progress';
  insp.startedAt = insp.startedAt || nowStamp();
  insp.history = insp.history || [];
  insp.history.push({ at: nowStamp(), by: App.user, text: 'Inspection started' });
  await DB.put('inspections', insp);
  return '';
}

function scheduleInspSave() {
  clearTimeout(inspSaveTimer);
  inspSaveTimer = setTimeout(saveInspNow, 500);
}
async function saveInspNow() {
  clearTimeout(inspSaveTimer);
  inspSaveTimer = null;
  if (!INSP) return;
  INSP.updatedAt = nowStamp();
  await DB.put('inspections', INSP);
}
async function flushInspSave() { if (inspSaveTimer) await saveInspNow(); }

async function renderInspect(m) {
  const no = decodeURIComponent(m[1]);
  const insp = await DB.get('inspections', no);
  if (!insp) { view(notFoundHtml('Inspection ' + no)); return; }
  if (['Draft', 'Pending Inspection'].includes(insp.status)) {
    const err = await prepareInspection(insp);
    if (err) {
      view(`<div class="card"><div class="alert red pre">${esc(err)}</div><a class="btn block" href="#/${insp.status === 'Draft' ? 'receipt' : 'view'}/${enc(no)}">Back</a></div>`);
      return;
    }
  } else if (insp.status !== 'Inspection in Progress') { redirect('#/view/' + enc(no)); return; }

  INSP = insp;
  const [instruments, defects, plan, photos] = await Promise.all([DB.getAll('instruments'), DB.getAll('defects'), DB.get('plans', insp.partNo), DB.byIndex('photos', 'inspNo', no)]);
  const pmap = {};
  photos.forEach(p => { pmap[p.id] = p; });
  INSP_CTX = { instruments: instruments.sort((a, b) => a.id.localeCompare(b.id)), defects: defects.filter(d => d.active !== 'Inactive'), plan, photos: pmap };

  view(`<div class="card lot-head">
      <div class="lc-top"><b>${esc(insp.inspNo)}</b>${statusBadge(insp.status)}</div>
      <div><b>${esc(insp.partNo)}</b> – ${esc(insp.partName)}</div>
      <div class="muted small">${esc(insp.supplierName)} · PO ${esc(insp.poNo)} · Invoice ${esc(insp.invoiceNo)} · Batch ${esc(insp.batchNo || '—')}</div>
      <div class="muted small">Received: <b>${esc(insp.qtyReceived)} ${esc(insp.uom)}</b> · Drawing ${esc(insp.drawingNo || '—')} Rev ${esc(insp.drawingRev || '—')}</div>
    </div>
    <div class="card grid2">
      ${fld('Quantity inspected *', `<input id="qtyInsp" inputmode="decimal" value="${esc(insp.qtyInspected)}">`)}
      ${fld('Quantity rejected', `<input id="qtyRej" inputmode="decimal" value="${esc(insp.qtyRejected)}">`)}
    </div>
    <div id="lotAlert"></div>
    <div id="chars">${insp.results.map((r, i) => charCardHtml(r, i)).join('')}</div>
    <div class="btn-bar">
      <button type="button" class="btn" id="bSaveDraft">Save Draft</button>
      <button type="button" class="btn primary" id="bComplete">Complete Inspection</button>
    </div>`);

  const chars = $('#chars');
  chars.addEventListener('input', onCharEdit);
  chars.addEventListener('change', onCharEdit);
  chars.addEventListener('click', onCharClick);
  $('#qtyInsp').addEventListener('input', e => { INSP.qtyInspected = e.target.value.trim(); scheduleInspSave(); });
  $('#qtyRej').addEventListener('input', e => { INSP.qtyRejected = e.target.value.trim(); scheduleInspSave(); });
  $('#bSaveDraft').onclick = async () => { await saveInspNow(); UI.toast('Inspection saved as draft', 'ok'); };
  $('#bComplete').onclick = completeInspection;
  insp.results.forEach((r, i) => { updateCard(i); renderPhotos(i); });
  updateLotAlert();
}

function charCardHtml(r, i) {
  const isDim = r.type === 'Dimensional', isVis = r.type === 'Visual';
  const planChar = INSP_CTX.plan && INSP_CTX.plan.chars ? INSP_CTX.plan.chars.find(c => String(c.sn) === String(r.sn)) : null;
  const hasRef = planChar && planChar.refPhoto;
  let body;
  if (isDim) {
    const L = limits(r);
    const ins = INSP_CTX.instruments;
    const matching = ins.filter(x => instMatches(x, r.instrument));
    const others = ins.filter(x => !instMatches(x, r.instrument));
    const io = x => `<option value="${esc(x.id)}"${x.id === r.instrumentId ? ' selected' : ''}>${esc(x.id)} – ${esc(x.name)} ${esc(x.range || '')}${instrumentExpired(x) ? ' (CALIBRATION EXPIRED)' : ''}</option>`;
    body = `<div class="spec-grid">
        <div><span>Specification</span><b>${esc(specText(r))}</b></div>
        <div><span>Lower tolerance</span><b>${esc(fmtTol(r.lowTol))}</b></div>
        <div><span>Upper tolerance</span><b>${esc(fmtTol(r.upTol))}</b></div>
        <div><span>Lower spec. limit</span><b>${L.lslS}</b></div>
        <div><span>Upper spec. limit</span><b>${L.uslS}</b></div>
        <div><span>Unit</span><b>${esc(r.unit || '—')}</b></div>
      </div>
      <div class="range">Acceptable range: <b>${L.lslS} to ${L.uslS} ${esc(r.unit)}</b></div>
      <div class="muted small mt">Measuring instrument: <b>${esc(r.instrument || '—')}</b> · Method: ${esc(r.method || '—')} · Sample size: ${r.sampleSize}</div>
      ${ins.length ? fld('Instrument used (ID) *', `<select data-f="instrumentId"><option value="">— Select instrument —</option>${matching.length ? `<optgroup label="${esc(r.instrument || 'Matching')}">${matching.map(io).join('')}</optgroup>` : ''}${others.length ? `<optgroup label="Other instruments">${others.map(io).join('')}</optgroup>` : ''}</select>`) : ''}
      <div id="instwarn-${i}"></div>
      <div class="samples">${r.samples.map((v, k) => `<div class="sample-row"><span class="s-lbl">Sample ${k + 1}</span><input data-s="${k}" inputmode="decimal" autocomplete="off" placeholder="Actual ${esc(r.unit)}" value="${esc(v)}"><span class="sres" id="sres-${i}-${k}"></span></div>`).join('')}</div>`;
  } else {
    body = `<div class="spec-line"><span class="muted">Requirement:</span> <b>${esc(r.spec || '—')}</b></div>
      <div class="muted small">Method: ${esc(r.method || '—')} · Instrument: ${esc(r.instrument || '—')} · Sample size: ${r.sampleSize}</div>
      <div class="seg">
        <button type="button" class="seg-btn" data-res="OK">OK</button>
        <button type="button" class="seg-btn" data-res="NOK">NOK</button>
        <button type="button" class="seg-btn" data-res="NA">Not Applicable</button>
      </div>
      ${isVis ? fld('Defect found (selecting a defect sets the result to NOK)', `<select data-f="finding">${opts(defectChoices('Visual', r.finding), r.finding, '— No defect —')}</select>`) : ''}
      ${fld('Observation / actual condition', `<input data-f="observation" value="${esc(r.observation)}" placeholder="${isVis ? 'Optional' : 'What was observed'}">`, 'Required as the reason when Not Applicable is selected.')}`;
  }
  const otherChoices = !isDim && !isVis ? defectChoices(r.type, r.finding) : [];
  const nok = `<div class="nok-panel" id="nok-${i}" hidden>
      <div class="nok-title">NOK observation – mandatory details</div>
      ${isVis ? `<div id="other-${i}" hidden>${fld('Defect name (for Other defect) *', `<input data-f="otherName" value="${esc(r.otherName)}">`)}</div>
        ${fld('Defect location *', `<input data-d="location" value="${esc(r.def.location)}" placeholder="e.g. Left flange near hole 2">`)}`
      : `${otherChoices.length ? fld('Defect type', `<select data-f="finding">${opts(otherChoices, r.finding, '— Select —')}</select>`) : ''}
        <div id="other-${i}" hidden>${fld('Defect name (for Other defect)', `<input data-f="otherName" value="${esc(r.otherName)}">`)}</div>
        ${fld('Defect description *', `<textarea data-d="desc" rows="2">${esc(r.def.desc)}</textarea>`)}`}
      ${fld('Defect quantity *', `<input data-d="qty" inputmode="decimal" value="${esc(r.def.qty)}">`)}
      ${isVis ? fld('Defect severity *', `<select data-d="severity">${opts(CLASSIFICATIONS, r.def.severity)}</select>`) : `<div class="muted small">Classification: <b>${esc(r.cls)}</b></div>`}
      ${fld('Suspected cause (optional)', `<input data-d="cause" value="${esc(r.def.cause)}">`)}
      ${fld(isVis ? 'Immediate action' : 'Immediate action *', `<input data-d="action" value="${esc(r.def.action)}" placeholder="e.g. Lot segregated and tagged HOLD">`)}
      ${fld(isVis ? 'Short remark *' : 'Remark', `<input data-d="remark" value="${esc(r.def.remark)}">`)}
      <div class="photos" id="photos-${i}"></div>
      <button type="button" class="btn primary block" data-act="saveobs">Save Observation</button>
      <div class="obs-state" id="obs-${i}"></div>
    </div>`;
  return `<div class="char-card" id="char-${i}" data-idx="${i}">
    <div class="char-head"><span class="sn">${esc(r.sn)}</span><div class="ch-name"><b>${esc(r.name)}</b><div class="ch-tags"><span class="tag">${esc(r.type)}</span> ${clsBadge(r.cls)}</div></div><span class="res-badge b-pending" id="res-${i}">PENDING</span></div>
    <div class="crit-banner" id="crit-${i}" hidden>CRITICAL DEFECT</div>
    ${r.refNote ? `<div class="ref-note">Work instruction: ${esc(r.refNote)}</div>` : ''}
    ${hasRef ? '<button type="button" class="btn small" data-act="refphoto">View reference photograph</button>' : ''}
    ${body}
    ${nok}
  </div>`;
}

function onCharEdit(e) {
  const t = e.target;
  if (e.type === 'input' && t.tagName === 'SELECT') return;
  if (e.type === 'change' && t.tagName !== 'SELECT') return;
  const card = t.closest('.char-card');
  if (!card) return;
  const i = +card.dataset.idx, r = INSP.results[i];
  if (t.dataset.s !== undefined) {
    r.samples[+t.dataset.s] = t.value.trim();
    const before = r.result;
    computeDim(r);
    if (before !== r.result) r.obsSaved = false;
  } else if (t.dataset.f) {
    const f = t.dataset.f;
    r[f] = t.value;
    if (f === 'finding' && r.type === 'Visual') {
      if (t.value) {
        r.result = 'NOK';
        const d = INSP_CTX.defects.find(x => x.name === t.value && x.type === 'Visual');
        if (d && d.severity && !r.def.qty && !r.def.location) r.def.severity = d.severity;
        const sev = $('select[data-d="severity"]', card);
        if (sev) sev.value = r.def.severity;
      } else if (r.result === 'NOK') r.result = '';
    }
    if (f === 'instrumentId') r.instOverride = null;
    if (f !== 'instrumentId' && f !== 'observation') r.obsSaved = false;
  } else if (t.dataset.d) {
    r.def[t.dataset.d] = t.value;
    r.obsSaved = false;
  } else return;
  updateCard(i);
  scheduleInspSave();
}

async function onCharClick(e) {
  const img = e.target.closest('img[data-pid]');
  if (img) { const p = INSP_CTX.photos[img.dataset.pid]; if (p) UI.image(p.dataUrl, p.caption); return; }
  const b = e.target.closest('button');
  if (!b) return;
  const card = b.closest('.char-card');
  if (!card) return;
  const i = +card.dataset.idx, r = INSP.results[i];
  if (b.dataset.res) { await setResult(i, b.dataset.res); return; }
  switch (b.dataset.act) {
    case 'photo-cam': await addPhoto(i, false); break;
    case 'photo-gallery': await addPhoto(i, true); break;
    case 'photo-retake': await retakePhoto(i, b.dataset.pid); break;
    case 'photo-del': await deletePhoto(i, b.dataset.pid); break;
    case 'photo-caption': await captionPhoto(i, b.dataset.pid); break;
    case 'saveobs': await saveObservation(i); break;
    case 'instoverride': await instrumentOverride(i); break;
    case 'refphoto': {
      const pc = INSP_CTX.plan.chars.find(c => String(c.sn) === String(r.sn));
      if (pc && pc.refPhoto) UI.image(pc.refPhoto, 'Reference: ' + r.name);
      break;
    }
    default: break;
  }
}

async function setResult(i, val) {
  const r = INSP.results[i];
  if (r.result === val) return;
  let cleared = false;
  if (r.result === 'NOK' && (r.photos.length || r.finding || r.def.desc || r.def.location)) {
    const ok = await UI.confirm(`Change the result from NOK to ${val === 'NA' ? 'Not Applicable' : val}?\n\nThe defect details and ${r.photos.length} photograph(s) of this characteristic will be deleted.`, { danger: true, ok: 'Yes, change' });
    if (!ok) return;
    for (const pid of r.photos) { await DB.del('photos', pid); delete INSP_CTX.photos[pid]; }
    r.photos = [];
    r.finding = ''; r.otherName = '';
    r.def = { desc: '', qty: '', cause: '', action: '', location: '', severity: r.cls, remark: '' };
    cleared = true;
  }
  r.result = val;
  r.obsSaved = false;
  if (cleared) rerenderCard(i); else updateCard(i);
  if (val === 'NOK') renderPhotos(i);
  await saveInspNow();
}

function rerenderCard(i) {
  const old = $('#char-' + i);
  old.outerHTML = charCardHtml(INSP.results[i], i);
  updateCard(i);
  renderPhotos(i);
}

function updateCard(i) {
  const r = INSP.results[i];
  const card = $('#char-' + i);
  if (!card) return;
  if (r.type === 'Dimensional') {
    const L = limits(r);
    r.samples.forEach((v, k) => {
      const inp = $(`input[data-s="${k}"]`, card);
      const sr = evalSample(v, L);
      inp.classList.toggle('in-ok', sr === 'OK');
      inp.classList.toggle('in-nok', sr === 'NOK' || sr === 'INVALID');
      const lab = $(`#sres-${i}-${k}`);
      lab.textContent = sr === 'INVALID' ? 'Not a number' : sr;
      lab.className = 'sres ' + (sr === 'OK' ? 't-ok' : sr ? 't-nok' : '');
    });
    const inst = INSP_CTX.instruments.find(x => x.id === r.instrumentId);
    const w = $('#instwarn-' + i);
    let blocked = false;
    if (inst && instrumentExpired(inst)) {
      if (r.instOverride) {
        w.innerHTML = `<div class="alert yellow small">Calibration of ${esc(inst.id)} expired (due ${fmtDate(inst.calDue)}). Use authorised by ${esc(r.instOverride.by)} on ${fmtDateTime(r.instOverride.at)}. Reason: ${esc(r.instOverride.reason)}</div>`;
      } else {
        blocked = true;
        w.innerHTML = `<div class="alert red"><b>CALIBRATION EXPIRED</b> – ${esc(inst.id)} ${esc(inst.name)} was due on ${fmtDate(inst.calDue)}${inst.status !== 'Active' ? ` (status: ${esc(inst.status)})` : ''}. Do not use it. Select another instrument, or the Quality Head must record an authorised override.<br><button type="button" class="btn small mt" data-act="instoverride">Quality Head override</button></div>`;
      }
    } else w.innerHTML = '';
    $$('input[data-s]', card).forEach(inp => { inp.disabled = blocked; });
  } else {
    $$('.seg-btn', card).forEach(b => b.classList.toggle('on', b.dataset.res === r.result));
  }
  const res = $('#res-' + i);
  res.textContent = r.result === 'NA' ? 'N/A' : (r.result || 'PENDING');
  res.className = 'res-badge ' + (r.result === 'OK' ? 'b-green' : r.result === 'NOK' ? 'b-red' : r.result === 'NA' ? 'b-grey' : 'b-pending');
  card.classList.toggle('is-nok', r.result === 'NOK');
  card.classList.toggle('is-ok', r.result === 'OK');
  $('#crit-' + i).hidden = !isCriticalNok(r);
  const panel = $('#nok-' + i);
  const wasHidden = panel.hidden;
  panel.hidden = r.result !== 'NOK';
  if (wasHidden && !panel.hidden) renderPhotos(i);
  const other = $('#other-' + i);
  if (other) other.hidden = r.finding !== 'Other defect';
  const obs = $('#obs-' + i);
  if (obs) obs.innerHTML = r.obsSaved ? '<span class="t-ok">✓ Observation saved</span>' : '<span class="t-warn">Observation not saved yet. Complete the fields above, take a photograph and press Save Observation.</span>';
  updateLotAlert();
}

function updateLotAlert() {
  const box = $('#lotAlert');
  if (!box || !INSP) return;
  const rs = INSP.results;
  const nok = rs.filter(r => r.result === 'NOK');
  const crit = rs.filter(isCriticalNok);
  box.innerHTML = `<div class="summary-bar"><span class="t-ok">OK: ${rs.filter(r => r.result === 'OK').length}</span><span class="t-nok">NOK: ${nok.length}</span><span>N/A: ${rs.filter(r => r.result === 'NA').length}</span><span>Pending: ${rs.filter(r => !r.result).length}</span></div>`
    + (crit.length ? `<div class="alert red big"><b>CRITICAL DEFECT</b> – characteristic ${crit.map(r => r.sn).join(', ')} is NOK. This lot cannot be accepted. An NCR will be created automatically.</div>`
      : nok.length ? '<div class="alert red">NOK found. An NCR will be created automatically when the inspection is completed.</div>' : '');
}

/* ---------- Photographs ---------- */
function renderPhotos(i) {
  const r = INSP.results[i];
  const box = $('#photos-' + i);
  if (!box) return;
  const thumbs = r.photos.map((pid, k) => {
    const p = INSP_CTX.photos[pid];
    if (!p) return '';
    return `<div class="ph"><img src="${p.dataUrl}" alt="Photograph ${k + 1}" data-pid="${esc(pid)}">
      <div class="ph-cap">${esc(p.caption)}</div><div class="ph-meta">${fmtDateTime(p.takenAt)}</div>
      <div class="ph-btns"><button type="button" class="btn small" data-act="photo-caption" data-pid="${esc(pid)}">Caption</button><button type="button" class="btn small" data-act="photo-retake" data-pid="${esc(pid)}">Retake</button><button type="button" class="btn small danger" data-act="photo-del" data-pid="${esc(pid)}">Delete</button></div></div>`;
  }).join('');
  box.innerHTML = `<div class="ph-head"><b>Photographs (${r.photos.length}/5)</b> <span class="${r.photos.length ? 't-ok' : 't-nok'}">${r.photos.length ? '' : 'At least one photograph is compulsory'}</span></div>
    <div class="ph-grid">${thumbs}</div>
    ${r.photos.length < 5 ? `<div class="btn-bar"><button type="button" class="btn primary" data-act="photo-cam">📷 ${r.photos.length ? 'Add another photograph' : 'Take photograph'}</button><button type="button" class="btn" data-act="photo-gallery">Add from gallery</button></div>` : '<p class="muted small">Maximum of five photographs reached.</p>'}`;
}

async function addPhoto(i, gallery) {
  const r = INSP.results[i];
  if (r.photos.length >= 5) { UI.alert('A maximum of five photographs is allowed for one characteristic.'); return; }
  const dataUrl = gallery ? await Camera.fromFile(false) : await Camera.capture();
  if (!dataUrl) return;
  const def = photoDefaultCaption(r);
  let cap = await UI.prompt('Photograph caption', 'Caption shown under the photograph in the report', def);
  if (!cap) cap = def;
  const p = { id: uid('PH'), inspNo: INSP.inspNo, charSn: r.sn, caption: cap, takenAt: nowStamp(), dataUrl };
  await DB.put('photos', p);
  INSP_CTX.photos[p.id] = p;
  r.photos.push(p.id);
  r.obsSaved = false;
  await saveInspNow();
  renderPhotos(i);
  updateCard(i);
  UI.toast('Photograph saved', 'ok');
}
async function retakePhoto(i, pid) {
  const p = INSP_CTX.photos[pid];
  if (!p) return;
  if (!await UI.confirm('Replace this photograph with a new one?', { ok: 'Retake' })) return;
  const dataUrl = await Camera.capture();
  if (!dataUrl) return;
  p.dataUrl = dataUrl;
  p.takenAt = nowStamp();
  await DB.put('photos', p);
  INSP.results[i].obsSaved = false;
  await saveInspNow();
  renderPhotos(i);
  updateCard(i);
  UI.toast('Photograph replaced', 'ok');
}
async function deletePhoto(i, pid) {
  if (!await UI.confirm('Delete this photograph? This cannot be undone.', { danger: true, ok: 'Delete' })) return;
  const r = INSP.results[i];
  await DB.del('photos', pid);
  delete INSP_CTX.photos[pid];
  r.photos = r.photos.filter(x => x !== pid);
  r.obsSaved = false;
  await saveInspNow();
  renderPhotos(i);
  updateCard(i);
}
async function captionPhoto(i, pid) {
  const p = INSP_CTX.photos[pid];
  if (!p) return;
  const cap = await UI.prompt('Photograph caption', 'Caption shown under the photograph in the report', p.caption, { required: true });
  if (cap === null) return;
  p.caption = cap;
  await DB.put('photos', p);
  renderPhotos(i);
}

/* ---------- Observations and validation ---------- */
function validateObs(r, insp) {
  const e = [];
  const L = `Characteristic ${r.sn} (${r.name})`;
  if (r.type === 'Visual') {
    if (!r.finding) e.push(`${L}: select the defect found.`);
    if (r.finding === 'Other defect' && !String(r.otherName).trim()) e.push(`${L}: type the defect name for "Other defect".`);
    if (!String(r.def.location).trim()) e.push(`${L}: enter the defect location.`);
    if (!r.def.severity) e.push(`${L}: select the defect severity.`);
    if (!String(r.def.remark).trim()) e.push(`${L}: add a short remark.`);
  } else {
    if (!String(r.def.desc).trim()) e.push(`${L}: enter the defect description.`);
    if (!String(r.def.action).trim()) e.push(`${L}: enter the immediate action.`);
    if (r.finding === 'Other defect' && !String(r.otherName).trim()) e.push(`${L}: type the defect name for "Other defect".`);
  }
  if (!isNum(r.def.qty) || Number(r.def.qty) <= 0) e.push(`${L}: defect quantity must be a number greater than zero.`);
  else if (Number(r.def.qty) > Number(insp.qtyReceived)) e.push(`${L}: defect quantity cannot be more than the quantity received.`);
  if (!r.photos.length) e.push(`${L}: take at least one photograph of the defect.`);
  return e;
}
async function saveObservation(i) {
  const r = INSP.results[i];
  const errs = validateObs(r, INSP);
  if (errs.length) { UI.errors(errs, 'Observation cannot be saved yet'); return; }
  r.obsSaved = true;
  await saveInspNow();
  updateCard(i);
  UI.toast('Observation saved', 'ok');
}
async function instrumentOverride(i) {
  const r = INSP.results[i];
  const inst = INSP_CTX.instruments.find(x => x.id === r.instrumentId);
  if (!inst) return;
  const pinSet = await DB.getSetting('qhPin', '1234');
  const qhName = await DB.getSetting('qhName', 'Quality Head');
  const reason = await UI.modal({
    title: 'Quality Head override – expired instrument',
    body: `<p>Instrument <b>${esc(inst.id)}</b> (${esc(inst.name)}) calibration was due on ${fmtDate(inst.calDue)}. It may be used only with an authorised Quality Head override.</p>
      ${App.role === 'QH' ? '' : fld('Quality Head PIN *', '<input class="ov-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off">')}
      ${fld('Reason for override *', '<textarea class="ov-reason" rows="2"></textarea>')}`,
    buttons: [
      { label: 'Cancel', value: null },
      {
        label: 'Authorise', cls: 'primary',
        validate: mm => {
          if (App.role !== 'QH' && $('.ov-pin', mm).value.trim() !== pinSet) return 'Incorrect Quality Head PIN.';
          if (!$('.ov-reason', mm).value.trim()) return 'Enter the reason for the override.';
          return '';
        },
        value: mm => $('.ov-reason', mm).value.trim()
      }
    ]
  });
  if (!reason) return;
  r.instOverride = { by: qhName, reason, at: nowStamp(), instrumentId: inst.id };
  await saveInspNow();
  updateCard(i);
}

function charErrors(r, insp, instruments) {
  const e = [];
  const L = `Characteristic ${r.sn} (${r.name})`;
  if (r.type === 'Dimensional') {
    const empty = r.samples.filter(v => v === '').length;
    const bad = r.samples.filter(v => v !== '' && !isNum(v)).length;
    if (empty) e.push(`${L}: enter all ${r.samples.length} actual measured values (${empty} missing).`);
    if (bad) e.push(`${L}: actual dimensional values must be numeric.`);
    if (instruments.length && !r.instrumentId) e.push(`${L}: select the measuring instrument used.`);
    const inst = instruments.find(x => x.id === r.instrumentId);
    if (inst && instrumentExpired(inst) && !r.instOverride) e.push(`${L}: instrument ${inst.id} calibration has expired. Select another instrument or get a Quality Head override.`);
  } else {
    if (!r.result) e.push(`${L}: select OK, NOK or Not Applicable.`);
    if (r.result === 'NA' && !String(r.observation).trim()) e.push(`${L}: enter the reason for Not Applicable in the Observation field.`);
  }
  if (r.result === 'NOK') {
    const oe = validateObs(r, insp);
    e.push(...oe);
    if (!oe.length && !r.obsSaved) e.push(`${L}: press "Save Observation" to save the NOK observation.`);
  }
  return e;
}
function lotErrors(insp) {
  const e = [];
  const rec = Number(insp.qtyReceived);
  if (!isNum(insp.qtyInspected) || Number(insp.qtyInspected) <= 0) e.push('Quantity inspected must be a number greater than zero.');
  else if (Number(insp.qtyInspected) > rec) e.push('Quantity inspected cannot be more than the quantity received.');
  if (!isNum(insp.qtyRejected) || Number(insp.qtyRejected) < 0) e.push('Quantity rejected must be zero or a positive number.');
  else if (Number(insp.qtyRejected) > rec) e.push('Quantity rejected cannot exceed the quantity received.');
  if (!insp.results.some(r => r.result === 'NOK') && Number(insp.qtyRejected) > 0) e.push('Quantity rejected must be 0 when all characteristics are OK.');
  return e;
}

async function completeInspection() {
  INSP.qtyInspected = $('#qtyInsp').value.trim();
  INSP.qtyRejected = $('#qtyRej').value.trim();
  const errs = lotErrors(INSP);
  let firstBad = -1;
  INSP.results.forEach((r, i) => {
    const ce = charErrors(r, INSP, INSP_CTX.instruments);
    $('#char-' + i).classList.toggle('has-err', ce.length > 0);
    if (ce.length && firstBad < 0) firstBad = i;
    errs.push(...ce);
  });
  if (errs.length) {
    await UI.errors(errs, 'Inspection cannot be completed yet');
    if (firstBad >= 0) $('#char-' + firstBad).scrollIntoView({ block: 'start' });
    return;
  }
  const anyNok = INSP.results.some(r => r.result === 'NOK');
  const critNok = INSP.results.some(isCriticalNok);
  const msg = anyNok
    ? `${critNok ? 'CRITICAL DEFECT found.\n' : ''}NOK found. An NCR will be created automatically and the lot will go to the Quality Head for the final decision.`
    : 'All applicable characteristics are OK. The lot will be ACCEPTED.';
  if (!await UI.confirm(msg + '\n\nComplete the inspection now?', { ok: 'Complete' })) return;
  INSP.completedAt = nowStamp();
  INSP.completedBy = App.user;
  INSP.history = INSP.history || [];
  if (!anyNok) {
    INSP.status = 'Accepted';
    INSP.decision = { type: 'Accept', by: App.user, auto: true, date: todayISO(), at: nowStamp(), remarks: 'All applicable characteristics OK (automatic acceptance).' };
    INSP.history.push({ at: nowStamp(), by: App.user, text: 'Inspection completed – all OK – lot accepted automatically' });
  } else {
    INSP.status = 'Pending Quality Head Review';
    INSP.proposedDecision = 'Reject';
    INSP.decision = null;
    const ncr = await ensureNCR(INSP, ncrTriggers(INSP));
    INSP.history.push({ at: nowStamp(), by: App.user, text: `Inspection completed with NOK – ${ncr.ncrNo} created – sent for Quality Head review` });
  }
  await saveInspNow();
  const no = INSP.inspNo;
  INSP = null;
  UI.toast('Inspection completed', 'ok');
  go('#/view/' + enc(no));
}

/* ================= NCR auto-generation ================= */

function ncrTriggers(insp) {
  const t = new Set();
  insp.results.filter(r => r.result === 'NOK').forEach(r => {
    if (isCriticalNok(r)) t.add('Critical characteristic NOK');
    if (r.type === 'Dimensional') t.add('Dimensional result outside tolerance');
    else if (r.type === 'Visual') t.add('Visual defect recorded');
    else if (['Documentation', 'Traceability', 'Identification'].includes(r.type)) t.add('Required documentation or traceability missing');
    else t.add(`${r.type} characteristic NOK`);
  });
  if (insp.decision && insp.decision.type === 'Reject') t.add('Lot rejected');
  return [...t];
}

async function ensureNCR(insp, triggers) {
  let ncr = insp.ncrNo ? await DB.get('ncrs', insp.ncrNo) : null;
  const sevRank = { Critical: 3, Major: 2, Minor: 1 };
  const defs = insp.results.filter(r => r.result === 'NOK').map(r => ({
    sn: r.sn, name: r.name, type: r.type, spec: specText(r), tolerance: tolText(r), observed: observedText(r),
    description: defectDescription(r), category: defectCategory(r), cls: defectSeverity(r), critical: isCriticalNok(r),
    qty: r.def.qty, action: r.def.action, location: r.def.location, cause: r.def.cause, photos: r.photos.slice(), deviation: r.deviation || null
  }));
  if (!ncr) {
    const today = todayISO();
    ncr = {
      ncrNo: await DB.nextNumber('NCR', 'ncrs'), inspNo: insp.inspNo, date: today, createdAt: nowStamp(), createdBy: App.user,
      status: 'Open', containment: defs.map(d => d.action).filter(Boolean).join('; '), location: insp.location || '',
      disposition: 'Pending', responsible: '', targetDate: addDays(today, 7), eightDTarget: addDays(today, 15), eightDReceived: '',
      rootCause: '', correctiveAction: '', supplierResponse: '', closureEvidence: '', verification: '', qhApproval: null,
      triggers: [], history: [{ at: nowStamp(), by: App.user, text: 'NCR created automatically: ' + triggers.join(', ') }]
    };
  }
  const top = defs.slice().sort((a, b) => (sevRank[b.cls] || 0) - (sevRank[a.cls] || 0))[0];
  Object.assign(ncr, {
    supplierCode: insp.supplierCode, supplierName: insp.supplierName, partNo: insp.partNo, partName: insp.partName,
    poNo: insp.poNo, invoiceNo: insp.invoiceNo, batchNo: insp.batchNo, qtyReceived: insp.qtyReceived,
    qtyInspected: insp.qtyInspected, qtyRejected: insp.qtyRejected, defects: defs,
    triggers: [...new Set([...(ncr.triggers || []), ...triggers])],
    defectCategory: top ? top.category : 'Lot rejected', classification: top ? top.cls : 'Major'
  });
  await DB.put('ncrs', ncr);
  insp.ncrNo = ncr.ncrNo;
  return ncr;
}

/* ================= Inspection detail and Quality Head decision ================= */

function receiptPairs(i) {
  return [
    ['Inspection number', i.inspNo], ['Receipt date and time', fmtDateTime(i.receiptDate)], ['Supplier', `${i.supplierName || ''} (${i.supplierCode || ''})`],
    ['Part number', i.partNo], ['Part name', i.partName], ['Part category', i.category], ['Vehicle type', i.vehicleType],
    ['Purchase order', i.poNo], ['Invoice / challan', i.invoiceNo], ['Supplier batch', i.batchNo],
    ['Quantity received', `${i.qtyReceived || ''} ${i.uom || ''}`], ['Quantity inspected', i.qtyInspected], ['Quantity rejected', i.qtyRejected],
    ['Drawing / revision', `${i.drawingNo || '—'} / ${i.drawingRev || '—'}`], ['Inspector', i.inspectorName],
    ['Storage / hold location', i.location], ['Remarks', i.remarks]
  ];
}
function resultsTableHtml(results) {
  if (!results || !results.length) return '<p class="muted">Inspection not started.</p>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Characteristic</th><th>Specification</th><th>Actual</th><th>Result</th></tr></thead><tbody>
    ${results.map(r => `<tr><td>${esc(r.sn)}</td><td>${esc(r.name)}<div class="muted small">${esc(r.type)} · ${esc(r.cls)}</div></td><td>${esc(specText(r))}${r.type === 'Dimensional' ? `<div class="muted small">${esc(tolText(r))}</div>` : ''}</td><td>${esc(observedText(r))}</td>
    <td>${r.result === 'OK' ? '<span class="badge b-green">OK</span>' : r.result === 'NOK' ? `<span class="badge b-red">NOK</span>${isCriticalNok(r) ? '<div class="t-nok small">CRITICAL</div>' : ''}${r.deviation ? '<div class="small t-warn">Deviation approved</div>' : ''}` : r.result === 'NA' ? '<span class="badge b-grey">N/A</span>' : '<span class="badge b-pending">PENDING</span>'}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function nokDetailsHtml(results, pmap) {
  const noks = (results || []).filter(r => r.result === 'NOK');
  if (!noks.length) return '';
  return `<div class="card"><h3>Nonconformities (${noks.length})</h3>${noks.map(r => `<div class="nok-box">
    <div><b>${esc(r.sn)}. ${esc(r.name)}</b> ${clsBadge(defectSeverity(r))} ${isCriticalNok(r) ? '<span class="badge b-red">CRITICAL DEFECT</span>' : ''}</div>
    ${kvTable([['Defect', defectCategory(r)], ['Description', defectDescription(r)], ['Observed', observedText(r)], ['Defect quantity', r.def.qty], ['Suspected cause', r.def.cause], ['Immediate action', r.def.action]])}
    <div class="ph-grid mt">${r.photos.map(pid => pmap[pid] ? `<div class="ph"><img src="${pmap[pid].dataUrl}" data-view="${esc(pid)}" alt=""><div class="ph-cap">${esc(pmap[pid].caption)}</div><div class="ph-meta">${fmtDateTime(pmap[pid].takenAt)}</div></div>` : '').join('')}</div>
  </div>`).join('')}</div>`;
}
function decisionSummaryHtml(i) {
  const d = i.decision;
  if (!d) return '';
  const cls = d.type === 'Accept' ? 'green' : d.type === 'Reject' ? 'red' : 'yellow';
  let extra = '';
  if (d.conditional) {
    const c = d.conditional;
    extra = kvTable([['Reason', c.reason], ['Approved quantity', c.approvedQty], ['Conditions of use', c.conditions], ['Approver', c.approver], ['Approval date', fmtDate(c.approvalDate)], ['Deviation number', c.deviationNo], ['Valid until', fmtDate(c.validUntil)]]);
  }
  if (d.hold) extra = kvTable([['Hold reason', d.hold.reason], ['Details', d.hold.detail]]);
  if (d.disposition) extra = kvTable([['Disposition', d.disposition]]);
  return `<div class="alert ${cls}"><b>Final decision: ${esc(DECISION_LABEL[d.type])}</b><div class="small">By ${esc(d.by)}${d.auto ? ' (automatic – all OK)' : ''} on ${fmtDate(d.date)}${d.remarks ? ' · ' + esc(d.remarks) : ''}</div></div>${extra}`;
}

function acceptBlockReason(insp) {
  const noks = (insp.results || []).filter(r => r.result === 'NOK');
  if (noks.some(isCriticalNok)) return 'CRITICAL DEFECT: this lot cannot be accepted. Choose Conditionally Accept, Reject or Hold.';
  const noDev = noks.filter(r => !r.deviation);
  if (noDev.length) return `Accept is allowed only when all applicable characteristics are OK. Characteristic ${noDev.map(r => r.sn).join(', ')} is NOK without an approved deviation.`;
  return '';
}

function qhPanelHtml(insp, qhName) {
  const d = insp.decision || {};
  const c = d.conditional || {};
  const h = d.hold || {};
  const costs = insp.costs || {};
  const noks = insp.results.filter(r => r.result === 'NOK');
  const sel = d.type || insp.proposedDecision || '';
  return `<div class="card qh-panel"><h3>Quality Head review and final decision</h3>
    ${noks.length ? `<h4>Deviation approval for NOK characteristics</h4>${noks.map(r => {
      const idx = insp.results.indexOf(r);
      return `<div class="dev-row"><div><b>${esc(r.sn)}. ${esc(r.name)}</b> <span class="badge b-red">NOK</span>${isCriticalNok(r) ? ' <span class="badge b-red">CRITICAL</span>' : ''}<div class="muted small">Observed: ${esc(observedText(r))}</div>
        ${r.deviation ? `<div class="alert yellow small">Deviation approved by ${esc(r.deviation.by)} on ${fmtDate(r.deviation.date)}. Reason: ${esc(r.deviation.reason)}</div>` : ''}</div>
        <div>${r.deviation ? `<button type="button" class="btn small" data-devdel="${idx}">Withdraw deviation</button>` : `<button type="button" class="btn small" data-dev="${idx}">Approve deviation</button>`}</div></div>`;
    }).join('')}` : '<p class="t-ok">All applicable characteristics are OK.</p>'}
    <h4>Final usage decision *</h4>
    <div class="seg dec-seg">${[['Accept', 'Accept'], ['Conditional', 'Conditionally Accept'], ['Reject', 'Reject'], ['Hold', 'Hold']].map(([v, l]) => `<button type="button" class="seg-btn dec-${v}${sel === v ? ' on' : ''}" data-dec="${v}">${l}</button>`).join('')}</div>
    <div id="decMsg"></div>
    <div class="grid2">
      ${fld('Quantity inspected *', `<input id="dQtyInsp" inputmode="decimal" value="${esc(insp.qtyInspected)}">`)}
      ${fld('Quantity rejected *', `<input id="dQtyRej" inputmode="decimal" value="${esc(insp.qtyRejected)}">`)}
    </div>
    <div id="condBox" hidden>
      <h4>Conditional acceptance (all fields mandatory)</h4>
      ${fld('Reason *', `<textarea id="cReason" rows="2">${esc(c.reason || '')}</textarea>`)}
      ${fld('Approved quantity *', `<input id="cQty" inputmode="decimal" value="${esc(c.approvedQty || '')}">`)}
      ${fld('Conditions of use *', `<textarea id="cCond" rows="2">${esc(c.conditions || '')}</textarea>`)}
      ${fld('Approver name *', `<input id="cApprover" value="${esc(c.approver || qhName)}">`)}
      <div class="grid2">
        ${fld('Approval date *', `<input id="cDate" type="date" value="${esc(c.approvalDate || todayISO())}">`)}
        ${fld('Valid until *', `<input id="cValid" type="date" value="${esc(c.validUntil || '')}">`)}
      </div>
      ${fld('Deviation number *', `<input id="cDevNo" value="${esc(c.deviationNo || '')}">`)}
    </div>
    <div id="holdBox" hidden>
      ${fld('Hold reason *', `<select id="hReason">${opts(HOLD_REASONS, h.reason, '— Select —')}</select>`)}
      ${fld('Details', `<textarea id="hDetail" rows="2">${esc(h.detail || '')}</textarea>`)}
    </div>
    <div id="rejBox" hidden>
      ${fld('Disposition of rejected material *', `<select id="rDisp">${opts(DISPOSITIONS.filter(x => x !== 'Pending' && x !== 'Use as is (deviation)'), d.disposition || 'Return to supplier')}</select>`)}
    </div>
    <h4>Cost of poor quality for this lot (₹)</h4>
    <div class="grid2">
      ${fld('Sorting cost', `<input id="k_sorting" inputmode="decimal" value="${esc(costs.sorting || '')}">`)}
      ${fld('Rework cost', `<input id="k_rework" inputmode="decimal" value="${esc(costs.rework || '')}">`)}
      ${fld('Rejection cost', `<input id="k_rejection" inputmode="decimal" value="${esc(costs.rejection || '')}">`)}
      ${fld('Transport cost', `<input id="k_transport" inputmode="decimal" value="${esc(costs.transport || '')}">`)}
      ${fld('Line stoppage cost', `<input id="k_lineStop" inputmode="decimal" value="${esc(costs.lineStop || '')}">`)}
    </div>
    ${fld('Quality Head remarks', `<textarea id="dRemarks" rows="2">${esc(d.auto ? '' : (d.remarks || ''))}</textarea>`)}
    <button type="button" class="btn primary block" id="bDecision">Save Final Decision</button>
  </div>`;
}

async function renderView(m) {
  const no = decodeURIComponent(m[1]);
  const insp = await DB.get('inspections', no);
  if (!insp) { view(notFoundHtml('Inspection ' + no)); return; }
  const [photos, qhName] = await Promise.all([DB.byIndex('photos', 'inspNo', no), DB.getSetting('qhName', 'Quality Head')]);
  const pmap = {};
  photos.forEach(p => { pmap[p.id] = p; });
  const isQH = App.role === 'QH';
  const reviewable = ['Pending Quality Head Review', 'Accepted', 'Conditionally Accepted', 'Rejected', 'On Hold'].includes(insp.status);
  const results = insp.results || [];
  insp.results = results;

  view(`<div class="card lot-head">
      <div class="lc-top"><b>${esc(insp.inspNo)}</b>${statusBadge(insp.status)}</div>
      <div><b>${esc(insp.partNo || '—')}</b> – ${esc(insp.partName || '')}</div>
      <div class="muted small">${esc(insp.supplierName || '—')} · Qty ${esc(insp.qtyReceived || '—')} ${esc(insp.uom || '')} · ${fmtDateTime(insp.receiptDate)}</div>
      ${insp.ncrNo ? `<div class="t-nok">NCR: ${esc(insp.ncrNo)}</div>` : ''}
    </div>
    ${insp.status === 'Pending Quality Head Review' && !isQH ? '<div class="alert blue">This lot is waiting for the Quality Head review and final decision.</div>' : ''}
    ${results.some(isCriticalNok) ? '<div class="alert red big"><b>CRITICAL DEFECT</b> – a critical characteristic is NOK. Automatic acceptance is blocked.</div>' : ''}
    ${decisionSummaryHtml(insp)}
    <div class="btn-bar">
      ${results.length ? `<a class="btn primary" href="#/report/${enc(no)}">Preview Report</a>` : ''}
      ${insp.ncrNo ? `<a class="btn" href="#/ncr/${enc(insp.ncrNo)}">Open NCR</a>` : ''}
      ${['Draft', 'Pending Inspection'].includes(insp.status) ? `<a class="btn" href="#/receipt/${enc(no)}">Edit Receipt</a><a class="btn primary" href="#/inspect/${enc(no)}">Start Inspection</a>` : ''}
      ${insp.status === 'Inspection in Progress' ? `<a class="btn primary" href="#/inspect/${enc(no)}">Continue Inspection</a>` : ''}
    </div>
    <details class="card"><summary><b>Receipt details</b></summary>${kvTable(receiptPairs(insp))}</details>
    <div class="card"><h3>Inspection results</h3>${resultsTableHtml(results)}</div>
    ${nokDetailsHtml(results, pmap)}
    ${isQH && reviewable ? qhPanelHtml(insp, qhName) : ''}
    ${isQH ? `<div class="card"><h3>Quality Head actions</h3><div class="btn-bar">
      ${insp.decision && insp.status !== 'Closed' ? '<button type="button" class="btn" id="bCloseLot">Close Lot</button>' : ''}
      ${insp.status === 'Closed' ? '<button type="button" class="btn" id="bReopen">Reopen Lot</button>' : ''}
      ${['Pending Quality Head Review', 'Accepted', 'Conditionally Accepted', 'Rejected', 'On Hold'].includes(insp.status) ? '<button type="button" class="btn" id="bReturn">Return to Inspector</button>' : ''}
      <button type="button" class="btn danger" id="bDelete">Delete Inspection</button></div></div>` : ''}
    <details class="card"><summary><b>History</b></summary><ul class="hist">${(insp.history || []).slice().reverse().map(h => `<li>${fmtDateTime(h.at)} – ${esc(h.by)}: ${esc(h.text)}</li>`).join('')}</ul></details>`);

  $$('img[data-view]').forEach(img => img.addEventListener('click', () => { const p = pmap[img.dataset.view]; if (p) UI.image(p.dataUrl, p.caption); }));
  if (!isQH) return;

  const reload = () => router();
  if (reviewable) {
    let sel = (insp.decision && insp.decision.type) || insp.proposedDecision || '';
    const showBoxes = () => {
      $$('.dec-seg .seg-btn').forEach(b => b.classList.toggle('on', b.dataset.dec === sel));
      $('#condBox').hidden = sel !== 'Conditional';
      $('#holdBox').hidden = sel !== 'Hold';
      $('#rejBox').hidden = sel !== 'Reject';
      const block = acceptBlockReason(insp);
      $('#decMsg').innerHTML = sel === 'Accept' && block ? `<div class="alert red">${esc(block)}</div>` : '';
      if (sel === 'Reject' && num($('#dQtyRej').value) === 0) $('#dQtyRej').value = insp.qtyReceived;
    };
    $$('.dec-seg .seg-btn').forEach(b => { b.onclick = () => { sel = b.dataset.dec; showBoxes(); }; });
    showBoxes();
    $$('[data-dev]').forEach(b => {
      b.onclick = async () => {
        const r = insp.results[+b.dataset.dev];
        const reason = await UI.prompt('Approve deviation', `Reason for accepting characteristic ${r.sn} (${r.name}) under deviation`, '', { required: true, multiline: true });
        if (!reason) return;
        r.deviation = { by: App.user, reason, date: todayISO(), at: nowStamp() };
        insp.history = insp.history || [];
        insp.history.push({ at: nowStamp(), by: App.user, text: `Deviation approved for characteristic ${r.sn}: ${reason}` });
        await DB.put('inspections', insp);
        if (insp.ncrNo) await ensureNCR(insp, []);
        UI.toast('Deviation recorded', 'ok');
        reload();
      };
    });
    $$('[data-devdel]').forEach(b => {
      b.onclick = async () => {
        const r = insp.results[+b.dataset.devdel];
        if (!await UI.confirm(`Withdraw the deviation for characteristic ${r.sn}?`)) return;
        r.deviation = null;
        insp.history.push({ at: nowStamp(), by: App.user, text: `Deviation withdrawn for characteristic ${r.sn}` });
        await DB.put('inspections', insp);
        if (insp.ncrNo) await ensureNCR(insp, []);
        reload();
      };
    });
    $('#bDecision').onclick = () => saveDecision(insp, sel);
  }
  const bClose = $('#bCloseLot');
  if (bClose) bClose.onclick = async () => {
    if (!await UI.confirm(`Close lot ${insp.inspNo}? The final decision (${DECISION_LABEL[insp.decision.type]}) is kept.`)) return;
    insp.status = 'Closed';
    insp.closedAt = nowStamp();
    insp.history.push({ at: nowStamp(), by: App.user, text: 'Lot closed' });
    await DB.put('inspections', insp);
    reload();
  };
  const bReopen = $('#bReopen');
  if (bReopen) bReopen.onclick = async () => {
    if (!await UI.confirm('Reopen this lot?')) return;
    insp.status = insp.decision ? DECISION_STATUS[insp.decision.type] : 'Pending Quality Head Review';
    insp.closedAt = '';
    insp.history.push({ at: nowStamp(), by: App.user, text: 'Lot reopened' });
    await DB.put('inspections', insp);
    reload();
  };
  const bReturn = $('#bReturn');
  if (bReturn) bReturn.onclick = async () => {
    if (!await UI.confirm('Return this lot to the inspector for re-inspection? The final decision will be cleared. Results, photographs and any NCR are kept.')) return;
    insp.status = 'Inspection in Progress';
    insp.decision = null;
    insp.completedAt = '';
    insp.history.push({ at: nowStamp(), by: App.user, text: 'Returned to inspector for re-inspection' });
    await DB.put('inspections', insp);
    go('#/inspect/' + enc(insp.inspNo));
  };
  $('#bDelete').onclick = async () => {
    if (!await UI.confirm(`Permanently delete inspection ${insp.inspNo}${insp.ncrNo ? ` and NCR ${insp.ncrNo}` : ''} with all photographs?\n\nThis cannot be undone. Create a backup first if you may need it.`, { danger: true, ok: 'Delete permanently' })) return;
    await deleteInspection(insp);
    UI.toast('Inspection deleted', 'ok');
    go('#/home');
  };
}

async function deleteInspection(insp) {
  const photos = await DB.byIndex('photos', 'inspNo', insp.inspNo);
  for (const p of photos) await DB.del('photos', p.id);
  if (insp.ncrNo) await DB.del('ncrs', insp.ncrNo);
  await DB.del('inspections', insp.inspNo);
}

async function saveDecision(insp, type) {
  const v = id => ($('#' + id) ? $('#' + id).value.trim() : '');
  const e = [];
  const rec = Number(insp.qtyReceived);
  const qi = v('dQtyInsp'), qr = v('dQtyRej');
  if (!type) e.push('Select the final decision: Accept, Conditionally Accept, Reject or Hold.');
  if (!isNum(qi) || Number(qi) <= 0) e.push('Quantity inspected must be a number greater than zero.');
  else if (Number(qi) > rec) e.push('Quantity inspected cannot be more than the quantity received.');
  if (!isNum(qr) || Number(qr) < 0) e.push('Quantity rejected must be zero or a positive number.');
  else if (Number(qr) > rec) e.push('Quantity rejected cannot exceed the quantity received.');
  if (type === 'Accept') { const b = acceptBlockReason(insp); if (b) e.push(b); }
  let conditional = null, hold = null, disposition = '';
  if (type === 'Conditional') {
    conditional = { reason: v('cReason'), approvedQty: v('cQty'), conditions: v('cCond'), approver: v('cApprover'), approvalDate: v('cDate'), deviationNo: v('cDevNo'), validUntil: v('cValid') };
    if (!conditional.reason) e.push('Conditional acceptance: enter the reason.');
    if (!isNum(conditional.approvedQty) || Number(conditional.approvedQty) <= 0) e.push('Conditional acceptance: approved quantity must be greater than zero.');
    else if (Number(conditional.approvedQty) > rec) e.push('Conditional acceptance: approved quantity cannot exceed the quantity received.');
    if (!conditional.conditions) e.push('Conditional acceptance: enter the conditions of use.');
    if (!conditional.approver) e.push('Conditional acceptance: enter the approver name.');
    if (!conditional.approvalDate) e.push('Conditional acceptance: enter the approval date.');
    if (!conditional.deviationNo) e.push('Conditional acceptance: enter the deviation number.');
    if (!conditional.validUntil) e.push('Conditional acceptance: enter the validity period (valid until date).');
    else if (conditional.approvalDate && conditional.validUntil < conditional.approvalDate) e.push('Conditional acceptance: "valid until" date cannot be earlier than the approval date.');
  }
  if (type === 'Reject') {
    disposition = v('rDisp');
    if (!(Number(qr) > 0)) e.push('Reject: quantity rejected must be greater than zero.');
    if (!disposition) e.push('Reject: select the disposition of the rejected material.');
  }
  if (type === 'Hold') {
    hold = { reason: v('hReason'), detail: v('hDetail') };
    if (!hold.reason) e.push('Hold: select the hold reason.');
  }
  const costs = {};
  [['sorting', 'Sorting'], ['rework', 'Rework'], ['rejection', 'Rejection'], ['transport', 'Transport'], ['lineStop', 'Line stoppage']].forEach(([k, l]) => {
    const x = v('k_' + k);
    if (x && (!isNum(x) || Number(x) < 0)) e.push(`${l} cost must be a number (zero or more).`);
    costs[k] = x;
  });
  if (e.length) { UI.errors(e); return; }

  insp.qtyInspected = qi;
  insp.qtyRejected = qr;
  insp.costs = costs;
  insp.decision = { type, by: App.user, date: todayISO(), at: nowStamp(), remarks: v('dRemarks'), conditional, hold, disposition };
  insp.status = DECISION_STATUS[type];
  insp.qhReview = { by: App.user, at: nowStamp() };
  insp.history = insp.history || [];
  insp.history.push({ at: nowStamp(), by: App.user, text: `Final decision: ${DECISION_LABEL[type]}` });
  if (type === 'Reject' || insp.results.some(r => r.result === 'NOK')) {
    const ncr = await ensureNCR(insp, ncrTriggers(insp));
    if (type === 'Reject' && (!ncr.disposition || ncr.disposition === 'Pending')) { ncr.disposition = disposition; await DB.put('ncrs', ncr); }
    if (type === 'Conditional' && (!ncr.disposition || ncr.disposition === 'Pending')) { ncr.disposition = 'Use as is (deviation)'; await DB.put('ncrs', ncr); }
  }
  await DB.put('inspections', insp);
  UI.toast(`Decision saved: ${DECISION_LABEL[type]}`, 'ok');
  router();
}
