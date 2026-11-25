/* BEM Incoming Inspection System - ncr.js
   Hold / NCR list and NCR follow-up (containment, 8D, closure). */
'use strict';

let NCR_FILTER = { status: 'open', q: '' };

function ncrIsOpen(n) { return n.status !== 'Closed'; }
/* Overdue 8D = NCR still open, 8D not received, and 8D target date earlier than the given day */
function ncrOverdue8D(n, asOf) {
  const day = asOf || todayISO();
  return n.status !== 'Closed' && !!n.eightDTarget && n.eightDTarget < day && !n.eightDReceived;
}

function ncrCardHtml(n) {
  const age = daysBetween(n.date, todayISO());
  return `<a class="lot-card ${ncrIsOpen(n) ? 'lc-red' : ''}" href="#/ncr/${enc(n.ncrNo)}">
    <div class="lc-top"><b>${esc(n.ncrNo)}</b>${ncrStatusBadge(n.status)}</div>
    <div class="lc-line">${esc(n.partNo)} · ${esc(n.partName)}</div>
    <div class="lc-line muted">${esc(n.supplierName)} · ${fmtDate(n.date)} · ${ncrIsOpen(n) ? `${age} day(s) open` : 'Closed'}</div>
    <div class="lc-line">${clsBadge(n.classification)} ${esc(n.defectCategory)} ${ncrOverdue8D(n) ? '<span class="badge b-red">8D OVERDUE</span>' : ''}</div>
  </a>`;
}

async function renderNcrList() {
  const [ncrs, insps] = await Promise.all([DB.getAll('ncrs'), DB.getAll('inspections')]);
  ncrs.sort((a, b) => b.ncrNo.localeCompare(a.ncrNo));
  const held = insps.filter(i => ['On Hold', 'Pending Quality Head Review'].includes(i.status));
  view(`<h2>Hold / NCR</h2>
    <div class="card">
      ${fld('Show', `<select id="nf">${opts([{ value: 'open', label: 'All open NCRs' }, { value: 'overdue', label: 'Overdue 8Ds' }, ...NCR_STATUSES.map(s => ({ value: s, label: s })), { value: 'all', label: 'All NCRs' }], NCR_FILTER.status)}</select>`)}
      ${fld('Search', `<input id="nq" value="${esc(NCR_FILTER.q)}" placeholder="NCR no, inspection no, supplier, part">`)}
    </div>
    <div id="ncount" class="muted"></div>
    <div id="nlist"></div>
    <h3>Lots on hold or waiting for Quality Head (${held.length})</h3>
    ${held.length ? held.map(i => lotCardHtml(i, '#/view/' + enc(i.inspNo), 'Open')).join('') : '<p class="muted">None</p>'}`);
  const draw = () => {
    const q = NCR_FILTER.q.toLowerCase();
    const list = ncrs.filter(n => {
      if (NCR_FILTER.status === 'open' && !ncrIsOpen(n)) return false;
      if (NCR_FILTER.status === 'overdue' && !ncrOverdue8D(n)) return false;
      if (NCR_STATUSES.includes(NCR_FILTER.status) && n.status !== NCR_FILTER.status) return false;
      if (q && ![n.ncrNo, n.inspNo, n.supplierName, n.supplierCode, n.partNo, n.partName, n.poNo, n.invoiceNo, n.batchNo].some(x => String(x || '').toLowerCase().includes(q))) return false;
      return true;
    });
    $('#ncount').textContent = `${list.length} NCR(s)`;
    $('#nlist').innerHTML = list.length ? list.map(ncrCardHtml).join('') : '<p class="muted">No NCRs match.</p>';
  };
  $('#nf').onchange = e => { NCR_FILTER.status = e.target.value; draw(); };
  $('#nq').oninput = e => { NCR_FILTER.q = e.target.value.trim(); draw(); };
  draw();
}

