/* BEM Incoming Inspection System - masters.js
   Masters (suppliers, parts, inspectors, instruments, defects), inspection plans,
   part categories, settings, backup / restore. Quality Head only. */
'use strict';

const MASTER_DEFS = {
  suppliers: {
    title: 'Supplier Master', key: 'code',
    fields: [
      { k: 'code', l: 'Supplier code', req: true },
      { k: 'name', l: 'Supplier name', req: true },
      { k: 'contact', l: 'Contact person' },
      { k: 'email', l: 'Email', type: 'email' },
      { k: 'phone', l: 'Phone', type: 'tel' },
      { k: 'address', l: 'Address', type: 'textarea' },
      { k: 'status', l: 'Supplier status', type: 'select', opts: ['Approved', 'Conditionally approved', 'Blocked', 'Inactive'], req: true, def: 'Approved' }
    ],
    title1: x => x.name, sub: x => `${x.code} · ${x.status || ''}`
  },
  parts: {
    title: 'Part Master', key: 'partNo',
    fields: [
      { k: 'partNo', l: 'Part number', req: true },
      { k: 'partName', l: 'Part name', req: true },
      { k: 'category', l: 'Category', type: 'select', opts: 'categories', req: true },
      { k: 'vehicleType', l: 'Vehicle type', type: 'select', opts: VEHICLE_TYPES, req: true },
      { k: 'drawingNo', l: 'Drawing number' },
      { k: 'drawingRev', l: 'Drawing revision' },
      { k: 'supplierCode', l: 'Supplier code', type: 'select', opts: 'suppliers' },
      { k: 'inspectionLevel', l: 'Inspection level', type: 'select', opts: ['Normal', 'Tightened', 'Reduced', '100% inspection', 'Skip lot'], def: 'Normal' },
      { k: 'critical', l: 'Critical part', type: 'select', opts: ['No', 'Yes'], req: true, def: 'No' }
    ],
    title1: x => `${x.partNo} – ${x.partName}`, sub: x => `${x.category || ''} · ${x.vehicleType || ''} · Supplier ${x.supplierCode || '—'}${x.critical === 'Yes' ? ' · CRITICAL PART' : ''}`
  },
  inspectors: {
    title: 'Inspector Master', key: 'empNo',
    fields: [
      { k: 'empNo', l: 'Employee number', req: true },
      { k: 'name', l: 'Name', req: true },
      { k: 'role', l: 'Role', type: 'select', opts: ['Inspector', 'Quality Engineer', 'Quality Head'], req: true, def: 'Inspector' },
      { k: 'active', l: 'Active or inactive', type: 'select', opts: ['Active', 'Inactive'], req: true, def: 'Active' }
    ],
    title1: x => x.name, sub: x => `${x.empNo} · ${x.role || ''} · ${x.active || ''}`
  },
  instruments: {
    title: 'Instrument Master', key: 'id',
    fields: [
      { k: 'id', l: 'Instrument ID', req: true },
      { k: 'name', l: 'Instrument name', req: true },
      { k: 'range', l: 'Range' },
      { k: 'leastCount', l: 'Least count' },
      { k: 'calDue', l: 'Calibration due date', type: 'date', req: true },
      { k: 'status', l: 'Status', type: 'select', opts: ['Active', 'Under calibration', 'Out of service', 'Scrapped'], req: true, def: 'Active' }
    ],
    title1: x => `${x.id} – ${x.name}`, sub: x => `${x.range || ''} · LC ${x.leastCount || '—'} · Cal. due ${fmtDate(x.calDue)} · ${x.status || ''}`
  },
  defects: {
    title: 'Defect Master', key: 'code',
    fields: [
      { k: 'code', l: 'Defect code', req: true },
      { k: 'name', l: 'Defect name', req: true },
      { k: 'type', l: 'Inspection type', type: 'select', opts: INSPECTION_TYPES, req: true },
      { k: 'severity', l: 'Severity', type: 'select', opts: CLASSIFICATIONS, req: true, def: 'Major' },
      { k: 'active', l: 'Active or inactive', type: 'select', opts: ['Active', 'Inactive'], req: true, def: 'Active' }
    ],
    title1: x => `${x.code} – ${x.name}`, sub: x => `${x.type} · ${x.severity} · ${x.active}`
  }
};

async function resolveOpts(def) {
  const out = {};
  for (const f of def.fields) {
    if (f.type !== 'select') continue;
    if (f.opts === 'categories') out[f.k] = (await DB.getSetting('categories', DEFAULT_CATEGORIES)).map(c => ({ value: c, label: c }));
    else if (f.opts === 'suppliers') out[f.k] = (await DB.getAll('suppliers')).sort((a, b) => a.name.localeCompare(b.name)).map(s => ({ value: s.code, label: `${s.code} – ${s.name}` }));
    else out[f.k] = f.opts.map(o => ({ value: o, label: o }));
  }
  return out;
}

async function renderMasters() {
  const items = [
    ['Supplier Master', '#/master/suppliers'], ['Part Master', '#/master/parts'], ['Inspection Plans', '#/plans'],
    ['Inspector Master', '#/master/inspectors'], ['Instrument Master', '#/master/instruments'], ['Defect Master', '#/master/defects'],
    ['Part Categories', '#/categories'], ['Settings', '#/settings']
  ];
  view(`<h2>Masters</h2><nav class="menu">${items.map(([l, h]) => `<a class="menu-btn" href="${h}"><span class="ml">${l}</span></a>`).join('')}</nav>`);
}

