/* BEM Incoming Inspection System - reports.js
   Supplier inspection / non-conformance report, monthly management review report, CSV exports. */
'use strict';

/* Black-and-white report styling. Also embedded in the shared HTML report file. */
const REPORT_CSS = `
.report{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;font-size:12px;line-height:1.35;max-width:820px;margin:0 auto;padding:12px}
.report *{color:#000}
.report .rh{display:flex;justify-content:space-between;gap:10px;border-bottom:2px solid #000;padding-bottom:6px}
.report .co{font-size:17px;font-weight:bold}
.report .rh-right{text-align:right}
.report h1{font-size:16px;text-align:center;margin:8px 0;text-transform:uppercase}
.report h2{font-size:13px;background:#e6e6e6;border:1px solid #000;padding:3px 6px;margin:12px 0 0}
.report table{width:100%;border-collapse:collapse;margin:0}
.report th,.report td{border:1px solid #000;padding:3px 5px;vertical-align:top;text-align:left}
.report th{background:#f2f2f2}
.report .kv2 td.k{width:18%;font-weight:bold;background:#f7f7f7}
.report .num{text-align:right}
.report .nok-item{border:1px solid #000;border-top:none;padding:6px;page-break-inside:avoid;break-inside:avoid}
.report .photos{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.report figure{margin:0;width:48%;border:1px solid #000;padding:4px;box-sizing:border-box;page-break-inside:avoid;break-inside:avoid}
.report figure img{width:100%;height:auto;max-height:260px;object-fit:contain;display:block}
.report figcaption{font-size:10.5px;margin-top:3px}
.report .crit{font-weight:bold;border:2px solid #000;padding:0 4px;display:inline-block}
.report .resp{border:1px solid #000;border-top:none;padding:6px}
.report .lines{border:1px solid #000;min-height:70px;margin-top:4px;padding:4px}
.report .cb{display:inline-block;width:14px;height:14px;border:1.5px solid #000;text-align:center;line-height:13px;font-weight:bold;margin-right:4px;vertical-align:middle}
.report .dec{display:flex;flex-wrap:wrap;gap:16px;border:1px solid #000;border-top:none;padding:6px}
.report .sig{height:48px}
.report .foot{margin-top:10px;font-size:10px;text-align:center}
.report .b{font-weight:bold}
.report .mt{margin-top:6px}
@media print{.report{max-width:none;padding:0}}
`;
(function injectReportCss() {
  const s = document.createElement('style');
  s.textContent = REPORT_CSS;
  document.head.appendChild(s);
})();

function rptKv(pairs) {
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i], b = pairs[i + 1] || ['', ''];
    rows.push(`<tr><td class="k">${esc(a[0])}</td><td>${esc(a[1])}</td><td class="k">${esc(b[0])}</td><td>${esc(b[1])}</td></tr>`);
  }
  return `<table class="kv2"><tbody>${rows.join('')}</tbody></table>`;
}

