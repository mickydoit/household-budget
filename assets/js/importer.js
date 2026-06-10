// CSV import — parse bank exports and auto-categorise transactions.

// ── CSV parsing ───────────────────────────────────────────────

function parseCSVRow(line) {
  const cells = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      cells.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;

  // Find header row — first line with ≥ 2 non-empty cells
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cells = parseCSVRow(lines[i]);
    if (cells.filter(Boolean).length >= 2) { headerIdx = i; break; }
  }

  const headers = parseCSVRow(lines[headerIdx]).map(h => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim());
  const rows = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = parseCSVRow(lines[i]);
    if (!vals.some(Boolean)) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] || ''; });
    rows.push(obj);
  }

  return { headers, rows };
}

// ── Column detection ──────────────────────────────────────────

function colIdx(headers, ...keywords) {
  return headers.findIndex(h => keywords.some(k => h.includes(k)));
}

export function detectColumns(headers) {
  return {
    dateCol:   colIdx(headers, 'date', 'transaction date', 'posted date', 'value date'),
    descCol:   colIdx(headers, 'description', 'narrative', 'details', 'merchant', 'memo', 'particulars', 'reference', 'narration'),
    amtCol:    colIdx(headers, 'amount', ' amt'),
    debitCol:  colIdx(headers, 'debit', 'withdrawal', 'dr '),
    creditCol: colIdx(headers, 'credit', 'deposit', 'cr '),
  };
}

// ── Date parsing ──────────────────────────────────────────────

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

