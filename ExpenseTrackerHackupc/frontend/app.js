/* =========================================================
 *  Expense Tracker - Frontend logic
 * =========================================================
 *  Talks to the Google Apps Script Web App via fetch().
 *  Keep all UI logic on the frontend; backend is "dumb storage".
 * ========================================================= */

// 🔧 PASTE your Apps Script Web App URL here (after deploying)
//    Example: https://script.google.com/macros/s/AKfy.../exec
const API_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';

// In-memory state
const state = {
  transactions: [],
  limits: [],
  filterMonth: '' // 'YYYY-MM', empty = all
};

// ---------------- DOM refs ----------------
const $ = (sel) => document.querySelector(sel);
const expenseForm   = $('#expense-form');
const categoryForm  = $('#category-form');
const expCategory   = $('#exp-category');
const expDate       = $('#exp-date');
const monthFilter   = $('#month-filter');
const totalAmountEl = $('#total-amount');
const summaryEl     = $('#category-summary');
const tableBody     = $('#expenses-table tbody');
const toastEl       = $('#toast');


// ---------------- API helpers ----------------

async function apiGet(action) {
  const res = await fetch(API_URL + '?action=' + encodeURIComponent(action));
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

async function apiPost(payload) {
  // text/plain avoids the CORS preflight that blocks Apps Script.
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
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
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function monthOf(dateStr) {
  // 'YYYY-MM-DD' -> 'YYYY-MM'
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

  // Sum spent per category
  const spentByCat = {};
  tx.forEach(t => {
    spentByCat[t.category] = (spentByCat[t.category] || 0) + Number(t.amount || 0);
  });

  // Build a unified list: all categories from limits, plus any orphan ones.
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
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

  if (tx.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" class="muted">No expenses yet</td></tr>';
    return;
  }

  // Map category -> emoji for display
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

expenseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    action: 'addTransaction',
    date: expDate.value || todayISO(),
    category: expCategory.value,
    amount: parseFloat($('#exp-amount').value),
    description: $('#exp-description').value
  };

  if (!payload.category) {
    toast('Pick a category first', 'error');
    return;
  }

  try {
    const saved = await apiPost(payload);
    state.transactions.push(saved); // optimistic
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
    action: 'addCategory',
    category: $('#cat-name').value.trim(),
    emoji: $('#cat-emoji').value.trim(),
    monthlyLimit: parseFloat($('#cat-limit').value) || 0
  };

  try {
    await apiPost(payload);
    // Reload limits from server (so we get updates merged correctly)
    state.limits = await apiGet('getLimits');
    renderAll();
    categoryForm.reset();
    toast('Category saved ✅');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
});

monthFilter.addEventListener('change', () => {
  state.filterMonth = monthFilter.value; // '' if cleared
  renderTotal();
  renderSummary();
  renderTable();
});


// ---------------- Init ----------------

(function init() {
  expDate.value = todayISO();
  // Default month filter to current month
  monthFilter.value = todayISO().slice(0, 7);
  state.filterMonth = monthFilter.value;

  if (API_URL.includes('PASTE_YOUR_WEB_APP_URL_HERE')) {
    summaryEl.innerHTML =
      '<p class="muted">⚠️ Open <code>app.js</code> and set <code>API_URL</code> to your deployed Apps Script Web App URL.</p>';
    tableBody.innerHTML =
      '<tr><td colspan="4" class="muted">Set API_URL in app.js to start</td></tr>';
    return;
  }

  loadData();
})();
