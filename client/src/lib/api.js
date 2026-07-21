const BASE = '';

export async function fetchCurrent() {
  const res = await fetch(`${BASE}/api/current`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchHistory(days = 252) {
  const params = new URLSearchParams({ days: String(days) });
  const res = await fetch(`${BASE}/api/history?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchHYHistory(days = 252) {
  const params = new URLSearchParams({ days: String(days) });
  const res = await fetch(`${BASE}/api/hy-history?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchQuotes() {
  const res = await fetch(`${BASE}/api/quotes`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchCalendar() {
  const res = await fetch(`${BASE}/api/calendar`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchBriefing() {
  const res = await fetch(`${BASE}/api/briefing`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fmtOptionsDash(symbol) {
  const params = new URLSearchParams({ symbol: String(symbol || '').toUpperCase() });
  const res = await fetch(`${BASE}/api/options-dash?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function importIvHistory(symbol, csvText) {
  const params = new URLSearchParams({ symbol: String(symbol || '').toUpperCase() });
  const res = await fetch(`${BASE}/api/iv-import?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csvText,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

export async function fetchOptions() {
  const res = await fetch(`${BASE}/api/options`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchCot() {
  const res = await fetch(`${BASE}/api/cot`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchEcbCurve() {
  const res = await fetch(`${BASE}/api/ecb-curve`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchCrypto() {
  const res = await fetch(`${BASE}/api/crypto`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchEarnings() {
  const res = await fetch(`${BASE}/api/earnings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchNews() {
  const res = await fetch(`${BASE}/api/news`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTrending(refresh = false) {
  const res = await fetch(`${BASE}/api/trending${refresh ? '?refresh=1' : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSpace() {
  const res = await fetch(`${BASE}/api/space`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchBacktest(strategy, refresh = false) {
  const res = await fetch(`${BASE}/api/backtest?strategy=${encodeURIComponent(strategy)}${refresh ? '&refresh=1' : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function refreshData() {
  const res = await fetch(`${BASE}/api/refresh`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
