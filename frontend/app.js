/* =========================================================
 *  Txerri Txiroa – Expense Tracker PWA
 * ========================================================= */

const API_URL = 'https://script.google.com/macros/s/AKfycbx09lKH5wNjc_A9QY6p_H932omwZU7XbMSrOnHiT1vtbMa9FJB9UbPnWCUAOISMegJX/exec';

const COLORS = [
  '#2563eb', '#ec4899', '#10b981', '#f59e0b',
  '#8b5cf6', '#06b6d4', '#f97316', '#ef4444',
  '#84cc16', '#14b8a6'
];

const state = {
  transactions: [],
  limits: [],
  filterMonth: '',
  filterCategory: '',
  spreadsheetId: localStorage.getItem('spreadsheetId') || ''
};

let doughnutChart = null;
let trendChart    = null;
let chartsDirty   = true;

// ---------- DOM refs ----------
const $ = sel => document.querySelector(sel);

const expenseForm    = $('#expense-form');
const categoryForm   = $('#category-form');
const expCategory    = $('#exp-category');
const expDate        = $('#exp-date');
const monthFilter    = $('#month-filter');
const toastEl        = $('#toast');
const connectSection = $('#connect-section');
const appContent     = $('#app-content');
const connectForm    = $('#connect-form');
const sheetUrlInput  = $('#sheet-url');
const connectStatus  = $('#connect-status');
const connectedIdEl  = $('#connected-id');
const disconnectBtn  = $('#disconnect-btn');
const bottomNav      = $('#bottom-nav');
const addModal       = $('#add-modal');
const fab            = $('#fab');
const connDot        = $('#conn-dot');


// ---------- API helpers ----------

async function apiGet(action) {
  if (!state.spreadsheetId) throw new Error('No sheet connected');
  const url = `${API_URL}?action=${encodeURIComponent(action)}&spreadsheetId=${encodeURIComponent(state.spreadsheetId)}`;
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


// ---------- Loading states ----------

function setSubmitting(btn, loading) {
  btn.disabled = loading;
  if (loading) {
    btn.dataset.origText = btn.textContent;
    btn.textContent = '…';
  } else {
    btn.textContent = btn.dataset.origText || btn.textContent;
  }
}


// ---------- Sheet connection ----------

async function connectSheet(sheetUrl) {
  connectStatus.textContent = 'Connecting…';
  connectStatus.className = 'connect-status';
  const btn = $('#connect-submit-btn');
  setSubmitting(btn, true);
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
  } finally {
    setSubmitting(btn, false);
  }
}

function disconnectSheet() {
  state.spreadsheetId = '';
  localStorage.removeItem('spreadsheetId');
  state.transactions = [];
  state.limits = [];
  bottomNav.style.display = 'none';
  fab.style.display = 'none';
  connDot.className = 'conn-dot conn-dot--off';
  connDot.title = 'No sheet connected';
  showConnectionPanel();
}

function showApp() {
  connectSection.style.display = 'none';
  appContent.style.display = '';
  bottomNav.style.display = '';
  fab.style.display = '';
  connDot.className = 'conn-dot conn-dot--on';
  connDot.title = 'Sheet connected';
  if (connectedIdEl) connectedIdEl.textContent = state.spreadsheetId;
  navigateTo('page1');
  loadData();
}

function showConnectionPanel() {
  connectSection.style.display = '';
  appContent.style.display = 'none';
  connectStatus.textContent = '';
  if (sheetUrlInput) sheetUrlInput.value = '';
}


// ---------- Navigation ----------

function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; });
  $('#' + pageId).style.display = '';
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === pageId);
  });
  if (pageId === 'page2' && chartsDirty) {
    renderCharts();
    chartsDirty = false;
  }
}

function openAddModal() {
  if (state.limits.length === 0) {
    toast('Create a category first', 'error');
    navigateTo('page4');
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


// ---------- Filter panel ----------

function openFilterPanel() {
  const catFilter = $('#cat-filter');
  catFilter.innerHTML = '<option value="">All categories</option>';
  state.limits.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.category;
    opt.textContent = (c.emoji ? c.emoji + ' ' : '') + c.category;
    catFilter.appendChild(opt);
  });
  monthFilter.value = state.filterMonth || todayISO().slice(0, 7);
  if (state.filterCategory) catFilter.value = state.filterCategory;
  $('#filter-panel').style.display = 'flex';
}

function closeFilterPanel() {
  $('#filter-panel').style.display = 'none';
}

