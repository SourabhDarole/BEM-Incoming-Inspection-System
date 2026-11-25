/* BEM Incoming Inspection System - db.js
   Offline storage (IndexedDB), fixed lists and first-run demonstration data. */
'use strict';

const DB_NAME = 'bem_iqc_db';
const DB_VERSION = 1;

/* Object stores and their key fields */
const STORE_KEYS = {
  settings: 'key',
  suppliers: 'code',
  parts: 'partNo',
  plans: 'partNo',
  inspectors: 'empNo',
  instruments: 'id',
  defects: 'code',
  inspections: 'inspNo',
  ncrs: 'ncrNo',
  photos: 'id'
};

const INSPECTION_TYPES = ['Dimensional', 'Visual', 'Functional', 'Fitment', 'Identification', 'Documentation', 'Packaging', 'Electrical', 'Leakage', 'Traceability'];
const CLASSIFICATIONS = ['Critical', 'Major', 'Minor'];
const VEHICLE_TYPES = ['EV', 'LNG', 'Common'];
const UOMS = ['Nos', 'Set', 'Pair', 'Kg', 'Metre', 'Litre', 'Box', 'Roll'];
const INSP_STATUSES = ['Draft', 'Pending Inspection', 'Inspection in Progress', 'Pending Quality Head Review', 'Accepted', 'Conditionally Accepted', 'Rejected', 'On Hold', 'Closed'];
const NCR_STATUSES = ['Open', 'Containment Awaited', '8D Awaited', 'Under Review', 'Action Implemented', 'Verification Pending', 'Closed'];
const DECISION_STATUS = { Accept: 'Accepted', Conditional: 'Conditionally Accepted', Reject: 'Rejected', Hold: 'On Hold' };
const DECISION_LABEL = { Accept: 'Accepted', Conditional: 'Conditionally Accepted', Reject: 'Rejected', Hold: 'On Hold' };
const DISPOSITIONS = ['Pending', 'Return to supplier', 'Scrap', 'Rework at supplier', 'Rework at BEM', 'Sort and use OK parts', 'Use as is (deviation)'];
const HOLD_REASONS = ['Engineering review', 'Additional inspection', 'Supplier clarification', 'Other'];

const DEFAULT_CATEGORIES = ['Engine', 'Cabin', 'Front axle', 'Rear axle', 'LNG tank', 'Fuel system part', 'Wiring harness', 'Electric motor', 'Battery pack', 'Tyre assembly', 'Sheet-metal part', 'Pipe', 'Radiator', 'Cooler', 'Fastener', 'Electrical part', 'Other small part'];

const VISUAL_DEFECTS = ['Dent', 'Scratch', 'Rust', 'Paint damage', 'Crack', 'Burr', 'Bend', 'Deformation', 'Welding defect', 'Connector damage', 'Broken part', 'Missing part', 'Wrong part', 'Corrosion', 'Oil leakage', 'Coolant leakage', 'Packaging damage', 'Transit damage', 'Contamination', 'Identification missing', 'Other defect'];

/* KPI targets. higherBetter = true means Green when value >= green limit. */
const DEFAULT_THRESHOLDS = {
  lotAcceptance: { label: 'Lot acceptance %', higherBetter: true, green: 98, yellow: 95 },
  rejectedQty: { label: 'Rejected quantity', higherBetter: false, green: 100, yellow: 300 },
  ppm: { label: 'Incoming PPM', higherBetter: false, green: 1000, yellow: 5000 },
  openNcr: { label: 'Open supplier NCRs', higherBetter: false, green: 3, yellow: 7 },
  overdue8d: { label: 'Overdue 8Ds', higherBetter: false, green: 0, yellow: 2 },
  conditional: { label: 'Conditional acceptances', higherBetter: false, green: 2, yellow: 5 },
  copq: { label: 'Cost of poor quality (Rs.)', higherBetter: false, green: 50000, yellow: 150000 }
};

function dbPad(n) { return String(n).padStart(2, '0'); }
function dbToday(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + (offsetDays || 0));
  return `${d.getFullYear()}-${dbPad(d.getMonth() + 1)}-${dbPad(d.getDate())}`;
}

