// ════════════════════════════════════════════
//  Expense & Budget Visualizer — app.js
// ════════════════════════════════════════════

// ── Palette for auto-assigning custom category colors ──
const AUTO_COLORS = [
  '#a855f7','#14b8a6','#f97316','#06b6d4',
  '#84cc16','#e879f9','#fb7185','#34d399',
];

// ── Built-in categories ──
const BUILTIN_CATEGORIES = {
  Food:      { label: 'Makanan',   icon: '🍔', color: '#f59e0b', builtin: true },
  Transport: { label: 'Transport', icon: '🚌', color: '#3b82f6', builtin: true },
  Fun:       { label: 'Hiburan',   icon: '🎉', color: '#ec4899', builtin: true },
};

// ── State ──
let transactions    = JSON.parse(localStorage.getItem('ebv_transactions')    || '[]');
let customCategories= JSON.parse(localStorage.getItem('ebv_custom_cats')     || '[]');
let spendingLimit   = parseFloat(localStorage.getItem('ebv_limit') || '0');
let darkMode        = localStorage.getItem('ebv_theme') !== 'light';
let selectedCategory= '';
let chartInstance   = null;
let activeTab       = 'transactions';

// ── Merged category config (built-in + custom) ──
function getCategoryConfig() {
  const cfg = { ...BUILTIN_CATEGORIES };
  customCategories.forEach(c => {
    cfg[c.key] = { label: c.label, icon: c.icon, color: c.color, builtin: false };
  });
  return cfg;
}

// ── Helpers ──
function formatRp(n) {
  if (n >= 1_000_000) return 'Rp' + (n / 1_000_000).toFixed(1) + 'jt';
  if (n >= 1_000)     return 'Rp' + (n / 1_000).toFixed(0) + 'rb';
  return 'Rp' + n.toLocaleString('id-ID');
}
function formatRpFull(n) {
  return 'Rp' + n.toLocaleString('id-ID');
}
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function saveAll() {
  localStorage.setItem('ebv_transactions', JSON.stringify(transactions));
  localStorage.setItem('ebv_custom_cats',  JSON.stringify(customCategories));
  if (spendingLimit > 0) localStorage.setItem('ebv_limit', spendingLimit);
  else localStorage.removeItem('ebv_limit');
}

// ── Theme ──
function applyTheme() {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  document.getElementById('themeToggle').textContent = darkMode ? '🌙' : '☀️';
  localStorage.setItem('ebv_theme', darkMode ? 'dark' : 'light');
  // Rebuild chart so border color updates
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  renderChart();
}
function toggleTheme() {
  darkMode = !darkMode;
  applyTheme();
}

// ── Tab switching ──
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
  document.getElementById('tab-' + tab).style.display = 'block';
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  if (tab === 'summary') renderSummary();
  if (tab === 'chart')   renderChart();
}

// ── Section toggle (collapsible) ──
function toggleSection(id) {
  const el = document.getElementById(id);
  const btn = el.previousElementSibling
    ? el.closest('.card').querySelector('.btn-toggle-section')
    : null;
  const open = el.style.display === 'none';
  el.style.display = open ? 'block' : 'none';
  if (btn) btn.textContent = open ? '－' : '＋';
}

// ── Category buttons (dynamic) ──
function renderCategoryButtons() {
  const cfg = getCategoryConfig();
  const row = document.getElementById('categoryRow');
  row.innerHTML = '';
  Object.entries(cfg).forEach(([key, c]) => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn' + (selectedCategory === key ? ' active' : '');
    btn.dataset.cat = key;
    btn.style.setProperty('--cat-color', c.color);
    if (selectedCategory === key) {
      btn.style.borderColor = c.color;
      btn.style.background  = hexToRgba(c.color, .15);
      btn.style.color       = c.color;
    }
    btn.innerHTML = `<span class="cat-icon">${c.icon}</span>${escapeHtml(c.label)}`;
    btn.onclick = () => selectCategory(key);
    row.appendChild(btn);
  });
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function selectCategory(cat) {
  selectedCategory = cat;
  document.getElementById('itemCategory').value = cat;
  renderCategoryButtons();
}