async function renderNcr(m) {
  const no = decodeURIComponent(m[1]);
  const n = await DB.get('ncrs', no);
  if (!n) { view(notFoundHtml('NCR ' + no)); return; }
  const photos = await DB.byIndex('photos', 'inspNo', n.inspNo);
  const pmap = {};
  photos.forEach(p => { pmap[p.id] = p; });
  const isQH = App.role === 'QH';
  const dis = isQH ? '' : ' disabled';

  view(`<div class="card lot-head">
      <div class="lc-top"><b>${esc(n.ncrNo)}</b>${ncrStatusBadge(n.status)}</div>
      <div><b>${esc(n.partNo)}</b> – ${esc(n.partName)}</div>
      <div class="muted small">${esc(n.supplierName)} · Inspection ${esc(n.inspNo)} · ${fmtDate(n.date)}</div>
      ${(n.defects || []).some(d => d.critical) ? '<div class="alert red"><b>CRITICAL DEFECT</b></div>' : ''}
      ${ncrOverdue8D(n) ? `<div class="alert red"><b>8D OVERDUE</b> – target was ${fmtDate(n.eightDTarget)}</div>` : ''}
    </div>
    <div class="btn-bar">
      <a class="btn" href="#/view/${enc(n.inspNo)}">Open Inspection</a>
      <a class="btn primary" href="#/report/${enc(n.inspNo)}">Supplier Report</a>
    </div>
    <details class="card" open><summary><b>NCR details</b></summary>${kvTable([
      ['NCR number', n.ncrNo], ['Inspection number', n.inspNo], ['Date', fmtDate(n.date)], ['Supplier', `${n.supplierName} (${n.supplierCode})`],
      ['Part name', n.partName], ['Part number', n.partNo], ['Purchase order', n.poNo], ['Invoice / challan', n.invoiceNo], ['Batch number', n.batchNo],
      ['Quantity received', n.qtyReceived], ['Quantity inspected', n.qtyInspected], ['Quantity rejected', n.qtyRejected],
      ['Defect category', n.defectCategory], ['Classification', n.classification], ['Reason for NCR', (n.triggers || []).join(', ')]
    ])}</details>
    <div class="card"><h3>Failed characteristics</h3>
      ${(n.defects || []).length ? n.defects.map(d => `<div class="nok-box">
        <div><b>${esc(d.sn)}. ${esc(d.name)}</b> ${clsBadge(d.cls)} ${d.critical ? '<span class="badge b-red">CRITICAL DEFECT</span>' : ''}</div>
        ${kvTable([['Specification', d.spec + (d.type === 'Dimensional' ? ' ' + d.tolerance : '')], ['Observed value', d.observed], ['Defect description', d.description], ['Defect quantity', d.qty], ['Immediate action', d.action], ['Deviation', d.deviation ? `Approved by ${d.deviation.by}: ${d.deviation.reason}` : '']])}
        <div class="ph-grid mt">${(d.photos || []).map(pid => pmap[pid] ? `<div class="ph"><img src="${pmap[pid].dataUrl}" data-view="${esc(pid)}" alt=""><div class="ph-cap">${esc(pmap[pid].caption)}</div></div>` : '').join('')}</div>
      </div>`).join('') : '<p class="muted">No characteristic failed – NCR raised because the lot was rejected.</p>'}
    </div>
    <form class="card" id="ncrForm" novalidate>
      <h3>Containment, action and closure</h3>
      ${isQH ? '' : '<div class="alert blue">Only the Quality Head can update the NCR.</div>'}
      ${fld('Immediate containment', `<textarea name="containment" rows="2"${dis}>${esc(n.containment)}</textarea>`)}
      ${fld('Material location', `<input name="location" value="${esc(n.location)}"${dis}>`)}
      ${fld('Final disposition', `<select name="disposition"${dis}>${opts(DISPOSITIONS, n.disposition)}</select>`)}
      ${fld('Responsible person (BEM)', `<input name="responsible" value="${esc(n.responsible)}"${dis}>`)}
      <div class="grid2">
        ${fld('Target date *', `<input type="date" name="targetDate" value="${esc(n.targetDate)}"${dis}>`, 'Required while the action is open.')}
        ${fld('8D target date', `<input type="date" name="eightDTarget" value="${esc(n.eightDTarget)}"${dis}>`)}
      </div>
      ${fld('8D received on', `<input type="date" name="eightDReceived" value="${esc(n.eightDReceived)}"${dis}>`, 'Leave blank until the supplier 8D report is received.')}
      ${fld('Root cause (from supplier 8D)', `<textarea name="rootCause" rows="2"${dis}>${esc(n.rootCause)}</textarea>`)}
      ${fld('Corrective action', `<textarea name="correctiveAction" rows="2"${dis}>${esc(n.correctiveAction)}</textarea>`)}
      ${fld('Supplier response', `<textarea name="supplierResponse" rows="2"${dis}>${esc(n.supplierResponse)}</textarea>`)}
      ${fld('Closure evidence', `<textarea name="closureEvidence" rows="2"${dis}>${esc(n.closureEvidence)}</textarea>`, 'Required to close the NCR, e.g. 8D ref., re-inspection report no.')}
      ${fld('Verification remarks', `<textarea name="verification" rows="2"${dis}>${esc(n.verification)}</textarea>`, 'Required to close the NCR.')}
      ${fld('Current status', `<select name="status"${dis}>${opts(NCR_STATUSES, n.status)}</select>`)}
      <label class="chk-line"><input type="checkbox" name="qhApprove"${n.qhApproval ? ' checked' : ''}${dis}> Quality Head approval${n.qhApproval ? ` – ${esc(n.qhApproval.by)}, ${fmtDate(n.qhApproval.date)}` : ''}</label>
      ${isQH ? '<button type="button" class="btn primary block" id="bNcrSave">Save NCR</button>' : ''}
    </form>
    <details class="card"><summary><b>History</b></summary><ul class="hist">${(n.history || []).slice().reverse().map(h => `<li>${fmtDateTime(h.at)} – ${esc(h.by)}: ${esc(h.text)}</li>`).join('')}</ul></details>`);

  $$('img[data-view]').forEach(img => img.addEventListener('click', () => { const p = pmap[img.dataset.view]; if (p) UI.image(p.dataUrl, p.caption); }));
  if (!isQH) return;

  $('#bNcrSave').onclick = async () => {
    const f = $('#ncrForm');
    const d = {};
    ['containment', 'location', 'disposition', 'responsible', 'targetDate', 'eightDTarget', 'eightDReceived', 'rootCause', 'correctiveAction', 'supplierResponse', 'closureEvidence', 'verification', 'status']
      .forEach(k => { d[k] = String(f.elements[k].value || '').trim(); });
    const approve = f.elements.qhApprove.checked;
    const e = [];
    if (d.status !== 'Closed' && !d.targetDate) e.push('Target date cannot be blank while the corrective action is open.');
    if (d.status === 'Closed') {
      if (!d.closureEvidence) e.push('Closure evidence is required to close the NCR.');
      if (!d.verification) e.push('Verification remarks are required to close the NCR.');
      if (!approve) e.push('Tick "Quality Head approval" to close the NCR.');
    }
    if (d.eightDReceived && d.eightDReceived < n.date) e.push('8D received date cannot be earlier than the NCR date.');
    if (e.length) { UI.errors(e); return; }
    const oldStatus = n.status;
    Object.assign(n, d);
    if (approve && !n.qhApproval) n.qhApproval = { by: App.user, date: todayISO() };
    if (!approve) n.qhApproval = null;
    n.history = n.history || [];
    if (oldStatus !== n.status) n.history.push({ at: nowStamp(), by: App.user, text: `Status changed from ${oldStatus} to ${n.status}` });
    else n.history.push({ at: nowStamp(), by: App.user, text: 'NCR updated' });
    n.closedAt = n.status === 'Closed' ? (n.closedAt || nowStamp()) : '';
    n.updatedAt = nowStamp();
    await DB.put('ncrs', n);
    UI.toast('NCR saved', 'ok');
    router();
  };
}