async function renderMasterList(m) {
  const key = m[1];
  const def = MASTER_DEFS[key];
  if (!def) { redirect('#/masters'); return; }
  const items = (await DB.getAll(key)).sort((a, b) => String(a[def.key]).localeCompare(String(b[def.key])));
  view(`<h2>${def.title}</h2>
    <div class="btn-bar"><a class="btn primary" href="#/master/${key}/edit/">+ Add New</a><button type="button" class="btn" id="mExp">Export CSV</button><button type="button" class="btn" id="mImp">Import CSV</button></div>
    <div class="card">${fld('Search', '<input id="mq" placeholder="Type to filter">')}</div>
    <div id="mcount" class="muted"></div><div id="mlist"></div>`);
  const draw = () => {
    const q = $('#mq').value.trim().toLowerCase();
    const list = items.filter(x => !q || def.fields.some(f => String(x[f.k] || '').toLowerCase().includes(q)));
    $('#mcount').textContent = `${list.length} record(s)`;
    $('#mlist').innerHTML = list.map(x => `<a class="lot-card" href="#/master/${key}/edit/${enc(x[def.key])}">
      <div class="lc-top"><b>${esc(def.title1(x))}</b>${key === 'instruments' && instrumentExpired(x) ? '<span class="badge b-red">CALIBRATION EXPIRED</span>' : ''}</div>
      <div class="lc-line muted">${esc(def.sub(x))}</div></a>`).join('') || '<p class="muted">No records.</p>';
  };
  $('#mq').oninput = draw;
  $('#mExp').onclick = () => {
    downloadText(toCSV(def.fields.map(f => f.l), items.map(x => def.fields.map(f => x[f.k] === undefined ? '' : x[f.k]))), `BEM_${key}_${fileStamp()}.csv`, 'text/csv');
    UI.toast('CSV exported', 'ok');
  };
  $('#mImp').onclick = () => importMasterCsv(key);
  draw();
}

async function importMasterCsv(key) {
  const def = MASTER_DEFS[key];
  const file = await pickFile('.csv,text/csv');
  if (!file) return;
  const rows = parseCSV(await file.text());
  if (rows.length < 2) { UI.alert('The CSV file has no data rows.'); return; }
  const header = rows[0].map(h => h.trim().toLowerCase());
  const colIdx = def.fields.map(f => { let i = header.indexOf(f.l.toLowerCase()); if (i < 0) i = header.indexOf(f.k.toLowerCase()); return i; });
  const keyField = def.fields.find(f => f.k === def.key);
  if (colIdx[def.fields.indexOf(keyField)] < 0) { UI.alert(`Column "${keyField.l}" was not found. Export a CSV first to see the correct column names.`); return; }
  const optMap = await resolveOpts(def);
  const errors = [];
  const recs = [];
  const newCats = new Set();
  const seen = new Set();
  rows.slice(1).forEach((row, ri) => {
    const rowNo = ri + 2;
    const o = {};
    def.fields.forEach((f, fi) => {
      const ci = colIdx[fi];
      let v = ci >= 0 ? String(row[ci] === undefined ? '' : row[ci]).trim() : '';
      if (!v && f.def) v = f.def;
      if (f.type === 'select' && v) {
        const list = optMap[f.k];
        const hit = list.find(x => String(x.value).toLowerCase() === v.toLowerCase());
        if (hit) v = hit.value;
        else if (f.opts === 'categories') newCats.add(v);
        else errors.push(`Row ${rowNo}: "${v}" is not a valid ${f.l}.${list.length <= 12 ? ' Allowed: ' + list.map(x => x.value).join(', ') : ''}`);
      }
      if (f.type === 'date' && v) { const nd = normalizeDate(v); if (!nd) errors.push(`Row ${rowNo}: ${f.l} must be a date (YYYY-MM-DD or DD-MM-YYYY).`); else v = nd; }
      if (f.type === 'email' && v && !/^\S+@\S+\.\S+$/.test(v)) errors.push(`Row ${rowNo}: email address is not valid.`);
      if (f.req && !v) errors.push(`Row ${rowNo}: ${f.l} is required.`);
      o[f.k] = v;
    });
    if (o[def.key]) { if (seen.has(o[def.key])) errors.push(`Row ${rowNo}: ${keyField.l} "${o[def.key]}" appears more than once.`); seen.add(o[def.key]); }
    recs.push(o);
  });
  if (errors.length) { UI.errors(errors.slice(0, 30).concat(errors.length > 30 ? [`…and ${errors.length - 30} more errors.`] : []), 'CSV not imported – nothing was changed'); return; }
  if (!await UI.confirm(`Import ${recs.length} record(s) into ${def.title}?\nRecords with the same ${keyField.l} will be updated.${newCats.size ? `\n\nNew categories will be added: ${[...newCats].join(', ')}` : ''}`, { ok: 'Import' })) return;
  if (newCats.size) {
    const cats = await DB.getSetting('categories', DEFAULT_CATEGORIES);
    await DB.setSetting('categories', [...cats, ...newCats]);
  }
  await DB.putMany(key, recs);
  UI.toast(`${recs.length} record(s) imported`, 'ok');
  router();
}