// ── Custom Categories ──
function renderCustomCatList() {
  const list = document.getElementById('customCatList');
  if (customCategories.length === 0) {
    list.innerHTML = '<p style="font-size:.8rem;color:var(--muted);margin-top:8px;">Belum ada kategori kustom.</p>';
    return;
  }
  list.innerHTML = '';
  customCategories.forEach(c => {
    const row = document.createElement('div');
    row.className = 'custom-cat-item';
    row.innerHTML = `
      <div class="custom-cat-swatch" style="background:${c.color}"></div>
      <span class="cat-icon">${c.icon}</span>
      <span class="custom-cat-name">${escapeHtml(c.label)}</span>
      <button class="btn-del-cat" onclick="deleteCustomCategory('${c.key}')">🗑</button>
    `;
    list.appendChild(row);
  });
}

function addCustomCategory() {
  const nameEl  = document.getElementById('newCatName');
  const iconEl  = document.getElementById('newCatIcon');
  const colorEl = document.getElementById('newCatColor');
  const name  = nameEl.value.trim();
  const icon  = iconEl.value.trim() || '📌';
  const color = colorEl.value;

  if (!name) { alert('Masukkan nama kategori.'); return; }

  const key = 'custom_' + Date.now();
  customCategories.push({ key, label: name, icon, color });
  saveAll();

  nameEl.value  = '';
  iconEl.value  = '';
  colorEl.value = AUTO_COLORS[customCategories.length % AUTO_COLORS.length];

  renderCustomCatList();
  renderCategoryButtons();
  renderStats();
}

function deleteCustomCategory(key) {
  // Remove from transactions too? Keep them but show key as fallback label.
  customCategories = customCategories.filter(c => c.key !== key);
  if (selectedCategory === key) selectedCategory = '';
  saveAll();
  renderCustomCatList();
  renderCategoryButtons();
  render();
}

// ── Spending Limit ──
function saveLimit() {
  const val = parseFloat(document.getElementById('spendingLimit').value);
  if (!val || val <= 0) { alert('Masukkan batas yang valid.'); return; }
  spendingLimit = val;
  saveAll();
  updateLimitUI();
  document.getElementById('spendingLimit').value = '';
}
function clearLimit() {
  spendingLimit = 0;
  saveAll();
  updateLimitUI();
}
function updateLimitUI() {
  const hint = document.getElementById('limitHint');
  if (spendingLimit > 0) {
    hint.textContent = `Batas aktif: ${formatRpFull(spendingLimit)}`;
  } else {
    hint.textContent = 'Tidak ada batas aktif.';
  }
  renderBalance(); // re-render bar
}

// ── Add Transaction ──
function addTransaction() {
  const name   = document.getElementById('itemName').value.trim();
  const amount = parseFloat(document.getElementById('itemAmount').value);
  const cat    = selectedCategory;

  if (!name && !amount && !cat) { showError('Semua field harus diisi!'); return; }
  if (!name)                    { showError('Nama item tidak boleh kosong.'); return; }
  if (!amount || isNaN(amount) || amount <= 0) { showError('Masukkan jumlah yang valid (lebih dari 0).'); return; }
  if (!cat)                     { showError('Pilih kategori terlebih dahulu.'); return; }

  document.getElementById('errorMsg').classList.remove('show');

  const now = new Date();
  const tx = {
    id: Date.now(),
    name,
    amount,
    category: cat,
    date: now.toISOString(),
  };
  transactions.unshift(tx);
  saveAll();

  document.getElementById('itemName').value  = '';
  document.getElementById('itemAmount').value = '';
  selectedCategory = '';
  document.getElementById('itemCategory').value = '';
  renderCategoryButtons();

  render();
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.add('show');
}

// ── Delete Transaction ──
function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveAll();
  render();
}

// ── Sort ──
function getSortedTransactions() {
  const sort = document.getElementById('sortSelect').value;
  const arr  = [...transactions];
  switch (sort) {
    case 'date-asc':    return arr.sort((a,b) => a.id - b.id);
    case 'amount-desc': return arr.sort((a,b) => b.amount - a.amount);
    case 'amount-asc':  return arr.sort((a,b) => a.amount - b.amount);
    case 'category':    return arr.sort((a,b) => a.category.localeCompare(b.category));
    default:            return arr; // date-desc (already newest first)
  }
}