function buildSupplierReport(insp, ncr, pmap, qhName) {
  const results = insp.results || [];
  const noks = results.filter(r => r.result === 'NOK');
  const d = insp.decision;
  const tick = on => `<span class="cb">${on ? 'X' : '&nbsp;'}</span>`;
  const qhSigner = d && !d.auto ? d.by : qhName;
  return `<div class="report">
    <div class="rh">
      <div><div class="co">Blue Energy Motors</div><div>Chakan Plant</div></div>
      <div class="rh-right"><div><b>Inspection No:</b> ${esc(insp.inspNo)}</div>${ncr ? `<div><b>NCR No:</b> ${esc(ncr.ncrNo)}</div>` : ''}<div><b>Report date:</b> ${fmtDate(todayISO())}</div></div>
    </div>
    <h1>Incoming Inspection and Non-Conformance Report</h1>

    <h2>A. Receipt details</h2>
    ${rptKv([
      ['Supplier', `${insp.supplierName || ''} (${insp.supplierCode || ''})`], ['Receipt date', fmtDateTime(insp.receiptDate)],
      ['Part name', insp.partName], ['Part number', insp.partNo],
      ['PO number', insp.poNo], ['Invoice / challan', insp.invoiceNo],
      ['Batch number', insp.batchNo || '—'], ['Drawing / revision', `${insp.drawingNo || '—'} / ${insp.drawingRev || '—'}`],
      ['Quantity received', `${insp.qtyReceived || ''} ${insp.uom || ''}`], ['Quantity inspected', insp.qtyInspected],
      ['Quantity rejected', insp.qtyRejected], ['Vehicle type', insp.vehicleType]
    ])}

    <h2>B. Inspection results</h2>
    <table><thead><tr><th>S.No</th><th>Inspection characteristic</th><th>Specification</th><th>Tolerance</th><th>Actual value</th><th>Result</th><th>Remarks</th></tr></thead><tbody>
      ${results.map(r => `<tr><td>${esc(r.sn)}</td><td>${esc(r.name)}<br><small>${esc(r.type)} / ${esc(r.cls)}</small></td><td>${esc(specText(r))}</td><td>${esc(tolText(r))}</td><td>${esc(observedText(r))}</td><td class="b">${r.result === 'NA' ? 'N/A' : esc(r.result || 'Pending')}${isCriticalNok(r) ? '<br><span class="crit">CRITICAL</span>' : ''}</td><td>${esc(resultRemarks(r))}</td></tr>`).join('')}
    </tbody></table>

    <h2>C. Nonconformity details</h2>
    ${noks.length ? noks.map(r => `<div class="nok-item">
      <div class="b">${esc(r.sn)}. ${esc(r.name)} ${isCriticalNok(r) ? '<span class="crit">CRITICAL DEFECT</span>' : ''}</div>
      ${rptKv([
        ['Defect description', defectDescription(r)], ['Severity', defectSeverity(r)],
        ['Specification', specText(r) + (r.type === 'Dimensional' ? ` (${tolText(r)})` : '')], ['Actual condition', observedText(r)],
        ['Defect quantity', r.def.qty], ['Immediate containment', r.def.action || (ncr ? ncr.containment : '')]
      ])}
      ${r.photos.length ? `<div class="photos">${r.photos.map(pid => {
        const p = pmap[pid];
        return p ? `<figure><img src="${p.dataUrl}" alt=""><figcaption>${fmtDateTime(p.takenAt)} | ${esc(insp.inspNo)} | ${esc(insp.partNo)}<br>${esc(p.caption)}</figcaption></figure>` : '';
      }).join('')}</div>` : ''}
    </div>`).join('') : '<div class="resp">No nonconformity observed.</div>'}

    <h2>D. Required supplier response</h2>
    <div class="resp">${noks.length || (d && d.type === 'Reject') ? `
      <div>1. Immediate containment is required within <b>24 hours</b> of receiving this report (stock at supplier, in transit and at BEM).</div>
      <div>2. Root cause analysis and corrective action are required in 8D format.</div>
      <div>3. 8D target date: <b>${ncr && ncr.eightDTarget ? fmtDate(ncr.eightDTarget) : '________________'}</b></div>
      <div class="mt">Supplier response:</div><div class="lines">${ncr && ncr.supplierResponse ? esc(ncr.supplierResponse) : ''}</div>
      <div class="mt">BEM responsible person: <b>${ncr && ncr.responsible ? esc(ncr.responsible) : '________________'}</b></div>` : 'No supplier response required.'}
    </div>

    <h2>E. Final decision</h2>
    <div class="dec">
      <span>${tick(d && d.type === 'Accept')}Accepted</span>
      <span>${tick(d && d.type === 'Conditional')}Conditionally Accepted</span>
      <span>${tick(d && d.type === 'Reject')}Rejected</span>
      <span>${tick(d && d.type === 'Hold')}On Hold</span>
    </div>
    ${!d ? '<div class="resp">Final decision pending Quality Head review.</div>' : ''}
    ${d && d.conditional ? rptKv([['Reason', d.conditional.reason], ['Approved quantity', d.conditional.approvedQty], ['Conditions of use', d.conditional.conditions], ['Deviation number', d.conditional.deviationNo], ['Approver', d.conditional.approver], ['Approval date', fmtDate(d.conditional.approvalDate)], ['Valid until', fmtDate(d.conditional.validUntil)], ['', '']]) : ''}
    ${d && d.hold ? rptKv([['Hold reason', d.hold.reason], ['Details', d.hold.detail]]) : ''}
    ${d && d.disposition ? rptKv([['Disposition', d.disposition], ['Remarks', d.remarks]]) : ''}

    <h2>F. Approval</h2>
    <table><thead><tr><th></th><th>Name</th><th>Date</th><th>Signature</th></tr></thead><tbody>
      <tr><td class="b">Inspector</td><td>${esc(insp.completedBy || insp.inspectorName)}</td><td>${fmtDate(insp.completedAt)}</td><td class="sig"></td></tr>
      <tr><td class="b">Quality Head</td><td>${esc(qhSigner)}</td><td>${d && !d.auto ? fmtDate(d.date) : ''}</td><td class="sig"></td></tr>
    </tbody></table>
    <div class="foot">Generated by BEM Incoming Inspection System · Blue Energy Motors, Chakan</div>
  </div>`;
}

