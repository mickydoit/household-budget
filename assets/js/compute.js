// Pure data transforms — no side-effects, no DOM.

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function prevMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nextMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonth(m) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('default', { day: 'numeric', month: 'short' });
}

export function getDashboard(data, month) {
  const catMap = Object.fromEntries(data.categories.map(c => [c.id, c]));
  const txns = data.transactions.filter(t => t.date.startsWith(month));
  const income   = txns.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expenses = txns.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  const spentByCat = {};
  for (const t of txns.filter(t => t.type === 'expense')) {
    spentByCat[t.category_id] = (spentByCat[t.category_id] || 0) + Number(t.amount);
  }

  const spendBreakdown = Object.entries(spentByCat)
    .map(([id, amount]) => ({
      category: catMap[id] || { id: 0, name: 'Uncategorised', color: '#888', icon: '?' },
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const targets = data.budget_targets.filter(b => b.month === month);
  const budgetRows = targets
    .map(t => ({ ...t, spent: spentByCat[t.category_id] || 0, category: catMap[t.category_id] || null }))
    .filter(r => r.category)
    .sort((a, b) => b.limit_amount - a.limit_amount);

  const recent = [...data.transactions]
    .filter(t => t.date.startsWith(month))
    .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)
    .slice(0, 5)
    .map(t => ({ ...t, category: catMap[t.category_id] || null }));

  const accounts = (data.bank_accounts || []).map(a => ({
    ...a,
    pct: a.target ? Math.min(1, Number(a.balance) / Number(a.target)) : 1,
  }));

  return { income, expenses, balance: income - expenses, spendBreakdown, budgetRows, recent, month, accounts };
}

export function getTransactionsView(data, month) {
  const catMap = Object.fromEntries(data.categories.map(c => [c.id, c]));
  const transactions = [...data.transactions]
    .filter(t => t.date.startsWith(month))
    .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)
    .map(t => ({ ...t, category: catMap[t.category_id] || null }));
  return { transactions, categories: data.categories, month };
}

export function getBudgetView(data, month) {
  const catMap = Object.fromEntries(data.categories.map(c => [c.id, c]));
  const txns = data.transactions.filter(t => t.date.startsWith(month) && t.type === 'expense');

  const spentByCat = {};
  for (const t of txns) spentByCat[t.category_id] = (spentByCat[t.category_id] || 0) + Number(t.amount);

  const targetMap = Object.fromEntries(
    data.budget_targets.filter(b => b.month === month).map(b => [b.category_id, b])
  );

  const rows = data.categories
    .filter(c => c.type === 'expense')
    .map(c => ({ category: c, target: targetMap[c.id] || null, spent: spentByCat[c.id] || 0 }))
    .sort((a, b) => (b.target ? Number(b.target.limit_amount) : 0) - (a.target ? Number(a.target.limit_amount) : 0) || b.spent - a.spent);

  return { rows, month };
}

export function getGoalsView(data) {
  return data.savings_goals
    .map(g => ({
      ...g,
      progress: Number(g.target_amount) > 0
        ? Math.min(1, Number(g.current_amount) / Number(g.target_amount))
        : 0,
    }))
    .sort((a, b) => b.progress - a.progress);
}