// ── Render ──
function render() {
  renderBalance();
  renderStats();
  renderList();
  if (activeTab === 'chart')   renderChart();
  if (activeTab === 'summary') renderSummary();
}

function renderBalance() {
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  document.getElementById('totalAmount').innerHTML =
    '<span>Rp</span>' + total.toLocaleString('id-ID');
  document.getElementById('txCount').textContent =
    transactions.length + ' transaksi';
  document.getElementById('chartCenterVal').textContent = formatRp(total);

  // Limit bar
  const wrap = document.getElementById('limitBarWrap');
  const fill = document.getElementById('limitBarFill');
  const lbl  = document.getElementById('limitBarLabel');
  const card = document.querySelector('.balance-card');

  if (spendingLimit > 0) {
    wrap.style.display = 'block';
    const pct = Math.min((total / spendingLimit) * 100, 100);
    fill.style.width = pct + '%';
    fill.className   = 'limit-bar-fill' + (pct >= 100 ? ' over' : pct >= 75 ? ' warn' : '');
    lbl.textContent  = `${formatRp(total)} / ${formatRp(spendingLimit)} (${pct.toFixed(0)}%)`;
    card.classList.toggle('over-limit', total > spendingLimit);
  } else {
    wrap.style.display = 'none';
    card.classList.remove('over-limit');
  }
}

function renderStats() {
  const cfg    = getCategoryConfig();
  const totals = {};
  Object.keys(cfg).forEach(k => { totals[k] = 0; });
  transactions.forEach(t => {
    if (totals[t.category] !== undefined) totals[t.category] += t.amount;
    else totals[t.category] = t.amount; // orphan category
  });

  const row = document.getElementById('statsRow');
  row.innerHTML = '';
  Object.entries(cfg).forEach(([key, c]) => {
    const box = document.createElement('div');
    box.className = 'stat-box';
    box.innerHTML = `
      <div class="stat-val" style="color:${c.color}">${formatRp(totals[key] || 0)}</div>
      <div class="stat-lbl">${c.icon} ${escapeHtml(c.label)}</div>
    `;
    row.appendChild(box);
  });
}

