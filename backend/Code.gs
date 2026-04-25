/**
 * Expense Tracker - Google Apps Script Backend (multi-user)
 * ----------------------------------------------------------
 * Every request must include a spreadsheetId (except setupSheet).
 *
 * GET:  ?action=getTransactions&spreadsheetId=...
 *       ?action=getLimits&spreadsheetId=...
 *
 * POST (body JSON sent as text/plain):
 *   { action: "setupSheet",        sheetUrl }
 *   { action: "addTransaction",    spreadsheetId, transaction: {date,category,amount,description} }
 *   { action: "deleteTransaction", spreadsheetId, id }
 *   { action: "addOrUpdateLimit",  spreadsheetId, category, monthlyLimit, emoji }
 *   { action: "deleteCategory",    spreadsheetId, category }
 */

const SHEET_TRANSACTIONS = 'Transactions';
const SHEET_LIMITS       = 'Limits';
const SHEET_SETTINGS     = 'Settings';


// ---------- RESPONSE HELPER ----------

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ---------- SHEET HELPERS ----------

function openSheet(spreadsheetId) {
  if (!spreadsheetId) throw new Error('spreadsheetId is required');
  return SpreadsheetApp.openById(spreadsheetId);
}

function getSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === SHEET_TRANSACTIONS) {
      sheet.appendRow(['Date', 'Category', 'Amount', 'Description', 'ID']);
    } else if (name === SHEET_LIMITS) {
      sheet.appendRow(['Category', 'MonthlyLimit', 'Emoji']);
    } else if (name === SHEET_SETTINGS) {
      sheet.appendRow(['Key', 'Value']);
    }
  }
  return sheet;
}

function extractSpreadsheetId(url) {
  const match = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Could not extract spreadsheet ID from URL. Paste a valid Google Sheets URL.');
  return match[1];
}


// ---------- GET ----------

function doGet(e) {
  try {
    const params        = (e && e.parameter) || {};
    const action        = params.action || '';
    const spreadsheetId = params.spreadsheetId || '';

    if (!spreadsheetId) {
      return jsonResponse({ ok: false, error: 'spreadsheetId query param is required' });
    }

    const ss = openSheet(spreadsheetId);

    if (action === 'getTransactions') return jsonResponse({ ok: true, data: getTransactions(ss) });
    if (action === 'getLimits')       return jsonResponse({ ok: true, data: getLimits(ss) });
    if (action === 'getAll') {
      return jsonResponse({ ok: true, data: { transactions: getTransactions(ss), limits: getLimits(ss) } });
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
      body = JSON.parse(e.postData.contents);
    }

    const action = body.action || '';

    // setupSheet doesn't need a spreadsheetId — it derives one from the URL
    if (action === 'setupSheet') {
      return jsonResponse(setupSheet(body.sheetUrl));
    }

    const spreadsheetId = body.spreadsheetId || '';
    if (!spreadsheetId) {
      return jsonResponse({ ok: false, error: 'spreadsheetId is required' });
    }

    const ss = openSheet(spreadsheetId);

    if (action === 'addTransaction')              return jsonResponse({ ok: true, data: addTransaction(ss, body) });
    if (action === 'deleteTransaction')           return jsonResponse({ ok: true, data: deleteTransaction(ss, body) });
    if (action === 'addOrUpdateLimit' ||
        action === 'addCategory')                 return jsonResponse({ ok: true, data: addOrUpdateLimit(ss, body) });
    if (action === 'deleteCategory')              return jsonResponse({ ok: true, data: deleteCategory(ss, body) });

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}


// ---------- BUSINESS LOGIC ----------

function setupSheet(sheetUrl) {
  try {
    if (!sheetUrl) throw new Error('sheetUrl is required');
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    const ss = SpreadsheetApp.openById(spreadsheetId);
    getSheet(ss, SHEET_TRANSACTIONS);
    getSheet(ss, SHEET_LIMITS);
    getSheet(ss, SHEET_SETTINGS);
    return { success: true, spreadsheetId: spreadsheetId, message: 'Sheet connected and prepared successfully' };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function getTransactions(ss) {
  const sheet  = getSheet(ss, SHEET_TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  return values.slice(1)
    .filter(r => r[0] !== '' && r[1] !== '')
    .map(r => ({
      id:          String(r[4] || ''),
      date:        formatDate(r[0]),
      category:    String(r[1]),
      amount:      Number(r[2]) || 0,
      description: String(r[3] || '')
    }));
}

function getLimits(ss) {
  const sheet  = getSheet(ss, SHEET_LIMITS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  return values.slice(1)
    .filter(r => r[0] !== '')
    .map(r => ({
      category:     String(r[0]),
      monthlyLimit: Number(r[1]) || 0,
      emoji:        String(r[2] || '')
    }));
}

function addTransaction(ss, data) {
  const sheet = getSheet(ss, SHEET_TRANSACTIONS);
  const tx    = data.transaction || data;

  const date        = tx.date ? new Date(tx.date) : new Date();
  const category    = String(tx.category || '').trim();
  const amount      = Number(tx.amount) || 0;
  const description = String(tx.description || '').trim();
  const id          = Utilities.getUuid();

  if (!category) throw new Error('Category is required');
  if (amount <= 0) throw new Error('Amount must be greater than 0');

  sheet.appendRow([date, category, amount, description, id]);
  return { id, date: formatDate(date), category, amount, description };
}

function deleteTransaction(ss, data) {
  const sheet  = getSheet(ss, SHEET_TRANSACTIONS);
  const id     = String(data.id || '');
  if (!id) throw new Error('id is required');

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][4]) === id) {
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  throw new Error('Transaction not found');
}

function addOrUpdateLimit(ss, data) {
  const sheet        = getSheet(ss, SHEET_LIMITS);
  const category     = String(data.category || '').trim();
  const monthlyLimit = Number(data.monthlyLimit) || 0;
  const emoji        = String(data.emoji || '').trim();

  if (!category) throw new Error('Category name is required');

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

function deleteCategory(ss, data) {
  const sheet    = getSheet(ss, SHEET_LIMITS);
  const category = String(data.category || '').trim();
  if (!category) throw new Error('category is required');

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === category.toLowerCase()) {
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  throw new Error('Category not found');
}


// ---------- UTILS ----------

function formatDate(d) {
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}