export function parseDate(str) {
  if (!str) return null;
  str = str.trim();

  // YYYY-MM-DD
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;

  // DD/MM/YYYY or DD-MM-YYYY
  m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

  // D MMM YYYY  or  DD MMM YYYY
  m = str.match(/^(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }

  // MMM DD YYYY
  m = str.match(/^([a-zA-Z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }

  return null;
}

// ── Amount parsing ────────────────────────────────────────────

export function parseAmount(str) {
  if (str == null || str === '') return null;
  // Handle (1234.56) → -1234.56
  const neg = /^\(/.test(str.trim());
  const n = parseFloat(str.replace(/[^0-9.\-]/g, ''));
  if (isNaN(n)) return null;
  return neg ? -Math.abs(n) : n;
}

// ── Auto-categorisation ───────────────────────────────────────

// keyword (lowercase substring) → category name to match against
const KEYWORD_MAP = [
  // Groceries
  ['woolworths', 'Groceries'],
  ['coles', 'Groceries'],
  [' aldi ', 'Groceries'],
  ['aldi store', 'Groceries'],
  ['iga ', 'Groceries'],
  ['foodworks', 'Groceries'],
  ['costco', 'Groceries'],
  ['harris farm', 'Groceries'],
  ['fresh food', 'Groceries'],

  // Fuel
  ['bp ', 'Fuel'],
  ['shell', 'Fuel'],
  ['caltex', 'Fuel'],
  ['ampol', 'Fuel'],
  ['7-eleven', 'Fuel'],
  ['puma energy', 'Fuel'],
  ['metro petroleum', 'Fuel'],
  ['united petrol', 'Fuel'],
  ['petrol', 'Fuel'],

  // Eating out
  ['mcdonald', 'Eating out'],
  ['macca', 'Eating out'],
  ['kfc', 'Eating out'],
  ['subway', 'Eating out'],
  ['hungry jack', 'Eating out'],
  ['domino', 'Eating out'],
  ['pizza hut', 'Eating out'],
  ['nandos', 'Eating out'],
  ['oporto', 'Eating out'],
  ['grill', 'Eating out'],
  ['uber eat', 'Eating out'],
  ['doordash', 'Eating out'],
  ['menulog', 'Eating out'],
  ['deliveroo', 'Eating out'],
  ['cafe', 'Eating out'],
  ['restaurant', 'Eating out'],
  ['thai', 'Eating out'],
  ['sushi', 'Eating out'],
  ['indian', 'Eating out'],

  // Electricity
  ['origin energy', 'Electricity'],
  ['agl ', 'Electricity'],
  ['ergon energy', 'Electricity'],
  ['energex', 'Electricity'],
  ['energy australia', 'Electricity'],
  ['simply energy', 'Electricity'],
  ['electricity', 'Electricity'],

  // Phone
  ['telstra mobile', 'Phone'],
  ['optus mobile', 'Phone'],
  ['amaysim', 'Phone'],
  ['boost mobile', 'Phone'],
  ['kogan mobile', 'Phone'],
  ['vodafone', 'Phone'],
  ['belong mobile', 'Phone'],

  // Internet
  ['aussie broadband', 'Internet'],
  ['tpg ', 'Internet'],
  ['internode', 'Internet'],
  ['iinet', 'Internet'],
  ['telstra internet', 'Internet'],
  ['optus internet', 'Internet'],
  ['broadband', 'Internet'],
  ['nbn', 'Internet'],

  // Spotify
  ['spotify', 'Spotify'],

  // Adobe
  ['adobe', 'Adobe'],

  // Entertainment / streaming
  ['netflix', 'Entertainment'],
  ['stan.com', 'Entertainment'],
  ['disney plus', 'Entertainment'],
  ['binge ', 'Entertainment'],
  ['prime video', 'Entertainment'],
  ['hulu', 'Entertainment'],
  ['foxtel', 'Entertainment'],
  ['hoyts', 'Entertainment'],
  ['village cinema', 'Entertainment'],
  ['event cinema', 'Entertainment'],

  // Transport
  ['uber ', 'Transport'],
  ['ola ', 'Transport'],
  ['didi ', 'Transport'],
  ['translink', 'Transport'],
  ['go card', 'Transport'],
  ['opal ', 'Transport'],
  ['myki ', 'Transport'],
  ['metro train', 'Transport'],
  ['queensland rail', 'Transport'],

  // Gym
  ['anytime fitness', 'Gym'],
  ['goodlife', 'Gym'],
  ['f45', 'Gym'],
  ['planet fitness', 'Gym'],
  ['snap fitness', 'Gym'],
  ['fitness first', 'Gym'],

  // Health
  ['chemist warehouse', 'Health'],
  ['priceline', 'Health'],
  ['pharmacy', 'Health'],
  ['chemist', 'Health'],
  ['medical centre', 'Health'],
  ['doctor', 'Health'],
  ['bulk bill', 'Health'],
  ['pathology', 'Health'],
  ['radiology', 'Health'],
  ['dentist', 'Health'],
  ['physio', 'Health'],
  ['medicare', 'Health'],

  // Rent
  ['rent', 'Rent'],
  ['real estate', 'Rent'],
  ['property mgmt', 'Rent'],

  // Scouts
  ['scouts', 'Scouts Food'],
  ['scouting', 'Scouts Food'],

  // Income
  ['salary', 'Salary'],
  ['payroll', 'Salary'],
  ['pay credit', 'Salary'],
  ['wages', 'Salary'],

  // Phone (generic)
  ['apple.com/bill', 'Phone'],
  ['google play', 'Entertainment'],
  ['steam ', 'Entertainment'],

  // Water
  ['urban utilities', 'Water'],
  ['unitywater', 'Water'],
  ['sydney water', 'Water'],
  ['yarra valley water', 'Water'],
  ['water corp', 'Water'],
  ['water billing', 'Water'],

  // Car
  ['car service', 'Car Service'],
  ['mechanic', 'Car Service'],
  ['tyrepower', 'Car Service'],
  ['bridgestone', 'Car Service'],
  ['ultratune', 'Car Service'],
  ['supercheap', 'Car Service'],
  ['repco', 'Car Service'],
  ['rego', 'Rego'],
  ['transport dept', 'Rego'],
  ['department of transport', 'Rego'],
];

export function categorise(description, categories) {
  const lower = (' ' + description.toLowerCase() + ' ').replace(/[^a-z0-9 ]/g, ' ');
  for (const [keyword, catName] of KEYWORD_MAP) {
    if (lower.includes(keyword)) {
      const cat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
      if (cat) return cat.id;
    }
  }
  return null;
}

// ── Image / PDF via Supabase Edge Function ────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function processFile(file, categories) {
  const cfg = (typeof window !== 'undefined' && window.BUDGET_CONFIG) || {};
  const supabaseUrl = cfg.SUPABASE_URL;
  const supabaseKey = cfg.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Image/PDF import requires Supabase to be configured in config.js.');
  }

  const [base64, mediaType] = await Promise.all([
    fileToBase64(file),
    Promise.resolve(file.type || 'application/octet-stream'),
  ]);

  const res = await fetch(`${supabaseUrl}/functions/v1/parse-statement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ fileData: base64, mediaType }),
  });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Parse failed (${res.status})`);
  if (!data.rows?.length) return null;

  return data.rows
    .map(r => ({
      date:        String(r.date || ''),
      description: String(r.description || ''),
      amount:      Math.abs(Number(r.amount)) || 0,
      type:        r.type === 'income' ? 'income' : 'expense',
      categoryId:  categorise(String(r.description || ''), categories),
      include:     true,
    }))
    .filter(r => r.amount > 0 && r.date);
}

// ── Main entry point (CSV) ────────────────────────────────────

export function processCSV(text, categories) {
  const parsed = parseCSV(text);
  if (!parsed) return null;

  const { headers, rows } = parsed;
  const cols = detectColumns(headers);

  if (cols.dateCol === -1 && cols.descCol === -1) return null;

  const result = [];

  for (const row of rows) {
    const vals = Object.values(row);
    const get = idx => (idx >= 0 ? vals[idx] : '') || '';

    const dateStr = get(cols.dateCol);
    const date = parseDate(dateStr);
    if (!date) continue;

    const desc = get(cols.descCol) || '';

    let amount = null;
    let type = 'expense';

    if (cols.amtCol >= 0) {
      amount = parseAmount(get(cols.amtCol));
      if (amount === null) continue;
      if (amount >= 0) type = 'income';
      amount = Math.abs(amount);
    } else if (cols.debitCol >= 0 || cols.creditCol >= 0) {
      const debit  = parseAmount(get(cols.debitCol));
      const credit = parseAmount(get(cols.creditCol));
      if (credit && credit > 0)      { amount = credit; type = 'income';  }
      else if (debit && debit > 0)   { amount = debit;  type = 'expense'; }
      else continue;
    } else {
      continue;
    }

    if (!amount || amount <= 0) continue;

    const catId = categorise(desc, categories) || (type === 'income' ? categories.find(c => c.type === 'income')?.id : categories.find(c => c.type === 'expense')?.id) || null;

    result.push({ date, description: desc, amount, type, categoryId: catId, include: true });
  }

  return result.length ? result : null;
}
