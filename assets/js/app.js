// SPA router + event wiring. Hash-based routing.

import { store } from './store.js?v=2';
import { currentMonth, prevMonth, nextMonth, getDashboard, getTransactionsView, getBudgetView, getGoalsView } from './compute.js?v=2';
import { renderDashboard, renderTransactions, renderBudget, renderGoals, renderSettings } from './views.js?v=2';

const root = document.getElementById('root');
const PASSWORD = (window.BUDGET_CONFIG || {}).ADMIN_PASSWORD || 'budget2026';
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let isAdmin    = localStorage.getItem('budget_admin') === '1';
let month      = currentMonth();
let addingTx   = false;
let txType     = 'expense';
let addingGoal = false;
let addFundsId = null;
let addingCat  = false;
let addingAcct = false;
let flash      = null;
let lastPaintedRoute = null;
let lastRenderedBody = null;

function applyTheme(dark) {
  document.body.dataset.theme = dark ? 'dark' : 'light';
  localStorage.setItem('budget_theme', dark ? 'dark' : 'light');
}
applyTheme(localStorage.getItem('budget_theme') !== 'light');

const NAV = [
  { route: '/',             label: 'Dashboard',    key: 'dashboard'    },
  { route: '/transactions', label: 'Transactions', key: 'transactions' },
  { route: '/budget',       label: 'Budget',       key: 'budget'       },
  { route: '/goals',        label: 'Goals',        key: 'goals'        },
  { route: '/settings',     label: 'Settings',     key: 'settings'     },
];