async function renderMasterEdit(m) {
  const key = m[1];
  const id = decodeURIComponent(m[2] || '');
  const def = MASTER_DEFS[key];
  if (!def) { redirect('#/masters'); return; }
  const rec = id ? await DB.get(key, id) : null;
  if (id && !rec) { view(notFoundHtml(`${def.title} record ${id}`)); return; }
  const optMap = await resolveOpts(def);
  const fieldHtml = f => {
    const val = rec ? (rec[f.k] === undefined ? '' : rec[f.k]) : (f.def || '');
    const lock = rec && f.k === def.key;
    const lbl = esc(f.l) + (f.req ? ' *' : '');
    if (f.type === 'select') {
      const list = optMap[f.k].slice();
      if (val && !list.some(x => x.value === val)) list.push({ value: val, label: val });
      return fld(lbl, `<select name="${f.k}">${opts(list, val, '— Select —')}</select>`);
    }
    if (f.type === 'textarea') return fld(lbl, `<textarea name="${f.k}" rows="2">${esc(val)}</textarea>`);
    return fld(lbl, `<input name="${f.k}" type="${f.type || 'text'}" value="${esc(val)}"${lock ? ' readonly class="ro"' : ''}>`, lock ? 'The key field cannot be changed. Delete and re-create the record if needed.' : '');
  };
  view(`<h2>${rec ? 'Edit' : 'Add'} – ${def.title}</h2>
    ${key === 'instruments' && rec && instrumentExpired(rec) ? '<div class="alert red"><b>CALIBRATION EXPIRED</b> – this instrument cannot be used for inspection unless the Quality Head records an override.</div>' : ''}
    <form class="card" id="mf" novalidate>${def.fields.map(fieldHtml).join('')}</form>
    <div class="btn-bar"><button type="button" class="btn primary" id="mSave">Save</button>${rec ? '<button type="button" class="btn danger" id="mDel">Delete</button>' : ''}<a class="btn" href="#/master/${key}">Cancel</a></div>`);
  $('#mSave').onclick = async () => {
    const f = $('#mf');
    const o = rec ? { ...rec } : {};
    const e = [];
    def.fields.forEach(fd => {
      const v = String(f.elements[fd.k].value || '').trim();
      o[fd.k] = v;
      if (fd.req && !v) e.push(`${fd.l} is required.`);
      if (fd.type === 'email' && v && !/^\S+@\S+\.\S+$/.test(v)) e.push('Email address is not valid.');
    });
    if (!rec && o[def.key] && await DB.get(key, o[def.key])) e.push(`${def.fields[0].l} "${o[def.key]}" already exists.`);
    if (e.length) { UI.errors(e); return; }
    await DB.put(key, o);
    UI.toast('Saved', 'ok');
    go('#/master/' + key);
  };
  if (rec) $('#mDel').onclick = async () => {
    let extra = '';
    if (key === 'suppliers') { const n = (await DB.getAll('parts')).filter(p => p.supplierCode === rec.code).length; if (n) extra = `\n\n${n} part(s) use this supplier.`; }
    if (key === 'parts') extra = '\n\nThe inspection plan of this part will also be deleted. Past inspections are not affected.';
    if (!await UI.confirm(`Delete ${def.title1(rec)}?${extra}`, { danger: true, ok: 'Delete' })) return;
    await DB.del(key, rec[def.key]);
    if (key === 'parts') await DB.del('plans', rec.partNo);
    UI.toast('Deleted', 'ok');
    go('#/master/' + key);
  };
}

/* ================= Inspection plans ================= */
let PLAN_ED = null;
const PLAN_CSV_HEAD = ['Part number', 'SN', 'Inspection type', 'Characteristic', 'Specification', 'Nominal', 'Lower tolerance', 'Upper tolerance', 'Unit', 'Inspection method', 'Measuring instrument', 'Sample size', 'Classification', 'Reference / work instruction'];
const PLAN_CSV_KEYS = ['partNo', 'sn', 'type', 'name', 'spec', 'nominal', 'lowTol', 'upTol', 'unit', 'method', 'instrument', 'sampleSize', 'cls', 'refNote'];

async function renderPlans() {
  const [plans, parts] = await Promise.all([DB.getAll('plans'), DB.getAll('parts')]);
  const partMap = {};
  parts.forEach(p => { partMap[p.partNo] = p; });
  plans.sort((a, b) => a.partNo.localeCompare(b.partNo));
  view(`<h2>Inspection Plans</h2>
    <div class="btn-bar"><button type="button" class="btn primary" id="pNew">+ New Plan</button><button type="button" class="btn" id="pExp">Export Plans CSV</button><button type="button" class="btn" id="pImp">Import Plans CSV</button></div>
    <div class="card">${fld('Search', '<input id="pq" placeholder="Part number or name">')}</div>
    <div id="plist"></div>`);
  const draw = () => {
    const q = $('#pq').value.trim().toLowerCase();
    const list = plans.filter(p => !q || p.partNo.toLowerCase().includes(q) || String((partMap[p.partNo] || {}).partName || '').toLowerCase().includes(q));
    $('#plist').innerHTML = list.map(p => `<div class="lot-card">
      <div class="lc-top"><b>${esc(p.partNo)}</b><span class="badge b-blue">${p.chars.length} characteristics</span></div>
      <div class="lc-line">${esc((partMap[p.partNo] || {}).partName || '(part not in Part Master)')}</div>
      <div class="lc-line muted small">${p.chars.map(c => `${c.sn}. ${c.name}`).join(' · ')}</div>
      <div class="btn-bar"><a class="btn small" href="#/plan/${enc(p.partNo)}">Edit</a><button type="button" class="btn small" data-copy="${esc(p.partNo)}">Copy</button><button type="button" class="btn small danger" data-del="${esc(p.partNo)}">Delete</button></div></div>`).join('') || '<p class="muted">No inspection plans.</p>';
  };
  $('#pq').oninput = draw;
  $('#plist').onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.del) {
      if (!await UI.confirm(`Delete the inspection plan of ${b.dataset.del}? Past inspections keep their own copy of the plan.`, { danger: true, ok: 'Delete' })) return;
      await DB.del('plans', b.dataset.del);
      UI.toast('Plan deleted', 'ok');
      router();
    } else if (b.dataset.copy) {
      const src = plans.find(p => p.partNo === b.dataset.copy);
      const target = await UI.select('Copy inspection plan', `Copy the plan of ${src.partNo} to part number`, parts.filter(p => p.partNo !== src.partNo).map(p => ({ value: p.partNo, label: `${p.partNo} – ${p.partName}${plans.some(x => x.partNo === p.partNo) ? ' (has a plan)' : ''}` })));
      if (!target) return;
      if (plans.some(x => x.partNo === target) && !await UI.confirm(`${target} already has a plan. Replace it with the copy?`, { danger: true, ok: 'Replace' })) return;
      await DB.put('plans', { partNo: target, chars: clone(src.chars), updatedAt: nowStamp(), updatedBy: App.user, copiedFrom: src.partNo });
      UI.toast(`Plan copied to ${target}`, 'ok');
      go('#/plan/' + enc(target));
    }
  };
  $('#pNew').onclick = async () => {
    const free = parts.filter(p => !plans.some(x => x.partNo === p.partNo));
    if (!free.length) { UI.alert('Every part already has a plan. Add the new part in Part Master first, or edit an existing plan.'); return; }
    const pn = await UI.select('New inspection plan', 'Part number', free.map(p => ({ value: p.partNo, label: `${p.partNo} – ${p.partName}` })));
    if (pn) go('#/plan/' + enc(pn));
  };
  $('#pExp').onclick = () => {
    const rows = [];
    plans.forEach(p => p.chars.forEach(c => rows.push(PLAN_CSV_KEYS.map(k => (k === 'partNo' ? p.partNo : (c[k] === undefined ? '' : c[k]))))));
    downloadText(toCSV(PLAN_CSV_HEAD, rows), `BEM_inspection_plans_${fileStamp()}.csv`, 'text/csv');
    UI.toast('Plans exported', 'ok');
  };
  $('#pImp').onclick = () => importPlansCsv(parts);
  draw();
}

