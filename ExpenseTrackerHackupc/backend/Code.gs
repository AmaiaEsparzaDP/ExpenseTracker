/**
 * Expense Tracker - Google Apps Script Backend
 * ---------------------------------------------
 * This script acts as a tiny REST-ish API on top of a Google Sheet.
 *
 * Sheets expected in the spreadsheet:
 *   - "Transactions"  columns: Date | Category | Amount | Description
 *   - "Limits"        columns: Category | MonthlyLimit | Emoji
 *
 * Endpoints:
 *   GET  ?action=getTransactions
 *   GET  ?action=getLimits
 *   POST { action: "addTransaction", date, category, amount, description }
 *   POST { action: "addCategory",    category, monthlyLimit, emoji }
 */

// ---------- CONFIG ----------
// Leave SPREADSHEET_ID empty if you bind this script to the Sheet
// (Extensions -> Apps Script). Otherwise paste the Sheet ID here.
const SPREADSHEET_ID = '';

const SHEET_TRANSACTIONS = 'Transactions';
const SHEET_LIMITS = 'Limits';


// ---------- HELPERS ----------

function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.length > 0) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === SHEET_TRANSACTIONS) {
      sheet.appendRow(['Date', 'Category', 'Amount', 'Description']);
    } else if (name === SHEET_LIMITS) {
      sheet.appendRow(['Category', 'MonthlyLimit', 'Emoji']);
    }
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ---------- GET ----------

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';

    if (action === 'getTransactions') {
      return jsonResponse({ ok: true, data: getTransactions() });
    }
    if (action === 'getLimits') {
      return jsonResponse({ ok: true, data: getLimits() });
    }
    if (action === 'getAll') {
      return jsonResponse({
        ok: true,
        data: {
          transactions: getTransactions(),
          limits: getLimits()
        }
      });
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}


// ---------- POST ----------

function doPost(e) {
  try {
    let body = {};
    if (e && e.postData && e.postData.contents) {
      // We use text/plain on the frontend to avoid CORS preflight,
      // but the body is still JSON.
      body = JSON.parse(e.postData.contents);
    }

    const action = body.action || '';

    if (action === 'addTransaction') {
      return jsonResponse({ ok: true, data: addTransaction(body) });
    }
    if (action === 'addCategory') {
      return jsonResponse({ ok: true, data: addCategory(body) });
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}


// ---------- BUSINESS LOGIC ----------

function getTransactions() {
  const sheet = getSheet(SHEET_TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const rows = values.slice(1); // drop header
  return rows
    .filter(r => r[0] !== '' && r[1] !== '')
    .map(r => ({
      date: formatDate(r[0]),
      category: String(r[1]),
      amount: Number(r[2]) || 0,
      description: String(r[3] || '')
    }));
}

function getLimits() {
  const sheet = getSheet(SHEET_LIMITS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const rows = values.slice(1);
  return rows
    .filter(r => r[0] !== '')
    .map(r => ({
      category: String(r[0]),
      monthlyLimit: Number(r[1]) || 0,
      emoji: String(r[2] || '')
    }));
}

function addTransaction(data) {
  const sheet = getSheet(SHEET_TRANSACTIONS);

  const date = data.date ? new Date(data.date) : new Date();
  const category = String(data.category || '').trim();
  const amount = Number(data.amount) || 0;
  const description = String(data.description || '').trim();

  if (!category) throw new Error('Category is required');
  if (amount <= 0) throw new Error('Amount must be greater than 0');

  sheet.appendRow([date, category, amount, description]);

  return { date: formatDate(date), category, amount, description };
}

function addCategory(data) {
  const sheet = getSheet(SHEET_LIMITS);
  const category = String(data.category || '').trim();
  const monthlyLimit = Number(data.monthlyLimit) || 0;
  const emoji = String(data.emoji || '').trim();

  if (!category) throw new Error('Category name is required');

  // If category already exists, update it. Otherwise append.
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === category.toLowerCase()) {
      sheet.getRange(i + 1, 1, 1, 3).setValues([[category, monthlyLimit, emoji]]);
      return { category, monthlyLimit, emoji, updated: true };
    }
  }

  sheet.appendRow([category, monthlyLimit, emoji]);
  return { category, monthlyLimit, emoji, updated: false };
}


// ---------- UTILS ----------

function formatDate(d) {
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}


// ---------- DEV HELPER (run once from the editor) ----------

function setupSheets() {
  getSheet(SHEET_TRANSACTIONS);
  const limits = getSheet(SHEET_LIMITS);
  if (limits.getLastRow() <= 1) {
    limits.appendRow(['Food', 200, '🍔']);
    limits.appendRow(['Transport', 80, '🚌']);
    limits.appendRow(['Entertainment', 100, '🎬']);
  }
}
