// Tiny dependency-free Supabase (PostgREST) client.
// Uses the public anon key — safe to embed in a browser app. No build step.

const cfg = (typeof window !== 'undefined' && window.BUDGET_CONFIG) || {};
const URL_BASE = cfg.SUPABASE_URL ? cfg.SUPABASE_URL.replace(/\/+$/, '') : '';
const KEY = cfg.SUPABASE_ANON_KEY || '';

export const supabaseEnabled = Boolean(URL_BASE && KEY);

const REST = `${URL_BASE}/rest/v1`;
function headers(extra = {}) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function handle(res) {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function sbSelect(table, query = 'select=*') {
  const res = await fetch(`${REST}/${table}?${query}`, { headers: headers() });
  return handle(res);
}

export async function sbInsert(table, rows) {
  const res = await fetch(`${REST}/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(rows),
  });
  return handle(res);
}

export async function sbUpsert(table, rows, onConflict) {
  const q = onConflict ? `?on_conflict=${onConflict}` : '';
  const res = await fetch(`${REST}/${table}${q}`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(rows),
  });
  return handle(res);
}

export async function sbUpdate(table, filter, patch) {
  const res = await fetch(`${REST}/${table}?${filter}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  return handle(res);
}

export async function sbDelete(table, filter) {
  const res = await fetch(`${REST}/${table}?${filter}`, {
    method: 'DELETE',
    headers: headers({ Prefer: 'return=minimal' }),
  });
  return handle(res);
}
