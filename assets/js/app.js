// SPA router + event wiring. Hash-based routing.

import { store } from './store.js?v=9';
import { currentMonth, prevMonth, nextMonth, getDashboard, getTransactionsView, getBudgetView, getGoalsView, toMonthly, fromMonthly } from './compute.js?v=9';
import { renderDashboard, renderTransactions, renderBudget, renderGoals, renderSettings } from './views.js?v=9';
import { processCSV, processFile } from './importer.js?v=9';

const root = document.getElementById('root');
const PASSWORD = (window.BUDGET_CONFIG || {}).ADMIN_PASSWORD || 'budget2026';
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let isAdmin      = localStorage.getItem('budget_admin') === '1';
let period       = localStorage.getItem('budget_period') || 'fortnightly';
let month        = currentMonth();
let addingTx     = false;
let txType       = 'expense';
let addingGoal   = false;
let addFundsId   = null;
let addingCat    = false;
let addingAcct   = false;
let addingIncome = false;
let importRows    = null;       // parsed rows awaiting review, or null
let importLoading = false;     // true while AI is processing image/PDF
let flash        = null;
let lastPaintedRoute = null;
let lastRenderedBody = null;
let lastData         = null;   // most recent store snapshot, used by undo handlers

// ── Undo stack ────────────────────────────────────────────────
const undoStack = [];
const MAX_UNDO  = 20;

function pushUndo(fn) {
  undoStack.push(fn);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function showToast(msg) {
  let el = document.getElementById('undo-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'undo-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('visible'), 1800);
}

// Extract the row id from what store add-methods return (array or object).
function rowId(result) {
  if (!result) return null;
  return Array.isArray(result) ? result[0]?.id : result?.id;
}

document.addEventListener('keydown', async (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    if (!undoStack.length) { showToast('Nothing to undo'); return; }
    e.preventDefault();
    const fn = undoStack.pop();
    try {
      await fn();
      await render();
      showToast('Undone');
    } catch (err) {
      window.alert('Undo failed: ' + err.message);
      await render();
    }
  }
});

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
      <svg class="brand-logo-svg" viewBox="0 0 127 58" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-label="MBD Budget"><path d="M23.6421 25.4837V-2.84369e-06H33.1494L36.7106 13.918L40.3045 -2.84369e-06H49.8119V25.4837H41.2519L41.4806 12.1211L38.6382 24.7649H34.8157L31.9733 12.1211L32.202 25.4837H23.6421ZM50.8895 25.4837V0.0326682H61.8018C70.035 0.0326682 71.8972 1.79693 71.8972 5.81551V8.10251C71.8972 10.1608 71.4725 11.5984 69.8716 12.4478C71.6032 13.2973 72.0933 14.7675 72.0933 16.8584V19.7009C72.0933 23.7194 70.035 25.4837 61.8018 25.4837H50.8895ZM59.9722 10.0301H61.6711C62.4879 10.0301 62.9126 9.93211 62.9126 9.34402V6.10955C62.9126 5.52147 62.4879 5.42345 61.6711 5.42345H59.9722V10.0301ZM59.9722 20.0929H61.8018C62.5859 20.0929 63.0106 19.9949 63.0106 19.4395V15.6169C63.0106 15.0615 62.5859 14.9308 61.8018 14.9308H59.9722V20.0929ZM83.4535 -2.84369e-06C92.0134 -2.84369e-06 94.1697 2.12364 94.1697 6.10955V19.4068C94.1697 23.3927 92.0134 25.4837 83.4535 25.4837H73.0639V-2.84369e-06H83.4535ZM85.087 6.40359C85.087 5.7175 84.6623 5.61948 83.4535 5.61948H82.1466V19.8969H83.4535C84.6623 19.8969 85.087 19.7989 85.087 19.1128V6.40359ZM-5.77449e-05 57.4837V32.0327H10.9122C19.1454 32.0327 21.0077 33.7969 21.0077 37.8155V40.1025C21.0077 42.1608 20.5829 43.5984 18.982 44.4478C20.7136 45.2973 21.2037 46.7675 21.2037 48.8584V51.7009C21.2037 55.7194 19.1454 57.4837 10.9122 57.4837H-5.77449e-05ZM9.0826 42.0301H10.7815C11.5983 42.0301 12.023 41.9321 12.023 41.344V38.1096C12.023 37.5215 11.5983 37.4235 10.7815 37.4235H9.0826V42.0301ZM9.0826 52.0929H10.9122C11.6963 52.0929 12.121 51.9949 12.121 51.4395V47.6169C12.121 47.0615 11.6963 46.9308 10.9122 46.9308H9.0826V52.0929ZM34.0995 32H43.1821V51.7335C43.1821 55.7194 41.0258 57.9411 32.6619 57.9411C24.3307 57.9411 22.1744 55.7194 22.1744 51.7335V32H31.257V51.4395C31.257 52.1256 31.6818 52.2236 32.6619 52.2236C33.6747 52.2236 34.0995 52.1256 34.0995 51.4395V32ZM54.6426 32C63.2025 32 65.3589 34.1236 65.3589 38.1096V51.4068C65.3589 55.3927 63.2025 57.4837 54.6426 57.4837H44.2531V32H54.6426ZM56.2762 38.4036C56.2762 37.7175 55.8515 37.6195 54.6426 37.6195H53.3358V51.8969H54.6426C55.8515 51.8969 56.2762 51.7989 56.2762 51.1128V38.4036ZM87.6336 41.4747H78.551V38.0769C78.551 37.3908 78.1262 37.2928 76.9174 37.2928C75.7412 37.2928 75.3165 37.3908 75.3165 38.0769V51.4395C75.3165 52.1256 75.7412 52.2236 77.0481 52.2236C78.3549 52.2236 78.7797 52.1256 78.7797 51.4395V48.009H76.9827V43.337H87.6336V51.7335C87.6336 55.7194 85.4773 57.9411 76.9174 57.9411C68.3902 57.9411 66.2338 55.7194 66.2338 51.7335V37.7828C66.2338 33.7969 68.3902 31.5753 76.9174 31.5753C85.4773 31.5753 87.6336 33.7969 87.6336 37.7828V41.4747ZM88.602 57.4837V32.0327H106.277V37.6195H97.6847V41.8668H105.624V47.0942H97.6847V51.8969H106.604V57.4837H88.602ZM126.129 32V37.6195H120.738V57.4837H111.656V37.6195H106.297V32H126.129Z"/></svg>
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

  lastData = data;

  let body;
  switch (route) {
    case '/transactions':
      body = renderTransactions(getTransactionsView(data, month), addingTx, txType, importRows, importLoading);
      break;
    case '/budget':
      body = renderBudget(getBudgetView(data, month, period));
      break;
    case '/goals':
      body = renderGoals(getGoalsView(data), addingGoal, addFundsId);
      break;
    case '/settings':
      body = renderSettings(data.categories, data.bank_accounts || [], addingCat, addingAcct, isAdmin, flash?.notice, flash?.problem, data.income_sources || [], addingIncome);
      flash = null;
      break;
    case '/':
    default:
      body = renderDashboard(getDashboard(data, month, period));
      break;
  }
  paint(route, body);
}

