/* =========================================================
 *  Expense Tracker – Frontend (multi-page PWA)
 * ========================================================= */

// 🔧 PASTE your Apps Script Web App URL here (after deploying)
const API_URL = 'https://script.google.com/macros/s/AKfycbx09lKH5wNjc_A9QY6p_H932omwZU7XbMSrOnHiT1vtbMa9FJB9UbPnWCUAOISMegJX/exec';

const COLORS = [
  '#4f46e5', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
  '#84cc16', '#14b8a6'
];

const state = {
  transactions: [],
  limits: [],
  filterMonth: '',
  spreadsheetId: localStorage.getItem('spreadsheetId') || ''
};

// ---------------- DOM refs ----------------
const $ = (sel) => document.querySelector(sel);
const expenseForm     = $('#expense-form');
const categoryForm    = $('#category-form');
const expCategory     = $('#exp-category');
const expDate         = $('#exp-date');
const monthFilter     = $('#month-filter');
const summaryEl       = $('#category-summary');
const tableBody       = $('#expenses-table tbody');
const toastEl         = $('#toast');
const connectSection  = $('#connect-section');
const connectedBar    = $('#connected-bar');
const appContent      = $('#app-content');
const connectForm     = $('#connect-form');
const sheetUrlInput   = $('#sheet-url');
const connectStatus   = $('#connect-status');
const connectedIdEl   = $('#connected-id');
const disconnectBtn   = $('#disconnect-btn');
const bottomNav       = $('#bottom-nav');
const monthFilterWrap = $('#month-filter-wrap');
const addModal        = $('#add-modal');


// ---------------- API helpers ----------------

async function apiGet(action) {
  if (!state.spreadsheetId) throw new Error('No sheet connected');
  const url = API_URL
    + '?action=' + encodeURIComponent(action)
    + '&spreadsheetId=' + encodeURIComponent(state.spreadsheetId);
  const res  = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

async function apiPost(payload) {
  // text/plain avoids the CORS preflight that blocks Apps Script
  const body = { ...payload, spreadsheetId: state.spreadsheetId };
  const res  = await fetch(API_URL, {
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
    const res  = await fetch(API_URL, {
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
  bottomNav.style.display = 'none';
  monthFilterWrap.style.display = 'none';
  showConnectionPanel();
}

function showApp() {
  connectSection.style.display = 'none';
  connectedBar.style.display = '';
  appContent.style.display = '';
  bottomNav.style.display = '';
  monthFilterWrap.style.display = '';
  connectedIdEl.textContent = state.spreadsheetId;
  navigateTo('page1');
  loadData();
}

function showConnectionPanel() {
  connectSection.style.display = '';
  connectedBar.style.display = 'none';
  appContent.style.display = 'none';
  connectStatus.textContent = '';
  sheetUrlInput.value = '';
}


// ---------------- Navigation ----------------

function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; });
  $('#' + pageId).style.display = '';
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === pageId);
  });
}

function openAddModal() {
  if (state.limits.length === 0) {
    toast('Create a category first', 'error');
    navigateTo('page3');
    return;
  }
  expDate.value = todayISO();
  renderCategoryOptions();
  addModal.style.display = 'flex';
}