async function loadReportData(no) {
  const insp = await DB.get('inspections', no);
  if (!insp) return null;
  const [ncr, photos, qhName] = await Promise.all([insp.ncrNo ? DB.get('ncrs', insp.ncrNo) : null, DB.byIndex('photos', 'inspNo', no), DB.getSetting('qhName', 'Quality Head')]);
  const pmap = {};
  photos.forEach(p => { pmap[p.id] = p; });
  return { insp, ncr, pmap, qhName };
}

async function renderReport(m) {
  const no = decodeURIComponent(m[1]);
  const data = await loadReportData(no);
  if (!data) { view(notFoundHtml('Inspection ' + no)); return; }
  const { insp, ncr, pmap, qhName } = data;
  view(`<div class="no-print">
      <h2>Inspection Report</h2>
      <div class="btn-bar">
        <button type="button" class="btn primary" id="rPrint">Print / Save as PDF</button>
        <button type="button" class="btn" id="rShare">Share Report</button>
        <button type="button" class="btn" id="rPhotos">Download Photos</button>
        <button type="button" class="btn" id="rExport">Export Inspection Data</button>
        <a class="btn" href="#/view/${enc(no)}">Back to Inspection</a>
      </div>
      <details class="card tip"><summary><b>How to send this report as a PDF from Android</b></summary>
        <ol><li>Tap <b>Print / Save as PDF</b>.</li><li>At the top of the print screen, set the printer to <b>Save as PDF</b>.</li><li>Tap the round PDF button and save the file in Downloads.</li><li>Open Gmail / Outlook / WhatsApp, attach the PDF from Downloads and send it to the supplier.</li></ol>
        <p class="small">"Share Report" sends a self-contained report file (with photographs) that opens in any browser. Use the PDF method above for a formal PDF.</p>
      </details>
    </div>
    ${buildSupplierReport(insp, ncr, pmap, qhName)}`);
  $('#rPrint').onclick = () => window.print();
  $('#rShare').onclick = () => shareReport(insp, ncr, pmap, qhName);
  $('#rPhotos').onclick = () => downloadPhotos(insp, pmap);
  $('#rExport').onclick = () => exportInspectionCsv(insp);
}

function standaloneHtml(title, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;background:#fff}@page{size:A4;margin:12mm}${REPORT_CSS}</style></head><body>${bodyHtml}</body></html>`;
}