const DB = {
  conn: null,

  open() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('This browser does not support offline storage (IndexedDB).'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        Object.entries(STORE_KEYS).forEach(([name, key]) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: key });
            if (name === 'photos') store.createIndex('inspNo', 'inspNo', { unique: false });
          }
        });
      };
      req.onsuccess = () => { this.conn = req.result; resolve(this.conn); };
      req.onerror = () => reject(req.error || new Error('Storage could not be opened.'));
      req.onblocked = () => reject(new Error('Storage is blocked by another open copy of the app. Close other tabs and try again.'));
    });
  },

  _run(storeName, mode, action) {
    return new Promise((resolve, reject) => {
      const tx = this.conn.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = action(store);
      let result;
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted (the phone may be out of space).'));
    });
  },

  get(store, key) { return this._run(store, 'readonly', s => s.get(key)); },
  getAll(store) { return this._run(store, 'readonly', s => s.getAll()); },
  put(store, obj) { return this._run(store, 'readwrite', s => s.put(obj)); },
  del(store, key) { return this._run(store, 'readwrite', s => s.delete(key)); },
  clear(store) { return this._run(store, 'readwrite', s => s.clear()); },
  byIndex(store, index, value) { return this._run(store, 'readonly', s => s.index(index).getAll(value)); },

  putMany(storeName, list) {
    return new Promise((resolve, reject) => {
      const tx = this.conn.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      list.forEach(item => store.put(item));
      tx.oncomplete = () => resolve(list.length);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted.'));
    });
  },

  /* Replace all stores in ONE transaction: either everything is restored or nothing changes. */
  replaceAll(data) {
    return new Promise((resolve, reject) => {
      const names = Object.keys(STORE_KEYS);
      const tx = this.conn.transaction(names, 'readwrite');
      names.forEach(name => {
        const store = tx.objectStore(name);
        store.clear();
        const list = Array.isArray(data[name]) ? data[name] : [];
        list.forEach(item => {
          if (item && item[STORE_KEYS[name]] !== undefined && item[STORE_KEYS[name]] !== null) store.put(item);
        });
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Restore aborted. No data was changed.'));
    });
  },

  async getSetting(key, def) {
    const rec = await this.get('settings', key);
    return rec ? rec.value : def;
  },
  setSetting(key, value) { return this.put('settings', { key, value }); },

  _ym() { const d = new Date(); return `${d.getFullYear()}${dbPad(d.getMonth() + 1)}`; },

  /* Returns the next number without reserving it (for display on new forms). */
  async peekNumber(kind, store) {
    const ym = this._ym();
    let n = await this.getSetting(`counter_${kind}_${ym}`, 0);
    let no;
    do { n++; no = `BEM-${kind}-${ym}-${String(n).padStart(4, '0')}`; } while (await this.get(store, no));
    return no;
  },

  /* Reserves and returns the next number, e.g. BEM-IQC-202611-0001. The serial restarts each month. */
  async nextNumber(kind, store) {
    const ym = this._ym();
    const ckey = `counter_${kind}_${ym}`;
    let n = await this.getSetting(ckey, 0);
    let no;
    do { n++; no = `BEM-${kind}-${ym}-${String(n).padStart(4, '0')}`; } while (await this.get(store, no));
    await this.setSetting(ckey, n);
    return no;
  }
};

/* First-run data: settings, masters and the demonstration inspection plan */
async function seedIfNeeded() {
  if (await DB.getSetting('seeded', false)) return;

  await DB.putMany('settings', [
    { key: 'qhPin', value: '1234' },
    { key: 'pinChanged', value: false },
    { key: 'qhName', value: 'Quality Head' },
    { key: 'categories', value: DEFAULT_CATEGORIES.slice() },
    { key: 'thresholds', value: JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS)) },
    { key: 'installedAt', value: dbToday(0) }
  ]);

  await DB.putMany('suppliers', [
    { code: 'DEMO-SUP', name: 'Demo Supplier', contact: 'Demo Contact', email: '', phone: '', address: 'Chakan, Pune', status: 'Approved' }
  ]);

  await DB.putMany('parts', [
    { partNo: 'BEM-DEMO-001', partName: 'Sheet Metal Mounting Bracket', category: 'Sheet-metal part', vehicleType: 'Common', drawingNo: 'BEM-DRG-DEMO-001', drawingRev: 'A', supplierCode: 'DEMO-SUP', inspectionLevel: 'Normal', critical: 'Yes' }
  ]);

  await DB.putMany('plans', [{
    partNo: 'BEM-DEMO-001',
    updatedAt: dbToday(0),
    updatedBy: 'System (demonstration plan)',
    chars: [
      { sn: 1, type: 'Dimensional', name: 'Material thickness', spec: '3.00 mm', nominal: '3.00', lowTol: '-0.10', upTol: '0.10', unit: 'mm', method: 'Measure at three locations', instrument: 'Micrometer', sampleSize: '3', cls: 'Major', refNote: '', refPhoto: '' },
      { sn: 2, type: 'Dimensional', name: 'Mounting hole diameter', spec: '20.00 mm', nominal: '20.00', lowTol: '-0.10', upTol: '0.15', unit: 'mm', method: 'Measure hole diameter', instrument: 'Vernier Caliper', sampleSize: '3', cls: 'Critical', refNote: '', refPhoto: '' },
      { sn: 3, type: 'Visual', name: 'Surface condition', spec: 'Free from dent, crack, rust and sharp burr', nominal: '', lowTol: '', upTol: '', unit: '', method: 'Visual check under normal shop light', instrument: 'Visual', sampleSize: '5', cls: 'Major', refNote: '', refPhoto: '' },
      { sn: 4, type: 'Identification', name: 'Part identification', spec: 'Correct part number and supplier batch identification', nominal: '', lowTol: '', upTol: '', unit: '', method: 'Check label / marking against PO and drawing', instrument: 'Visual', sampleSize: '1', cls: 'Critical', refNote: '', refPhoto: '' }
    ]
  }]);

  await DB.putMany('inspectors', [
    { empNo: 'E001', name: 'Demo Inspector', role: 'Inspector', active: 'Active' }
  ]);

  await DB.putMany('instruments', [
    { id: 'MIC-001', name: 'Micrometer', range: '0-25 mm', leastCount: '0.001 mm', calDue: dbToday(180), status: 'Active' },
    { id: 'VC-001', name: 'Vernier Caliper', range: '0-150 mm', leastCount: '0.02 mm', calDue: dbToday(180), status: 'Active' },
    { id: 'VC-002', name: 'Vernier Caliper', range: '0-200 mm', leastCount: '0.02 mm', calDue: dbToday(-10), status: 'Active' }
  ]);

  const sev = { Crack: 'Critical', 'Broken part': 'Critical', 'Wrong part': 'Critical', 'Missing part': 'Major', 'Welding defect': 'Major', Deformation: 'Major', Bend: 'Major', 'Oil leakage': 'Major', 'Coolant leakage': 'Major', 'Connector damage': 'Major', Corrosion: 'Major', 'Identification missing': 'Major', Contamination: 'Major' };
  const defects = VISUAL_DEFECTS.map((name, i) => ({ code: `VD${String(i + 1).padStart(2, '0')}`, name, type: 'Visual', severity: sev[name] || 'Minor', active: 'Active' }));
  defects.push(
    { code: 'DM01', name: 'Out of tolerance', type: 'Dimensional', severity: 'Major', active: 'Active' },
    { code: 'FN01', name: 'Function failure', type: 'Functional', severity: 'Major', active: 'Active' },
    { code: 'FT01', name: 'Fitment problem', type: 'Fitment', severity: 'Major', active: 'Active' },
    { code: 'ID01', name: 'Wrong or unreadable identification', type: 'Identification', severity: 'Major', active: 'Active' },
    { code: 'DC01', name: 'Required document missing', type: 'Documentation', severity: 'Major', active: 'Active' },
    { code: 'PK01', name: 'Inadequate packaging', type: 'Packaging', severity: 'Minor', active: 'Active' },
    { code: 'EL01', name: 'Electrical test failure', type: 'Electrical', severity: 'Major', active: 'Active' },
    { code: 'LK01', name: 'Leakage found', type: 'Leakage', severity: 'Critical', active: 'Active' },
    { code: 'TR01', name: 'Traceability missing', type: 'Traceability', severity: 'Major', active: 'Active' }
  );
  await DB.putMany('defects', defects);

  await DB.setSetting('seeded', true);
}
