// Data layer — dual backend: Supabase (shared) or localStorage (solo/test).
// Both expose the same interface so the app doesn't care which is live.

import { supabaseEnabled, sbSelect, sbInsert, sbUpsert, sbUpdate, sbDelete } from './supabase.js?v=13';

const DEFAULT_INCOME_SOURCES = [
  { id: 1, name: 'Full Life Psychology', person: 'Bek',     amount: 1500, frequency: 'fortnightly', color: '#8bffec' },
  { id: 2, name: 'Queensland Health',    person: 'Bek',     amount: 1313, frequency: 'fortnightly', color: '#4d7cff' },
  { id: 3, name: 'CV Global',           person: 'Michael', amount: 1978, frequency: 'fortnightly', color: '#A855F7' },
];

const DEFAULT_ACCOUNTS = [
  { id: 1, name: 'Cheque',  balance: 0, color1: '#8bffec', color2: '#4d7cff', target: null },
  { id: 2, name: 'Savings', balance: 0, color1: '#A855F7', color2: '#4d7cff', target: null },
];

const DEFAULT_CATEGORIES = [
  { id: 1,  name: 'Salary',           color: '#8bffec', icon: '💼', type: 'income'  },
  { id: 2,  name: 'Freelance',        color: '#4d7cff', icon: '💻', type: 'income'  },
  { id: 3,  name: 'Groceries',        color: '#f4ff7b', icon: '🛒', type: 'expense' },
  { id: 4,  name: 'Eating out',       color: '#ff4b2b', icon: '🍽', type: 'expense' },
  { id: 5,  name: 'Transport',        color: '#A855F7', icon: '🚗', type: 'expense' },
  { id: 6,  name: 'Utilities',        color: '#4d7cff', icon: '💡', type: 'expense' },
  { id: 7,  name: 'Entertainment',    color: '#ff4b2b', icon: '🎬', type: 'expense' },
  { id: 8,  name: 'Health',           color: '#8bffec', icon: '🏥', type: 'expense' },
  { id: 9,  name: 'Clothing',         color: '#f4ff7b', icon: '👕', type: 'expense' },
  { id: 10, name: 'Other',            color: '#888888', icon: '📦', type: 'expense' },
  { id: 11, name: 'Rent',             color: '#ff6b35', icon: '🏠', type: 'expense' },
  { id: 12, name: 'Water',            color: '#4d7cff', icon: '💧', type: 'expense' },
  { id: 13, name: 'Electricity',      color: '#f4ff7b', icon: '⚡', type: 'expense' },
  { id: 14, name: 'Internet',         color: '#8bffec', icon: '🌐', type: 'expense' },
  { id: 15, name: 'Car Service',      color: '#A855F7', icon: '🔧', type: 'expense' },
  { id: 16, name: 'Rego',             color: '#ff6b35', icon: '🚘', type: 'expense' },
  { id: 17, name: 'Scouts Food',      color: '#f4ff7b', icon: '🍱', type: 'expense' },
  { id: 18, name: 'Spotify',          color: '#22c55e', icon: '🎵', type: 'expense' },
  { id: 19, name: 'Phone',            color: '#4d7cff', icon: '📱', type: 'expense' },
  { id: 20, name: 'Fuel',             color: '#ff6b35', icon: '⛽', type: 'expense' },
  { id: 21, name: 'Spend',            color: '#888888', icon: '💳', type: 'expense' },
  { id: 22, name: 'Adobe',            color: '#ff4b2b', icon: '🎨', type: 'expense' },
  { id: 23, name: 'Gym',              color: '#22c55e', icon: '💪', type: 'expense' },
  { id: 24, name: 'Doctor Visits',    color: '#8bffec', icon: '🏥', type: 'expense' },
  { id: 25, name: 'Scouts Insurance', color: '#4d7cff', icon: '🛡', type: 'expense' },
  { id: 26, name: 'Emergency Fund',   color: '#f4ff7b', icon: '🐷', type: 'expense' },
];

// ============================================================
//  localStorage backend
// ============================================================
const LS_KEY = 'budget_state_v1';

function freshLocalState() {
  return {
    bank_accounts:   DEFAULT_ACCOUNTS.map(a => ({ ...a })),
    categories:      DEFAULT_CATEGORIES.map(c => ({ ...c })),
    transactions:    [],
    budget_targets:  [],
    savings_goals:   [],
    income_sources:  DEFAULT_INCOME_SOURCES.map(s => ({ ...s })),
    nextTxId:        1,
    nextTargetId:    1,
    nextGoalId:      1,
    nextCatId:       DEFAULT_CATEGORIES.length + 1,
    nextAcctId:      DEFAULT_ACCOUNTS.length + 1,
    nextIncomeId:    DEFAULT_INCOME_SOURCES.length + 1,
  };
}

function lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const s = freshLocalState();
  localStorage.setItem(LS_KEY, JSON.stringify(s));
  return s;
}

function lsSave(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

const localBackend = {
  mode: 'local',
  async loadAll() {
    const s = lsLoad();
    return {
      bank_accounts:  s.bank_accounts  || DEFAULT_ACCOUNTS.map(a => ({ ...a })),
      categories:     s.categories,
      transactions:   s.transactions,
      budget_targets: s.budget_targets,
      savings_goals:  s.savings_goals,
      income_sources: s.income_sources || DEFAULT_INCOME_SOURCES.map(x => ({ ...x })),
    };
  },
  async addTransaction({ amount, description, categoryId, type, date }) {
    const s = lsLoad();
    const row = { id: s.nextTxId++, amount: Number(amount), description: description || '', category_id: categoryId || null, type, date, created_at: new Date().toISOString() };
    s.transactions.push(row);
    lsSave(s);
    return [row];
  },
  async deleteTransaction(id) {
    const s = lsLoad();
    s.transactions = s.transactions.filter(t => t.id !== id);
    lsSave(s);
  },
  async setBudgetTarget({ categoryId, month, limitAmount }) {
    const s = lsLoad();
    const existing = s.budget_targets.find(b => b.category_id === categoryId && b.month === month);
    if (existing) {
      existing.limit_amount = Number(limitAmount);
      lsSave(s);
      return [existing];
    } else {
      const row = { id: s.nextTargetId++, category_id: categoryId, month, limit_amount: Number(limitAmount) };
      s.budget_targets.push(row);
      lsSave(s);
      return [row];
    }
  },
  async deleteBudgetTarget(id) {
    const s = lsLoad();
    s.budget_targets = s.budget_targets.filter(b => b.id !== id);
    lsSave(s);
  },
  async addGoal({ name, targetAmount, color }) {
    const s = lsLoad();
    const row = { id: s.nextGoalId++, name, target_amount: Number(targetAmount), current_amount: 0, color: color || '#8bffec', created_at: new Date().toISOString() };
    s.savings_goals.push(row);
    lsSave(s);
    return [row];
  },
  async updateGoalAmount(id, delta) {
    const s = lsLoad();
    const g = s.savings_goals.find(x => x.id === id);
    if (!g) throw new Error('Goal not found');
    g.current_amount = Math.max(0, Number(g.current_amount) + Number(delta));
    lsSave(s);
  },
  async deleteGoal(id) {
    const s = lsLoad();
    s.savings_goals = s.savings_goals.filter(g => g.id !== id);
    lsSave(s);
  },
  async addCategory({ name, color, icon, type }) {
    const s = lsLoad();
    const row = { id: s.nextCatId++, name, color: color || '#A855F7', icon: icon || '💰', type };
    s.categories.push(row);
    lsSave(s);
    return [row];
  },
  async deleteCategory(id) {
    const s = lsLoad();
    s.categories = s.categories.filter(c => c.id !== id);
    lsSave(s);
  },
  async addAccount({ name, balance, color1, color2, target }) {
    const s = lsLoad();
    if (!s.bank_accounts) s.bank_accounts = [];
    if (!s.nextAcctId) s.nextAcctId = (s.bank_accounts.reduce((m, a) => Math.max(m, a.id), 0)) + 1;
    const row = { id: s.nextAcctId++, name, balance: Number(balance) || 0, color1: color1 || '#8bffec', color2: color2 || '#A855F7', target: target ? Number(target) : null };
    s.bank_accounts.push(row);
    lsSave(s);
    return [row];
  },
  async updateAccountBalance(id, balance) {
    const s = lsLoad();
    const a = (s.bank_accounts || []).find(x => x.id === id);
    if (!a) throw new Error('Account not found');
    a.balance = Number(balance);
    lsSave(s);
  },
  async deleteAccount(id) {
    const s = lsLoad();
    s.bank_accounts = (s.bank_accounts || []).filter(a => a.id !== id);
    lsSave(s);
  },
  async clearAllTransactions() {
    const s = lsLoad();
    s.transactions = [];
    s.budget_targets = [];
    s.nextTxId = 1;
    s.nextTargetId = 1;
    lsSave(s);
  },
  async addIncomeSource({ name, person, amount, frequency, color }) {
    const s = lsLoad();
    if (!s.income_sources) s.income_sources = DEFAULT_INCOME_SOURCES.map(x => ({ ...x }));
    if (!s.nextIncomeId) s.nextIncomeId = (s.income_sources.reduce((m, x) => Math.max(m, x.id), 0)) + 1;
    const row = { id: s.nextIncomeId++, name, person: person || '', amount: Number(amount), frequency: frequency || 'fortnightly', color: color || '#8bffec' };
    s.income_sources.push(row);
    lsSave(s);
    return [row];
  },
  async deleteIncomeSource(id) {
    const s = lsLoad();
    s.income_sources = (s.income_sources || []).filter(x => x.id !== id);
    lsSave(s);
  },
};

// ============================================================
//  Supabase backend
// ============================================================
const supabaseBackend = {
  mode: 'supabase',
  async loadAll() {
    const [bank_accounts, categories, transactions, budget_targets, savings_goals, income_sources] = await Promise.all([
      sbSelect('bank_accounts',  'select=*&order=created_at.asc'),
      sbSelect('categories',     'select=*&order=type.asc,id.asc'),
      sbSelect('transactions',   'select=*&order=date.desc,id.desc'),
      sbSelect('budget_targets', 'select=*'),
      sbSelect('savings_goals',  'select=*&order=created_at.asc'),
      sbSelect('income_sources', 'select=*&order=id.asc'),
    ]);
    return {
      bank_accounts:  bank_accounts  || [],
      categories:     categories     || [],
      transactions:   transactions   || [],
      budget_targets: budget_targets || [],
      savings_goals:  savings_goals  || [],
      income_sources: income_sources || [],
    };
  },
  async addTransaction({ amount, description, categoryId, type, date }) {
    return await sbInsert('transactions', { amount: Number(amount), description: description || '', category_id: categoryId || null, type, date });
  },
  async deleteTransaction(id) {
    await sbDelete('transactions', `id=eq.${id}`);
  },
  async setBudgetTarget({ categoryId, month, limitAmount }) {
    return await sbUpsert('budget_targets', { category_id: categoryId, month, limit_amount: Number(limitAmount) }, 'category_id,month');
  },
  async deleteBudgetTarget(id) {
    await sbDelete('budget_targets', `id=eq.${id}`);
  },
  async addGoal({ name, targetAmount, color }) {
    return await sbInsert('savings_goals', { name, target_amount: Number(targetAmount), current_amount: 0, color: color || '#8bffec' });
  },
  async updateGoalAmount(id, delta) {
    const rows = await sbSelect('savings_goals', `select=current_amount&id=eq.${id}`);
    const current = Number((rows && rows[0] && rows[0].current_amount) || 0);
    await sbUpdate('savings_goals', `id=eq.${id}`, { current_amount: Math.max(0, current + Number(delta)) });
  },
  async deleteGoal(id) {
    await sbDelete('savings_goals', `id=eq.${id}`);
  },
  async addCategory({ name, color, icon, type }) {
    return await sbInsert('categories', { name, color: color || '#A855F7', icon: icon || '💰', type });
  },
  async deleteCategory(id) {
    await sbDelete('categories', `id=eq.${id}`);
  },
  async addAccount({ name, balance, color1, color2, target }) {
    return await sbInsert('bank_accounts', { name, balance: Number(balance) || 0, color1: color1 || '#8bffec', color2: color2 || '#A855F7', target: target ? Number(target) : null });
  },
  async updateAccountBalance(id, balance) {
    await sbUpdate('bank_accounts', `id=eq.${id}`, { balance: Number(balance) });
  },
  async deleteAccount(id) {
    await sbDelete('bank_accounts', `id=eq.${id}`);
  },
  async clearAllTransactions() {
    await sbDelete('transactions',   'id=gt.0');
    await sbDelete('budget_targets', 'id=gt.0');
  },
  async addIncomeSource({ name, person, amount, frequency, color }) {
    return await sbInsert('income_sources', { name, person: person || '', amount: Number(amount), frequency: frequency || 'fortnightly', color: color || '#8bffec' });
  },
  async deleteIncomeSource(id) {
    await sbDelete('income_sources', `id=eq.${id}`);
  },
};

export const store = supabaseEnabled ? supabaseBackend : localBackend;
