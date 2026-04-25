# 💰 Expense Tracker (Hackathon MVP)

Minimal personal-expense tracker:

- **Frontend:** plain HTML + CSS + Vanilla JS
- **Backend:** Google Apps Script (Web App)
- **Database:** Google Sheets

No servers, no frameworks, no OAuth dance. Built to be hackable in an afternoon.

---

## 📁 Folder structure

```
ExpenseTrackerHackupc/
├── backend/
│   └── Code.gs              # Google Apps Script (paste this into the Apps Script editor)
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js               # 👈 set API_URL here after deploying
└── README.md
```

---

## 🚀 Setup (≈ 10 minutes)

### 1. Create the Google Sheet

1. Go to <https://sheets.new> and name it e.g. **"Expense Tracker DB"**.
2. Create three tabs (rename / add at the bottom):

   **Tab `Transactions`** — first row:
   ```
   Date | Category | Amount | Description
   ```

   **Tab `Limits`** — first row:
   ```
   Category | MonthlyLimit | Emoji
   ```

   *(Optional)* **Tab `Summary`** — leave blank, the script doesn't need it.

   > Tip: you don't actually need to add the headers manually — the script adds them on first run. But it's nice to see them.

### 2. Add the Apps Script backend

1. In the Sheet: **Extensions → Apps Script**.
2. Delete the default `Code.gs` content and paste the contents of [`backend/Code.gs`](backend/Code.gs).
3. Save (💾). Name the project e.g. **"Expense Tracker API"**.
4. *(Optional but recommended)* In the editor, run the function `setupSheets` once. It will create the headers and seed a few default categories. Approve the permissions popup the first time.

### 3. Deploy as a Web App

1. Top-right: **Deploy → New deployment**.
2. Click the gear ⚙️ → **Web app**.
3. Configure:
   - **Description:** Expense Tracker API
   - **Execute as:** *Me*
   - **Who has access:** *Anyone* (this is what makes it callable from your HTML page)
4. **Deploy** → copy the **Web app URL** (looks like `https://script.google.com/macros/s/AKfy.../exec`).

> Every time you change `Code.gs`, you must redeploy: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

### 4. Connect the frontend

1. Open `frontend/app.js`.
2. Replace the placeholder:
   ```js
   const API_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';
   ```
   with the URL you just copied.
3. Open `frontend/index.html` in your browser (double-click is fine — no build step).

You should see the UI load and any seeded categories appear with empty progress bars.

---

## 🧪 Quick test

1. Click **Add / update category** → e.g. `Food`, emoji `🍔`, limit `200`.
2. Add an expense in that category.
3. Reload the Sheet — the row should be there.
4. The progress bar fills accordingly. Go past 100 % to see the red ⚠️ overflow style.

---

## 🔌 API reference

Base URL = the Web App URL.

| Method | Action | Params / body | Returns |
|---|---|---|---|
| `GET`  | `?action=getTransactions` | – | `[{date, category, amount, description}]` |
| `GET`  | `?action=getLimits`       | – | `[{category, monthlyLimit, emoji}]` |
| `GET`  | `?action=getAll`          | – | `{transactions, limits}` |
| `POST` | `addTransaction`          | `{action, date, category, amount, description}` | saved row |
| `POST` | `addCategory`             | `{action, category, monthlyLimit, emoji}` | saved row |

All responses are JSON of the form `{ ok: true, data: ... }` or `{ ok: false, error: "..." }`.

> The frontend posts with `Content-Type: text/plain` on purpose — Apps Script doesn't handle CORS preflight requests, and `text/plain` doesn't trigger one. The body is still JSON.

---

## 🎨 Features

**MVP (done):**
- Add expense via form
- Add / update category with emoji + monthly limit
- All expenses listed in a table
- Per-category totals (computed on the frontend)
- Grand total
- Progress bars per category (green → orange ≥ 75 % → red ≥ 100 %)
- Month filter

**Easy nice-to-haves to add later:**
- Pie / bar chart with Chart.js (just drop in a `<canvas>` and a CDN script)
- Delete / edit row (add a `deleteTransaction` action in `Code.gs`)
- Toast for "limit exceeded" alerts (already styled, just wire it up)

---

## 🧠 Design notes

- **State lives on the frontend.** The backend just stores rows — no aggregation, no business rules. This keeps `Code.gs` tiny.
- **One spreadsheet, two real sheets.** No joins, no IDs, no migrations.
- **No build step.** Open `index.html` in any browser.
- **No CORS pain.** `text/plain` POST + JSON body is the standard Apps Script trick.