async function shareReport(insp, ncr, pmap, qhName) {
  const title = `${insp.inspNo} Incoming Inspection Report`;
  const html = standaloneHtml(title, buildSupplierReport(insp, ncr, pmap, qhName));
  const fname = `${insp.inspNo}_Inspection_Report.html`;
  const decision = insp.decision ? DECISION_LABEL[insp.decision.type] : 'Pending Quality Head review';
  const text = `Blue Energy Motors, Chakan – Incoming Inspection Report\nInspection: ${insp.inspNo}${ncr ? `\nNCR: ${ncr.ncrNo}` : ''}\nSupplier: ${insp.supplierName}\nPart: ${insp.partNo} ${insp.partName}\nQty received / rejected: ${insp.qtyReceived} / ${insp.qtyRejected}\nDecision: ${decision}`;
  const file = new File([html], fname, { type: 'text/html' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title, text }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  if (navigator.share) {
    const sendText = await UI.confirm('This phone cannot share the report file directly. Share a text summary now? (The full report file will also be downloaded so you can attach it.)', { ok: 'Share summary' });
    downloadBlob(new Blob([html], { type: 'text/html' }), fname);
    if (sendText) { try { await navigator.share({ title, text }); } catch (e) { /* user closed share sheet */ } }
    return;
  }
  downloadBlob(new Blob([html], { type: 'text/html' }), fname);
  UI.alert(`The report file "${fname}" has been downloaded. Attach it to an email, or use Print / Save as PDF for a PDF copy.`, 'Report downloaded');
}

async function downloadPhotos(insp, pmap) {
  const list = [];
  (insp.results || []).filter(r => r.result === 'NOK').forEach(r => r.photos.forEach((pid, k) => { if (pmap[pid]) list.push({ p: pmap[pid], name: `${insp.inspNo}_C${r.sn}_${k + 1}.jpg` }); }));
  if (!list.length) { UI.alert('There are no defect photographs for this inspection.'); return; }
  const files = list.map(x => new File([dataUrlToBlob(x.p.dataUrl)], x.name, { type: 'image/jpeg' }));
  const useShare = navigator.canShare && navigator.canShare({ files }) && await UI.confirm(`${files.length} photograph(s). Share them directly (e.g. to WhatsApp or Gmail) instead of saving to Downloads?`, { ok: 'Share', cancel: 'Download' });
  if (useShare) {
    try { await navigator.share({ files, title: `${insp.inspNo} photographs` }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  for (let i = 0; i < files.length; i++) {
    downloadBlob(files[i], files[i].name);
    await new Promise(r => setTimeout(r, 600));
  }
  UI.toast(`${files.length} photograph(s) downloaded`, 'ok');
}

function exportInspectionCsv(insp) {
  const d = insp.decision;
  const head = ['Inspection no', 'Receipt date', 'Supplier code', 'Supplier', 'Part no', 'Part name', 'PO no', 'Invoice', 'Batch', 'Qty received', 'Qty inspected', 'Qty rejected', 'Status', 'Decision', 'NCR no',
    'S.No', 'Type', 'Characteristic', 'Specification', 'Tolerance', 'Classification', 'Instrument used', 'Actual', 'Result', 'Defect', 'Defect qty', 'Severity', 'Immediate action', 'Remarks', 'Photos'];
  const rows = (insp.results || []).map(r => [insp.inspNo, fmtDateTime(insp.receiptDate), insp.supplierCode, insp.supplierName, insp.partNo, insp.partName, insp.poNo, insp.invoiceNo, insp.batchNo, insp.qtyReceived, insp.qtyInspected, insp.qtyRejected, insp.status, d ? DECISION_LABEL[d.type] : '', insp.ncrNo || '',
    r.sn, r.type, r.name, specText(r), tolText(r), r.cls, r.instrumentId || '', observedText(r), r.result, r.result === 'NOK' ? defectCategory(r) : '', r.result === 'NOK' ? r.def.qty : '', r.result === 'NOK' ? defectSeverity(r) : '', r.result === 'NOK' ? r.def.action : '', resultRemarks(r), r.photos.length]);
  downloadText(toCSV(head, rows), `${insp.inspNo}_Inspection_Data.csv`, 'text/csv');
  UI.toast('Inspection data exported', 'ok');
}

/* ---------- Summary CSV exports (Backup screen and search) ---------- */
function inspectionSummaryCsv(list) {
  const head = ['Inspection no', 'Receipt date', 'Supplier code', 'Supplier', 'Part no', 'Part name', 'Category', 'Vehicle type', 'PO no', 'Invoice', 'Batch', 'Drawing', 'Revision', 'Qty received', 'UOM', 'Qty inspected', 'Qty rejected', 'Inspector', 'Status', 'Decision', 'Decision by', 'Decision date', 'NCR no', 'NOK characteristics', 'Critical NOK', 'CoPQ (Rs.)', 'Location', 'Remarks'];
  const rows = list.map(i => [i.inspNo, fmtDateTime(i.receiptDate), i.supplierCode, i.supplierName, i.partNo, i.partName, i.category, i.vehicleType, i.poNo, i.invoiceNo, i.batchNo, i.drawingNo, i.drawingRev, i.qtyReceived, i.uom, i.qtyInspected, i.qtyRejected, i.inspectorName, i.status,
    i.decision ? DECISION_LABEL[i.decision.type] : '', i.decision ? i.decision.by : '', i.decision ? fmtDate(i.decision.date) : '', i.ncrNo || '',
    (i.results || []).filter(r => r.result === 'NOK').map(r => `${r.sn}. ${r.name}`).join('; '), (i.results || []).some(isCriticalNok) ? 'Yes' : 'No', sumCosts(i.costs), i.location, i.remarks]);
  return toCSV(head, rows);
}
function ncrSummaryCsv(list) {
  const head = ['NCR no', 'Inspection no', 'Date', 'Supplier code', 'Supplier', 'Part no', 'Part name', 'PO no', 'Invoice', 'Batch', 'Qty received', 'Qty inspected', 'Qty rejected', 'Defect category', 'Classification', 'Failed characteristics', 'Immediate containment', 'Material location', 'Final disposition', 'Responsible person', 'Target date', '8D target date', '8D received', 'Overdue 8D', 'Status', 'QH approval', 'Closed on'];
  const rows = list.map(n => [n.ncrNo, n.inspNo, fmtDate(n.date), n.supplierCode, n.supplierName, n.partNo, n.partName, n.poNo, n.invoiceNo, n.batchNo, n.qtyReceived, n.qtyInspected, n.qtyRejected, n.defectCategory, n.classification,
    (n.defects || []).map(d => `${d.sn}. ${d.name}: ${d.observed}`).join('; '), n.containment, n.location, n.disposition, n.responsible, fmtDate(n.targetDate), fmtDate(n.eightDTarget), fmtDate(n.eightDReceived), ncrOverdue8D(n) ? 'Yes' : 'No', n.status,
    n.qhApproval ? `${n.qhApproval.by} ${fmtDate(n.qhApproval.date)}` : '', fmtDateTime(n.closedAt)]);
  return toCSV(head, rows);
}

/* ---------- Monthly management review report ---------- */
function buildMRReport(ym, insps, ncrs, qhName) {
  const s = monthStats(ym, insps, ncrs);
  const lots = s.lotList;
  const sup = supplierSummary(lots).filter(x => x.rejQty > 0 || x.rejLots > 0 || x.nokLots > 0).slice(0, 5);
  const parts = partSummary(lots).filter(x => x.rejQty > 0 || x.nokLots > 0).slice(0, 5);
  const defs = defectSummary(lots).slice(0, 5);
  const openActions = ncrs.filter(ncrIsOpen).sort((a, b) => String(a.targetDate).localeCompare(String(b.targetDate)));
  const tbl = (head, rows, empty) => rows.length ? `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<div class="resp">${empty}</div>`;
  return `<div class="report">
    <div class="rh"><div><div class="co">Blue Energy Motors</div><div>Chakan Plant – Quality</div></div>
      <div class="rh-right"><div><b>Reporting month:</b> ${monthLabel(ym)}</div><div><b>Prepared date:</b> ${fmtDate(todayISO())}</div><div><b>Prepared by:</b> ${esc(qhName)}</div></div></div>
    <h1>Incoming Quality – Monthly Management Review</h1>
    <h2>1. Summary</h2>
    ${rptKv([
      ['Total incoming lots', fmtInt(s.lots)], ['Accepted lots', fmtInt(s.accepted)],
      ['Rejected lots', fmtInt(s.rejected)], ['Conditional acceptance lots', fmtInt(s.conditional)],
      ['Lots on hold', fmtInt(s.hold)], ['Pending Quality Head review', fmtInt(s.pendingReview)],
      ['Lot acceptance %', s.acceptance === null ? '—' : fmtPct(s.acceptance)], ['Total quantity received', fmtInt(s.recQty)],
      ['Total rejected quantity', fmtInt(s.rejQty)], ['Incoming PPM', fmtInt(s.ppm)],
      ['Open supplier NCRs', fmtInt(s.openNcr)], ['Overdue 8Ds', fmtInt(s.overdue8d)]
    ])}
    <h2>2. Cost of poor quality</h2>
    ${tbl(['Sorting', 'Rework', 'Rejection', 'Transport', 'Line stoppage', 'Total'], [[fmtINR(s.costs.sorting), fmtINR(s.costs.rework), fmtINR(s.costs.rejection), fmtINR(s.costs.transport), fmtINR(s.costs.lineStop), `<b>${fmtINR(s.copq)}</b> (${fmtLakh(s.copq)})`]], '')}
    <h2>3. Top five suppliers by rejection</h2>
    ${tbl(['#', 'Supplier', 'Lots', 'Rejected lots', 'Rejected qty', 'PPM'], sup.map((x, i) => [i + 1, esc(x.label), x.lots, x.rejLots, fmtInt(x.rejQty), fmtInt(x.ppm)]), 'No supplier rejections this month.')}
    <h2>4. Top five defective parts</h2>
    ${tbl(['#', 'Part', 'Lots', 'NOK lots', 'Rejected qty', 'PPM'], parts.map((x, i) => [i + 1, esc(x.label), x.lots, x.nokLots, fmtInt(x.rejQty), fmtInt(x.ppm)]), 'No defective parts this month.')}
    <h2>5. Top five defect categories</h2>
    ${tbl(['#', 'Defect category', 'Observations', 'Defect qty', 'Cumulative %'], defs.map((x, i) => [i + 1, esc(x.label), x.count, fmtInt(x.qty), x.cumPct.toFixed(0) + '%']), 'No defects recorded this month.')}
    <h2>6. Open actions (all open NCRs)</h2>
    ${tbl(['NCR', 'Supplier / part', 'Status', 'Responsible', 'Target date', '8D target'], openActions.map(n => [esc(n.ncrNo), `${esc(n.supplierName)}<br>${esc(n.partNo)}`, esc(n.status) + (ncrOverdue8D(n) ? ' <b>(8D OVERDUE)</b>' : ''), esc(n.responsible || '—'), fmtDate(n.targetDate), fmtDate(n.eightDTarget)]), 'No open actions.')}
    <h2>7. Review</h2>
    <table><tbody><tr><td class="b" style="width:25%">Reviewed by</td><td class="sig"></td><td class="b" style="width:15%">Date</td><td></td></tr></tbody></table>
    <div class="foot">Generated by BEM Incoming Inspection System · Figures are based on lots by receipt date in the reporting month.</div>
  </div>`;
}

async function renderMR() {
  view(`<div class="no-print"><h2>Management Review Report</h2>
      <div class="card">${fld('Reporting month', `<input type="month" id="mrMonth" value="${currentYM()}">`)}
      <button type="button" class="btn primary block" id="mrPrint">Print / Save as PDF</button></div></div>
    <div id="mrOut"></div>`);
  const draw = async () => {
    const ym = $('#mrMonth').value || currentYM();
    const [insps, ncrs, qhName] = await Promise.all([DB.getAll('inspections'), DB.getAll('ncrs'), DB.getSetting('qhName', 'Quality Head')]);
    $('#mrOut').innerHTML = buildMRReport(ym, insps, ncrs, qhName);
  };
  $('#mrMonth').onchange = draw;
  $('#mrPrint').onclick = () => window.print();
  await draw();
}
