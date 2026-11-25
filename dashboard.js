/* BEM Incoming Inspection System - dashboard.js
   KPI calculations, dashboard screen and summaries used by the management review report. */
'use strict';

const SAMPLE_KPI = {
  cur: { lots: 185, acceptance: 93.5, rejQty: 428, ppm: 8450, openNcr: 12, overdue8d: 4, conditional: 6, copq: 240000 },
  prev: { lots: 172, acceptance: 96.2, rejQty: 215, ppm: 4980, openNcr: 9, overdue8d: 2, conditional: 7, copq: 150000 }
};
let DASH_PERIOD = '3m';

function sumCosts(c) {
  c = c || {};
  return num(c.sorting) + num(c.rework) + num(c.rejection) + num(c.transport) + num(c.lineStop);
}

/* Lots are assigned to a month by their receipt date */
function monthStats(ym, insps, ncrs) {
  const lots = insps.filter(i => isCompletedLot(i) && ymOf(i.receiptDate) === ym);
  const dt = t => lots.filter(i => i.decision && i.decision.type === t).length;
  const recQty = lots.reduce((s, i) => s + num(i.qtyReceived), 0);
  const rejQty = lots.reduce((s, i) => s + num(i.qtyRejected), 0);
  const asOf = ym === currentYM() ? todayISO() : monthEndISO(ym);
  const openAt = n => n.date <= asOf && (n.status !== 'Closed' || String(n.closedAt || '').slice(0, 10) > asOf);
  const openNcr = ncrs.filter(openAt).length;
  const overdue8d = ncrs.filter(n => openAt(n) && n.eightDTarget && n.eightDTarget < asOf && (!n.eightDReceived || n.eightDReceived > asOf)).length;
  const costs = { sorting: 0, rework: 0, rejection: 0, transport: 0, lineStop: 0 };
  lots.forEach(i => Object.keys(costs).forEach(k => { costs[k] += num((i.costs || {})[k]); }));
  return {
    ym, lots: lots.length, lotList: lots,
    accepted: dt('Accept'), rejected: dt('Reject'), conditional: dt('Conditional'), hold: dt('Hold'),
    pendingReview: lots.filter(i => i.status === 'Pending Quality Head Review').length,
    acceptance: lots.length ? (dt('Accept') / lots.length) * 100 : null,
    recQty, rejQty, ppm: recQty ? (rejQty / recQty) * 1e6 : 0,
    openNcr, overdue8d, costs, copq: Object.values(costs).reduce((a, b) => a + b, 0)
  };
}

function kpiStatus(key, val, T) {
  const t = T[key];
  if (!t || val === null || val === undefined) return 'none';
  if (t.higherBetter) return val >= t.green ? 'green' : val >= t.yellow ? 'yellow' : 'red';
  return val <= t.green ? 'green' : val <= t.yellow ? 'yellow' : 'red';
}
function statusChip(s) {
  const l = { green: 'Green', yellow: 'Yellow', red: 'Red', info: 'Information', none: 'No data' }[s];
  return `<span class="st st-${s}">${l}</span>`;
}