function renderList() {
  const list  = document.getElementById('txList');
  const empty = document.getElementById('emptyState');
  const cfg   = getCategoryConfig();
  const total = transactions.reduce((s, t) => s + t.amount, 0);

  if (transactions.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  Array.from(list.querySelectorAll('.tx-item')).forEach(el => el.remove());

  const sorted = getSortedTransactions();
  sorted.forEach(tx => {
    const c    = cfg[tx.category] || { label: tx.category, icon: '📌', color: '#94a3b8' };
    const isOver = spendingLimit > 0 && total > spendingLimit;
    const item = document.createElement('div');
    item.className = 'tx-item' + (isOver ? ' over-limit-item' : '');
    item.innerHTML = `
      <div class="tx-dot" style="background:${c.color}"></div>
      <div class="tx-info">
        <div class="tx-name">${escapeHtml(tx.name)}</div>
        <div class="tx-cat">${c.icon} ${escapeHtml(c.label)}</div>
      </div>
      ${isOver ? '<span class="tx-warn" title="Melebihi batas">⚠️</span>' : ''}
      <div class="tx-amount" style="color:${c.color}">${formatRpFull(tx.amount)}</div>
      <button class="btn-del" onclick="deleteTransaction(${tx.id})" title="Hapus">🗑</button>
    `;
    list.appendChild(item);
  });
}

// ── Monthly Summary ──
function populateMonthSelect() {
  const select = document.getElementById('monthSelect');
  const months = new Set();
  transactions.forEach(t => {
    const d = new Date(t.date || t.id);
    months.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  });
  const sorted = [...months].sort().reverse();
  const current = select.value;
  select.innerHTML = '';
  if (sorted.length === 0) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = 'Tidak ada data';
    select.appendChild(opt);
    return;
  }
  sorted.forEach(m => {
    const [y, mo] = m.split('-');
    const label = new Date(y, mo - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = label;
    select.appendChild(opt);
  });
  if (current && sorted.includes(current)) select.value = current;
}

function renderSummary() {
  populateMonthSelect();
  const sel     = document.getElementById('monthSelect').value;
  const content = document.getElementById('summaryContent');
  const cfg     = getCategoryConfig();

  if (!sel) {
    content.innerHTML = '<div class="no-summary">Belum ada data transaksi.</div>';
    return;
  }

  const [y, mo] = sel.split('-').map(Number);
  const filtered = transactions.filter(t => {
    const d = new Date(t.date || t.id);
    return d.getFullYear() === y && d.getMonth() + 1 === mo;
  });

  if (filtered.length === 0) {
    content.innerHTML = '<div class="no-summary">Tidak ada transaksi bulan ini.</div>';
    return;
  }

  const total  = filtered.reduce((s, t) => s + t.amount, 0);
  const totals = {};
  filtered.forEach(t => { totals[t.category] = (totals[t.category] || 0) + t.amount; });

  let html = `
    <div class="summary-month-total">
      <span class="s-label">Total bulan ini</span>
      <span class="s-val">${formatRpFull(total)}</span>
    </div>
  `;

  // Sort categories by amount desc
  const catEntries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  catEntries.forEach(([key, val]) => {
    const c   = cfg[key] || { label: key, icon: '📌', color: '#94a3b8' };
    const pct = ((val / total) * 100).toFixed(1);
    html += `
      <div class="summary-cat-row">
        <div class="summary-cat-dot" style="background:${c.color}"></div>
        <div class="summary-cat-name">${c.icon} ${escapeHtml(c.label)}</div>
        <div class="summary-cat-bar-wrap">
          <div class="summary-cat-bar-track">
            <div class="summary-cat-bar-fill" style="width:${pct}%;background:${c.color}"></div>
          </div>
        </div>
        <div class="summary-cat-pct">${pct}%</div>
        <div class="summary-cat-amt" style="color:${c.color}">${formatRpFull(val)}</div>
      </div>
    `;
  });

  html += `<div class="summary-tx-count">${filtered.length} transaksi bulan ini</div>`;
  content.innerHTML = html;
}

// ── Chart ──
function renderChart() {
  const cfg    = getCategoryConfig();
  const totals = {};
  Object.keys(cfg).forEach(k => { totals[k] = 0; });
  transactions.forEach(t => {
    if (totals[t.category] !== undefined) totals[t.category] += t.amount;
  });
  const total = Object.values(totals).reduce((a, b) => a + b, 0);

  const noChart   = document.getElementById('noChart');
  const chartArea = document.getElementById('chartArea');

  if (total === 0) {
    noChart.style.display   = 'block';
    chartArea.style.display = 'none';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  noChart.style.display   = 'none';
  chartArea.style.display = 'block';

  // Only include categories with spending
  const activeCats = Object.keys(cfg).filter(k => totals[k] > 0);
  const data       = activeCats.map(k => totals[k]);
  const colors     = activeCats.map(k => cfg[k].color);
  const labels     = activeCats.map(k => cfg[k].label);
  const borderCol  = darkMode ? '#1e293b' : '#ffffff';

  if (chartInstance) {
    chartInstance.data.labels                    = labels;
    chartInstance.data.datasets[0].data          = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.data.datasets[0].borderColor   = borderCol;
    chartInstance.update('active');
  } else {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: borderCol,
          borderWidth: 3,
          hoverOffset: 8,
        }]
      },
      options: {
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const val = ctx.parsed;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return ` ${formatRpFull(val)} (${pct}%)`;
              }
            }
          }
        },
        animation: { animateRotate: true, duration: 500 }
      }
    });
  }

  // Legend
  const legend = document.getElementById('chartLegend');
  legend.innerHTML = '';
  activeCats.forEach(key => {
    const c   = cfg[key];
    const val = totals[key];
    const pct = ((val / total) * 100).toFixed(1);
    const row = document.createElement('div');
    row.className = 'legend-item';
    row.innerHTML = `
      <div class="legend-dot" style="background:${c.color}"></div>
      <div class="legend-name">${c.icon} ${escapeHtml(c.label)}</div>
      <div class="legend-pct" style="color:${c.color}">${pct}%</div>
      <div class="legend-amt">${formatRpFull(val)}</div>
    `;
    legend.appendChild(row);
  });
}

// ── Enter key support ──
document.getElementById('itemName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('itemAmount').focus();
});
document.getElementById('itemAmount').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTransaction();
});

// ── Init ──
applyTheme();
renderCategoryButtons();
renderCustomCatList();
updateLimitUI();
render();
