# BEM Incoming Inspection System

**Blue Energy Motors, Chakan** — incoming parts inspection app for Android phones.
Version 1.0.0 · Free installable Progressive Web App (PWA) · Works offline · No paid services.

---

## 1. How the application works

- The app is a set of plain HTML, CSS and JavaScript files. It runs inside Google Chrome on Android and can be added to the home screen, where it opens like a normal app.
- All data (receipts, inspections, photographs, NCRs and masters) is stored **on the phone** in the browser's built-in database (IndexedDB). No server, login service or paid database is used.
- A service worker saves a copy of the app files on the phone the first time it is opened. After that the app opens and works **without internet**.
- **Inspector** (select name, no PIN): new receipt, inspection entry, photographs, save draft, complete inspection, reports.
- **Quality Head** (4-digit PIN, default `1234`): everything above plus final decision, deviation approval, NCR follow-up, dashboard, management review report, masters, inspection plans, settings, export, backup and restore.
- Flow: **New Receipt → Start Inspection → characteristics entered (dimensional values give automatic OK/NOK; visual defects force NOK) → Complete Inspection**.
  - All OK → lot is **Accepted automatically**.
  - Any NOK → an **NCR is created automatically** and the lot goes to **Pending Quality Head Review**. Critical NOK shows **CRITICAL DEFECT** and acceptance is blocked.
- Reports are clean black-and-white HTML pages. Use **Print / Save as PDF** to make a PDF for the supplier.

> **Security note:** The PIN is basic local access control on one phone. It is **not** enterprise-grade security. Anyone with the phone and technical knowledge could read the stored data.

---

## 2. Folder and file structure

```
bem-iqc/
├── index.html            Page shell, loads all scripts
├── styles.css            Look and feel, print layout
├── db.js                 IndexedDB storage, fixed lists, first-run demo data
├── ui.js                 Helpers: dates, dialogs, CSV, downloads, photo compression, camera
├── inspection.js         Receipt, inspection entry, photographs, QH decision, NCR auto-creation
├── ncr.js                Hold / NCR list and NCR follow-up
├── dashboard.js          KPI calculations and dashboard
├── reports.js            Supplier report, management review report, CSV exports
├── masters.js            Masters, inspection plans, categories, settings, backup / restore
├── app.js                Start-up, login, navigation, home screen, search
├── manifest.json         PWA settings (name, icons, colours)
├── service-worker.js     Offline cache
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-512.png
├── serve.ps1             Free local web server for Windows (testing on a PC)
├── start-app.bat         Double-click to start serve.ps1
├── .nojekyll             Tells GitHub Pages to publish files as they are
└── README.md             This guide
```

All files must stay in the same folder (icons inside `icons/`).

### Icons
The three PNG icons are included (blue square, white "BEM / IQC"). To use your own logo, make square PNG files with exactly these names and sizes (192×192 and 512×512; for the maskable icon keep the logo inside the central 70 % of the square). A free tool such as https://www.pwabuilder.com/imageGenerator or Microsoft Paint is enough.

---

## 3. Run it on a Windows computer

Opening `index.html` by double-clicking will show the screens, but **offline installation (service worker) and the in-app camera do not work from a file** — browsers only allow them on `https://` addresses or on `http://localhost`. Use the included free local server:

1. Copy the whole `bem-iqc` folder to the computer (e.g. `D:\bem-iqc`).
2. Double-click **`start-app.bat`**.
   - A black window opens and says *running at http://localhost:8080/*. Chrome opens automatically.
   - Keep the black window open while using the app. Close it (or press Ctrl+C) to stop.
3. If Windows blocks the script, open PowerShell in the folder and run:
   `powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1`
4. If port 8080 is busy: `powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 -Port 8090`

Use Chrome's mobile view to see the phone layout: press **F12 → Ctrl+Shift+M**.

> The computer server is for testing only. A phone on Wi-Fi cannot use the camera or offline mode from `http://<computer-IP>:8080` because that address is not secure. For phones, use GitHub Pages (next section).

---

## 4. Host it free on GitHub Pages

GitHub Pages gives a free `https://` address. The free plan needs a **public** repository — this only makes the **app code** public. **Inspection data never leaves the phone** and is not stored on GitHub.

1. Create a free account at https://github.com (use a company e-mail if allowed by IT policy).
2. Click **+ → New repository**. Name: `bem-iqc`. Select **Public**. Click **Create repository**.
3. On the new repository page click **uploading an existing file**.
4. Drag **all files and the `icons` folder** from your computer into the browser window. (Include `.nojekyll`; if Windows hides it, it is optional.)
5. Click **Commit changes**.
6. Go to **Settings → Pages**. Under *Build and deployment*: Source = **Deploy from a branch**, Branch = **main**, folder **/ (root)**. Click **Save**.
7. Wait 1–2 minutes. The address appears at the top of the Pages screen, e.g.
   `https://your-user-name.github.io/bem-iqc/`