function currentRoute() { return location.hash.replace(/^#/, '') || '/'; }

function activeKey(route) {
  if (route === '/')                        return 'dashboard';
  if (route.startsWith('/transactions'))    return 'transactions';
  if (route.startsWith('/budget'))          return 'budget';
  if (route.startsWith('/goals'))           return 'goals';
  if (route.startsWith('/settings'))        return 'settings';
  return '';
}

function headerHtml(route) {
  const ak = activeKey(route);
  const links = NAV.map(n => `<a href="#${n.route}" class="${ak === n.key ? 'active' : ''}">${n.label}</a>`).join('');
  const isDark = document.body.dataset.theme !== 'light';
  return `
  <header class="topbar">
    <a class="brand" href="#/">
      <span class="brand-icon">₿</span>
      <div class="brand-text">
        <span class="brand-name">Household</span>
        <span class="brand-sub">Budget</span>
      </div>
    </a>
    <nav class="topbar-nav">${links}</nav>
    <div class="topbar-end">
      <button class="theme-toggle" data-action="toggle-theme">${isDark ? '☀ Light' : '☾ Dark'}</button>
      <button class="nav-burger" data-action="toggle-nav" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
    <div class="nav-drawer">${links}</div>
  </header>
  <nav class="bottom-nav" aria-label="Navigation">
    <a href="#/" class="bnav-item ${ak === 'dashboard' ? 'active' : ''}" aria-label="Dashboard">
      <span class="bnav-icon">⌂</span><span class="bnav-label">Dashboard</span>
    </a>
    <a href="#/transactions" class="bnav-item ${ak === 'transactions' ? 'active' : ''}" aria-label="Transactions">
      <span class="bnav-icon">↕</span><span class="bnav-label">Transactions</span>
    </a>
    <a href="#/budget" class="bnav-item ${ak === 'budget' ? 'active' : ''}" aria-label="Budget">
      <span class="bnav-icon">◎</span><span class="bnav-label">Budget</span>
    </a>
    <a href="#/goals" class="bnav-item ${ak === 'goals' ? 'active' : ''}" aria-label="Goals">
      <span class="bnav-icon">★</span><span class="bnav-label">Goals</span>
    </a>
    <a href="#/settings" class="bnav-item ${ak === 'settings' ? 'active' : ''}" aria-label="Settings">
      <span class="bnav-icon">⚙</span><span class="bnav-label">Settings</span>
    </a>
  </nav>`;
}

function paint(route, body) {
  document.body.dataset.route = activeKey(route) || 'dashboard';
  const appEl = document.getElementById('app');
  if (appEl && lastPaintedRoute === route) {
    if (body !== lastRenderedBody) { appEl.innerHTML = body; lastRenderedBody = body; }
  } else {
    root.innerHTML = headerHtml(route) + `<main class="container" id="app">${body}</main>`;
    lastPaintedRoute = route;
    lastRenderedBody = body;
  }
}

async function render() {
  const route = currentRoute();
  if (!root.querySelector('.topbar')) paint(route, `<p class="hint">Loading…</p>`);

  let data;
  try {
    data = await store.loadAll();
  } catch (err) {
    paint(route, `
      <h1>Couldn't load data</h1>
      <div class="banner err">${esc(err.message)}</div>
      <p class="hint">Check your <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> in
      <code>config.js</code> and that you ran <code>supabase-schema.sql</code>.</p>`);
    return;
  }

  let body;
  switch (route) {
    case '/transactions':
      body = renderTransactions(getTransactionsView(data, month), addingTx, txType);
      break;
    case '/budget':
      body = renderBudget(getBudgetView(data, month));
      break;
    case '/goals':
      body = renderGoals(getGoalsView(data), addingGoal, addFundsId);
      break;
    case '/settings':
      body = renderSettings(data.categories, data.bank_accounts || [], addingCat, addingAcct, isAdmin, flash?.notice, flash?.problem);
      flash = null;
      break;
    case '/':
    default:
      body = renderDashboard(getDashboard(data, month));
      break;
  }
  paint(route, body);
}

async function run(fn) {
  try {
    await fn();
    await render();
  } catch (err) {
    flash = { problem: err.message };
    if (currentRoute() === '/settings') await render();
    else { window.alert(err.message); await render(); }
  }
}

// ── Event delegation ─────────────────────────────────────────
root.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-action]');
  if (!form) return;
  e.preventDefault();
  const action = form.dataset.action;
  const fd = new FormData(form);

  if (action === 'add-tx') {
    const amount = Number(fd.get('amount'));
    if (!amount || amount <= 0) { window.alert('Enter a valid amount.'); return; }
    run(() => store.addTransaction({
      amount,
      description: String(fd.get('description') || '').trim(),
      categoryId: fd.get('categoryId') ? Number(fd.get('categoryId')) : null,
      type: fd.get('type') || 'expense',
      date: fd.get('date') || new Date().toISOString().slice(0, 10),
    }));
    addingTx = false;

  } else if (action === 'set-budget') {
    const limitAmount = Number(fd.get('limitAmount'));
    if (!limitAmount || limitAmount <= 0) { window.alert('Enter a valid limit.'); return; }
    run(() => store.setBudgetTarget({
      categoryId: Number(fd.get('categoryId')),
      month,
      limitAmount,
    }));

  } else if (action === 'add-goal') {
    const targetAmount = Number(fd.get('targetAmount'));
    if (!targetAmount || targetAmount <= 0) { window.alert('Enter a valid target amount.'); return; }
    run(() => store.addGoal({
      name: String(fd.get('name') || '').trim(),
      targetAmount,
      color: fd.get('color') || '#8bffec',
    }));
    addingGoal = false;

  } else if (action === 'add-funds') {
    const delta = Number(fd.get('delta'));
    if (!delta) { window.alert('Enter an amount.'); return; }
    run(() => store.updateGoalAmount(Number(fd.get('goalId')), delta));
    addFundsId = null;

  } else if (action === 'add-acct') {
    const name = String(fd.get('name') || '').trim();
    if (!name) { window.alert('Enter an account name.'); return; }
    const colors = String(fd.get('colors') || '#8bffec|#A855F7').split('|');
    run(() => store.addAccount({
      name,
      balance: Number(fd.get('balance')) || 0,
      color1: colors[0] || '#8bffec',
      color2: colors[1] || '#A855F7',
      target: fd.get('target') ? Number(fd.get('target')) : null,
    }));
    addingAcct = false;

  } else if (action === 'update-acct-balance') {
    run(() => store.updateAccountBalance(Number(fd.get('acctId')), Number(fd.get('balance'))));

  } else if (action === 'add-cat') {
    const name = String(fd.get('name') || '').trim();
    if (!name) { window.alert('Enter a category name.'); return; }
    run(() => store.addCategory({
      name,
      color: fd.get('color') || '#A855F7',
      icon: String(fd.get('icon') || '').trim() || '💰',
      type: fd.get('type') || 'expense',
    }));
    addingCat = false;

  } else if (action === 'admin-login') {
    if (String(fd.get('password')) === PASSWORD) {
      isAdmin = true;
      localStorage.setItem('budget_admin', '1');
      flash = { notice: 'Admin unlocked.' };
    } else {
      flash = { problem: 'Incorrect password.' };
    }
    render();
  }
});

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'FORM') return;
  const action = el.dataset.action;

  if (action === 'toggle-nav') {
    document.body.classList.toggle('nav-open');

  } else if (action === 'toggle-theme') {
    applyTheme(document.body.dataset.theme !== 'dark');
    render();

  } else if (action === 'prev-month') {
    month = prevMonth(month);
    render();

  } else if (action === 'next-month') {
    month = nextMonth(month);
    render();

  } else if (action === 'toggle-add-tx') {
    addingTx = true; txType = 'expense';
    render();

  } else if (action === 'cancel-add-tx') {
    addingTx = false;
    render();

  } else if (action === 'tx-type') {
    txType = el.dataset.type;
    render();

  } else if (action === 'del-tx') {
    if (!window.confirm('Delete this transaction?')) return;
    run(() => store.deleteTransaction(Number(el.dataset.id)));

  } else if (action === 'del-budget') {
    if (!window.confirm('Remove this budget limit?')) return;
    run(() => store.deleteBudgetTarget(Number(el.dataset.id)));

  } else if (action === 'toggle-add-goal') {
    addingGoal = true;
    render();

  } else if (action === 'cancel-add-goal') {
    addingGoal = false;
    render();

  } else if (action === 'toggle-funds') {
    addFundsId = Number(el.dataset.id);
    render();

  } else if (action === 'cancel-funds') {
    addFundsId = null;
    render();

  } else if (action === 'del-goal') {
    if (!window.confirm('Delete this savings goal?')) return;
    run(() => store.deleteGoal(Number(el.dataset.id)));

  } else if (action === 'toggle-add-acct') {
    addingAcct = true;
    render();

  } else if (action === 'cancel-add-acct') {
    addingAcct = false;
    render();

  } else if (action === 'del-acct') {
    if (!window.confirm('Delete this account?')) return;
    run(() => store.deleteAccount(Number(el.dataset.id)));

  } else if (action === 'toggle-add-cat') {
    addingCat = true;
    render();

  } else if (action === 'cancel-add-cat') {
    addingCat = false;
    render();

  } else if (action === 'del-cat') {
    if (!window.confirm('Delete this category? Existing transactions will become uncategorised.')) return;
    run(() => store.deleteCategory(Number(el.dataset.id)));

  } else if (action === 'clear-all') {
    if (!window.confirm('Delete ALL transactions and budget targets? This cannot be undone.')) return;
    run(async () => { await store.clearAllTransactions(); flash = { notice: 'All transactions cleared.' }; });
  }
});

window.addEventListener('hashchange', () => {
  document.body.classList.remove('nav-open');
  addingTx = false;
  addingGoal = false;
  addFundsId = null;
  addingCat = false;
  addingAcct = false;
  render();
});

// Splash
const splashEl = document.getElementById('splash');
const t0 = Date.now();
const hideSplash = () => {
  if (!splashEl || splashEl.classList.contains('splash-out')) return;
  splashEl.classList.add('splash-out');
  setTimeout(() => splashEl.remove(), 520);
};
const guard = setTimeout(hideSplash, 4000);
render().finally(() => {
  clearTimeout(guard);
  setTimeout(hideSplash, Math.max(0, 800 - (Date.now() - t0)));
});
