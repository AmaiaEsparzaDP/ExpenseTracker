# 💰 Expense Tracker

Personal expense tracker deployable on GitHub Pages. Each user connects their own Google Sheet.

- **Frontend:** plain HTML + CSS + Vanilla JS (PWA-ready)
- **Backend:** Google Apps Script (Web App)
- **Database:** Google Sheets (one per user, user-owned)

No servers, no frameworks, no OAuth.

---

## 📁 Folder structure

```
ExpenseTrackerHackupc/
├── backend/
│   └── Code.gs              # Google Apps Script — paste into the Apps Script editor
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── app.js               # 👈 set API_URL here after deploying Apps Script
│   ├── manifest.json        # PWA manifest
│   ├── service-worker.js    # PWA offline cache
│   ├── icon-192.png         # (optional) add your own icons
│   └── icon-512.png         # (optional)
└── README.md
.github/
└── workflows/
    └── deploy.yml           # Auto-deploys frontend/ to GitHub Pages on push
```

---

## 🚀 Setup

### Step 1 — Deploy the Apps Script backend

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Delete the default code and paste the contents of `backend/Code.gs`.
3. Save. Name the project e.g. **"Expense Tracker API"**.
4. **Deploy → New deployment → gear ⚙️ → Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy** and copy the **Web app URL** (looks like `https://script.google.com/macros/s/AKfy.../exec`).

> Every time you edit `Code.gs`, redeploy: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

### Step 2 — Configure the frontend

Open `frontend/app.js` and replace the placeholder on line 10:

```js
const API_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';
```

with the Web App URL you just copied.

### Step 3 — Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Source**, choose **GitHub Actions**.
4. Push to `main` — the workflow in `.github/workflows/deploy.yml` will build and deploy automatically.

Your app will be live at `https://<your-username>.github.io/<repo-name>/`.

> **Local testing:** you can also just open `frontend/index.html` directly in a browser — no build step needed.

---

## 👤 How users connect their own Google Sheet

Each user runs this flow once:

1. Go to [sheets.new](https://sheets.new) and create an empty Google Sheet.
2. **Share it** with the email address of the Google account that owns the Apps Script (Editor access).
3. Open the app → paste the Sheet URL into the **"Connect your Google Sheet"** form.
4. Click **Connect Sheet** — the backend creates the required tabs automatically.
5. Done. The Sheet URL is stored in `localStorage` — it survives page reloads.

To switch sheets, click **Disconnect** and repeat the flow with a different URL.

---

## 🗂️ Google Sheets structure (auto-created)

The backend creates three tabs on first connection:

**Transactions**

| Date | Category | Amount | Description | CreatedAt |
|------|----------|--------|-------------|-----------|

**Limits**

| Category | MonthlyLimit | Emoji |
|----------|-------------|-------|

**Settings**

| Key | Value |
|-----|-------|

---

## 🔌 API reference

Base URL = the Web App URL.

| Method | Action | Params / body | Returns |
|--------|--------|---------------|---------|
| `POST` | `setupSheet` | `{ sheetUrl }` | `{ success, spreadsheetId, message }` |
| `GET`  | `getTransactions` | `?spreadsheetId=...` | array of transactions |
| `GET`  | `getLimits` | `?spreadsheetId=...` | array of limits |
| `GET`  | `getAll` | `?spreadsheetId=...` | `{ transactions, limits }` |
| `POST` | `addTransaction` | `{ spreadsheetId, transaction: { date, category, amount, description } }` | saved row |
| `POST` | `addOrUpdateLimit` | `{ spreadsheetId, category, monthlyLimit, emoji }` | saved row |

All responses (except `setupSheet`) are `{ ok: true, data: ... }` or `{ ok: false, error: "..." }`.

> The frontend posts with `Content-Type: text/plain` — Apps Script doesn't handle CORS preflight, and `text/plain` doesn't trigger one. The body is still JSON.

---

## 📱 PWA support

The app can be installed on mobile as a standalone app:

- **iOS:** open in Safari → Share → Add to Home Screen
- **Android:** open in Chrome → menu → Install app / Add to Home Screen

The service worker caches all static assets for offline use. API calls (to Google Apps Script) still require internet.

To add a custom icon, create `icon-192.png` and `icon-512.png` in the `frontend/` folder before deploying.

---

## 🎨 Features

- Add expenses with date, category, amount, description
- Add / update categories with emoji + monthly limit
- All expenses listed in a table, newest first
- Grand total for selected month
- Per-category totals with progress bars
- Progress bar colour: green → orange (≥ 75%) → red (≥ 100%)
- Month filter
- Per-user Google Sheet (connected via URL, stored in localStorage)
- PWA: installable, works offline for cached pages

---

## ⚠️ Limitations

This app uses a simplified approach that trades setup simplicity for some limitations:

1. **Manual sharing required.** Users must share their Sheet with the Apps Script owner email. A production app would use Google OAuth + Google Picker instead.
2. **No authentication.** Anyone who knows your Apps Script URL and spreadsheetId can read/write your data. Suitable for personal use or controlled demos.
3. **Apps Script quota.** Google enforces [daily quotas](https://developers.google.com/apps-script/guides/services/quotas) on Apps Script Web Apps. Fine for personal use, not for high traffic.
4. **Redeploy on changes.** Every edit to `Code.gs` requires a manual new deployment in the Apps Script editor.

A production-ready solution would use Google OAuth + Google Picker so users authorise the app directly without sharing sheets manually.
