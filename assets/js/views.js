// HTML string renderers — pure functions, no DOM mutations.

import { formatMonth, formatDate, prevMonth, nextMonth, fromMonthly, PERIOD_LABELS } from './compute.js?v=6';

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
export function renderDashboard({ income, expenses, balance, spendBreakdown, budgetRows, recent, month, accounts, incomeSources, totalMonthlyExpected, goals, period }) {
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

  ${budgetRows.length ? `
  <section class="section">
    <h2>Budget progress</h2>
    <div class="rings-row card">${budgetRingHtml}</div>
  </section>` : ''}

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
export function renderTransactions({ transactions, categories, month }, addingTx, txType) {
  const expenseCats = categories.filter(c => c.type === 'expense');
  const incomeCats  = categories.filter(c => c.type === 'income');
  const activeCats  = txType === 'income' ? incomeCats : expenseCats;
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
  </div>` : `
  <button class="add-btn primary" data-action="toggle-add-tx">+ Add Transaction</button>`;

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
  ${addForm}
  <section class="section">
    <div class="card tx-list">${txHtml}</div>
  </section>`;
}

// ── Budget ────────────────────────────────────────────────────
export function renderBudget({ rows, month, period = 'monthly' }) {
  const periodShort = PERIOD_SHORT[period] || 'mo';

  const rowsHtml = rows.map(({ category, target, spent }) => {
    const limitMonthly = target ? Number(target.limit_amount) : null;
    const limitDisplay = limitMonthly !== null ? fromMonthly(limitMonthly, period) : null;
    const spentDisplay = fromMonthly(spent, period);
    const pct  = limitMonthly ? spent / limitMonthly : 0;
    const over = limitMonthly !== null && spent > limitMonthly;

    return `
    <div class="budget-row card">
      <div class="budget-row-top">
        <span class="spend-icon">${esc(category.icon)}</span>
        <span class="budget-cat-name">${esc(category.name)}</span>
        <div class="budget-row-right">
          ${limitDisplay !== null
            ? `<span class="budget-spent ${over ? 'over' : ''}">${fmt(spentDisplay)}</span><span class="budget-limit-sep">/</span><span class="budget-limit">${fmt(limitDisplay)}<span class="budget-period-tag">/${periodShort}</span></span>`
            : `<span class="budget-spent-only">${spentDisplay > 0 ? fmt(spentDisplay) : ''}</span>`}
        </div>
      </div>
      ${limitMonthly !== null ? progressBar(pct, category.color, over) : ''}
      <div class="budget-row-form">
        <form data-action="set-budget" data-cat-id="${category.id}">
          <input type="hidden" name="categoryId" value="${category.id}" />
          <input type="number" name="limitAmount" min="0" step="0.01"
            placeholder="${limitDisplay !== null ? `Update limit (${periodShort})` : `Set ${periodShort} limit…`}"
            value="${limitDisplay !== null ? limitDisplay.toFixed(2) : ''}"
            class="form-input budget-limit-input" />
          <button type="submit" class="small-btn">${limitDisplay !== null ? 'Update' : 'Set'}</button>
          ${target ? `<button type="button" class="small-btn danger" data-action="del-budget" data-id="${target.id}">Remove</button>` : ''}
        </form>
      </div>
    </div>`;
  }).join('');

  return `
  <h1>Budget</h1>
  <div class="budget-page-header">
    ${monthNav(month)}
    <div class="budget-period-row">
      <span class="hint">View &amp; set limits per</span>
      ${periodToggle(period)}
    </div>
  </div>
  <section class="section">
    ${rowsHtml || '<p class="hint">No expense categories yet. Add some in Settings.</p>'}
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