function planCharErrors(c, label) {
  const e = [];
  if (!INSPECTION_TYPES.includes(c.type)) e.push(`${label}: inspection type must be one of ${INSPECTION_TYPES.join(', ')}.`);
  if (!String(c.name || '').trim()) e.push(`${label}: characteristic name is required.`);
  if (!CLASSIFICATIONS.includes(c.cls)) e.push(`${label}: classification must be Critical, Major or Minor.`);
  if (!/^\d+$/.test(String(c.sampleSize || '').trim()) || Number(c.sampleSize) < 1) e.push(`${label}: sample size must be a whole number of 1 or more.`);
  else if (Number(c.sampleSize) > 50 && c.type === 'Dimensional') e.push(`${label}: dimensional sample size cannot exceed 50 readings.`);
  if (c.type === 'Dimensional') {
    if (!isNum(c.nominal)) e.push(`${label}: nominal value must be a number.`);
    if (!isNum(c.lowTol)) e.push(`${label}: lower tolerance must be a number (e.g. -0.10).`);
    if (!isNum(c.upTol)) e.push(`${label}: upper tolerance must be a number (e.g. 0.15).`);
    if (isNum(c.nominal) && isNum(c.lowTol) && isNum(c.upTol) && Number(c.nominal) + Number(c.lowTol) > Number(c.nominal) + Number(c.upTol)) e.push(`${label}: lower limit cannot be greater than upper limit.`);
    if (!String(c.unit || '').trim()) e.push(`${label}: unit is required.`);
  } else if (!String(c.spec || '').trim()) e.push(`${label}: specification / requirement is required.`);
  return e;
}

async function importPlansCsv(parts) {
  const file = await pickFile('.csv,text/csv');
  if (!file) return;
  const rows = parseCSV(await file.text());
  if (rows.length < 2) { UI.alert('The CSV file has no data rows.'); return; }
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = PLAN_CSV_HEAD.map((h, i) => { let j = header.indexOf(h.toLowerCase()); if (j < 0) j = header.indexOf(PLAN_CSV_KEYS[i].toLowerCase()); return j; });
  if (idx[0] < 0 || idx[3] < 0) { UI.alert('Columns "Part number" and "Characteristic" are required. Export a plans CSV first to see the correct format.'); return; }
  const errors = [];
  const byPart = {};
  rows.slice(1).forEach((row, ri) => {
    const c = {};
    PLAN_CSV_KEYS.forEach((k, i) => { c[k] = idx[i] >= 0 ? String(row[idx[i]] === undefined ? '' : row[idx[i]]).trim() : ''; });
    const t = INSPECTION_TYPES.find(x => x.toLowerCase() === c.type.toLowerCase());
    if (t) c.type = t;
    const cl = CLASSIFICATIONS.find(x => x.toLowerCase() === c.cls.toLowerCase());
    if (cl) c.cls = cl;
    if (!c.sampleSize) c.sampleSize = '1';
    const label = `Row ${ri + 2}`;
    if (!c.partNo) { errors.push(`${label}: part number is required.`); return; }
    if (!parts.some(p => p.partNo === c.partNo)) errors.push(`${label}: part ${c.partNo} is not in Part Master. Import parts first.`);
    errors.push(...planCharErrors(c, label));
    (byPart[c.partNo] = byPart[c.partNo] || []).push(c);
  });
  if (errors.length) { UI.errors(errors.slice(0, 30).concat(errors.length > 30 ? [`…and ${errors.length - 30} more errors.`] : []), 'CSV not imported – nothing was changed'); return; }
  const pns = Object.keys(byPart);
  if (!await UI.confirm(`Import inspection plans for ${pns.length} part(s): ${pns.join(', ')}?\nExisting plans of these parts will be replaced.`, { ok: 'Import' })) return;
  await DB.putMany('plans', pns.map(pn => ({
    partNo: pn, updatedAt: nowStamp(), updatedBy: App.user,
    chars: byPart[pn].map((c, i) => ({ sn: i + 1, type: c.type, name: c.name, spec: c.spec, nominal: c.nominal, lowTol: c.lowTol, upTol: c.upTol, unit: c.unit, method: c.method, instrument: c.instrument, sampleSize: c.sampleSize, cls: c.cls, refNote: c.refNote, refPhoto: '' }))
  })));
  UI.toast(`${pns.length} plan(s) imported`, 'ok');
  router();
}