function applyFilter() {
  state.filterMonth    = monthFilter.value;
  state.filterCategory = $('#cat-filter').value;
  updateFilterBadge();
  closeFilterPanel();
  renderPage1();
  renderYearStats();
  renderExpensesList();
  chartsDirty = true;
}

function clearFilter() {
  monthFilter.value    = todayISO().slice(0, 7);
  state.filterMonth    = monthFilter.value;
  state.filterCategory = '';
  updateFilterBadge();
  closeFilterPanel();
  renderPage1();
  renderYearStats();
  renderExpensesList();
  chartsDirty = true;
}

function updateFilterBadge() {
  const badge  = $('#filter-badge');
  const active = state.filterMonth || state.filterCategory;
  badge.style.display = active ? '' : 'none';
}


// ---------- UI helpers ----------

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

function getFilteredTransactions() {
  return state.transactions.filter(t => {
    if (state.filterMonth    && monthOf(t.date)  !== state.filterMonth)    return false;
    if (state.filterCategory && t.category !== state.filterCategory) return false;
    return true;
  });
}


// ---------- Rendering ----------

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

// Page 1 — hero total
function renderTotalHero() {
  const tx    = getFilteredTransactions();
  const total = tx.reduce((s, t) => s + Number(t.amount || 0), 0);
  $('#total-hero-amount').textContent = fmtMoney(total);
  const month   = state.filterMonth || todayISO().slice(0, 7);
  const [y, m]  = month.split('-');
  const label   = new Date(Number(y), Number(m) - 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' });
  $('#hero-month').textContent = label;
}

// Page 1 — budget bars
function renderBudgetBars() {
  const listEl     = $('#budget-list');
  const tx         = getFilteredTransactions();
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
    listEl.innerHTML = '<p class="muted">No categories yet</p>';
    return;
  }

  listEl.innerHTML = items.map(item => {
    const pct  = item.limit > 0 ? (item.spent / item.limit) * 100 : 0;
    const pctC = Math.min(pct, 100);
    const cls  = pct >= 100 ? 'danger' : pct >= 75 ? 'warning' : '';
    const vals = item.limit > 0
      ? `${fmtMoney(item.spent)} / ${fmtMoney(item.limit)}`
      : fmtMoney(item.spent);
    const pctText = item.limit > 0 ? `${pct.toFixed(0)}%${pct >= 100 ? ' ⚠️' : ''}` : '';
    return `<div class="budget-item">
      <div class="budget-row">
        <span class="budget-name">${item.emoji ? item.emoji + ' ' : ''}${escapeHtml(item.category)}</span>
        <span class="budget-vals">${vals}</span>
      </div>
      <div class="bar"><div class="bar-fill ${cls}" style="width:${pctC}%"></div></div>
      ${pctText ? `<div class="budget-pct ${pct >= 100 ? 'over' : ''}">${pctText}</div>` : ''}
    </div>`;
  }).join('');
}


function renderPage1() {
  renderTotalHero();
  renderBudgetBars();
}

// Page 2 — Chart.js charts
function getLastSixMonths() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    });
  }
  return months;
}

function renderCharts() {
  renderDoughnutChart();
  renderTrendChart();
}

function renderDoughnutChart() {
  const ctx        = $('#doughnut-canvas').getContext('2d');
  const tx         = getFilteredTransactions();
  const spentByCat = {};
  tx.forEach(t => {
    spentByCat[t.category] = (spentByCat[t.category] || 0) + Number(t.amount || 0);
  });

  const labels = Object.keys(spentByCat);
  const data   = Object.values(spentByCat);
  const colors = labels.map(cat => catColor(cat));

  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } },
        tooltip: { callbacks: { label: c => ` ${fmtMoney(c.parsed)}` } }
      },
      cutout: '65%'
    }
  });
}

