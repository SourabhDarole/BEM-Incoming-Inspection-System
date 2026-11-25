/* BEM Incoming Inspection System - app.js
   App start-up, local login (Inspector / Quality Head PIN), navigation, home screen and search. */
'use strict';

const APP_VERSION = '1.0.0';
const App = { role: null, user: '', deferredInstall: null };

/* ---------- Local session ---------- */
function loadSession() {
  try {
    const q = JSON.parse(sessionStorage.getItem('bem_qh') || 'null');
    if (q && q.role === 'QH') { App.role = 'QH'; App.user = q.user; return; }
  } catch (e) { /* storage unavailable */ }
  try {
    const s = JSON.parse(localStorage.getItem('bem_user') || 'null');
    if (s && s.role === 'INSPECTOR') { App.role = 'INSPECTOR'; App.user = s.user; }
  } catch (e) { /* storage unavailable */ }
}
function setSession(role, user) {
  App.role = role;
  App.user = user;
  try {
    if (role === 'QH') sessionStorage.setItem('bem_qh', JSON.stringify({ role, user }));
    else { sessionStorage.removeItem('bem_qh'); localStorage.setItem('bem_user', JSON.stringify({ role, user })); }
  } catch (e) { /* storage unavailable: session lasts until reload */ }
  updateHeader();
}
function logout() {
  App.role = null;
  App.user = '';
  try { sessionStorage.removeItem('bem_qh'); localStorage.removeItem('bem_user'); } catch (e) { /* ignore */ }
  go('#/login');
}
/* Asks for the Quality Head PIN; on success the session becomes Quality Head */
async function askQHLogin() {
  const pin = await DB.getSetting('qhPin', '1234');
  const ok = await UI.modal({
    title: 'Quality Head access',
    body: `<p>This screen is for the Quality Head.</p>${fld('Enter 4-digit PIN', '<input class="m-in" type="password" inputmode="numeric" maxlength="4" autocomplete="off">')}`,
    buttons: [
      { label: 'Cancel', value: false },
      { label: 'Unlock', cls: 'primary', validate: r => ($('.m-in', r).value.trim() === pin ? '' : 'Incorrect PIN. Try again.'), value: true }
    ]
  });
  if (ok) setSession('QH', await DB.getSetting('qhName', 'Quality Head'));
  return !!ok;
}

