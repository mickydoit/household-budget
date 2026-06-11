// HTML string renderers — pure functions, no DOM mutations.

import { formatMonth, formatDate, prevMonth, nextMonth, fromMonthly, PERIOD_LABELS } from './compute.js?v=13';

const cfg = (typeof window !== 'undefined' && window.BUDGET_CONFIG) || {};
const CUR = cfg.CURRENCY_SYMBOL || 'R';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = (n) => `${CUR}${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtAbs = (n) => fmt(Math.abs(Number(n)));

function monthNav(month) {
  return `
  <div class="month-nav">
    <button class="month-btn" data-action="prev-month" aria-label="Previous month">&#8249;</button>
    <span class="month-label">${esc(formatMonth(month))}</span>
    <button class="month-btn" data-action="next-month" aria-label="Next month">&#8250;</button>
  </div>`;
}

function periodToggle(current) {
  const opts = [
    { key: 'weekly',      label: 'W'  },
    { key: 'fortnightly', label: '2W' },
    { key: 'monthly',     label: 'M'  },
    { key: 'annual',      label: 'Y'  },
  ];
  return `<div class="period-toggle" role="group" aria-label="Budget period">
    ${opts.map(o => `<button type="button" class="period-btn${current === o.key ? ' active' : ''}" data-action="set-period" data-period="${o.key}" title="${esc(PERIOD_LABELS[o.key])}">${o.label}</button>`).join('')}
  </div>`;
}

function progressBar(pct, color, overBudget = false) {
  const fill = Math.min(100, Math.round(pct * 100));
  const barColor = overBudget ? 'var(--red)' : (color || 'var(--h1-color)');
  return `<div class="prog-track"><div class="prog-bar" style="width:${fill}%;background:${esc(barColor)}"></div></div>`;
}

let _ringCounter = 0;
// sublabel shows below ring-label; when provided, line2 is omitted from inside the ring
function ringChart({ pct, c1, c2, line1, sublabel = null, label }) {
  const uid = ++_ringCounter;
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, pct)));
  const gid = `rg${uid}`;
  return `
  <div class="ring-wrap">
    <svg viewBox="0 0 100 100" class="ring-svg">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${esc(c1)}" />
          <stop offset="100%" stop-color="${esc(c2)}" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="${r}" fill="none" stroke-width="7" stroke="rgba(128,128,128,0.10)" />
      <circle cx="50" cy="50" r="${r}" fill="none" stroke-width="7"
        stroke="url(#${gid})" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
        stroke-linecap="round" transform="rotate(-90 50 50)" />
      <text x="50" y="54" text-anchor="middle" class="ring-line1">${esc(line1)}</text>
    </svg>
    <span class="ring-label">${esc(label)}</span>
    ${sublabel !== null ? `<span class="ring-sublabel">${esc(sublabel)}</span>` : ''}
  </div>`;
}

const FREQ_SHORT = { weekly: 'wk', fortnightly: '2wk', monthly: 'mo', annual: 'yr' };
const PERIOD_SHORT = { weekly: 'wk', fortnightly: '2wk', monthly: 'mo', annual: 'yr' };

// ── Dashboard ─────────────────────────────────────────────────
export function renderDashboard({ income, expenses, balance, spendBreakdown, budgetRows, recent, month, accounts, incomeSources, totalMonthlyExpected, goals, period, expenseRows = [] }) {
  _ringCounter = 0;

  const maxSpend = spendBreakdown.length ? spendBreakdown[0].amount : 1;
  const periodShort = PERIOD_SHORT[period] || 'mo';

  // ── Income sources ──
  const incomeSourcesHtml = incomeSources.length
    ? incomeSources.map(s => {
        const displayAmt = fromMonthly(s.monthlyAmount, period);
        return `
        <div class="income-row">
          <span class="income-dot" style="background:${esc(s.color)}"></span>
          <span class="income-name">${esc(s.name)}</span>
          <span class="income-person">${esc(s.person)}</span>
          <span class="income-amount">${fmt(displayAmt)}<span class="income-freq">/${periodShort}</span></span>
        </div>`;
      }).join('')
    : `<p class="hint" style="padding:.75rem 1.1rem">No income sources. Add one in <a href="#/settings">Settings</a>.</p>`;

  const totalExpectedDisplay = fromMonthly(totalMonthlyExpected, period);

  // ── Account rings ──
  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const accountRings = accounts.length
    ? accounts.map(a => ringChart({
        pct: a.pct,
        c1: a.color1, c2: a.color2,
        line1: fmt(a.balance),
        sublabel: a.target ? `of ${fmt(a.target)}` : null,
        label: a.name,
      })).join('')
    : `<p class="hint">No accounts yet. Add one in <a href="#/settings">Settings</a>.</p>`;

  // ── Budget mini-rings ──
  const budgetRingHtml = budgetRows.length
    ? budgetRows.slice(0, 6).map(row => {
        const pct = Number(row.limit_amount) > 0 ? row.spent / Number(row.limit_amount) : 0;
        const over = pct > 1;
        return ringChart({
          pct: over ? 1 : pct,
          c1: over ? '#e8351a' : row.category.color,
          c2: over ? '#ff6b35' : '#A855F7',
          line1: `${Math.round(Math.min(pct, 9.99) * 100)}%`,
          sublabel: fmt(row.spent),
          label: row.category.name,
        });
      }).join('')
    : '';

  // ── Month totals rings ──
  const totalBudget = budgetRows.reduce((s, r) => s + Number(r.limit_amount), 0);
  const budgetPct = totalBudget > 0 ? Math.min(1, expenses / totalBudget) : (expenses > 0 ? 0.5 : 0);
  const summaryRingHtml = ringChart({
    pct: budgetPct,
    c1: income > expenses ? '#22c55e' : '#e8351a',
    c2: '#A855F7',
    line1: fmt(balance),
    sublabel: balance >= 0 ? 'remaining' : 'over budget',
    label: 'Balance',
  }) + ringChart({
    pct: income > 0 ? 1 : 0,
    c1: '#22c55e', c2: '#8bffec',
    line1: fmt(income),
    sublabel: 'this month',
    label: 'Income',
  }) + ringChart({
    pct: totalBudget > 0 ? Math.min(1, expenses / totalBudget) : (expenses > 0 ? 0.5 : 0),
    c1: '#f4ff7b', c2: '#ff6b35',
    line1: fmt(expenses),
    sublabel: totalBudget > 0 ? `of ${fmt(totalBudget)}` : 'spent',
    label: 'Expenses',
  });

  const breakdownHtml = spendBreakdown.length
    ? spendBreakdown.map(({ category, amount }) => `
      <div class="spend-row">
        <span class="spend-icon">${esc(category.icon)}</span>
        <div class="spend-mid">
          <span class="spend-name">${esc(category.name)}</span>
          ${progressBar(amount / maxSpend, category.color)}
        </div>
        <span class="spend-amt">${fmt(amount)}</span>
      </div>`).join('')
    : `<p class="hint">No expenses recorded yet.</p>`;

  const recentHtml = recent.length
    ? recent.map(t => `
      <div class="tx-row">
        <span class="tx-icon">${esc(t.category ? t.category.icon : '?')}</span>
        <div class="tx-mid">
          <span class="tx-desc">${esc(t.description || t.category?.name || '—')}</span>
          <span class="tx-cat">${esc(t.category?.name || 'Uncategorised')} · ${esc(formatDate(t.date))}</span>
        </div>
        <span class="tx-amt ${t.type === 'income' ? 'income' : 'expense'}">${t.type === 'income' ? '+' : '−'}${fmtAbs(t.amount)}</span>
      </div>`).join('')
    : `<p class="hint">No transactions this month.</p>`;

  // ── Budget group bars for dashboard ──
  const incomeMonthlyDash = income > 0 ? income : totalMonthlyExpected;
  const catRowMapDash = {};
  for (const r of expenseRows) catRowMapDash[r.category.name.toLowerCase()] = r;

  const dashGroupsHtml = CATEGORY_GROUPS.map(grp => {
    const grpRows = grp.cats.map(n => catRowMapDash[n.toLowerCase()]).filter(Boolean);
    const grpPlannedMo = grpRows.reduce((s, r) => s + (r.target ? Number(r.target.limit_amount) : 0), 0);
    const grpSpentMo   = grpRows.reduce((s, r) => s + r.spent, 0);
    const pctOfIncome  = incomeMonthlyDash > 0 ? Math.min(100, grpSpentMo / incomeMonthlyDash * 100) : 0;
    const pctOfBudget  = grpPlannedMo > 0 ? Math.min(100, grpSpentMo / grpPlannedMo * 100) : 0;
    const barPct       = incomeMonthlyDash > 0 ? pctOfIncome : pctOfBudget;
    const over         = grpPlannedMo > 0 && grpSpentMo > grpPlannedMo;
    const grpSpentDisp = fromMonthly(grpSpentMo, period);
    const grpPlanDisp  = fromMonthly(grpPlannedMo, period);
    return `
    <div class="dbgroup">
      <div class="dbgroup-row">
        <span class="dbgroup-name" style="color:${esc(grp.color)}">${grp.icon} ${grp.name}</span>
        <div class="dbgroup-right">
          ${grpSpentMo > 0 ? `<span class="dbgroup-spent">${fmt(grpSpentDisp)}</span>` : ''}
          ${grpPlannedMo > 0 ? `<span class="dbgroup-plan">/ ${fmt(grpPlanDisp)}</span>` : ''}
          <span class="dbgroup-pct${pctOfIncome >= 25 ? ' high' : ''}">${pctOfIncome > 0 ? pctOfIncome.toFixed(1) + '%' : grpPlannedMo > 0 ? '0%' : '—'}</span>
        </div>
      </div>
      <div class="dbgroup-bar-track">
        <div class="dbgroup-bar-fill${over ? ' over' : ''}" style="width:${barPct.toFixed(1)}%;background:${esc(grp.color)}"></div>
      </div>
    </div>`;
  }).join('');

  // ── Savings goal rings for dashboard ──
  const goalRingsHtml = goals.length
    ? goals.map(g => ringChart({
        pct: g.progress,
        c1: g.color,
        c2: '#A855F7',
        line1: `${Math.round(g.progress * 100)}%`,
        sublabel: g.progress >= 1
          ? '✓ done'
          : Number(g.target_amount) > 0
            ? `${fmt(g.current_amount)} / ${fmt(g.target_amount)}`
            : 'no target',
        label: g.name,
      })).join('')
    : '';

  return `
  <h1>Dashboard</h1>
  ${monthNav(month)}

  <section class="section">
    <div class="section-header-row">
      <h2 style="margin:0">Income sources</h2>
      ${periodToggle(period)}
    </div>
    <div class="card income-list">${incomeSourcesHtml}</div>
    <div class="acct-total">Expected ${esc(PERIOD_LABELS[period] || 'monthly').toLowerCase()} total <strong>${fmt(totalExpectedDisplay)}</strong></div>
  </section>

  ${goals.length ? `
  <section class="section">
    <h2>Savings goals</h2>
    <div class="rings-row rings-row-lg card">${goalRingsHtml}</div>
    <div class="section-footer"><a href="#/goals" class="view-link">Manage goals →</a></div>
  </section>` : ''}

  <section class="section">
    <h2>Monthly summary</h2>
    <div class="rings-row rings-row-lg card">${summaryRingHtml}</div>
  </section>

  <section class="section">
    <h2>Bank accounts</h2>
    ${accounts.length
      ? `<div class="rings-row card">
          ${accountRings}
          <div class="ring-wrap ring-add">
            <a href="#/settings" class="ring-add-btn" title="Manage accounts">
              <svg viewBox="0 0 100 100" class="ring-svg">
                <circle cx="50" cy="50" r="38" fill="none" stroke-width="2" stroke="rgba(128,128,128,0.2)" stroke-dasharray="4 4" />
                <text x="50" y="54" text-anchor="middle" class="ring-add-icon">+</text>
              </svg>
              <span class="ring-label">Manage</span>
            </a>
          </div>
        </div>
        <div class="acct-total">Total balance <strong>${fmt(totalBalance)}</strong></div>`
      : `<div class="card"><p class="hint">No accounts yet. <a href="#/settings">Add one in Settings →</a></p></div>`}
  </section>

  <section class="section">
    <h2>Budget breakdown</h2>
    <div class="card dbgroups">${dashGroupsHtml}</div>
    <div class="section-footer"><a href="#/budget" class="view-link">Set budgets →</a></div>
  </section>

  <section class="section">
    <h2>Spending breakdown</h2>
    <div class="card spend-list">${breakdownHtml}</div>
  </section>

  <section class="section">
    <h2>Recent transactions</h2>
    <div class="card tx-list">${recentHtml}</div>
    <div class="section-footer"><a href="#/transactions" class="view-link">View all →</a></div>
  </section>`;
}

// ── Transactions ──────────────────────────────────────────────
export function renderTransactions({ transactions, categories, month }, addingTx, txType, importRows = null, importLoading = false) {
  const expenseCats = categories.filter(c => c.type === 'expense');
  const incomeCats  = categories.filter(c => c.type === 'income');
  const activeCats  = txType === 'income' ? incomeCats : expenseCats;
  const allCats     = [...incomeCats, ...expenseCats];
  const today = new Date().toISOString().slice(0, 10);

  const addForm = addingTx ? `
  <div class="add-form card">
    <form data-action="add-tx">
      <div class="type-toggle">
        <button type="button" class="type-btn${txType !== 'income' ? ' active' : ''}" data-action="tx-type" data-type="expense">Expense</button>
        <button type="button" class="type-btn${txType === 'income' ? ' active' : ''}" data-action="tx-type" data-type="income">Income</button>
      </div>
      <div class="form-row">
        <label class="form-label">Amount
          <input type="number" name="amount" min="0" step="0.01" placeholder="0.00" required class="form-input big-input" />
        </label>
        <label class="form-label">Date
          <input type="date" name="date" value="${esc(today)}" required class="form-input" />
        </label>
      </div>
      <label class="form-label">Description
        <input type="text" name="description" placeholder="What was this for?" class="form-input" />
      </label>
      <label class="form-label">Category
        <select name="categoryId" class="form-input">
          ${activeCats.map(c => `<option value="${c.id}">${esc(c.icon)} ${esc(c.name)}</option>`).join('')}
        </select>
      </label>
      <input type="hidden" name="type" value="${txType === 'income' ? 'income' : 'expense'}" />
      <div class="form-actions">
        <button type="submit" class="primary">Add</button>
        <button type="button" data-action="cancel-add-tx">Cancel</button>
      </div>
    </form>
  </div>` : '';

  // ── Loading state while AI parses the document ──
  const loadingSection = importLoading ? `
  <section class="section import-review">
    <div class="import-loading">
      <div class="import-spinner"></div>
      <p class="import-loading-text">Analysing your statement…</p>
      <p class="hint">Claude is reading the document and extracting transactions.</p>
    </div>
  </section>` : '';

  // ── CSV import review table ──
  const importSection = (!importLoading && importRows) ? (() => {
    const included = importRows.filter(r => r.include);
    const catOptions = (selectedId, type) => allCats
      .filter(c => c.type === type)
      .map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`)
      .join('');

    const rows = importRows.map((r, i) => `
      <tr class="import-row${r.include ? '' : ' import-row-skip'}">
        <td><input type="checkbox" class="import-check" data-action="toggle-import-row" data-idx="${i}" ${r.include ? 'checked' : ''} /></td>
        <td class="import-date">${esc(r.date)}</td>
        <td class="import-desc">${esc(r.description)}</td>
        <td class="import-amt ${r.type === 'income' ? 'income' : 'expense'}">${r.type === 'income' ? '+' : '−'}${fmt(r.amount)}</td>
        <td>
          <select class="form-input import-cat-sel" data-action="set-import-cat" data-idx="${i}">
            <optgroup label="${r.type === 'income' ? 'Income' : 'Expense'}">${catOptions(r.categoryId, r.type)}</optgroup>
          </select>
        </td>
      </tr>`).join('');

    return `
    <section class="section import-review">
      <div class="import-header">
        <div>
          <h2 class="import-title">Review imported transactions</h2>
          <p class="hint import-hint">${importRows.length} rows parsed · ${included.length} selected · fix any categories then confirm</p>
        </div>
        <div class="import-actions">
          <button class="primary" data-action="confirm-import" ${included.length === 0 ? 'disabled' : ''}>Import ${included.length}</button>
          <button data-action="cancel-import">Cancel</button>
        </div>
      </div>
      <div class="card import-table-wrap">
        <table class="import-table">
          <thead><tr>
            <th></th><th>Date</th><th>Description</th><th>Amount</th><th>Category</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
  })() : '';

  // Upload button shown when not adding manually and no import in progress
  const actionBar = !addingTx && !importRows ? `
  <div class="tx-action-bar">
    <button class="add-btn primary" data-action="toggle-add-tx">+ Add Transaction</button>
    <label class="import-label" title="Import CSV, image or PDF from your bank">
      ↑ Import statement
      <input type="file" accept=".csv,.txt,image/*,.pdf,application/pdf" data-action="import-csv" class="import-file-input" />
    </label>
  </div>` : addForm;

  const txHtml = transactions.length
    ? transactions.map(t => `
      <div class="tx-row">
        <span class="tx-icon">${esc(t.category ? t.category.icon : '?')}</span>
        <div class="tx-mid">
          <span class="tx-desc">${esc(t.description || t.category?.name || '—')}</span>
          <span class="tx-cat">${esc(t.category?.name || 'Uncategorised')} · ${esc(formatDate(t.date))}</span>
        </div>
        <span class="tx-amt ${t.type === 'income' ? 'income' : 'expense'}">${t.type === 'income' ? '+' : '−'}${fmtAbs(t.amount)}</span>
        <button class="icon-btn danger" data-action="del-tx" data-id="${t.id}" title="Delete" aria-label="Delete transaction">×</button>
      </div>`).join('')
    : `<p class="hint">No transactions in ${esc(formatMonth(month))}.</p>`;

  return `
  <h1>Transactions</h1>
  ${monthNav(month)}
  ${actionBar}
  ${loadingSection}
  ${importSection}
  <section class="section">
    <div class="card tx-list">${txHtml}</div>
  </section>`;
}

// ── Budget ────────────────────────────────────────────────────
// Category groups — maps display groups to category names
const CATEGORY_GROUPS = [
  { name: 'Housing',       color: '#4d7cff', icon: '🏠', cats: ['Rent', 'Water', 'Electricity', 'Internet'] },
  { name: 'Food & Dining', color: '#f4ff7b', icon: '🛒', cats: ['Groceries', 'Eating out'] },
  { name: 'Transport',     color: '#A855F7', icon: '🚗', cats: ['Fuel', 'Car Service', 'Rego', 'Transport'] },
  { name: 'Bills',         color: '#ff6b35', icon: '📱', cats: ['Phone', 'Spotify', 'Adobe', 'Entertainment'] },
  { name: 'Health',        color: '#8bffec', icon: '🏥', cats: ['Health', 'Doctor Visits', 'Gym'] },
  { name: 'Personal',      color: '#ff4b2b', icon: '👤', cats: ['Clothing', 'Spend', 'Other'] },
  { name: 'Savings',       color: '#22c55e', icon: '💰', cats: ['Emergency Fund'] },
  { name: 'Scouts',        color: '#fbbf24', icon: '🏕', cats: ['Scouts Food', 'Scouts Insurance'] },
];

export function renderBudget({ rows, month, period = 'monthly', income = 0, totalMonthlyExpected = 0 }) {
  _ringCounter = 0;
  const periodShort = PERIOD_SHORT[period] || 'mo';

  // Use actual income transactions if available, else expected from income sources
  const incomeMonthly  = income > 0 ? income : totalMonthlyExpected;
  const incomeDisplay  = fromMonthly(incomeMonthly, period);
  const totalSpentMo   = rows.reduce((s, r) => s + r.spent, 0);
  const totalSpentDisp = fromMonthly(totalSpentMo, period);
  const overallPct     = incomeMonthly > 0 ? Math.min(1, totalSpentMo / incomeMonthly) : 0;
  const remaining      = incomeDisplay - totalSpentDisp;

  // Income ring
  const incomeRingHtml = `
  <div class="budget-income-section">
    <div class="budget-income-ring">
      ${ringChart({ pct: overallPct, c1: '#4d7cff', c2: '#8bffec', line1: fmt(incomeDisplay), label: income > 0 ? 'INCOME' : 'EXPECTED', sublabel: `/${periodShort}` })}
    </div>
    <div class="budget-income-stats">
      <div class="budget-stat"><span class="budget-stat-val">${fmt(totalSpentDisp)}</span><span class="budget-stat-lbl">Spent</span></div>
      <div class="budget-stat-divider"></div>
      <div class="budget-stat"><span class="budget-stat-val ${remaining < 0 ? 'over' : 'ok'}">${fmt(Math.abs(remaining))}</span><span class="budget-stat-lbl">${remaining < 0 ? 'Over' : 'Remaining'}</span></div>
      <div class="budget-stat-divider"></div>
      <div class="budget-stat"><span class="budget-stat-val">${Math.round(overallPct * 100)}%</span><span class="budget-stat-lbl">Allocated</span></div>
    </div>
  </div>`;

  // Build lookup: category name (lowercase) → row data
  const catRowMap = {};
  for (const r of rows) catRowMap[r.category.name.toLowerCase()] = r;
  const groupedCatNames = new Set();

  const groupsHtml = CATEGORY_GROUPS.map(grp => {
    const grpRows = grp.cats.map(n => catRowMap[n.toLowerCase()]).filter(Boolean);
    grpRows.forEach(r => groupedCatNames.add(r.category.name.toLowerCase()));

    const grpPlannedMo   = grpRows.reduce((s, r) => s + (r.target ? Number(r.target.limit_amount) : 0), 0);
    const grpSpentMo     = grpRows.reduce((s, r) => s + r.spent, 0);
    const grpPlannedDisp = fromMonthly(grpPlannedMo, period);
    const grpSpentDisp   = fromMonthly(grpSpentMo, period);
    const pctOfIncome    = incomeMonthly > 0 ? grpSpentMo / incomeMonthly * 100 : 0;
    const over           = grpPlannedMo > 0 && grpSpentMo > grpPlannedMo;

    const catItemsHtml = grpRows.map(({ category, target, spent }) => {
      const limitMo   = target ? Number(target.limit_amount) : null;
      const limitDisp = limitMo !== null ? fromMonthly(limitMo, period) : null;
      const spentDisp = fromMonthly(spent, period);
      const catPct    = limitMo ? Math.min(1, spent / limitMo) : 0;
      const catOver   = limitMo !== null && spent > limitMo;
      return `
      <div class="bcat-item">
        <div class="bcat-row">
          <span class="bcat-name"><span class="spend-icon">${esc(category.icon)}</span>${esc(category.name)}</span>
          <div class="bcat-amounts">
            <span class="${catOver ? 'over' : ''}">${spentDisp > 0 ? fmt(spentDisp) : '—'}</span>
            ${limitDisp !== null ? `<span class="bcat-sep">/</span><span class="bcat-limit">${fmt(limitDisp)}</span>` : ''}
          </div>
        </div>
        ${limitMo !== null ? `<div class="bcat-bar-track"><div class="bcat-bar-fill${catOver ? ' over' : ''}" style="width:${Math.min(100, catPct * 100).toFixed(1)}%;background:${esc(category.color)}"></div></div>` : ''}
        <form data-action="set-budget" data-cat-id="${category.id}" class="bcat-form">
          <input type="hidden" name="categoryId" value="${category.id}" />
          <input type="number" name="limitAmount" min="0" step="0.01"
            placeholder="${limitDisp !== null ? `Update (${periodShort})` : `Set ${periodShort} limit…`}"
            value="${limitDisp !== null ? limitDisp.toFixed(2) : ''}"
            class="form-input budget-limit-input" />
          <button type="submit" class="small-btn">${limitDisp !== null ? 'Update' : 'Set'}</button>
          ${target ? `<button type="button" class="small-btn danger" data-action="del-budget" data-id="${target.id}">✕</button>` : ''}
        </form>
      </div>`;
    }).join('');

    // Bar width based on % of income; if no income yet, use % of total planned
    const barPct = incomeMonthly > 0 ? Math.min(100, pctOfIncome) : (grpPlannedMo > 0 && totalSpentMo > 0 ? Math.min(100, grpSpentMo / totalSpentMo * 100) : 0);

    return `
    <div class="bgroup">
      <div class="bgroup-head">
        <span class="bgroup-name" style="color:${esc(grp.color)}">${grp.icon} ${grp.name}</span>
        <div class="bgroup-meta">
          ${grpPlannedMo > 0 ? `<span class="bgroup-planned">${fmt(grpPlannedDisp)}<span class="budget-period-tag">/${periodShort}</span></span>` : ''}
          <span class="bgroup-pct${pctOfIncome >= 25 ? ' high' : ''}">${pctOfIncome > 0 ? pctOfIncome.toFixed(1) + '%' : grpPlannedMo > 0 ? '0%' : ''}</span>
        </div>
      </div>
      <div class="bgroup-bar-track">
        <div class="bgroup-bar-fill${over ? ' over' : ''}" style="width:${barPct.toFixed(1)}%;background:${esc(grp.color)}"></div>
      </div>
      <div class="bgroup-cats">${catItemsHtml || '<p class="hint bgroup-hint">No matching categories</p>'}</div>
    </div>`;
  }).join('');

  // Ungrouped categories (catch-all)
  const ungroupedRows = rows.filter(r => !groupedCatNames.has(r.category.name.toLowerCase()));
  const ungroupedHtml = ungroupedRows.length ? `
  <div class="bgroup">
    <div class="bgroup-head">
      <span class="bgroup-name" style="color:var(--text-2)">📦 Other</span>
    </div>
    ${ungroupedRows.map(({ category, target, spent }) => {
      const limitMo   = target ? Number(target.limit_amount) : null;
      const limitDisp = limitMo !== null ? fromMonthly(limitMo, period) : null;
      const spentDisp = fromMonthly(spent, period);
      const catOver   = limitMo !== null && spent > limitMo;
      return `
      <div class="bcat-item">
        <div class="bcat-row">
          <span class="bcat-name"><span class="spend-icon">${esc(category.icon)}</span>${esc(category.name)}</span>
          <div class="bcat-amounts">
            <span class="${catOver ? 'over' : ''}">${spentDisp > 0 ? fmt(spentDisp) : '—'}</span>
            ${limitDisp !== null ? `<span class="bcat-sep">/</span><span class="bcat-limit">${fmt(limitDisp)}</span>` : ''}
          </div>
        </div>
        <form data-action="set-budget" data-cat-id="${category.id}" class="bcat-form">
          <input type="hidden" name="categoryId" value="${category.id}" />
          <input type="number" name="limitAmount" min="0" step="0.01"
            placeholder="${limitDisp !== null ? `Update (${periodShort})` : `Set ${periodShort} limit…`}"
            value="${limitDisp !== null ? limitDisp.toFixed(2) : ''}"
            class="form-input budget-limit-input" />
          <button type="submit" class="small-btn">${limitDisp !== null ? 'Update' : 'Set'}</button>
          ${target ? `<button type="button" class="small-btn danger" data-action="del-budget" data-id="${target.id}">✕</button>` : ''}
        </form>
      </div>`;
    }).join('')}
  </div>` : '';

  return `
  <h1>Budget</h1>
  <div class="budget-page-header">
    ${monthNav(month)}
    <div class="budget-period-row">
      <span class="hint">View &amp; set limits per</span>
      ${periodToggle(period)}
    </div>
  </div>
  ${incomeRingHtml}
  <section class="section budget-groups-section">
    ${groupsHtml}${ungroupedHtml}
  </section>`;
}

// ── Goals ─────────────────────────────────────────────────────
export function renderGoals(goals, addingGoal, addFundsId) {
  const goalsHtml = goals.length
    ? goals.map(g => {
        const pct = g.progress;
        const remaining = Number(g.target_amount) - Number(g.current_amount);
        const done = pct >= 1;
        const ring = ringChart({
          pct,
          c1: g.color,
          c2: '#A855F7',
          line1: `${Math.round(pct * 100)}%`,
          label: g.name,
        });
        return `
        <div class="goal-card card${done ? ' done' : ''}">
          <div class="goal-ring-row">
            ${ring}
            <div class="goal-detail">
              ${done ? '<span class="goal-badge">✓ Done</span>' : ''}
              <div class="goal-amounts">
                <span class="goal-current">${fmt(g.current_amount)}</span>
                <span class="goal-sep">of</span>
                <span class="goal-target">${fmt(g.target_amount)}</span>
              </div>
              ${addFundsId === g.id ? `
              <form class="goal-funds-form" data-action="add-funds">
                <input type="hidden" name="goalId" value="${g.id}" />
                <input type="number" name="delta" step="0.01" placeholder="Amount to add" class="form-input" required />
                <div class="form-actions">
                  <button type="submit" class="small-btn primary">Add</button>
                  <button type="button" class="small-btn" data-action="cancel-funds">Cancel</button>
                </div>
              </form>` : `
              ${!done ? `<button class="small-btn" data-action="toggle-funds" data-id="${g.id}">+ Add funds</button>` : ''}`}
            </div>
            <button class="icon-btn danger goal-del" data-action="del-goal" data-id="${g.id}" title="Delete" aria-label="Delete goal">×</button>
          </div>
        </div>`;
      }).join('')
    : `<p class="hint">No savings goals yet. Tap the button below to create one.</p>`;

  const addGoalForm = addingGoal ? `
  <div class="add-form card">
    <form data-action="add-goal">
      <h3 class="form-title">New Savings Goal</h3>
      <label class="form-label">Goal name
        <input type="text" name="name" placeholder="e.g. Holiday, New car…" required class="form-input" />
      </label>
      <label class="form-label">Target amount
        <input type="number" name="targetAmount" min="1" step="0.01" placeholder="0.00" required class="form-input" />
      </label>
      <label class="form-label">Colour
        <div class="color-options">
          ${['#8bffec','#4d7cff','#A855F7','#f4ff7b','#ff4b2b','#3ef0a0','#ff9f43'].map(c =>
            `<label class="color-opt"><input type="radio" name="color" value="${c}" ${c === '#8bffec' ? 'checked' : ''} /><span class="color-swatch" style="background:${c}"></span></label>`
          ).join('')}
        </div>
      </label>
      <div class="form-actions">
        <button type="submit" class="primary">Create Goal</button>
        <button type="button" data-action="cancel-add-goal">Cancel</button>
      </div>
    </form>
  </div>` : '';

  return `
  <h1>Goals</h1>
  <section class="section">
    ${goalsHtml}
  </section>
  ${addGoalForm}
  ${!addingGoal ? `<button class="add-btn primary" data-action="toggle-add-goal">+ New Goal</button>` : ''}`;
}

// ── Settings ──────────────────────────────────────────────────
export function renderSettings(categories, accounts, addingCat, addingAcct, isAdmin, notice, problem, incomeSources = [], addingIncome = false) {
  const noticeBanner  = notice  ? `<div class="banner ok">${esc(notice)}</div>`  : '';
  const problemBanner = problem ? `<div class="banner err">${esc(problem)}</div>` : '';

  // ── Income sources ──
  const incomeRows = incomeSources.map(s => `
    <div class="cat-row">
      <span class="cat-dot" style="background:${esc(s.color)}"></span>
      <div style="flex:1;min-width:0">
        <span class="cat-name">${esc(s.name)}</span>
      </div>
      <span class="cat-type income" style="margin-right:.4rem">${esc(s.person)}</span>
      <span class="income-settings-amt">${fmt(s.amount)}<span class="income-freq">/${esc(FREQ_SHORT[s.frequency] || s.frequency)}</span></span>
      <button class="icon-btn danger" data-action="del-income" data-id="${s.id}" title="Delete" aria-label="Delete income source">×</button>
    </div>`).join('');

  const addIncomeForm = addingIncome ? `
  <div class="add-form card">
    <form data-action="add-income">
      <h3 class="form-title">New Income Source</h3>
      <div class="form-row">
        <label class="form-label">Name
          <input type="text" name="name" placeholder="e.g. Salary, Freelance…" required class="form-input" />
        </label>
        <label class="form-label">Person
          <input type="text" name="person" placeholder="e.g. Bek, Michael" class="form-input" />
        </label>
      </div>
      <div class="form-row">
        <label class="form-label">Amount
          <input type="number" name="amount" min="0" step="0.01" placeholder="0.00" required class="form-input" />
        </label>
        <label class="form-label">Frequency
          <select name="frequency" class="form-input">
            <option value="weekly">Weekly</option>
            <option value="fortnightly" selected>Fortnightly</option>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
      </div>
      <label class="form-label">Colour
        <div class="color-options">
          ${['#8bffec','#4d7cff','#A855F7','#f4ff7b','#22c55e','#ff6b35','#888888'].map(c =>
            `<label class="color-opt"><input type="radio" name="color" value="${c}" ${c === '#8bffec' ? 'checked' : ''} /><span class="color-swatch" style="background:${c}"></span></label>`
          ).join('')}
        </div>
      </label>
      <div class="form-actions">
        <button type="submit" class="primary">Add Income</button>
        <button type="button" data-action="cancel-add-income">Cancel</button>
      </div>
    </form>
  </div>` : `<button class="add-btn primary" data-action="toggle-add-income">+ Add Income Source</button>`;

  // ── Categories ──
  const catRows = categories.map(c => `
    <div class="cat-row">
      <span class="cat-icon">${esc(c.icon)}</span>
      <span class="cat-dot" style="background:${esc(c.color)}"></span>
      <span class="cat-name">${esc(c.name)}</span>
      <span class="cat-type ${c.type}">${c.type}</span>
      <button class="icon-btn danger" data-action="del-cat" data-id="${c.id}" title="Delete" aria-label="Delete category">×</button>
    </div>`).join('');

  const addCatForm = addingCat ? `
  <div class="add-form card">
    <form data-action="add-cat">
      <h3 class="form-title">New Category</h3>
      <div class="form-row">
        <label class="form-label">Icon (emoji)
          <input type="text" name="icon" placeholder="💰" maxlength="2" class="form-input icon-input" />
        </label>
        <label class="form-label">Type
          <select name="type" class="form-input">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>
      </div>
      <label class="form-label">Name
        <input type="text" name="name" placeholder="Category name" required class="form-input" />
      </label>
      <label class="form-label">Colour
        <div class="color-options">
          ${['#8bffec','#4d7cff','#A855F7','#f4ff7b','#ff4b2b','#3ef0a0','#888888'].map(c =>
            `<label class="color-opt"><input type="radio" name="color" value="${c}" ${c === '#A855F7' ? 'checked' : ''} /><span class="color-swatch" style="background:${c}"></span></label>`
          ).join('')}
        </div>
      </label>
      <div class="form-actions">
        <button type="submit" class="primary">Add Category</button>
        <button type="button" data-action="cancel-add-cat">Cancel</button>
      </div>
    </form>
  </div>` : `<button class="add-btn primary" data-action="toggle-add-cat">+ Add Category</button>`;

  // ── Accounts ──
  const acctRows = accounts.map(a => `
    <div class="cat-row">
      <span class="cat-dot" style="background:linear-gradient(135deg,${esc(a.color1)},${esc(a.color2)})"></span>
      <span class="cat-name">${esc(a.name)}</span>
      <form data-action="update-acct-balance" style="display:flex;align-items:center;gap:.4rem;margin-left:auto">
        <input type="hidden" name="acctId" value="${a.id}" />
        <input type="number" name="balance" value="${Number(a.balance)}" step="0.01" class="form-input" style="width:110px" />
        <button type="submit" class="small-btn">Save</button>
      </form>
      <button class="icon-btn danger" data-action="del-acct" data-id="${a.id}" title="Delete" aria-label="Delete account">×</button>
    </div>`).join('');

  const addAcctForm = addingAcct ? `
  <div class="add-form card">
    <form data-action="add-acct">
      <h3 class="form-title">New Account</h3>
      <div class="form-row">
        <label class="form-label">Account name
          <input type="text" name="name" placeholder="e.g. Cheque, Savings…" required class="form-input" />
        </label>
        <label class="form-label">Current balance
          <input type="number" name="balance" value="0" step="0.01" class="form-input" />
        </label>
      </div>
      <label class="form-label">Target balance (optional)
        <input type="number" name="target" placeholder="Leave blank for no target" step="0.01" class="form-input" />
      </label>
      <label class="form-label">Gradient colours
        <div class="grad-options">
          ${[
            ['#8bffec','#4d7cff'],['#A855F7','#4d7cff'],['#f4ff7b','#ff6b35'],
            ['#22c55e','#8bffec'],['#ff6b35','#A855F7'],['#4d7cff','#A855F7'],
          ].map(([c1, c2], i) =>
            `<label class="color-opt"><input type="radio" name="colors" value="${c1}|${c2}" ${i === 0 ? 'checked' : ''} /><span class="color-swatch grad-swatch" style="background:linear-gradient(135deg,${c1},${c2})"></span></label>`
          ).join('')}
        </div>
      </label>
      <div class="form-actions">
        <button type="submit" class="primary">Add Account</button>
        <button type="button" data-action="cancel-add-acct">Cancel</button>
      </div>
    </form>
  </div>` : `<button class="add-btn primary" data-action="toggle-add-acct">+ Add Account</button>`;

  const adminSection = `
  <section class="section">
    <h2>Danger Zone</h2>
    ${isAdmin
      ? `<div class="card danger-zone">
          <p class="hint">These actions are permanent and cannot be undone.</p>
          <button class="danger" data-action="clear-all">Clear all transactions &amp; budgets</button>
        </div>`
      : `<div class="card">
          <form data-action="admin-login">
            <p class="hint" style="margin-bottom:.75rem">Enter your admin password to unlock destructive actions.</p>
            <div class="form-row">
              <input type="password" name="password" placeholder="Password" class="form-input" required />
              <button type="submit" class="small-btn">Unlock</button>
            </div>
          </form>
        </div>`}
  </section>`;

  return `
  <h1>Settings</h1>
  ${noticeBanner}${problemBanner}
  <section class="section">
    <h2>Income sources</h2>
    <div class="card cat-list">${incomeRows || '<p class="hint" style="padding:.75rem 1.1rem">No income sources yet.</p>'}</div>
    ${addIncomeForm}
  </section>
  <section class="section">
    <h2>Bank accounts</h2>
    <div class="card cat-list">${acctRows || '<p class="hint" style="padding:.75rem 1.1rem">No accounts yet.</p>'}</div>
    ${addAcctForm}
  </section>
  <section class="section">
    <h2>Categories</h2>
    <div class="card cat-list">${catRows}</div>
    ${addCatForm}
  </section>
  ${adminSection}`;
}
