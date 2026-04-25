/* =========================================================
 *  Expense Tracker - Frontend logic
 * =========================================================
 *  After deploying Apps Script, paste the Web App URL below.
 *  Each user connects their own Google Sheet via the UI.
 * ========================================================= */

// 🔧 PASTE your Apps Script Web App URL here (after deploying)
//    Example: https://script.google.com/macros/s/AKfy.../exec
const API_URL = 'https://docs.google.com/spreadsheets/d/1IaZoku2BqgM1OjiaXg38wDV_ce1T6UMk7w8OCGFLow0/edit?gid=1320133303#gid=1320133303';

// In-memory state — spreadsheetId persists across reloads via localStorage
const state = {
  transactions: [],
  limits: [],
  filterMonth: '',
  spreadsheetId: localStorage.getItem('spreadsheetId') || ''
};

// ---------------- DOM refs ----------------
const $ = (sel) => document.querySelector(sel);
const expenseForm    = $('#expense-form');
const categoryForm   = $('#category-form');
const expCategory    = $('#exp-category');
const expDate        = $('#exp-date');
const monthFilter    = $('#month-filter');
const totalAmountEl  = $('#total-amount');
const summaryEl      = $('#category-summary');
const tableBody      = $('#expenses-table tbody');
const toastEl        = $('#toast');
const connectSection = $('#connect-section');
const connectedBar   = $('#connected-bar');
const appContent     = $('#app-content');
const connectForm    = $('#connect-form');
const sheetUrlInput  = $('#sheet-url');
const connectStatus  = $('#connect-status');
const connectedIdEl  = $('#connected-id');
const disconnectBtn  = $('#disconnect-btn');


// ---------------- API helpers ----------------

async function apiGet(action) {
  if (!state.spreadsheetId) throw new Error('No sheet connected');
  const url = API_URL
    + '?action=' + encodeURIComponent(action)
    + '&spreadsheetId=' + encodeURIComponent(state.spreadsheetId);
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

async function apiPost(payload) {
  // Always attach spreadsheetId so the backend knows which sheet to use.
  // text/plain avoids the CORS preflight that blocks Apps Script.
  const body = { ...payload, spreadsheetId: state.spreadsheetId };
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}


// ---------------- Sheet connection ----------------

async function connectSheet(sheetUrl) {
  connectStatus.textContent = 'Connecting…';
  connectStatus.className = 'connect-status';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'setupSheet', sheetUrl })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Connection failed');

    state.spreadsheetId = json.spreadsheetId;
    localStorage.setItem('spreadsheetId', json.spreadsheetId);
    showApp();
    toast('Sheet connected ✅');
  } catch (err) {
    connectStatus.textContent = '❌ ' + err.message;
    connectStatus.className = 'connect-status error';
  }
}

function disconnectSheet() {
  state.spreadsheetId = '';
  localStorage.removeItem('spreadsheetId');
  state.transactions = [];
  state.limits = [];
  showConnectionPanel();
}

function showApp() {
  connectSection.style.display = 'none';
  connectedBar.style.display = '';
  appContent.style.display = '';
  connectedIdEl.textContent = state.spreadsheetId;
  loadData();
}

function showConnectionPanel() {
  connectSection.style.display = '';
  connectedBar.style.display = 'none';
  appContent.style.display = 'none';
  connectStatus.textContent = '';
  sheetUrlInput.value = '';
}


// ---------------- UI helpers ----------------

function toast(msg, type = 'success') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show ' + type;
  setTimeout(() => { toastEl.className = 'toast'; }, 2500);
}

function fmtMoney(n) {
  return (Number(n) || 0).toFixed(2) + ' €';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthOf(dateStr) {
  return (dateStr || '').slice(0, 7);
}


// ---------------- Rendering ----------------

function renderCategoryOptions() {
  const current = expCategory.value;
  expCategory.innerHTML = '';

  if (state.limits.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '-- create a category first --';
    expCategory.appendChild(opt);
    return;
  }

  state.limits.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.category;
    opt.textContent = (c.emoji ? c.emoji + ' ' : '') + c.category;
    expCategory.appendChild(opt);
  });

  if (current) expCategory.value = current;
}

function getFilteredTransactions() {
  if (!state.filterMonth) return state.transactions;
  return state.transactions.filter(t => monthOf(t.date) === state.filterMonth);
}

function renderTotal() {
  const total = getFilteredTransactions()
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  totalAmountEl.textContent = fmtMoney(total);
}