/* ---------- Routing ---------- */
const ROUTES = [
  [/^#\/login$/, () => renderLogin(), false],
  [/^#\/home$/, () => renderHome(), false],
  [/^#\/receipt\/(.+)$/, m => renderReceipt(m), false],
  [/^#\/pending$/, () => renderPending(), false],
  [/^#\/start$/, () => renderStart(), false],
  [/^#\/inspect\/(.+)$/, m => renderInspect(m), false],
  [/^#\/view\/(.+)$/, m => renderView(m), false],
  [/^#\/report\/(.+)$/, m => renderReport(m), false],
  [/^#\/ncrs$/, () => renderNcrList(), false],
  [/^#\/ncr\/(.+)$/, m => renderNcr(m), false],
  [/^#\/completed$/, () => renderSearch(), false],
  [/^#\/dashboard$/, () => renderDashboard(), true],
  [/^#\/mr$/, () => renderMR(), true],
  [/^#\/masters$/, () => renderMasters(), true],
  [/^#\/master\/(\w+)\/edit\/(.*)$/, m => renderMasterEdit(m), true],
  [/^#\/master\/(\w+)$/, m => renderMasterList(m), true],
  [/^#\/plans$/, () => renderPlans(), true],
  [/^#\/plan\/(.+)$/, m => renderPlanEditor(m), true],
  [/^#\/categories$/, () => renderCategories(), true],
  [/^#\/settings$/, () => renderSettings(), true],
  [/^#\/backup$/, () => renderBackup(), true]
];
let routing = false;

async function router() {
  if (routing) return;
  routing = true;
  try {
    await flushInspSave();
    const hash = location.hash || '#/home';
    if (!App.role && hash !== '#/login') { redirect('#/login'); return; }
    if (App.role && hash === '#/login') { redirect('#/home'); return; }
    if (!location.hash.startsWith('#/inspect/')) INSP = null;
    for (const [re, fn, qhOnly] of ROUTES) {
      const m = hash.match(re);
      if (!m) continue;
      if (qhOnly && App.role !== 'QH') {
        const ok = await askQHLogin();
        if (!ok) { redirect('#/home'); return; }
      }
      window.scrollTo(0, 0);
      try { await fn(m); }
      catch (e) {
        console.error(e);
        view(`<div class="card"><div class="alert red">Something went wrong: ${esc(e && e.message ? e.message : e)}</div><a class="btn" href="#/home">Go to Home</a></div>`);
      }
      updateHeader();
      return;
    }
    redirect('#/home');
  } finally {
    routing = false;
  }
}
/* A hash change while a screen is still loading is processed after it finishes */
function onHashChange() {
  if (routing) { setTimeout(onHashChange, 50); return; }
  router();
}

function updateHeader() {
  const logged = !!App.role;
  const hash = location.hash || '#/home';
  $('#userbar').hidden = !logged;
  $('#navbar').hidden = !logged || hash === '#/home' || hash === '#/login';
  $('#userInfo').innerHTML = logged ? `${App.role === 'QH' ? 'Quality Head' : 'Inspector'}: <b>${esc(App.user)}</b>` : '';
}

/* ---------- Login ---------- */
async function renderLogin() {
  const insps = (await DB.getAll('inspectors')).filter(x => x.active !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name));
  const pinChanged = await DB.getSetting('pinChanged', false);
  view(`<div class="card login">
    <h2>Who is using the app?</h2>
    <h3>Inspector</h3>
    ${fld('Select your name', `<select id="lInsp">${opts(insps.map(x => ({ value: x.name, label: `${x.name} (${x.empNo})` })), insps.length === 1 ? insps[0].name : '', '— Select —')}<option value="__other">Other (type my name)</option></select>`)}
    <div id="lOtherWrap" hidden>${fld('Your name', '<input id="lOther" autocomplete="name">')}</div>
    <button type="button" class="btn primary block" id="lInspGo">Continue as Inspector</button>
    <hr>
    <h3>Quality Head</h3>
    ${fld('4-digit PIN', '<input id="lPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off">')}
    ${pinChanged ? '' : '<div class="hint">First use: the default PIN is <b>1234</b>. Change it in Masters → Settings.</div>'}
    <button type="button" class="btn primary block" id="lQhGo">Continue as Quality Head</button>
    <p class="muted small">This is basic local access control on this phone only. It is not enterprise-grade security.</p>
  </div>`);
  $('#lInsp').onchange = e => { $('#lOtherWrap').hidden = e.target.value !== '__other'; };
  $('#lInspGo').onclick = () => {
    const sel = $('#lInsp').value;
    const name = sel === '__other' ? $('#lOther').value.trim() : sel;
    if (!name) { UI.alert('Select or type your name.'); return; }
    setSession('INSPECTOR', name);
    go('#/home');
  };
  $('#lQhGo').onclick = async () => {
    const pin = await DB.getSetting('qhPin', '1234');
    if ($('#lPin').value.trim() !== pin) { UI.alert('Incorrect PIN.'); return; }
    setSession('QH', await DB.getSetting('qhName', 'Quality Head'));
    go('#/home');
  };
  $('#lPin').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lQhGo').click(); });
}

/* ---------- Home ---------- */
function menuBtn(n, label, href, qhOnly) {
  return `<a class="menu-btn" href="${href}"><span class="mn">${n}</span><span class="ml">${label}</span>${qhOnly && App.role !== 'QH' ? '<span class="lock">Quality Head PIN</span>' : ''}</a>`;
}
async function renderHome() {
  const [insps, ncrs, lastBackup] = await Promise.all([DB.getAll('inspections'), DB.getAll('ncrs'), DB.getSetting('lastBackup', '')]);
  const cur = currentYM();
  const pending = insps.filter(i => ['Draft', 'Pending Inspection', 'Inspection in Progress'].includes(i.status)).length;
  const review = insps.filter(i => i.status === 'Pending Quality Head Review').length;
  const rejMonth = insps.filter(i => i.decision && i.decision.type === 'Reject' && ymOf(i.receiptDate) === cur).length;
  const openNcr = ncrs.filter(ncrIsOpen).length;
  const overdue = ncrs.filter(n => ncrOverdue8D(n)).length;
  const days = lastBackup ? daysBetween(lastBackup.slice(0, 10), todayISO()) : null;
  const remind = (insps.length || ncrs.length) && (days === null || days >= 30);
  view(`<div class="stats">
      <a class="stat" href="#/pending"><div class="sv">${pending}</div><div class="sl">Pending inspection lots</div></a>
      <a class="stat ${rejMonth ? 's-red' : ''}" href="#/completed" id="statRej"><div class="sv">${rejMonth}</div><div class="sl">Rejected lots this month</div></a>
      <a class="stat ${openNcr ? 's-red' : ''}" href="#/ncrs" id="statNcr"><div class="sv">${openNcr}</div><div class="sl">Open NCRs</div></a>
      <a class="stat ${overdue ? 's-red' : ''}" href="#/ncrs" id="statOver"><div class="sv">${overdue}</div><div class="sl">Overdue 8Ds</div></a>
    </div>
    ${review ? `<a class="alert blue block-link" href="#/pending">${review} lot(s) waiting for Quality Head review ›</a>` : ''}
    ${remind ? `<a class="alert yellow block-link" href="#/backup"><b>Monthly backup reminder:</b> ${days === null ? 'no backup has been made yet.' : `last backup was ${days} days ago.`} Tap here to create a backup${App.role === 'QH' ? '' : ' (Quality Head PIN needed)'}.</a>` : ''}
    <nav class="menu">
      ${menuBtn(1, 'New Receipt', '#/receipt/new')}
      ${menuBtn(2, 'Pending Inspections', '#/pending')}
      ${menuBtn(3, 'Start Inspection', '#/start')}
      ${menuBtn(4, 'Hold / NCR', '#/ncrs')}
      ${menuBtn(5, 'Completed Inspections', '#/completed')}
      ${menuBtn(6, 'Dashboard', '#/dashboard', true)}
      ${menuBtn(7, 'Masters', '#/masters', true)}
      ${menuBtn(8, 'Backup and Restore', '#/backup', true)}
    </nav>`);
  $('#statRej').addEventListener('click', () => { Object.assign(SEARCH, { q: '', field: 'all', status: 'all', decision: 'Reject', period: 'cur' }); });
  $('#statNcr').addEventListener('click', () => { NCR_FILTER.status = 'open'; });
  $('#statOver').addEventListener('click', () => { NCR_FILTER.status = 'overdue'; });
}

/* ---------- Completed inspections / search ---------- */
const SEARCH = { q: '', field: 'all', status: 'completed', decision: '', period: 'all', from: '', to: '' };
const SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' }, { value: 'inspNo', label: 'Inspection number' }, { value: 'ncrNo', label: 'NCR number' },
  { value: 'supplier', label: 'Supplier' }, { value: 'partNo', label: 'Part number' }, { value: 'partName', label: 'Part name' },
  { value: 'poNo', label: 'PO number' }, { value: 'invoiceNo', label: 'Invoice number' }, { value: 'batchNo', label: 'Batch number' }
];
function matchSearch(i, S) {
  if (S.period !== 'all') {
    const [from, to] = periodRange(S.period, S.from, S.to);
    const d = String(i.receiptDate || '').slice(0, 10);
    if (d < from || d > to) return false;
  }
  if (S.status === 'completed') { if (!isCompletedLot(i)) return false; }
  else if (S.status !== 'all' && i.status !== S.status) return false;
  if (S.decision && (!i.decision || i.decision.type !== S.decision)) return false;
  if (S.q) {
    const q = S.q.toLowerCase();
    const f = { inspNo: [i.inspNo], ncrNo: [i.ncrNo], supplier: [i.supplierName, i.supplierCode], partNo: [i.partNo], partName: [i.partName], poNo: [i.poNo], invoiceNo: [i.invoiceNo], batchNo: [i.batchNo] };
    const pool = S.field === 'all' ? Object.values(f).flat() : f[S.field];
    if (!pool.some(v => String(v || '').toLowerCase().includes(q))) return false;
  }
  return true;
}
async function renderSearch() {
  const all = (await DB.getAll('inspections')).sort((a, b) => String(b.receiptDate).localeCompare(String(a.receiptDate)));
  view(`<h2>Completed Inspections</h2>
    <div class="card">
      ${fld('Search', `<input id="sq" value="${esc(SEARCH.q)}" placeholder="Inspection, NCR, supplier, part, PO, invoice, batch">`)}
      ${fld('Search in', `<select id="sf">${opts(SEARCH_FIELDS, SEARCH.field)}</select>`)}
      <div class="grid2">
        ${fld('Status', `<select id="ss">${opts([{ value: 'completed', label: 'All completed' }, { value: 'all', label: 'All statuses' }, ...INSP_STATUSES.map(s => ({ value: s, label: s }))], SEARCH.status)}</select>`)}
        ${fld('Final decision', `<select id="sd">${opts([{ value: '', label: 'Any' }, { value: 'Accept', label: 'Accepted' }, { value: 'Conditional', label: 'Conditionally Accepted' }, { value: 'Reject', label: 'Rejected' }, { value: 'Hold', label: 'On Hold' }], SEARCH.decision)}</select>`)}
      </div>
      ${fld('Period (receipt date)', `<select id="sp">${opts(PERIOD_OPTIONS, SEARCH.period)}</select>`)}
      <div class="grid2" id="sCustom" ${SEARCH.period === 'custom' ? '' : 'hidden'}>
        ${fld('From', `<input type="date" id="sFrom" value="${esc(SEARCH.from)}">`)}
        ${fld('To', `<input type="date" id="sTo" value="${esc(SEARCH.to)}">`)}
      </div>
      <button type="button" class="btn block" id="sClear">Clear Filters</button>
    </div>
    <div class="btn-bar"><button type="button" class="btn" id="sExport">Export Results (CSV)</button></div>
    <div id="sCount" class="muted"></div><div id="slist"></div>`);
  let shown = [];
  const draw = () => {
    shown = all.filter(i => matchSearch(i, SEARCH));
    $('#sCount').textContent = `${shown.length} inspection(s) found`;
    $('#slist').innerHTML = shown.slice(0, 200).map(i => lotCardHtml(i, (i.status === 'Draft' ? '#/receipt/' : '#/view/') + enc(i.inspNo), '')).join('') + (shown.length > 200 ? '<p class="muted">Showing the first 200. Narrow the search or export to CSV.</p>' : '') || '<p class="muted">No inspections match.</p>';
  };
  const bind = (id, key, ev) => $(id).addEventListener(ev, e => { SEARCH[key] = e.target.value.trim(); if (key === 'period') $('#sCustom').hidden = SEARCH.period !== 'custom'; draw(); });
  bind('#sq', 'q', 'input'); bind('#sf', 'field', 'change'); bind('#ss', 'status', 'change'); bind('#sd', 'decision', 'change');
  bind('#sp', 'period', 'change'); bind('#sFrom', 'from', 'change'); bind('#sTo', 'to', 'change');
  $('#sClear').onclick = () => { Object.assign(SEARCH, { q: '', field: 'all', status: 'completed', decision: '', period: 'all', from: '', to: '' }); router(); };
  $('#sExport').onclick = () => {
    if (!shown.length) { UI.alert('There are no results to export.'); return; }
    downloadText(inspectionSummaryCsv(shown), `BEM_inspections_${fileStamp()}.csv`, 'text/csv');
    UI.toast('Results exported', 'ok');
  };
  draw();
}

/* ---------- Start-up ---------- */
async function init() {
  try {
    await DB.open();
    await seedIfNeeded();
  } catch (e) {
    view(`<div class="card"><div class="alert red">The app could not open its offline storage. ${esc(e && e.message ? e.message : e)}<br><br>Use Google Chrome (not Incognito mode) and make sure the phone has free storage space.</div></div>`);
    return;
  }
  loadSession();
  $('#btnHome').onclick = () => go('#/home');
  $('#btnBack').onclick = () => { if (history.length > 1) history.back(); else go('#/home'); };
  $('#btnSwitch').onclick = async () => { await flushInspSave(); logout(); };
  $('#brand').onclick = () => { if (App.role) go('#/home'); };
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); App.deferredInstall = e; });
  window.addEventListener('pagehide', () => { flushInspSave(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushInspSave(); });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (location.protocol === 'file:') {
    $('#offlineNote').innerHTML = '<div class="alert yellow">Opened directly from a file. Offline installation and the in-app camera need the app to be opened from a web address (GitHub Pages or the local server). See README.md.</div>';
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(err => console.warn('Service worker registration failed', err));
  }
  router();
}
document.addEventListener('DOMContentLoaded', init);