function kpiRowsHtml(a, b, T) {
  const rows = [
    ['Lots inspected', fmtInt(a.lots), fmtInt(b.lots), 'info'],
    ['Lot acceptance', a.acceptance === null ? '—' : fmtPct(a.acceptance), b.acceptance === null ? '—' : fmtPct(b.acceptance), kpiStatus('lotAcceptance', a.acceptance, T)],
    ['Rejected quantity', fmtInt(a.rejQty), fmtInt(b.rejQty), kpiStatus('rejectedQty', a.rejQty, T)],
    ['Incoming PPM', fmtInt(a.ppm), fmtInt(b.ppm), kpiStatus('ppm', a.ppm, T)],
    ['Open supplier NCRs', fmtInt(a.openNcr), fmtInt(b.openNcr), kpiStatus('openNcr', a.openNcr, T)],
    ['Overdue 8Ds', fmtInt(a.overdue8d), fmtInt(b.overdue8d), kpiStatus('overdue8d', a.overdue8d, T)],
    ['Conditional acceptances', fmtInt(a.conditional), fmtInt(b.conditional), kpiStatus('conditional', a.conditional, T)],
    ['Cost of poor quality', fmtINR(a.copq), fmtINR(b.copq), kpiStatus('copq', a.copq, T)]
  ];
  return rows.map(r => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td><td>${statusChip(r[3])}</td></tr>`).join('');
}

/* ---------- Summaries ---------- */
function lotsInRange(insps, from, to) {
  return insps.filter(i => { const d = String(i.receiptDate || '').slice(0, 10); return isCompletedLot(i) && d >= from && d <= to; });
}
function groupSummary(lots, keyFn, labelFn) {
  const map = {};
  lots.forEach(i => {
    const k = keyFn(i);
    if (!map[k]) map[k] = { key: k, label: labelFn(i), lots: 0, rejLots: 0, nokLots: 0, recQty: 0, rejQty: 0 };
    const g = map[k];
    g.lots++;
    if (i.decision && i.decision.type === 'Reject') g.rejLots++;
    if ((i.results || []).some(r => r.result === 'NOK')) g.nokLots++;
    g.recQty += num(i.qtyReceived);
    g.rejQty += num(i.qtyRejected);
  });
  return Object.values(map).map(g => ({ ...g, ppm: g.recQty ? (g.rejQty / g.recQty) * 1e6 : 0 }))
    .sort((a, b) => b.rejQty - a.rejQty || b.rejLots - a.rejLots || b.nokLots - a.nokLots);
}
function supplierSummary(lots) { return groupSummary(lots, i => i.supplierCode || '-', i => i.supplierName || i.supplierCode || '-'); }
function partSummary(lots) { return groupSummary(lots, i => i.partNo || '-', i => `${i.partNo || '-'} ${i.partName || ''}`); }
function defectSummary(lots) {
  const map = {};
  lots.forEach(i => (i.results || []).filter(r => r.result === 'NOK').forEach(r => {
    const c = defectCategory(r);
    if (!map[c]) map[c] = { label: c, count: 0, qty: 0 };
    map[c].count++;
    map[c].qty += num(r.def && r.def.qty);
  }));
  const list = Object.values(map).sort((a, b) => b.count - a.count || b.qty - a.qty);
  const total = list.reduce((s, x) => s + x.count, 0);
  let cum = 0;
  list.forEach(x => { cum += x.count; x.cumPct = total ? (cum / total) * 100 : 0; });
  return list;
}
function ncrAgeing(ncrs) {
  const b = [['0-7 days', 0, 7], ['8-15 days', 8, 15], ['16-30 days', 16, 30], ['31-60 days', 31, 60], ['Over 60 days', 61, 1e9]].map(x => ({ label: x[0], min: x[1], max: x[2], count: 0 }));
  ncrs.filter(ncrIsOpen).forEach(n => {
    const age = daysBetween(n.date, todayISO());
    const k = b.find(x => age >= x.min && age <= x.max);
    if (k) k.count++;
  });
  return b;
}
function hbars(items, valFn, labelFn, textFn, color) {
  const max = Math.max(1, ...items.map(valFn));
  return `<div class="bars">${items.map(x => `<div class="brow"><div class="blabel">${esc(labelFn(x))}</div><div class="bar-track"><div class="bar-fill ${color || ''}" style="width:${(valFn(x) / max) * 100}%"></div></div><div class="bval">${textFn(x)}</div></div>`).join('')}</div>`;
}

function trendHtml(insps) {
  const cur = currentYM();
  const months = [-5, -4, -3, -2, -1, 0].map(d => shiftYM(cur, d));
  const data = months.map(ym => {
    const lots = insps.filter(i => isCompletedLot(i) && ymOf(i.receiptDate) === ym);
    const rec = lots.reduce((s, i) => s + num(i.qtyReceived), 0), rej = lots.reduce((s, i) => s + num(i.qtyRejected), 0);
    return { ym, lots: lots.length, rej: lots.filter(i => i.decision && i.decision.type === 'Reject').length, ppm: rec ? (rej / rec) * 1e6 : 0 };
  });
  const max = Math.max(1, ...data.map(d => d.lots));
  return `<div class="trend">${data.map(d => `<div class="tcol">
      <div class="tbars"><div class="tbar blue" style="height:${(d.lots / max) * 100}%" title="Lots ${d.lots}"></div><div class="tbar red" style="height:${(d.rej / max) * 100}%" title="Rejected ${d.rej}"></div></div>
      <div class="tval">${d.lots} / <span class="t-nok">${d.rej}</span></div><div class="tlab">${monthLabel(d.ym).slice(0, 3)}</div><div class="tppm">${fmtInt(d.ppm)} ppm</div></div>`).join('')}</div>
    <div class="legend"><span class="lg blue"></span> Lots inspected <span class="lg red"></span> Rejected lots</div>`;
}

async function renderDashboard() {
  const [insps, ncrs, T] = await Promise.all([DB.getAll('inspections'), DB.getAll('ncrs'), DB.getSetting('thresholds', DEFAULT_THRESHOLDS)]);
  const cur = currentYM(), prev = shiftYM(cur, -1);
  const real = insps.some(isCompletedLot);
  const a = real ? monthStats(cur, insps, ncrs) : SAMPLE_KPI.cur;
  const b = real ? monthStats(prev, insps, ncrs) : SAMPLE_KPI.prev;
  const statuses = INSP_STATUSES.map(s => ({ label: s, count: insps.filter(i => i.status === s).length }));

  view(`<h2>Dashboard</h2>
    ${real ? '' : '<div class="alert yellow"><b>Demonstration values.</b> No completed inspections are stored yet. These sample figures are replaced automatically by calculated values as soon as the first inspection is completed.</div>'}
    <div class="card"><div class="tbl-wrap"><table class="tbl kpi"><thead><tr><th>KPI</th><th>Current month<div class="small">${monthLabel(cur)}</div></th><th>Previous month<div class="small">${monthLabel(prev)}</div></th><th>Status</th></tr></thead>
      <tbody>${kpiRowsHtml(a, b, T)}</tbody></table></div>
      <div class="muted small mt">Status compares the current month with the targets set in Masters → Settings. Lot acceptance % = accepted lots ÷ inspected lots × 100. PPM = rejected qty ÷ received qty × 1,000,000.</div></div>
    <div class="btn-bar"><a class="btn primary" href="#/mr">Management Review Report</a><a class="btn" href="#/settings">KPI Targets</a></div>
    <div class="card"><h3>Monthly inspection trend</h3>${trendHtml(insps)}</div>
    <div class="card"><h3>Inspection status summary (all lots)</h3>${hbars(statuses, x => x.count, x => x.label, x => x.count)}</div>
    <div class="card"><h3>Open NCR ageing</h3>${hbars(ncrAgeing(ncrs), x => x.count, x => x.label, x => x.count, 'red')}</div>
    <div class="card">${fld('Period for the summaries below (by receipt date)', `<select id="dPeriod">${opts(PERIOD_OPTIONS.filter(p => p.value !== 'custom'), DASH_PERIOD)}</select>`)}</div>
    <div id="dSum"></div>`);

  const drawSummaries = () => {
    const [from, to] = periodRange(DASH_PERIOD);
    const lots = lotsInRange(insps, from, to);
    const sup = supplierSummary(lots);
    const parts = partSummary(lots);
    const defs = defectSummary(lots);
    $('#dSum').innerHTML = `
      <div class="card"><h3>Supplier rejection summary</h3>${sup.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Supplier</th><th>Lots</th><th>Rejected lots</th><th>Rejected qty</th><th>PPM</th></tr></thead><tbody>${sup.map(s => `<tr><td>${esc(s.label)}</td><td class="num">${s.lots}</td><td class="num">${s.rejLots}</td><td class="num">${fmtInt(s.rejQty)}</td><td class="num">${fmtInt(s.ppm)}</td></tr>`).join('')}</tbody></table></div>
        ${hbars(sup.slice(0, 8), x => x.rejQty, x => x.label, x => fmtInt(x.rejQty), 'red')}` : '<p class="muted">No completed lots in this period.</p>'}</div>
      <div class="card"><h3>Defect Pareto</h3>${defs.length ? `<div class="bars">${defs.map(d => `<div class="brow"><div class="blabel">${esc(d.label)}</div><div class="bar-track"><div class="bar-fill red" style="width:${(d.count / defs[0].count) * 100}%"></div></div><div class="bval">${d.count} · ${d.cumPct.toFixed(0)}%</div></div>`).join('')}</div><div class="muted small">Count of NOK observations · cumulative %</div>` : '<p class="muted">No defects recorded in this period.</p>'}</div>
      <div class="card"><h3>Part-wise rejection summary</h3>${parts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Part</th><th>Lots</th><th>NOK lots</th><th>Rejected qty</th><th>PPM</th></tr></thead><tbody>${parts.map(p => `<tr><td>${esc(p.label)}</td><td class="num">${p.lots}</td><td class="num">${p.nokLots}</td><td class="num">${fmtInt(p.rejQty)}</td><td class="num">${fmtInt(p.ppm)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No completed lots in this period.</p>'}</div>`;
  };
  $('#dPeriod').onchange = e => { DASH_PERIOD = e.target.value; drawSummaries(); };
  drawSummaries();
}