8. Open that address on the Android phone in Chrome.

**Updating the app later:** upload the changed files to the same repository, and **increase `CACHE_VERSION`** in `service-worker.js` (e.g. `bem-iqc-v1.0.1`). Phones pick up the new version the next time the app is opened with internet (close and reopen the app once more if the old screen still shows). Data on the phone is not affected by updates.

**Other genuinely free options:** Netlify Drop (https://app.netlify.com/drop — drag the folder onto the page) or Cloudflare Pages. Any static host with `https://` works.

---

## 5. Install it on the Android home screen

1. Open the GitHub Pages address in **Google Chrome** (not Incognito).
2. Wait until the login screen appears (this stores the app for offline use).
3. Tap the Chrome menu **⋮ → Add to Home screen** (or **Install app**). Confirm **Install**.
4. The **BEM IQC** icon appears on the home screen. Open it from there from now on.
5. Test offline: switch on Airplane mode and open the app — it should still open.
6. Inside the app, Quality Head → **Masters → Settings → Request Permanent Storage** (asks Chrome not to clear data automatically).

---

## 6. Allow camera access on Android

1. In the app open an inspection, make a characteristic NOK and tap **📷 Take photograph**.
2. Chrome asks *"Allow BEM IQC to take pictures and record video?"* → tap **Allow** (or **While using the app**).
3. The rear camera opens inside the app → **Capture** → check the preview → **Use Photo** or **Retake**.

If you tapped **Block** by mistake:
- Installed app: long-press the app icon → **App info** (or Chrome ⋮ → *Settings → Site settings → Camera*) → find the app address → **Allow**.
- Or: Chrome → ⋮ → **Settings → Site settings → Camera** → make sure Camera is allowed, and remove the app address from the *Blocked* list.
- Android level: **Settings → Apps → Chrome → Permissions → Camera → Allow**.

If the in-app camera cannot open, the app automatically opens the phone's own camera app instead. **Add from gallery** lets you pick an existing photograph. Large photographs are reduced to 1280 pixels (about 100–250 KB) before saving.

---

## 7. Test procedure using the demonstration part

Demo data loaded on first start: supplier **Demo Supplier (DEMO-SUP)**, part **BEM-DEMO-001 Sheet Metal Mounting Bracket**, inspection plan with 4 characteristics, inspector **Demo Inspector**, instruments **MIC-001** (Micrometer), **VC-001** (Vernier Caliper) and **VC-002** (Vernier Caliper with **expired** calibration, for testing the warning).

**Start:** Login → *Demo Inspector* → **Continue as Inspector** → **New Receipt** → Part number **BEM-DEMO-001** (name, category, drawing, supplier fill automatically and "Inspection plan loaded: 4 characteristics" appears) → enter PO, invoice, quantity 100 → **Save and Start Inspection**.

| Test | Steps | Expected result |
|---|---|---|
| **1 Dimensional OK** | Characteristic 2 (Mounting hole diameter), Sample 1 = `20.05` | Range shown 19.90 to 20.15 mm; value box green; **OK** |
| **2 Dimensional NOK** | Sample 2 = `20.22` | Value box red, **NOK**, red **CRITICAL DEFECT** banner; NOK panel appears with defect description, quantity, suspected cause, immediate action and **Take photograph / Add from gallery** buttons |
| Expired instrument | Characteristic 2 → Instrument used = **VC-002** | Red **CALIBRATION EXPIRED** warning, sample boxes locked; **Quality Head override** needs PIN and reason. Select **VC-001** to continue normally |
| **3 Visual dent** | Characteristic 3 → Defect found = **Dent** | Result becomes **NOK** automatically; camera buttons appear; **Save Observation** and **Complete Inspection** refuse to continue until a photograph, location, quantity, severity and remark are entered |
| **4 Critical NOK** | Fill all fields, take photographs, press **Save Observation** on each NOK, mark characteristic 4 OK, **Complete Inspection** | Confirmation says NCR will be created; status **Pending Quality Head Review**; NCR **BEM-NCR-YYYYMM-0001** created automatically. As Quality Head choose **Accept** → blocked with "CRITICAL DEFECT: this lot cannot be accepted". **Reject** or **Conditionally Accept** (all 7 fields mandatory) works |
| **5 Dashboard** | Create a second receipt, change *Receipt date and time* to last month, enter all values inside tolerance and mark visual/identification OK → **Complete Inspection** (auto-accepted). Open **Dashboard** | Yellow "Demonstration values" banner disappears; current month shows the rejected lot (acceptance 0 %, PPM), previous month shows 1 lot 100 % acceptance. Values change automatically as more lots are entered |
| **6 Backup** | Quality Head → **Backup and Restore → Export Complete Backup** → open the lot → **Delete Inspection** → **Restore Backup from JSON** → choose the file from Downloads → **Restore** | After reload the deleted lot, its NCR and photographs are back |

Also try: **Preview Report → Print / Save as PDF**, **Hold / NCR** (closing needs closure evidence, verification remarks and QH approval), **Management Review Report**, **Completed Inspections** search and filters.

### Test results (done before delivery)
Tested in Chrome on a mobile-size screen: Tests 1–6 all passed; the app loaded and worked with the server stopped (offline); NCR closure rules, CSV import/export (including error rows), conditional acceptance, inspector restrictions and Clear All Data were checked. **The live in-app camera could not be tested in the test browser (camera blocked there)**; its fallback to the phone camera and the photo compression/storage/report path were tested. Check the camera once on your own phone (section 6).

---

## 8. Calculations and rules used

- **LSL** = nominal + lower tolerance; **USL** = nominal + upper tolerance; actual value inside LSL–USL (inclusive) = **OK**, else **NOK**. The inspector cannot change a calculated dimensional result. Only the Quality Head can approve a **deviation**, with a recorded reason.
- **Lot acceptance %** = Accepted lots ÷ total inspected lots × 100 (conditional acceptance is not counted as accepted).
- **Incoming PPM** = total rejected quantity ÷ total received quantity × 1,000,000.
- **Overdue 8D** = NCR not closed, 8D not received and 8D target date earlier than today.
- **Cost of poor quality** = sorting + rework + rejection + transport + line stoppage (entered per lot by the Quality Head).
- Lots are counted in the month of their **receipt date**.
- Default KPI targets (editable in **Masters → Settings**): Lot acceptance Green ≥ 98, Yellow ≥ 95; PPM Green ≤ 1,000, Yellow ≤ 5,000; Open NCRs Green ≤ 3, Yellow ≤ 7; Overdue 8Ds Green 0, Yellow ≤ 2. Targets you did not specify were set as starting values: Rejected quantity Green ≤ 100, Yellow ≤ 300; Conditional acceptances Green ≤ 2, Yellow ≤ 5; CoPQ Green ≤ ₹50,000, Yellow ≤ ₹1,50,000 — change them to your plant targets.
- Inspection and NCR numbers restart at 0001 each month (BEM-IQC-YYYYMM-0001, BEM-NCR-YYYYMM-0001).
- One NCR is raised per lot and lists every failed characteristic.
- The inspection plan is copied into the lot when inspection starts, so later plan changes do not alter past inspections.

### CSV formats
Use **Export CSV** first, edit in Excel, then **Import CSV** (save as *CSV UTF-8*).
- Parts: `Part number, Part name, Category, Vehicle type, Drawing number, Drawing revision, Supplier code, Inspection level, Critical part`
- Plans (one row per characteristic): `Part number, SN, Inspection type, Characteristic, Specification, Nominal, Lower tolerance, Upper tolerance, Unit, Inspection method, Measuring instrument, Sample size, Classification, Reference / work instruction`
- Suppliers, inspectors, instruments and defects also support CSV with their screen field names as columns.
If any row has an error, nothing is imported and the row numbers are listed.

---

## 9. Known limitations of local-device storage

- **Data is currently stored on this device. Create a regular backup. Clearing browser data or losing the phone may permanently delete inspections.**
- Each phone has its own separate data. Two inspectors on two phones do not see each other's lots. Merge by restoring a backup on the Quality Head's phone (restore **replaces** all data; it does not merge).
- Uninstalling Chrome, "Clear storage" for Chrome, or a factory reset deletes the data.
- Storage space: about 150–250 KB per photograph. A phone with a few GB free can hold thousands of photographs, but very large backups (hundreds of MB) take time to export.
- The Quality Head PIN is not strong security and is stored on the phone.
- Monthly backup reminder appears on the home screen; backups go to the phone's Downloads folder — copy them to Google Drive / e-mail / PC.
- Android may not share `.html` report files to every app; use Print / Save as PDF for a PDF.
- iPhones are not the target; Safari support for some features (sharing files, install) is limited.

---

## 10. Future optional improvements

- Shared central database (e.g. a company server or a free-tier database) so all phones see the same data, with proper user accounts.
- Automatic upload of backups to Google Drive / OneDrive.
- Barcode / QR scanning of part labels and GRN numbers using the camera.
- Sampling plans per inspection level (e.g. IS 2500 / ISO 2859 tables) to calculate sample size from lot size.
- Supplier portal / e-mail link for suppliers to submit 8D responses.
- SPC charts (X-bar, Cpk) for repeated dimensional characteristics.
- Integration with ERP (GRN, PO and vendor master import).
- Hindi / Marathi language option for the shop floor.
- Packaging as a Play Store app (Trusted Web Activity) if wider distribution is needed.