function blankChar(sn) {
  return { sn, type: 'Dimensional', name: '', spec: '', nominal: '', lowTol: '', upTol: '', unit: 'mm', method: '', instrument: '', sampleSize: '1', cls: 'Major', refNote: '', refPhoto: '' };
}

async function renderPlanEditor(m) {
  const partNo = decodeURIComponent(m[1]);
  const part = await DB.get('parts', partNo);
  if (!part) { view(notFoundHtml('Part ' + partNo + ' (add it in Part Master first)')); return; }
  const plan = await DB.get('plans', partNo);
  const instruments = await DB.getAll('instruments');
  PLAN_ED = { partNo, part, chars: plan ? clone(plan.chars) : [blankChar(1)], instNames: [...new Set(instruments.map(i => i.name))] };
  drawPlanEditor();
}

function planCharHtml(c, i) {
  const dim = c.type === 'Dimensional';
  let lim = '';
  if (dim && isNum(c.nominal) && isNum(c.lowTol) && isNum(c.upTol)) {
    const L = limits(c);
    lim = L.lsl > L.usl ? '<span class="t-nok">Lower limit is greater than upper limit</span>' : `Acceptable range: <b>${L.lslS} to ${L.uslS} ${esc(c.unit)}</b>`;
  }
  return `<div class="char-card" data-idx="${i}">
    <div class="char-head"><span class="sn">${i + 1}</span><div class="ch-name"><b>Characteristic ${i + 1}</b></div>
      <div class="mini-btns"><button type="button" class="btn small" data-pact="up" aria-label="Move up">↑</button><button type="button" class="btn small" data-pact="down" aria-label="Move down">↓</button><button type="button" class="btn small danger" data-pact="del">Delete</button></div></div>
    ${fld('Inspection type *', `<select data-k="type">${opts(INSPECTION_TYPES, c.type)}</select>`)}
    ${fld('Characteristic name *', `<input data-k="name" value="${esc(c.name)}">`)}
    ${fld(dim ? 'Specification (text, optional)' : 'Specification / requirement *', `<input data-k="spec" value="${esc(c.spec)}" placeholder="${dim ? 'e.g. 20.00 mm' : 'e.g. Free from dent, crack and rust'}">`)}
    ${dim ? `<div class="grid2">
      ${fld('Nominal value *', `<input data-k="nominal" inputmode="decimal" value="${esc(c.nominal)}">`)}
      ${fld('Unit *', `<input data-k="unit" value="${esc(c.unit)}">`)}
      ${fld('Lower tolerance *', `<input data-k="lowTol" inputmode="decimal" value="${esc(c.lowTol)}" placeholder="-0.10">`)}
      ${fld('Upper tolerance *', `<input data-k="upTol" inputmode="decimal" value="${esc(c.upTol)}" placeholder="0.15">`)}
    </div><div class="range" id="lim-${i}">${lim || 'Enter nominal and tolerances to see the limits.'}</div>` : ''}
    ${fld('Inspection method', `<input data-k="method" value="${esc(c.method)}">`)}
    ${fld('Measuring instrument', `<input data-k="instrument" list="instNames" value="${esc(c.instrument)}">`)}
    <div class="grid2">
      ${fld('Sample size *', `<input data-k="sampleSize" inputmode="numeric" value="${esc(c.sampleSize)}">`)}
      ${fld('Classification *', `<select data-k="cls">${opts(CLASSIFICATIONS, c.cls)}</select>`)}
    </div>
    ${fld('Reference / work instruction', `<input data-k="refNote" value="${esc(c.refNote)}" placeholder="e.g. WI-IQC-012 or note">`)}
    <div class="ref-photo">${c.refPhoto ? `<img src="${c.refPhoto}" alt="Reference">` : ''}
      <div class="btn-bar"><button type="button" class="btn small" data-pact="refadd">${c.refPhoto ? 'Change' : 'Add'} reference photograph</button>${c.refPhoto ? '<button type="button" class="btn small danger" data-pact="refdel">Remove photograph</button>' : ''}</div></div>
  </div>`;
}

