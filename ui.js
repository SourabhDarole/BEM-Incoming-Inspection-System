/* BEM Incoming Inspection System - ui.js
   Shared helpers: formatting, dates, dialogs, CSV, downloads, image compression and camera. */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Dates (all stored as local text: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS) ---------- */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function pad(n, w = 2) { return String(n).padStart(w, '0'); }
function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayISO() { return isoDate(new Date()); }
function nowStamp() { const d = new Date(); return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function nowLocalInput() { return nowStamp().slice(0, 16); }
function parseISODate(s) { const p = String(s).slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function addDays(iso, n) { const d = parseISODate(iso); d.setDate(d.getDate() + n); return isoDate(d); }
function daysBetween(a, b) { return Math.round((parseISODate(b) - parseISODate(a)) / 86400000); }
function fmtDate(s) { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : String(s); }
function fmtDateTime(s) { if (!s) return ''; const t = String(s).slice(11, 16); return fmtDate(s) + (t ? ' ' + t : ''); }
function ymOf(s) { return String(s || '').slice(0, 7); }
function currentYM() { return todayISO().slice(0, 7); }
function shiftYM(ym, delta) { const p = ym.split('-').map(Number); const d = new Date(p[0], p[1] - 1 + delta, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function monthEndISO(ym) { const p = ym.split('-').map(Number); return isoDate(new Date(p[0], p[1], 0)); }
function monthLabel(ym) { const p = ym.split('-').map(Number); return `${MONTH_NAMES[p[1] - 1]} ${p[0]}`; }
function normalizeDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return '';
}

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All dates' },
  { value: 'cur', label: 'Current month' },
  { value: 'prev', label: 'Previous month' },
  { value: '3m', label: 'Last three months' },
  { value: 'fy', label: 'Financial year (Apr-Mar)' },
  { value: 'custom', label: 'Custom date range' }
];
/* Returns [fromISO, toISO] inclusive */
function periodRange(p, from, to) {
  const t = new Date(); const y = t.getFullYear(); const m = t.getMonth();
  switch (p) {
    case 'cur': return [isoDate(new Date(y, m, 1)), isoDate(new Date(y, m + 1, 0))];
    case 'prev': return [isoDate(new Date(y, m - 1, 1)), isoDate(new Date(y, m, 0))];
    case '3m': return [isoDate(new Date(y, m - 2, 1)), isoDate(new Date(y, m + 1, 0))];
    case 'fy': { const fy = m >= 3 ? y : y - 1; return [`${fy}-04-01`, `${fy + 1}-03-31`]; }
    case 'custom': return [from || '0000-01-01', to || '9999-12-31'];
    default: return ['0000-01-01', '9999-12-31'];
  }
}

/* ---------- Numbers ---------- */
function isNum(v) { return v !== null && v !== undefined && /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/.test(String(v)); }
function num(v) { return isNum(v) ? Number(v) : 0; }
function decs(v) { const s = String(v === undefined || v === null ? '' : v).trim(); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }
function fmtTol(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) return '';
  if (s[0] === '-' || s[0] === '+') return s;
  return Number(s) === 0 ? s : '+' + s;
}
function fmtInt(n) { return Math.round(Number(n) || 0).toLocaleString('en-IN'); }
function fmtINR(n) { return '₹' + fmtInt(n); }
function fmtLakh(n) { return '₹' + ((Number(n) || 0) / 100000).toFixed(2) + ' lakh'; }
function fmtPct(n, d = 1) { return (Number(n) || 0).toFixed(d) + '%'; }
function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function enc(s) { return encodeURIComponent(s); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* ---------- Rendering helpers ---------- */
function view(html) { $('#view').innerHTML = html; }
function go(hash) { if (location.hash === hash) router(); else location.hash = hash; }
function redirect(hash) { location.replace(hash); }
function opts(list, selected, placeholder) {
  let h = placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '';
  list.forEach(it => {
    const v = typeof it === 'object' ? it.value : it;
    const l = typeof it === 'object' ? it.label : it;
    h += `<option value="${esc(v)}"${String(v) === String(selected === undefined || selected === null ? '' : selected) ? ' selected' : ''}>${esc(l)}</option>`;
  });
  return h;
}
function fld(label, inner, hint) {
  return `<div class="fld"><span class="lbl">${label}</span>${inner}${hint ? `<small class="hint">${hint}</small>` : ''}</div>`;
}
function kvTable(pairs) {
  return `<table class="tbl kv"><tbody>${pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v === undefined || v === null || v === '' ? '—' : esc(v)}</td></tr>`).join('')}</tbody></table>`;
}
function notFoundHtml(what) {
  return `<div class="card"><div class="alert red">${esc(what)} was not found on this phone.</div><a class="btn" href="#/home">Go to Home</a></div>`;
}
function statusBadge(s) {
  const map = { 'Accepted': 'b-green', 'Conditionally Accepted': 'b-yellow', 'Rejected': 'b-red', 'On Hold': 'b-yellow', 'Pending Quality Head Review': 'b-blue', 'Inspection in Progress': 'b-blue', 'Closed': 'b-grey', 'Draft': 'b-grey', 'Pending Inspection': 'b-grey' };
  return `<span class="badge ${map[s] || 'b-grey'}">${esc(s)}</span>`;
}
function ncrStatusBadge(s) {
  const c = s === 'Closed' ? 'b-green' : s === 'Open' ? 'b-red' : 'b-yellow';
  return `<span class="badge ${c}">${esc(s)}</span>`;
}
function clsBadge(c) {
  const m = { Critical: 'b-red', Major: 'b-yellow', Minor: 'b-grey' };
  return `<span class="badge ${m[c] || 'b-grey'}">${esc((c || '').toUpperCase())}</span>`;
}

/* ---------- Dialogs ---------- */
const UI = {
  modal({ title, body = '', buttons = [{ label: 'OK', value: true, cls: 'primary' }], onOpen }) {
    return new Promise(resolve => {
      const back = document.createElement('div');
      back.className = 'modal-back';
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title || '')}</h3><div class="modal-body">${body}</div><div class="modal-err" hidden></div><div class="modal-btns">${buttons.map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
      document.body.appendChild(back);
      const errEl = $('.modal-err', back);
      let busy = false;
      const press = async btn => {
        if (busy) return;
        const b = buttons[+btn.dataset.i];
        if (b.validate) {
          busy = true;
          const err = await b.validate(back);
          busy = false;
          if (err) { errEl.textContent = err; errEl.hidden = false; return; }
        }
        const val = typeof b.value === 'function' ? b.value(back) : b.value;
        back.remove();
        resolve(val);
      };
      back.addEventListener('click', e => {
        const btn = e.target.closest('button[data-i]');
        if (btn) press(btn);
      });
      back.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
          e.preventDefault();
          const all = $$('.modal-btns button', back);
          press(all[all.length - 1]);
        }
      });
      if (onOpen) onOpen(back);
      const first = $('input,select,textarea', back);
      if (first) setTimeout(() => first.focus(), 60);
    });
  },
  alert(msg, title = 'Message') {
    return this.modal({ title, body: `<p class="pre">${esc(msg)}</p>`, buttons: [{ label: 'OK', value: true, cls: 'primary' }] });
  },
  confirm(msg, { title = 'Please confirm', ok = 'Yes', cancel = 'Cancel', danger = false } = {}) {
    return this.modal({ title, body: `<p class="pre">${esc(msg)}</p>`, buttons: [{ label: cancel, value: false }, { label: ok, value: true, cls: danger ? 'danger solid' : 'primary' }] });
  },
  prompt(title, label, value = '', { type = 'text', required = false, multiline = false } = {}) {
    const input = multiline ? `<textarea class="m-in" rows="3">${esc(value)}</textarea>` : `<input class="m-in" type="${type}" value="${esc(value)}">`;
    return this.modal({
      title,
      body: `<label class="fld"><span class="lbl">${esc(label)}</span>${input}</label>`,
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'OK', cls: 'primary', validate: r => (required && !$('.m-in', r).value.trim() ? 'This field is required.' : ''), value: r => $('.m-in', r).value.trim() }
      ]
    });
  },
  select(title, label, list, placeholder = '— Select —') {
    return this.modal({
      title,
      body: `<label class="fld"><span class="lbl">${esc(label)}</span><select class="m-in">${opts(list, '', placeholder)}</select></label>`,
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'OK', cls: 'primary', validate: r => ($('.m-in', r).value ? '' : 'Please select an option.'), value: r => $('.m-in', r).value }
      ]
    });
  },
  errors(list, title = 'Please correct the following') {
    return this.modal({ title, body: `<ul class="err-list">${list.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`, buttons: [{ label: 'OK', value: true, cls: 'primary' }] });
  },
  image(src, caption) {
    return this.modal({ title: caption || 'Photograph', body: `<img class="full-img" src="${src}" alt="">`, buttons: [{ label: 'Close', value: true, cls: 'primary' }] });
  },
  toast(msg, type = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
};

/* ---------- Files, downloads and CSV ---------- */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}
function downloadText(text, filename, mime = 'text/plain') { downloadBlob(new Blob([text], { type: mime + ';charset=utf-8' }), filename); }
function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(headers, rows) {
  return '﻿' + [headers.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\r\n');
}
function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
function fileStamp() { const s = nowStamp(); return s.slice(0, 10) + '-' + s.slice(11, 16).replace(':', ''); }
function pickFile(accept) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); resolve(f || null); });
    inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
    inp.click();
  });
}

/* ---------- Images ---------- */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be read.'));
    img.src = src;
  });
}
/* Resize so the longest side is at most maxDim and save as JPEG to keep storage small */
async function compressImage(file, maxDim = 1280, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- Camera: in-app rear camera with preview / retake, phone camera and gallery fall-backs ---------- */
const Camera = {
  async capture() {
    if (window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } catch (e) {
        UI.toast('In-app camera not available. Opening the phone camera.');
        return this.fromFile(true);
      }
      return this.live(stream);
    }
    return this.fromFile(true);
  },

  fromFile(useCamera) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      if (useCamera) inp.setAttribute('capture', 'environment');
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0];
        inp.remove();
        if (!f) { resolve(null); return; }
        try { resolve(await compressImage(f)); }
        catch (e) { await UI.alert('This photograph could not be read. Please try another photograph.'); resolve(null); }
      });
      inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
      inp.click();
    });
  },

  live(stream) {
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.className = 'cam';
      box.innerHTML = `
        <video playsinline autoplay muted></video>
        <img class="cam-preview" alt="Preview" hidden>
        <div class="cam-msg">Rear camera</div>
        <div class="cam-btns cam-live">
          <button type="button" class="btn" data-c="cancel">Cancel</button>
          <button type="button" class="btn" data-c="gallery">Gallery</button>
          <button type="button" class="btn primary" data-c="shoot" disabled>Capture</button>
        </div>
        <div class="cam-btns cam-review" hidden>
          <button type="button" class="btn" data-c="retake">Retake</button>
          <button type="button" class="btn primary" data-c="use">Use Photo</button>
        </div>`;
      document.body.appendChild(box);
      const video = $('video', box);
      const prev = $('.cam-preview', box);
      const liveBtns = $('.cam-live', box);
      const revBtns = $('.cam-review', box);
      const shoot = $('[data-c="shoot"]', box);
      let shot = null;
      video.srcObject = stream;
      video.addEventListener('loadedmetadata', () => { shoot.disabled = false; video.play().catch(() => {}); });
      const stop = () => { stream.getTracks().forEach(t => t.stop()); box.remove(); };
      box.addEventListener('click', e => {
        const b = e.target.closest('button[data-c]');
        if (!b) return;
        const c = b.dataset.c;
        if (c === 'shoot') {
          const vw = video.videoWidth, vh = video.videoHeight;
          if (!vw || !vh) return;
          const scale = Math.min(1, 1280 / Math.max(vw, vh));
          const cv = document.createElement('canvas');
          cv.width = Math.round(vw * scale); cv.height = Math.round(vh * scale);
          cv.getContext('2d').drawImage(video, 0, 0, cv.width, cv.height);
          shot = cv.toDataURL('image/jpeg', 0.72);
          prev.src = shot; prev.hidden = false; video.hidden = true;
          liveBtns.hidden = true; revBtns.hidden = false;
        } else if (c === 'retake') {
          shot = null; prev.hidden = true; video.hidden = false;
          liveBtns.hidden = false; revBtns.hidden = true;
        } else if (c === 'use') {
          stop(); resolve(shot);
        } else if (c === 'gallery') {
          stop(); this.fromFile(false).then(resolve);
        } else if (c === 'cancel') {
          stop(); resolve(null);
        }
      });
    });
  }
};