// run(doFn, makeUndoFn?)
//   doFn        — async action to perform
//   makeUndoFn  — optional fn(result) → async undo fn | null
async function run(fn, makeUndoFn = null) {
  try {
    const result = await fn();
    if (makeUndoFn) {
      const undoFn = makeUndoFn(result);
      if (undoFn) pushUndo(undoFn);
    }
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
    const params = {
      amount,
      description: String(fd.get('description') || '').trim(),
      categoryId: fd.get('categoryId') ? Number(fd.get('categoryId')) : null,
      type: fd.get('type') || 'expense',
      date: fd.get('date') || new Date().toISOString().slice(0, 10),
    };
    run(
      () => store.addTransaction(params),
      (result) => { const id = rowId(result); return id ? () => store.deleteTransaction(id) : null; }
    );
    addingTx = false;

  } else if (action === 'set-budget') {
    const limitInPeriod = Number(fd.get('limitAmount'));
    if (!limitInPeriod || limitInPeriod <= 0) { window.alert('Enter a valid limit.'); return; }
    const limitMonthly = toMonthly(limitInPeriod, period);
    const catId = Number(fd.get('categoryId'));
    const prevTarget = lastData?.budget_targets.find(b => b.category_id === catId && b.month === month);
    run(
      () => store.setBudgetTarget({ categoryId: catId, month, limitAmount: limitMonthly }),
      (result) => {
        if (prevTarget) {
          return () => store.setBudgetTarget({ categoryId: catId, month, limitAmount: prevTarget.limit_amount });
        }
        const id = rowId(result);
        return id ? () => store.deleteBudgetTarget(id) : null;
      }
    );

  } else if (action === 'add-goal') {
    const targetAmount = Number(fd.get('targetAmount'));
    if (!targetAmount || targetAmount <= 0) { window.alert('Enter a valid target amount.'); return; }
    const params = {
      name: String(fd.get('name') || '').trim(),
      targetAmount,
      color: fd.get('color') || '#8bffec',
    };
    run(
      () => store.addGoal(params),
      (result) => { const id = rowId(result); return id ? () => store.deleteGoal(id) : null; }
    );
    addingGoal = false;

  } else if (action === 'add-funds') {
    const delta = Number(fd.get('delta'));
    if (!delta) { window.alert('Enter an amount.'); return; }
    const goalId = Number(fd.get('goalId'));
    run(
      () => store.updateGoalAmount(goalId, delta),
      () => () => store.updateGoalAmount(goalId, -delta)
    );
    addFundsId = null;

  } else if (action === 'add-acct') {
    const name = String(fd.get('name') || '').trim();
    if (!name) { window.alert('Enter an account name.'); return; }
    const colors = String(fd.get('colors') || '#8bffec|#A855F7').split('|');
    const params = {
      name,
      balance: Number(fd.get('balance')) || 0,
      color1: colors[0] || '#8bffec',
      color2: colors[1] || '#A855F7',
      target: fd.get('target') ? Number(fd.get('target')) : null,
    };
    run(
      () => store.addAccount(params),
      (result) => { const id = rowId(result); return id ? () => store.deleteAccount(id) : null; }
    );
    addingAcct = false;

  } else if (action === 'update-acct-balance') {
    const acctId = Number(fd.get('acctId'));
    const newBalance = Number(fd.get('balance'));
    const prevAcct = lastData?.bank_accounts?.find(a => a.id === acctId);
    run(
      () => store.updateAccountBalance(acctId, newBalance),
      () => prevAcct != null ? () => store.updateAccountBalance(acctId, prevAcct.balance) : null
    );

  } else if (action === 'add-cat') {
    const name = String(fd.get('name') || '').trim();
    if (!name) { window.alert('Enter a category name.'); return; }
    const params = {
      name,
      color: fd.get('color') || '#A855F7',
      icon: String(fd.get('icon') || '').trim() || '💰',
      type: fd.get('type') || 'expense',
    };
    run(
      () => store.addCategory(params),
      (result) => { const id = rowId(result); return id ? () => store.deleteCategory(id) : null; }
    );
    addingCat = false;

  } else if (action === 'add-income') {
    const name = String(fd.get('name') || '').trim();
    if (!name) { window.alert('Enter an income source name.'); return; }
    const amount = Number(fd.get('amount'));
    if (!amount || amount <= 0) { window.alert('Enter a valid amount.'); return; }
    const params = {
      name,
      person:    String(fd.get('person') || '').trim(),
      amount,
      frequency: fd.get('frequency') || 'fortnightly',
      color:     fd.get('color') || '#8bffec',
    };
    run(
      () => store.addIncomeSource(params),
      (result) => { const id = rowId(result); return id ? () => store.deleteIncomeSource(id) : null; }
    );
    addingIncome = false;

  } else if (action === 'confirm-import') {
    // handled via click delegation below
    return;

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
    const id = Number(el.dataset.id);
    const tx = lastData?.transactions?.find(t => t.id === id);
    run(
      () => store.deleteTransaction(id),
      () => tx ? () => store.addTransaction({ amount: tx.amount, description: tx.description, categoryId: tx.category_id, type: tx.type, date: tx.date }) : null
    );

  } else if (action === 'del-budget') {
    if (!window.confirm('Remove this budget limit?')) return;
    const id = Number(el.dataset.id);
    const target = lastData?.budget_targets?.find(b => b.id === id);
    run(
      () => store.deleteBudgetTarget(id),
      () => target ? () => store.setBudgetTarget({ categoryId: target.category_id, month: target.month, limitAmount: target.limit_amount }) : null
    );

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
    const id = Number(el.dataset.id);
    const goal = lastData?.savings_goals?.find(g => g.id === id);
    run(
      () => store.deleteGoal(id),
      () => goal ? () => store.addGoal({ name: goal.name, targetAmount: goal.target_amount, color: goal.color }) : null
    );

  } else if (action === 'toggle-add-acct') {
    addingAcct = true;
    render();

  } else if (action === 'cancel-add-acct') {
    addingAcct = false;
    render();

  } else if (action === 'del-acct') {
    if (!window.confirm('Delete this account?')) return;
    const id = Number(el.dataset.id);
    const acct = lastData?.bank_accounts?.find(a => a.id === id);
    run(
      () => store.deleteAccount(id),
      () => acct ? () => store.addAccount({ name: acct.name, balance: acct.balance, color1: acct.color1, color2: acct.color2, target: acct.target }) : null
    );

  } else if (action === 'toggle-add-cat') {
    addingCat = true;
    render();

  } else if (action === 'cancel-add-cat') {
    addingCat = false;
    render();

  } else if (action === 'del-cat') {
    if (!window.confirm('Delete this category? Existing transactions will become uncategorised.')) return;
    const id = Number(el.dataset.id);
    const cat = lastData?.categories?.find(c => c.id === id);
    run(
      () => store.deleteCategory(id),
      () => cat ? () => store.addCategory({ name: cat.name, color: cat.color, icon: cat.icon, type: cat.type }) : null
    );

  } else if (action === 'clear-all') {
    if (!window.confirm('Delete ALL transactions and budget targets? This cannot be undone.')) return;
    run(async () => { await store.clearAllTransactions(); flash = { notice: 'All transactions cleared.' }; });

  } else if (action === 'set-period') {
    period = el.dataset.period;
    localStorage.setItem('budget_period', period);
    render();

  } else if (action === 'toggle-add-income') {
    addingIncome = true;
    render();

  } else if (action === 'cancel-add-income') {
    addingIncome = false;
    render();

  } else if (action === 'del-income') {
    if (!window.confirm('Remove this income source?')) return;
    const id = Number(el.dataset.id);
    const src = lastData?.income_sources?.find(s => s.id === id);
    run(
      () => store.deleteIncomeSource(id),
      () => src ? () => store.addIncomeSource({ name: src.name, person: src.person, amount: src.amount, frequency: src.frequency, color: src.color }) : null
    );

  } else if (action === 'cancel-import') {
    importRows = null;
    render();

  } else if (action === 'confirm-import') {
    const rows = (importRows || []).filter(r => r.include);
    if (!rows.length) return;
    importRows = null;
    run(
      async () => {
        const ids = [];
        for (const r of rows) {
          const result = await store.addTransaction({ amount: r.amount, description: r.description, categoryId: r.categoryId, type: r.type, date: r.date });
          const id = rowId(result);
          if (id) ids.push(id);
        }
        return ids;
      },
      (ids) => ids?.length
        ? () => Promise.all(ids.map(id => store.deleteTransaction(id)))
        : null
    );
  }
});