function renderTrendChart() {
  const ctx    = $('#trend-canvas').getContext('2d');
  const months = getLastSixMonths();
  const totals = months.map(({ key }) =>
    state.transactions
      .filter(t => monthOf(t.date) === key)
      .reduce((s, t) => s + Number(t.amount || 0), 0)
  );

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [{
        label: 'Total (€)',
        data: totals,
        backgroundColor: months.map((_, i) => i === months.length - 1 ? '#2563eb' : '#93c5fd'),
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${fmtMoney(c.parsed.y)}` } }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { callback: v => v + ' €' }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

// Page 3 — year total
function renderYearStats() {
  const year   = String(new Date().getFullYear());
  const yearTx = state.transactions.filter(t => (t.date || '').startsWith(year));
  const total  = yearTx.reduce((s, t) => s + Number(t.amount || 0), 0);
  $('#year-total-amount').textContent = fmtMoney(total);

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

// Page 3 — expenses list
function renderExpensesList() {
  const listEl   = $('#expenses-list');
  const emojiMap = {};
  state.limits.forEach(c => { emojiMap[c.category] = c.emoji || ''; });

  const tx = getFilteredTransactions().slice().sort((a, b) => a.date < b.date ? 1 : -1);

  if (tx.length === 0) {
    listEl.innerHTML = '<p class="muted">No expenses yet</p>';
    return;
  }

  listEl.innerHTML = tx.map(t => `
    <div class="recent-item">
      <div class="recent-left">
        <div class="recent-emoji">${emojiMap[t.category] || '💳'}</div>
        <div>
          <div class="recent-desc">${escapeHtml(t.description || t.category)}</div>
          <div class="recent-meta">${escapeHtml(t.category)} · ${escapeHtml(t.date)}</div>
        </div>
      </div>
      <div class="recent-right">
        <span class="recent-amount">−${fmtMoney(t.amount)}</span>
        <button class="btn-icon btn-icon-danger"
          data-action="delete-tx"
          data-id="${escapeHtml(t.id)}"
          title="Delete">🗑️</button>
      </div>
    </div>`).join('');
}

// Page 4 — categories list
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
        <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
        <span class="cat-name">${c.emoji ? c.emoji + ' ' : ''}${escapeHtml(c.category)}</span>
        ${limitBadge}
      </div>
      <div class="cat-actions">
        <button class="btn-icon" data-action="edit-cat" data-cat="${escapeHtml(c.category)}" title="Edit">✏️</button>
        <button class="btn-icon btn-icon-danger"
          data-action="delete-cat"
          data-cat="${escapeHtml(c.category)}"
          title="Delete">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function renderAll() {
  renderCategoryOptions();
  renderPage1();
  renderYearStats();
  renderExpensesList();
  renderCategoriesList();
  chartsDirty = true;
}


// ---------- Data loading ----------

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


// ---------- Delete handlers ----------

async function deleteTransaction(id) {
  if (!id) { toast('Cannot delete: missing ID', 'error'); return; }
  try {
    await apiPost({ action: 'deleteTransaction', id });
    await loadData();
    toast('Expense deleted ✅');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function confirmDeleteCategory(category) {
  try {
    await apiPost({ action: 'deleteCategory', category });
    await loadData();
    toast('Category deleted ✅');
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


// ---------- Event listeners ----------

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, cat } = btn.dataset;
  if (action === 'delete-tx')  deleteTransaction(id);
  if (action === 'edit-cat')   editCategory(cat);
  if (action === 'delete-cat') confirmDeleteCategory(cat);
});

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

fab.addEventListener('click', openAddModal);
$('#modal-close').addEventListener('click', closeAddModal);
$('#modal-backdrop').addEventListener('click', closeAddModal);

$('#filter-btn').addEventListener('click', openFilterPanel);
$('#filter-close').addEventListener('click', closeFilterPanel);
$('#filter-backdrop').addEventListener('click', closeFilterPanel);
$('#filter-apply').addEventListener('click', applyFilter);
$('#filter-clear').addEventListener('click', clearFilter);

connectForm.addEventListener('submit', async e => {
  e.preventDefault();
  await connectSheet(sheetUrlInput.value.trim());
});

disconnectBtn.addEventListener('click', () => {
  if (confirm('Disconnect this sheet? Your data in Google Sheets is not affected.')) {
    disconnectSheet();
  }
});

expenseForm.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#exp-submit-btn');
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
  setSubmitting(btn, true);
  try {
    const saved = await apiPost(payload);
    state.transactions.push(saved);
    closeAddModal();
    renderPage1();
    renderYearStats();
    renderExpensesList();
    chartsDirty = true;
    toast('Expense added ✅');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    setSubmitting(btn, false);
  }
});

categoryForm.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#cat-submit-btn');
  const payload = {
    action:       'addOrUpdateLimit',
    category:     $('#cat-name').value.trim(),
    emoji:        $('#cat-emoji').value.trim(),
    monthlyLimit: parseFloat($('#cat-limit').value) || 0
  };
  setSubmitting(btn, true);
  try {
    await apiPost(payload);
    state.limits = await apiGet('getLimits');
    renderAll();
    categoryForm.reset();
    toast('Category saved ✅');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    setSubmitting(btn, false);
  }
});


// ---------- Init ----------

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
  updateFilterBadge();

  if (state.spreadsheetId) {
    showApp();
  } else {
    showConnectionPanel();
  }
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => console.log('Service Worker registrado', reg))
      .catch(err => console.error('Error al registrar SW', err));
  });
}