function closeAddModal() {
  addModal.style.display = 'none';
  expenseForm.reset();
  expDate.value = todayISO();
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function catColor(category) {
  const idx = state.limits.findIndex(c => c.category === category);
  return COLORS[idx >= 0 ? idx % COLORS.length : 0];
}


// ---------------- Rendering ----------------

function renderCategoryOptions() {
  const current = expCategory.value;
  expCategory.innerHTML = '';
  if (state.limits.length === 0) {
    expCategory.innerHTML = '<option value="">-- create a category first --</option>';
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

// Page 1 — donut chart with monthly total in centre
function renderDonutChart() {
  const donutEl  = $('#donut-chart');
  const legendEl = $('#donut-legend');
  const tx       = getFilteredTransactions();

  const spentByCat = {};
  tx.forEach(t => {
    spentByCat[t.category] = (spentByCat[t.category] || 0) + Number(t.amount || 0);
  });

  const total = Object.values(spentByCat).reduce((s, v) => s + v, 0);
  const r = 38, circ = 2 * Math.PI * r;

  if (total === 0) {
    donutEl.innerHTML = `
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="14"/>
      <text x="50" y="47" text-anchor="middle" class="donut-val">0.00 €</text>
      <text x="50" y="60" text-anchor="middle" class="donut-lbl">this month</text>`;
    legendEl.innerHTML = '<p class="muted" style="text-align:center;padding:8px 0">No expenses this month</p>';
    return;
  }

  const entries = Object.entries(spentByCat).sort((a, b) => b[1] - a[1]);

  let startAngle = 0;
  const circles = entries.map(([cat, amount]) => {
    const pct    = amount / total;
    const arcLen = pct * circ;
    const color  = catColor(cat);
    // rotate(startAngle - 90) starts the first slice at 12 o'clock
    const seg = `<circle cx="50" cy="50" r="${r}" fill="none"
      stroke="${color}" stroke-width="14"
      stroke-dasharray="${arcLen.toFixed(2)} ${(circ - arcLen).toFixed(2)}"
      transform="rotate(${(startAngle - 90).toFixed(2)} 50 50)" />`;
    startAngle += pct * 360;
    return seg;
  });

  donutEl.innerHTML = circles.join('') + `
    <text x="50" y="47" text-anchor="middle" class="donut-val">${fmtMoney(total)}</text>
    <text x="50" y="60" text-anchor="middle" class="donut-lbl">this month</text>`;

  legendEl.innerHTML = entries.map(([cat, amount]) => {
    const lim   = state.limits.find(c => c.category === cat);
    const emoji = lim ? lim.emoji || '' : '';
    return `<div class="legend-item">
      <span class="legend-dot" style="background:${catColor(cat)}"></span>
      <span class="legend-name">${emoji ? emoji + ' ' : ''}${escapeHtml(cat)}</span>
      <span class="legend-amount">${fmtMoney(amount)}</span>
    </div>`;
  }).join('');
}

// Page 1 — last 5 expenses this month
function renderRecentExpenses() {
  const recentEl = $('#recent-list');
  const emojiMap = {};
  state.limits.forEach(c => { emojiMap[c.category] = c.emoji || ''; });

  const tx = getFilteredTransactions()
    .slice()
    .sort((a, b) => a.date < b.date ? 1 : -1)
    .slice(0, 5);

  if (tx.length === 0) {
    recentEl.innerHTML = '<p class="muted">No expenses this month</p>';
    return;
  }

  recentEl.innerHTML = tx.map(t => `
    <div class="recent-item">
      <div class="recent-left">
        <span class="recent-emoji">${emojiMap[t.category] || '💳'}</span>
        <div class="recent-text">
          <div class="recent-desc">${escapeHtml(t.description || t.category)}</div>
          <div class="recent-meta">${escapeHtml(t.category)} · ${escapeHtml(t.date)}</div>
        </div>
      </div>
      <span class="recent-amount">−${fmtMoney(t.amount)}</span>
    </div>`).join('');
}

// Page 2 — category progress bars
function renderSummary() {
  const tx = getFilteredTransactions();
  const spentByCat = {};
  tx.forEach(t => {
    spentByCat[t.category] = (spentByCat[t.category] || 0) + Number(t.amount || 0);
  });

  const seen  = new Set();
  const items = state.limits.map(c => {
    seen.add(c.category);
    return { category: c.category, emoji: c.emoji || '',
             limit: Number(c.monthlyLimit) || 0, spent: spentByCat[c.category] || 0 };
  });
  Object.keys(spentByCat).forEach(cat => {
    if (!seen.has(cat)) items.push({ category: cat, emoji: '', limit: 0, spent: spentByCat[cat] });
  });

  if (items.length === 0) {
    summaryEl.innerHTML = '<p class="muted">No categories yet</p>';
    return;
  }

  summaryEl.innerHTML = items.map(item => {
    const pct        = item.limit > 0 ? (item.spent / item.limit) * 100 : 0;
    const pctClamped = Math.min(pct, 100);
    const cls        = pct >= 100 ? 'danger' : pct >= 75 ? 'warning' : '';
    const limitText  = item.limit > 0
      ? `${fmtMoney(item.spent)} / ${fmtMoney(item.limit)}`
      : `${fmtMoney(item.spent)} (no limit)`;
    const pctText = item.limit > 0
      ? `${pct.toFixed(0)}%${pct >= 100 ? ' ⚠️ over budget' : ''}` : '';

    return `<div class="summary-item">
      <div class="summary-row">
        <span class="summary-name">${item.emoji ? item.emoji + ' ' : ''}${escapeHtml(item.category)}</span>
        <span>${limitText}</span>
      </div>
      <div class="bar"><div class="bar-fill ${cls}" style="width:${pctClamped}%"></div></div>
      <div class="summary-pct ${pct >= 100 ? 'warning-text' : ''}">${pctText}</div>
    </div>`;
  }).join('');
}

// Page 2 — full expenses table with delete
function renderTable() {
  const tx = getFilteredTransactions().slice().sort((a, b) => a.date < b.date ? 1 : -1);

  if (tx.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" class="muted">No expenses yet</td></tr>';
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
      <td class="td-action">
        <button class="btn-icon btn-icon-danger"
          data-action="delete-tx" data-id="${escapeHtml(t.id || '')}"
          title="Delete">🗑️</button>
      </td>
    </tr>`).join('');
}

// Page 2 — year total card
function renderYearStats() {
  const year   = String(new Date().getFullYear());
  const yearTx = state.transactions.filter(t => (t.date || '').startsWith(year));
  const total  = yearTx.reduce((s, t) => s + Number(t.amount || 0), 0);
  $('#year-total').textContent = fmtMoney(total);

  const spentByCat = {};
  yearTx.forEach(t => {
    spentByCat[t.category] = (spentByCat[t.category] || 0) + Number(t.amount || 0);
  });

  $('#year-breakdown').innerHTML = Object.entries(spentByCat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amount]) => {
      const lim   = state.limits.find(c => c.category === cat);
      const emoji = lim ? lim.emoji || '' : '';
      return `<div class="year-cat">
        <span>${emoji ? emoji + ' ' : ''}${escapeHtml(cat)}</span>
        <span>${fmtMoney(amount)}</span>
      </div>`;
    }).join('') || '<p style="opacity:.75;font-size:13px;margin:4px 0">No expenses this year yet</p>';
}

// Page 3 — categories list with edit / delete
function renderCategoriesList() {
  const listEl = $('#categories-list');
  if (state.limits.length === 0) {
    listEl.innerHTML = '<p class="muted">No categories yet</p>';
    return;
  }
  listEl.innerHTML = state.limits.map((c, i) => {
    const color      = COLORS[i % COLORS.length];
    const limitBadge = c.monthlyLimit > 0
      ? `<span class="cat-limit-badge">${fmtMoney(c.monthlyLimit)}/mo</span>`
      : `<span class="cat-no-limit">no limit</span>`;
    return `<div class="cat-item">
      <div class="cat-info">
        <span class="legend-dot" style="background:${color}"></span>
        <span class="cat-name">${c.emoji ? c.emoji + ' ' : ''}${escapeHtml(c.category)}</span>
        ${limitBadge}
      </div>
      <div class="cat-actions">
        <button class="btn-icon" data-action="edit-cat"
          data-cat="${escapeHtml(c.category)}" title="Edit">✏️</button>
        <button class="btn-icon btn-icon-danger" data-action="delete-cat"
          data-cat="${escapeHtml(c.category)}" title="Delete">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function renderAll() {
  renderCategoryOptions();
  renderDonutChart();
  renderRecentExpenses();
  renderSummary();
  renderTable();
  renderYearStats();
  renderCategoriesList();
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


// ---------------- Delete handlers ----------------

async function confirmDeleteTransaction(id) {
  if (!id) { toast('Cannot delete: missing ID', 'error'); return; }
  if (!confirm('Delete this expense?')) return;
  try {
    await apiPost({ action: 'deleteTransaction', id });
    state.transactions = state.transactions.filter(t => t.id !== id);
    renderDonutChart();
    renderRecentExpenses();
    renderSummary();
    renderTable();
    renderYearStats();
    toast('Expense deleted');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function confirmDeleteCategory(category) {
  if (!confirm(`Delete category "${category}"?\nTransactions in this category are kept.`)) return;
  try {
    await apiPost({ action: 'deleteCategory', category });
    state.limits = await apiGet('getLimits');
    renderAll();
    toast('Category deleted');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function editCategory(category) {
  const cat = state.limits.find(c => c.category === category);
  if (!cat) return;
  $('#cat-name').value  = cat.category;
  $('#cat-emoji').value = cat.emoji || '';
  $('#cat-limit').value = cat.monthlyLimit > 0 ? cat.monthlyLimit : '';
  $('#category-form').scrollIntoView({ behavior: 'smooth' });
}


// ---------------- Event listeners ----------------

// Delegated listener for all dynamic action buttons
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, cat } = btn.dataset;
  if (action === 'delete-tx')  confirmDeleteTransaction(id);
  if (action === 'edit-cat')   editCategory(cat);
  if (action === 'delete-cat') confirmDeleteCategory(cat);
});

// Navigation tabs
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

// Add expense modal
$('#add-btn').addEventListener('click', openAddModal);
$('#modal-close').addEventListener('click', closeAddModal);
$('#modal-backdrop').addEventListener('click', closeAddModal);

// Sheet connection
connectForm.addEventListener('submit', async e => {
  e.preventDefault();
  await connectSheet(sheetUrlInput.value.trim());
});

disconnectBtn.addEventListener('click', () => {
  if (confirm('Disconnect this sheet? Your data in Google Sheets is not affected.')) {
    disconnectSheet();
  }
});

// Add expense (inside modal)
expenseForm.addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    action: 'addTransaction',
    transaction: {
      date:        expDate.value || todayISO(),
      category:    expCategory.value,
      amount:      parseFloat($('#exp-amount').value),
      description: $('#exp-description').value
    }
  };
  if (!payload.transaction.category) { toast('Pick a category first', 'error'); return; }
  try {
    const saved = await apiPost(payload);
    state.transactions.push(saved);
    closeAddModal();
    renderDonutChart();
    renderRecentExpenses();
    renderSummary();
    renderTable();
    renderYearStats();
    toast('Expense added ✅');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
});

// Add / update category
categoryForm.addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    action:       'addOrUpdateLimit',
    category:     $('#cat-name').value.trim(),
    emoji:        $('#cat-emoji').value.trim(),
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

// Month filter
monthFilter.addEventListener('change', () => {
  state.filterMonth = monthFilter.value;
  renderDonutChart();
  renderRecentExpenses();
  renderSummary();
  renderTable();
});


// ---------------- Init ----------------

(function init() {
  if (API_URL.includes('PASTE_YOUR_WEB_APP_URL_HERE')) {
    connectSection.querySelector('h2').textContent = '⚠️ Setup required';
    connectSection.querySelector('.connect-help').innerHTML =
      'Open <code>app.js</code> and replace <code>PASTE_YOUR_WEB_APP_URL_HERE</code> '
      + 'with your deployed Apps Script Web App URL, then reload.';
    connectForm.style.display = 'none';
    return;
  }

  expDate.value     = todayISO();
  monthFilter.value = todayISO().slice(0, 7);
  state.filterMonth = monthFilter.value;

  if (state.spreadsheetId) {
    showApp();
  } else {
    showConnectionPanel();
  }
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(console.error);
}