// ── Change events (file input, per-row import controls) ───────
root.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'import-csv') {
    const file = el.files && el.files[0];
    if (!file) return;
    el.value = ''; // allow re-selecting same file

    const isCSV = file.type === 'text/csv' || file.type === 'text/plain' || file.name.endsWith('.csv') || file.name.endsWith('.txt');

    if (isCSV) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rows = processCSV(ev.target.result, lastData?.categories || []);
        if (!rows) { window.alert('Could not parse this CSV — make sure it has Date, Amount and Description columns.'); return; }
        importRows = rows;
        render();
      };
      reader.readAsText(file);
    } else {
      // Image or PDF — send to Supabase Edge Function for AI parsing
      importLoading = true;
      render();
      processFile(file, lastData?.categories || [])
        .then(rows => {
          importLoading = false;
          if (!rows) { window.alert('No transactions found in this document. Try a clearer image or a digital (not scanned) PDF.'); render(); return; }
          importRows = rows;
          render();
        })
        .catch(err => {
          importLoading = false;
          window.alert('Could not parse document: ' + err.message);
          render();
        });
    }

  } else if (action === 'set-import-cat' && importRows) {
    const idx = Number(el.dataset.idx);
    if (importRows[idx]) { importRows[idx].categoryId = Number(el.value); }

  } else if (action === 'toggle-import-row' && importRows) {
    const idx = Number(el.dataset.idx);
    if (importRows[idx]) { importRows[idx].include = el.checked; render(); }
  }
});

window.addEventListener('hashchange', () => {
  document.body.classList.remove('nav-open');
  addingTx     = false;
  addingGoal   = false;
  addFundsId   = null;
  addingCat    = false;
  addingAcct   = false;
  addingIncome = false;
  importRows    = null;
  importLoading = false;
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