function renderSummary() {
  const tx = getFilteredTransactions();

  const spentByCat = {};
  tx.forEach(t => {
    spentByCat[t.category] = (spentByCat[t.category] || 0) + Number(t.amount || 0);
  });

  const seen = new Set();
  const items = state.limits.map(c => {
    seen.add(c.category);
    return {
      category: c.category,
      emoji: c.emoji || '',
      limit: Number(c.monthlyLimit) || 0,
      spent: spentByCat[c.category] || 0
    };
  });
  Object.keys(spentByCat).forEach(cat => {
    if (!seen.has(cat)) {
      items.push({ category: cat, emoji: '', limit: 0, spent: spentByCat[cat] });
    }
  });

  if (items.length === 0) {
    summaryEl.innerHTML = '<p class="muted">No categories yet. Add one above 👆</p>';
    return;
  }

  summaryEl.innerHTML = items.map(item => {
    const pct = item.limit > 0 ? (item.spent / item.limit) * 100 : 0;
    const pctClamped = Math.min(pct, 100);
    let cls = '';
    if (pct >= 100) cls = 'danger';
    else if (pct >= 75) cls = 'warning';

    const limitText = item.limit > 0
      ? `${fmtMoney(item.spent)} / ${fmtMoney(item.limit)}`
      : `${fmtMoney(item.spent)} (no limit)`;

    const pctText = item.limit > 0
      ? `${pct.toFixed(0)}%${pct >= 100 ? ' ⚠️ over budget' : ''}`
      : '';

    return `
      <div class="summary-item">
        <div class="summary-row">
          <span class="summary-name">${item.emoji ? item.emoji + ' ' : ''}${escapeHtml(item.category)}</span>
          <span>${limitText}</span>
        </div>
        <div class="bar">
          <div class="bar-fill ${cls}" style="width:${pctClamped}%"></div>
        </div>
        <div class="summary-pct ${pct >= 100 ? 'warning-text' : ''}">${pctText}</div>
      </div>
    `;
  }).join('');
}

function renderTable() {
  const tx = getFilteredTransactions()
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  if (tx.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" class="muted">No expenses yet</td></tr>';
    return;
  }

  const emojiMap = {};
  state.limits.forEach(c => { emojiMap[c.category] = c.emoji || ''; });

  tableBody.innerHTML = tx.map(t => `
    <tr>
      <td>${escapeHtml(t.date)}</td>
      <td>${emojiMap[t.category] ? emojiMap[t.category] + ' ' : ''}${escapeHtml(t.category)}</td>
      <td>${escapeHtml(t.description || '')}</td>
      <td class="right">${fmtMoney(t.amount)}</td>
    </tr>
  `).join('');
}

function renderAll() {
  renderCategoryOptions();
  renderTotal();
  renderSummary();
  renderTable();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// ---------------- Data loading ----------------

async function loadData() {
  try {
    const [transactions, limits] = await Promise.all([
      apiGet('getTransactions'),
      apiGet('getLimits')
    ]);
    state.transactions = transactions;
    state.limits = limits;
    renderAll();
  } catch (err) {
    console.error(err);
    toast('Failed to load: ' + err.message, 'error');
  }
}


// ---------------- Event handlers ----------------

connectForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await connectSheet(sheetUrlInput.value.trim());
});

disconnectBtn.addEventListener('click', () => {
  if (confirm('Disconnect this sheet? Your data in Google Sheets is not affected.')) {
    disconnectSheet();
  }
});

expenseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    action: 'addTransaction',
    transaction: {
      date: expDate.value || todayISO(),
      category: expCategory.value,
      amount: parseFloat($('#exp-amount').value),
      description: $('#exp-description').value
    }
  };

  if (!payload.transaction.category) {
    toast('Pick a category first', 'error');
    return;
  }

  try {
    const saved = await apiPost(payload);
    state.transactions.push(saved);
    renderTotal();
    renderSummary();
    renderTable();
    expenseForm.reset();
    expDate.value = todayISO();
    toast('Expense added ✅');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
});

categoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    action: 'addOrUpdateLimit',
    category: $('#cat-name').value.trim(),
    emoji: $('#cat-emoji').value.trim(),
    monthlyLimit: parseFloat($('#cat-limit').value) || 0
  };

  try {
    await apiPost(payload);
    state.limits = await apiGet('getLimits');
    renderAll();
    categoryForm.reset();
    toast('Category saved ✅');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
});

monthFilter.addEventListener('change', () => {
  state.filterMonth = monthFilter.value;
  renderTotal();
  renderSummary();
  renderTable();
});


// ---------------- Init ----------------

(function init() {
  if (API_URL.includes('PASTE_YOUR_WEB_APP_URL_HERE')) {
    connectSection.querySelector('h2').textContent = '⚠️ Setup required';
    connectSection.querySelector('.connect-help').innerHTML =
      'Open <code>app.js</code> and replace <code>PASTE_YOUR_WEB_APP_URL_HERE</code> '
      + 'with your deployed Apps Script Web App URL, then reload the page.';
    connectForm.style.display = 'none';
    return;
  }

  expDate.value = todayISO();
  monthFilter.value = todayISO().slice(0, 7);
  state.filterMonth = monthFilter.value;

  if (state.spreadsheetId) {
    showApp();
  } else {
    showConnectionPanel();
  }
})();

// PWA: register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(console.error);
}