function drawPlanEditor() {
  const p = PLAN_ED.part;
  view(`<h2>Inspection Plan</h2>
    <div class="card"><b>${esc(p.partNo)}</b> – ${esc(p.partName)}<div class="muted small">${esc(p.category)} · ${esc(p.vehicleType)} · Drawing ${esc(p.drawingNo || '—')} Rev ${esc(p.drawingRev || '—')}${p.critical === 'Yes' ? ' · CRITICAL PART' : ''}</div></div>
    <datalist id="instNames">${PLAN_ED.instNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div id="pchars">${PLAN_ED.chars.map(planCharHtml).join('')}</div>
    <div class="btn-bar"><button type="button" class="btn" id="pAdd">+ Add Characteristic</button><button type="button" class="btn primary" id="pSave">Save Plan</button><a class="btn" href="#/plans">Cancel</a></div>`);
  const box = $('#pchars');
  const onEdit = e => {
    const t = e.target;
    if (!t.dataset.k) return;
    const i = +t.closest('.char-card').dataset.idx;
    const c = PLAN_ED.chars[i];
    c[t.dataset.k] = t.value;
    if (t.dataset.k === 'type') { drawPlanEditor(); return; }
    if (['nominal', 'lowTol', 'upTol', 'unit'].includes(t.dataset.k)) {
      const el = $('#lim-' + i);
      if (el) {
        if (isNum(c.nominal) && isNum(c.lowTol) && isNum(c.upTol)) {
          const L = limits(c);
          el.innerHTML = L.lsl > L.usl ? '<span class="t-nok">Lower limit is greater than upper limit</span>' : `Acceptable range: <b>${L.lslS} to ${L.uslS} ${esc(c.unit)}</b>`;
        } else el.textContent = 'Enter nominal and tolerances to see the limits.';
      }
    }
  };
  box.addEventListener('input', e => { if (e.target.tagName !== 'SELECT') onEdit(e); });
  box.addEventListener('change', e => { if (e.target.tagName === 'SELECT') onEdit(e); });
  box.addEventListener('click', async e => {
    const b = e.target.closest('button[data-pact]');
    if (!b) return;
    const i = +b.closest('.char-card').dataset.idx;
    const ch = PLAN_ED.chars;
    switch (b.dataset.pact) {
      case 'up': if (i > 0) { [ch[i - 1], ch[i]] = [ch[i], ch[i - 1]]; drawPlanEditor(); } break;
      case 'down': if (i < ch.length - 1) { [ch[i + 1], ch[i]] = [ch[i], ch[i + 1]]; drawPlanEditor(); } break;
      case 'del':
        if (await UI.confirm(`Delete characteristic ${i + 1} (${ch[i].name || 'no name'})?`, { danger: true, ok: 'Delete' })) { ch.splice(i, 1); drawPlanEditor(); }
        break;
      case 'refadd': {
        const f = await pickFile('image/*');
        if (!f) break;
        try { ch[i].refPhoto = await compressImage(f, 1024, 0.7); drawPlanEditor(); }
        catch (err) { UI.alert('This photograph could not be read.'); }
        break;
      }
      case 'refdel':
        if (await UI.confirm('Remove the reference photograph?', { danger: true, ok: 'Remove' })) { ch[i].refPhoto = ''; drawPlanEditor(); }
        break;
      default: break;
    }
  });
  $('#pAdd').onclick = () => { PLAN_ED.chars.push(blankChar(PLAN_ED.chars.length + 1)); drawPlanEditor(); window.scrollTo(0, document.body.scrollHeight); };
  $('#pSave').onclick = async () => {
    const e = [];
    if (!PLAN_ED.chars.length) e.push('Add at least one characteristic.');
    PLAN_ED.chars.forEach((c, i) => e.push(...planCharErrors(c, `Characteristic ${i + 1}`)));
    if (e.length) { UI.errors(e); return; }
    PLAN_ED.chars.forEach((c, i) => { c.sn = i + 1; Object.keys(c).forEach(k => { if (typeof c[k] === 'string' && k !== 'refPhoto') c[k] = c[k].trim(); }); });
    await DB.put('plans', { partNo: PLAN_ED.partNo, chars: PLAN_ED.chars, updatedAt: nowStamp(), updatedBy: App.user });
    UI.toast('Inspection plan saved', 'ok');
    go('#/plans');
  };
}

/* ================= Part categories ================= */
async function renderCategories() {
  const [cats, parts] = await Promise.all([DB.getSetting('categories', DEFAULT_CATEGORIES), DB.getAll('parts')]);
  view(`<h2>Part Categories</h2>
    <div class="card">${fld('New category', '<input id="cNew" placeholder="e.g. Brake system">')}<button type="button" class="btn primary block" id="cAdd">Add Category</button></div>
    <div class="card"><ul class="cat-list">${cats.map((c, i) => `<li><span>${esc(c)} <span class="muted small">(${parts.filter(p => p.category === c).length} parts)</span></span><button type="button" class="btn small danger" data-ci="${i}">Delete</button></li>`).join('')}</ul></div>`);
  $('#cAdd').onclick = async () => {
    const v = $('#cNew').value.trim();
    if (!v) { UI.alert('Type the category name.'); return; }
    if (cats.some(c => c.toLowerCase() === v.toLowerCase())) { UI.alert('This category already exists.'); return; }
    await DB.setSetting('categories', [...cats, v]);
    UI.toast('Category added', 'ok');
    router();
  };
  $$('[data-ci]').forEach(b => {
    b.onclick = async () => {
      const c = cats[+b.dataset.ci];
      const used = parts.filter(p => p.category === c).length;
      if (!await UI.confirm(`Delete category "${c}"?${used ? `\n\n${used} part(s) still use it; they keep the name but it will no longer be offered for new parts.` : ''}`, { danger: true, ok: 'Delete' })) return;
      await DB.setSetting('categories', cats.filter(x => x !== c));
      router();
    };
  });
}

/* ================= Settings ================= */
const DATA_WARNING = 'Data is currently stored on this device. Create a regular backup. Clearing browser data or losing the phone may permanently delete inspections.';

