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

// ── PDF — client-side extraction via PDF.js (no API key needed) ──

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
let _pdfjsPromise = null;

function loadPDFJS() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!_pdfjsPromise) {
    _pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${PDFJS_CDN}/pdf.min.js`;
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error('Could not load PDF.js'));
      document.head.appendChild(s);
    });
  }
  return _pdfjsPromise;
}

async function extractPDFLines(file) {
  const pdfjs = await loadPDFJS();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const lines = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Group text items by Y coordinate (± 2pt = same line)
    const rows = {};
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!rows[y]) rows[y] = [];
      rows[y].push({ x: item.transform[4], str: item.str });
    }

    // Reconstruct lines: sort rows top-to-bottom, items left-to-right
    Object.keys(rows)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach(y => {
        const line = rows[y]
          .sort((a, b) => a.x - b.x)
          .map(i => i.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (line) lines.push(line);
      });
  }
  return lines;
}

// Captures optional leading minus + optional $ + amount + optional CR/DR suffix
const AMT_RE  = /-?\$?\d{1,3}(?:,\d{3})*\.\d{2}(?:\s*(?:CR|DR))?/gi;
const DATE_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/i;

// ── Shared helper: resolve type + category for any row ────────
// Priority: CR/DR suffix > amount sign > keyword-matched category type > default
// Always returns a non-null categoryId by falling back to the first
// category of the correct type.
function resolveRow(desc, rawAmt, rawStr, categories) {
  let type;
  if (/\bCR\b/i.test(rawStr))      type = 'income';
  else if (/\bDR\b/i.test(rawStr)) type = 'expense';
  else if (rawAmt < 0)             type = 'expense';
  else                             type = 'expense'; // positive with no suffix — refine below

  // Keyword match — if the matched category has a definitive type, trust it.
  // e.g. "SALARY CREDIT" → Salary (income) overrides the default 'expense'.
  const catId  = categorise(desc, categories);
  const catObj = catId ? categories.find(c => c.id === catId) : null;
  if (catObj) type = catObj.type;

  // Fallback category so categoryId is never null
  const fallback = categories.find(c => c.type === type);

  return { type, categoryId: catId || fallback?.id || null };
}

function parsePDFLines(lines, categories) {
  const results = [];
  const HEADER_RE = /\b(date|description|narrative|transaction|debit|credit|balance|amount|opening|closing|statement|account)\b/i;

  for (const line of lines) {
    const dateM = line.match(DATE_RE);
    if (!dateM) continue;

    const date = parseDate(dateM[0]);
    if (!date) continue;

    // Skip header rows (contain keywords but no real amount)
    if (HEADER_RE.test(line) && !/\d{1,3},\d{3}|\d+\.\d{2}/.test(line.replace(dateM[0], ''))) continue;

    const amtMatches = [...line.matchAll(AMT_RE)];
    if (!amtMatches.length) continue;

    // ≥2 amounts: last is usually running balance, second-to-last is transaction.
    // 1 amount: use it directly.
    const txMatch = amtMatches.length >= 2
      ? amtMatches[amtMatches.length - 2]
      : amtMatches[0];

    const raw    = txMatch[0];
    const rawAmt = parseAmount(raw);
    if (!rawAmt) continue;
    const amount = Math.abs(rawAmt);
    if (amount < 0.01) continue;

    // Description: text between date and first amount
    const dateEnd  = (dateM.index ?? 0) + dateM[0].length;
    const firstAmt = amtMatches[0].index ?? line.length;
    let desc = line.slice(dateEnd, firstAmt).replace(/\s+/g, ' ').trim();
    if (!desc || desc.length < 2) {
      desc = line.slice(dateEnd).replace(AMT_RE, '').replace(/\s+/g, ' ').trim();
    }
    if (!desc || desc.length < 2) continue;

    const { type, categoryId } = resolveRow(desc, rawAmt, raw, categories);

    results.push({ date, description: desc, amount, type, categoryId, include: true });
  }
  return results.length ? results : null;
}

export async function processPDF(file, categories) {
  const lines = await extractPDFLines(file);
  return parsePDFLines(lines, categories);
}

// ── Images via Supabase Edge Function (requires ANTHROPIC_API_KEY) ──

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function processImage(file, categories) {
  const cfg = (typeof window !== 'undefined' && window.BUDGET_CONFIG) || {};
  const supabaseUrl = cfg.SUPABASE_URL;
  const supabaseKey = cfg.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Image import requires Supabase to be configured in config.js.');
  }

  const base64   = await fileToBase64(file);
  const mediaType = file.type || 'image/jpeg';

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
    .map(r => {
      const desc   = String(r.description || '');
      const rawAmt = Number(r.amount) || 0;
      // Claude returns a type hint — use it as the initial guess for resolveRow
      // by passing a fake rawStr that carries the right CR/DR marker.
      const rawStr = r.type === 'income' ? 'CR' : 'DR';
      const { type, categoryId } = resolveRow(desc, rawAmt, rawStr, categories);
      return { date: String(r.date || ''), description: desc, amount: Math.abs(rawAmt), type, categoryId, include: true };
    })
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

    // resolveRow may override type if keyword matches a category of opposite type
    const resolved = resolveRow(desc, type === 'income' ? amount : -amount, '', categories);

    result.push({ date, description: desc, amount, type: resolved.type, categoryId: resolved.categoryId, include: true });
  }

  return result.length ? result : null;
}