async function renderSettings() {
  const [qhName, T, lastBackup] = await Promise.all([DB.getSetting('qhName', 'Quality Head'), DB.getSetting('thresholds', DEFAULT_THRESHOLDS), DB.getSetting('lastBackup', '')]);
  let persisted = null, estimate = null;
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (e) { persisted = null; }
  try { if (navigator.storage && navigator.storage.estimate) estimate = await navigator.storage.estimate(); } catch (e) { estimate = null; }
  const keys = Object.keys(DEFAULT_THRESHOLDS);
  view(`<h2>Settings</h2>
    <div class="alert red"><b>${esc(DATA_WARNING)}</b></div>
    <div class="card"><h3>Quality Head</h3>${fld('Quality Head name (printed on reports)', `<input id="sQh" value="${esc(qhName)}">`)}<button type="button" class="btn primary block" id="sQhSave">Save Name</button></div>
    <div class="card"><h3>Change Quality Head PIN</h3>
      ${fld('Current PIN', '<input id="sPinOld" type="password" inputmode="numeric" maxlength="4" autocomplete="off">')}
      ${fld('New 4-digit PIN', '<input id="sPinNew" type="password" inputmode="numeric" maxlength="4" autocomplete="off">')}
      ${fld('Confirm new PIN', '<input id="sPinNew2" type="password" inputmode="numeric" maxlength="4" autocomplete="off">')}
      <button type="button" class="btn primary block" id="sPinSave">Change PIN</button>
      <p class="muted small">The PIN is basic local access control on this phone only. It is not enterprise-grade security: anyone with the phone and technical knowledge could read the stored data.</p></div>
    <div class="card"><h3>KPI targets (dashboard status)</h3>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>KPI</th><th>Green limit</th><th>Yellow limit</th><th>Rule</th></tr></thead><tbody>
      ${keys.map(k => { const t = T[k] || DEFAULT_THRESHOLDS[k]; const hb = DEFAULT_THRESHOLDS[k].higherBetter; return `<tr><td>${esc(DEFAULT_THRESHOLDS[k].label)}</td><td><input class="thr" data-k="${k}" data-g="green" inputmode="decimal" value="${esc(t.green)}"></td><td><input class="thr" data-k="${k}" data-g="yellow" inputmode="decimal" value="${esc(t.yellow)}"></td><td class="small">${hb ? 'Green ≥ green limit; Yellow ≥ yellow limit; else Red' : 'Green ≤ green limit; Yellow ≤ yellow limit; else Red'}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="btn-bar"><button type="button" class="btn primary" id="sThrSave">Save Targets</button><button type="button" class="btn" id="sThrReset">Restore Defaults</button></div></div>
    <div class="card"><h3>Backup status</h3><p>Last backup: <b>${lastBackup ? fmtDateTime(lastBackup) : 'Never'}</b></p><a class="btn block" href="#/backup">Open Backup and Restore</a></div>
    <div class="card"><h3>Storage on this phone</h3>
      <p>Permanent storage: <b>${persisted === null ? 'Unknown' : persisted ? 'Granted (browser will not clear data automatically)' : 'Not granted'}</b></p>
      ${estimate ? `<p>Used: <b>${(estimate.usage / 1048576).toFixed(1)} MB</b> of about ${(estimate.quota / 1048576).toFixed(0)} MB available.</p>` : ''}
      ${persisted ? '' : '<button type="button" class="btn block" id="sPersist">Request Permanent Storage</button><p class="muted small">Chrome usually grants this after the app is installed on the home screen.</p>'}</div>
    <div class="card"><h3>App</h3><p>Version ${APP_VERSION}. Works offline after the first load.</p>
      ${App.deferredInstall ? '<button type="button" class="btn primary block" id="sInstall">Install App on Home Screen</button>' : '<p class="muted small">To install: Chrome menu (⋮) → Add to Home screen / Install app.</p>'}</div>`);

  $('#sQhSave').onclick = async () => {
    const v = $('#sQh').value.trim();
    if (!v) { UI.alert('Enter the Quality Head name.'); return; }
    await DB.setSetting('qhName', v);
    if (App.role === 'QH') setSession('QH', v);
    UI.toast('Name saved', 'ok');
  };
  $('#sPinSave').onclick = async () => {
    const cur = await DB.getSetting('qhPin', '1234');
    const o = $('#sPinOld').value.trim(), n1 = $('#sPinNew').value.trim(), n2 = $('#sPinNew2').value.trim();
    const e = [];
    if (o !== cur) e.push('Current PIN is incorrect.');
    if (!/^\d{4}$/.test(n1)) e.push('New PIN must be exactly 4 digits.');
    if (n1 !== n2) e.push('New PIN and confirmation do not match.');
    if (e.length) { UI.errors(e); return; }
    await DB.setSetting('qhPin', n1);
    await DB.setSetting('pinChanged', true);
    ['sPinOld', 'sPinNew', 'sPinNew2'].forEach(id => { $('#' + id).value = ''; });
    UI.alert('Quality Head PIN changed. Remember it – it is needed to open Dashboard, Masters and Backup.', 'PIN changed');
  };
  $('#sThrSave').onclick = async () => {
    const out = clone(DEFAULT_THRESHOLDS);
    const e = [];
    $$('.thr').forEach(inp => {
      const k = inp.dataset.k, g = inp.dataset.g, v = inp.value.trim();
      if (!isNum(v)) e.push(`${DEFAULT_THRESHOLDS[k].label}: ${g} limit must be a number.`);
      else out[k][g] = Number(v);
    });
    keys.forEach(k => {
      const t = out[k];
      if (t.higherBetter && t.green < t.yellow) e.push(`${t.label}: green limit must be greater than or equal to the yellow limit.`);
      if (!t.higherBetter && t.green > t.yellow) e.push(`${t.label}: green limit must be less than or equal to the yellow limit.`);
    });
    if (e.length) { UI.errors(e); return; }
    await DB.setSetting('thresholds', out);
    UI.toast('KPI targets saved', 'ok');
  };
  $('#sThrReset').onclick = async () => {
    if (!await UI.confirm('Restore the default KPI targets?')) return;
    await DB.setSetting('thresholds', clone(DEFAULT_THRESHOLDS));
    router();
  };
  const bp = $('#sPersist');
  if (bp) bp.onclick = async () => {
    let ok = false;
    try { ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { ok = false; }
    UI.alert(ok ? 'Permanent storage granted.' : 'Chrome did not grant permanent storage yet. Install the app on the home screen and use it regularly, then try again. Keep making backups.');
    router();
  };
  const bi = $('#sInstall');
  if (bi) bi.onclick = async () => {
    const ev = App.deferredInstall;
    App.deferredInstall = null;
    ev.prompt();
    try { await ev.userChoice; } catch (e) { /* ignored */ }
    router();
  };
}

/* ================= Backup and restore ================= */
async function renderBackup() {
  const [lastBackup, insps, ncrs, photos] = await Promise.all([DB.getSetting('lastBackup', ''), DB.getAll('inspections'), DB.getAll('ncrs'), DB.getAll('photos')]);
  const days = lastBackup ? daysBetween(lastBackup.slice(0, 10), todayISO()) : null;
  view(`<h2>Backup and Restore</h2>
    <div class="alert red"><b>${esc(DATA_WARNING)}</b></div>
    <div class="card"><p>Last backup: <b>${lastBackup ? `${fmtDateTime(lastBackup)} (${days} day(s) ago)` : 'Never'}</b></p>
      <p class="muted small">On this phone: ${insps.length} inspections, ${ncrs.length} NCRs, ${photos.length} photographs.</p>
      ${days === null || days >= 30 ? '<div class="alert yellow">Monthly backup is due. Create a backup now and copy it to Google Drive, email or a computer.</div>' : ''}</div>
    <div class="card">
      <button type="button" class="btn primary block" id="bkExport">Export Complete Backup (JSON)</button>
      <button type="button" class="btn block" id="bkRestore">Restore Backup from JSON</button>
      <button type="button" class="btn block" id="bkInspCsv">Export Inspection Summary (CSV)</button>
      <button type="button" class="btn block" id="bkNcrCsv">Export NCR Summary (CSV)</button>
    </div>
    <div class="card"><h3>Clear all data</h3><p>Deletes every inspection, NCR, photograph, master and setting on this phone and returns the app to its first-install state with the demonstration data.</p>
      <button type="button" class="btn danger block" id="bkClear">Clear All Data</button></div>`);
  $('#bkExport').onclick = exportBackup;
  $('#bkRestore').onclick = restoreBackup;
  $('#bkInspCsv').onclick = () => { downloadText(inspectionSummaryCsv(insps.sort((a, b) => a.inspNo.localeCompare(b.inspNo))), `BEM_inspection_summary_${fileStamp()}.csv`, 'text/csv'); UI.toast('Inspection summary exported', 'ok'); };
  $('#bkNcrCsv').onclick = () => { downloadText(ncrSummaryCsv(ncrs.sort((a, b) => a.ncrNo.localeCompare(b.ncrNo))), `BEM_NCR_summary_${fileStamp()}.csv`, 'text/csv'); UI.toast('NCR summary exported', 'ok'); };
  $('#bkClear').onclick = clearAllData;
}

async function exportBackup() {
  const data = {};
  for (const s of Object.keys(STORE_KEYS)) data[s] = await DB.getAll(s);
  const stamp = nowStamp();
  const counts = {};
  Object.keys(data).forEach(k => { counts[k] = data[k].length; });
  const obj = { app: 'BEM Incoming Inspection System', format: 1, appVersion: APP_VERSION, exportedAt: stamp, counts, data };
  const name = `BEM-IQC-Backup-${fileStamp()}.json`;
  downloadBlob(new Blob([JSON.stringify(obj)], { type: 'application/json' }), name);
  await DB.setSetting('lastBackup', stamp);
  await UI.alert(`Backup file "${name}" has been saved to the Downloads folder.\n\nCopy it to Google Drive, email it to yourself or move it to a computer, so it is not lost with the phone.`, 'Backup created');
  router();
}

async function restoreBackup() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  let obj;
  try { obj = JSON.parse(await f.text()); } catch (e) { UI.alert('This file is not a valid backup file (it could not be read).'); return; }
  if (!obj || obj.app !== 'BEM Incoming Inspection System' || !obj.data || typeof obj.data !== 'object') { UI.alert('This file is not a BEM Incoming Inspection System backup.'); return; }
  const bad = Object.keys(STORE_KEYS).filter(s => obj.data[s] !== undefined && !Array.isArray(obj.data[s]));
  if (bad.length) { UI.alert('The backup file is damaged (' + bad.join(', ') + '). Nothing was changed.'); return; }
  const c = s => (obj.data[s] || []).length;
  const ok = await UI.confirm(`Restore the backup created on ${fmtDateTime(obj.exportedAt)}?\n\nIt contains ${c('inspections')} inspections, ${c('ncrs')} NCRs, ${c('photos')} photographs, ${c('parts')} parts and ${c('plans')} inspection plans.\n\nALL data now on this phone will be REPLACED by the backup. This cannot be undone.`, { danger: true, ok: 'Restore' });
  if (!ok) return;
  try {
    await DB.replaceAll(obj.data);
  } catch (e) {
    UI.alert('Restore failed and no data was changed: ' + (e && e.message ? e.message : e));
    return;
  }
  await DB.setSetting('seeded', true);
  await DB.setSetting('lastRestore', nowStamp());
  if (!(await DB.getSetting('qhPin', ''))) await DB.setSetting('qhPin', '1234');
  await UI.alert('Backup restored successfully. The Quality Head PIN is now the PIN stored in the backup. The app will reload.', 'Restore complete');
  location.reload();
}

async function clearAllData() {
  if (!await UI.confirm(`WARNING: This permanently deletes ALL inspections, NCRs, photographs, masters and settings on this phone.\n\n${DATA_WARNING}\n\nHave you made a backup?`, { danger: true, ok: 'Continue' })) return;
  const typed = await UI.prompt('Confirm clearing all data', 'Type DELETE to confirm', '');
  if (typed !== 'DELETE') { if (typed !== null) UI.alert('Nothing was deleted (DELETE was not typed exactly).'); return; }
  await DB.replaceAll({});
  try { localStorage.removeItem('bem_user'); sessionStorage.removeItem('bem_qh'); } catch (e) { /* storage unavailable */ }
  await UI.alert('All data has been cleared. The app will reload with the demonstration data.', 'Data cleared');
  location.hash = '#/login';
  location.reload();
}
