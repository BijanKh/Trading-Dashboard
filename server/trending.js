// Trending scanner — "Setups Daytrading" (daily 12 EMA) and "Setups
// Swingtrading" (weekly 12 EMA) over the S&P 500 + Nasdaq-100 universe.
//
// Long setup: price above the 12 EMA and within 5% (daytrading) / 10%
// (swingtrading) of the TRUE all-time high. Short setup is the inverse
// (below the 12 EMA, near the 52-WEEK low — index members are never near
// their all-time low: survivorship ejects them first and ATLs are decades-
// old split-adjusted prices, so the closest S&P/NDX name sits +22% above
// its ATL) plus tradability floors: price >= $5 and avg dollar volume
// >= $20M, so the short list isn't delisting candidates. Ranked by closeness to the 12 EMA (the filter
// already guarantees the right side of it), so the tightest pullbacks —
// the actionable entries — come first. Distance to the 12 EMA is reported
// in ATR units — |dist| <= 1 ATR is flagged PULLBACK (the entry zone),
// > 2.5 ATR is EXTENDED. RS vs SPY (weighted 1/3/6-month excess return)
// is shown as context, not rank.
//
// "Strongest Trending" / "Weakest Trending": top/bottom 10 of the WHOLE
// universe by that RS momentum score (not just the near-ATH/low pools),
// filtered to price above (strongest) / below (weakest) the daily 12 EMA
// so they show active trends, not bounces. Weakest also applies the short
// tradability floors.
//
// Cost model: one batched quote() pass over ~560 symbols (4 chunks)
// supplies price / 52-week range / liquidity, and pre-filters the setup
// candidate pool (within X% of the ATH implies within X% of the 52w high).
// The sequential chart() pass (350ms gaps) then fetches ~420d of daily
// bars for EVERY symbol (EMA/ATR/returns — the momentum list needs the
// whole universe) plus full-listing weekly bars for pool candidates only
// (ATH + weekly EMA/ATR). ~770 calls, ~7 min, once a day: lazily when a
// request finds the scan > 20h old, and via cron after the US close.
// Result persists to data/trending.json so restarts don't rescan.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { yahooFinance, withTimeout, localDateParts, sameDate } from './yahoo.js';
import { getSp500Symbols } from './sp500.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISK_CACHE = path.join(__dirname, '..', 'data', 'trending.json');
const NDX_DISK_CACHE = path.join(__dirname, '..', 'data', 'ndx100.json');

const NDX_URL = 'https://en.wikipedia.org/wiki/Nasdaq-100';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const SCAN_TTL_MS = 20 * 60 * 60 * 1000;
const FORCE_MIN_GAP_MS = 10 * 60 * 1000;
const NDX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const QUOTE_CHUNK = 150;
const CHART_GAP_MS = 350;
const LONG_POOL_MAX = 200;
const SHORT_POOL_MAX = 150;

const DAY_BAND = 0.05;     // distance to ATH/ATL, daily timeframe
const SWING_BAND = 0.10;   // distance to ATH/ATL, weekly timeframe
const POOL_BAND = SWING_BAND + 0.005; // pre-filter buffer on the 52w range
const MIN_PRICE_SHORT = 5;
const MIN_DOLLAR_VOL_SHORT = 20e6;
const PULLBACK_ATR = 1.0;
const EXTENDED_ATR = 2.5;
const TOP_N = 10;

// ---------- Nasdaq-100 constituents (Wikipedia, 7d cache + disk fallback) ----------

const ndxCache = { symbols: null, fetchedAt: 0 };

async function fetchNdxFromWiki() {
  const res = await fetch(NDX_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const html = await res.text();
  // Components table (id="constituents"): ticker cells are plain <td>SYM</td>
  const start = html.indexOf('id="constituents"');
  if (start === -1) throw new Error('constituents table not found');
  const end = html.indexOf('</table>', start);
  const section = html.slice(start, end === -1 ? undefined : end);
  const found = new Set();
  for (const m of section.matchAll(/<td[^>]*>\s*([A-Z][A-Z.]{0,5})\s*<\/td>/g)) {
    found.add(m[1]);
  }
  const symbols = [...found].map(s => s.replace(/\./g, '-')).sort();
  if (symbols.length < 80 || symbols.length > 130) {
    throw new Error(`parsed ${symbols.length} NDX tickers, expected ~100`);
  }
  return symbols;
}

async function getNdxSymbols() {
  if (ndxCache.symbols && Date.now() - ndxCache.fetchedAt < NDX_TTL_MS) {
    return ndxCache.symbols;
  }
  try {
    const symbols = await fetchNdxFromWiki();
    ndxCache.symbols = symbols;
    ndxCache.fetchedAt = Date.now();
    try { fs.writeFileSync(NDX_DISK_CACHE, JSON.stringify({ fetchedAt: ndxCache.fetchedAt, symbols })); } catch {}
    console.log(`Nasdaq-100 constituents: ${symbols.length} from Wikipedia`);
    return symbols;
  } catch (err) {
    console.error('Nasdaq-100 constituent fetch failed:', err.message);
    if (ndxCache.symbols) return ndxCache.symbols;
    try {
      const disk = JSON.parse(fs.readFileSync(NDX_DISK_CACHE, 'utf8'));
      if (Array.isArray(disk.symbols) && disk.symbols.length >= 80) {
        ndxCache.symbols = disk.symbols;
        ndxCache.fetchedAt = disk.fetchedAt || 0;
        console.log(`Nasdaq-100 constituents: ${disk.symbols.length} from disk cache`);
        return disk.symbols;
      }
    } catch {}
    return null; // scanner degrades to S&P 500 only
  }
}

// ---------- indicator math ----------

function ema(values, n) {
  if (values.length < n + 5) return null; // seed SMA + some smoothing history
  const k = 2 / (n + 1);
  let e = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

// Wilder ATR over {high, low, close} bars
function atr(bars, n = 14) {
  if (bars.length < n + 1) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high ?? bars[i].close;
    const l = bars[i].low ?? bars[i].close;
    const pc = bars[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let a = trs.slice(0, n).reduce((x, y) => x + y, 0) / n;
  for (let i = n; i < trs.length; i++) a = (a * (n - 1) + trs[i]) / n;
  return a;
}

function retN(closes, n) {
  if (closes.length <= n) return null;
  const past = closes[closes.length - 1 - n];
  return past ? closes[closes.length - 1] / past - 1 : null;
}

// Days-since-epoch of the ISO-week Monday containing the date (exchange tz)
function isoWeekStartDays(date, tz) {
  const { y, m, d } = localDateParts(date, tz);
  const epochDays = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const dow = (epochDays + 4) % 7; // 1970-01-01 was a Thursday
  return epochDays - (dow + 6) % 7;
}

// ---------- per-candidate history (two chart() calls each) ----------

// True once the regular session of the chart's current trading day has
// ended. Post-close scans (the 16:45 ET cron, evening rescans) land here:
// the today bar is then complete and must NOT be dropped, or the EMA lags
// one session behind the quote price it gets compared against — marginal
// shorts can end up above the properly-computed 12 EMA (and longs below).
function sessionClosed(meta) {
  const end = meta?.currentTradingPeriod?.regular?.end;
  if (end == null) return false;
  const t = end instanceof Date ? end.getTime() : end * 1000;
  return Date.now() >= t;
}

// ~420 calendar days of daily bars: EMA12/ATR14 daily + 1/3/6-month returns
async function fetchDailyBars(symbol) {
  const result = await withTimeout(yahooFinance.chart(symbol, {
    period1: new Date(Date.now() - 420 * 86400000),
    interval: '1d',
  }, { validateResult: false }), 15000, `chart(${symbol})`);

  const tz = result?.meta?.exchangeTimezoneName;
  let bars = (result?.quotes || []).filter(q => q.close != null && isFinite(q.close));

  // Completed sessions only — drop a still-forming today bar
  const today = localDateParts(new Date(), tz);
  if (bars.length && sameDate(localDateParts(bars[bars.length - 1].date, tz), today)
      && !sessionClosed(result?.meta)) {
    bars = bars.slice(0, -1);
  }
  return bars;
}

// Full listing history as weekly bars: the true ATH/ATL (split-adjusted
// weekly highs/lows) plus the weekly EMA12/ATR14 in the same payload.
async function fetchWeeklyHistory(symbol) {
  const result = await withTimeout(yahooFinance.chart(symbol, {
    period1: new Date(0),
    interval: '1wk',
  }, { validateResult: false }), 20000, `chart-wk(${symbol})`);

  const tz = result?.meta?.exchangeTimezoneName;
  let bars = (result?.quotes || []).filter(q => q.close != null && isFinite(q.close));

  // Completed weeks only — drop the still-forming current week. On the
  // weekend, or Friday after the close, the current week IS complete
  // (same off-by-one as the daily bars for Friday-evening cron scans).
  const { y, m, d } = localDateParts(new Date(), tz);
  const dow = (Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 4) % 7; // 0=Sun..6=Sat
  const weekComplete = dow === 0 || dow === 6 || (dow === 5 && sessionClosed(result?.meta));
  if (!weekComplete) {
    const nowWeek = isoWeekStartDays(new Date(), tz);
    while (bars.length && isoWeekStartDays(bars[bars.length - 1].date, tz) >= nowWeek) {
      bars = bars.slice(0, -1);
    }
  }
  return bars;
}

// Compact OHLC tail for the hover candle popover (5 significant digits
// keeps the persisted JSON small). Missing O/H/L fall back to the close.
function sparkTail(bars, n = 120) {
  return bars.slice(-n).map(b =>
    [b.open, b.high, b.low, b.close].map(v =>
      Number((v != null && isFinite(v) ? v : b.close).toPrecision(5))));
}

function enrichDaily(c, daily) {
  const closes = daily.map(b => b.close);
  c.ema12d = ema(closes, 12);
  c.atr14d = atr(daily, 14);
  c.r21 = retN(closes, 21);
  c.r63 = retN(closes, 63);
  c.r126 = retN(closes, 126);
  c.sparkD = sparkTail(daily);
}

function enrichWeekly(c, weekly) {
  const closes = weekly.map(b => b.close);
  c.ema12w = ema(closes, 12);
  c.sparkW = sparkTail(weekly);
  c.atr14w = atr(weekly.slice(-120), 14); // recent regime, not 1990s vol

  let ath = null;
  for (const b of weekly) {
    const h = b.high ?? b.close;
    if (h > 0 && (ath == null || h > ath)) ath = h;
  }
  c.ath = ath;
  c.offAth = ath ? c.price / ath - 1 : null;
}

// RS vs SPY: weighted 1/3/6-month excess returns, reweighted if history is
// short (recent IPOs). Context column only — ranking is ATH/ATL proximity.
function rsScore(c, spy) {
  const pairs = [[c.r21, spy.r21, 0.4], [c.r63, spy.r63, 0.35], [c.r126, spy.r126, 0.25]];
  let num = 0, wsum = 0;
  for (const [r, s, w] of pairs) {
    if (r != null && s != null) { num += w * (r - s); wsum += w; }
  }
  return wsum ? (num / wsum) * 100 : null;
}

// ---------- setup construction ----------

function buildRow(c, side, tf) {
  const emaV = tf === 'day' ? c.ema12d : c.ema12w;
  const atrV = tf === 'day' ? c.atr14d : c.atr14w;
  if (emaV == null || !atrV) return null;
  const band = tf === 'day' ? DAY_BAND : SWING_BAND;
  const inTrend = side === 'long' ? c.price > emaV : c.price < emaV;
  const nearEdge = side === 'long'
    ? c.offAth != null && c.offAth >= -band
    : c.offLow52 != null && c.offLow52 <= band;
  if (!inTrend || !nearEdge) return null;
  const emaDistAtr = (c.price - emaV) / atrV;
  const setup = Math.abs(emaDistAtr) <= PULLBACK_ATR ? 'PULLBACK'
    : Math.abs(emaDistAtr) <= EXTENDED_ATR ? 'TRENDING' : 'EXTENDED';
  return {
    symbol: c.symbol,
    name: c.name,
    price: c.price,
    dayPct: c.dayPct,
    offAth: c.offAth,
    offLow: c.offLow52 ?? null,
    emaDistAtr,
    rs: c.rs ?? null,
    setup,
    spark: (tf === 'day' ? c.sparkD : c.sparkW) ?? null,
    sparkTf: tf,
  };
}

// Rank by closeness to the 12 EMA. The filter already guarantees the right
// side of the EMA (longs above, shorts below), so the tightest pullbacks —
// the actionable entries — sort first on both sides.
function rank(rows) {
  return rows
    .sort((a, b) => Math.abs(a.emaDistAtr) - Math.abs(b.emaDistAtr))
    .slice(0, TOP_N);
}

// ---------- the daily scan ----------

const state = {
  data: null,
  scannedAt: 0,
  inflight: false,
  lastStart: 0,
  progress: null,
};

try {
  const disk = JSON.parse(fs.readFileSync(DISK_CACHE, 'utf8'));
  if (disk?.data) {
    state.data = disk.data;
    state.scannedAt = disk.scannedAt || 0;
  }
} catch {}

async function scan() {
  const [spx, ndx] = await Promise.all([getSp500Symbols(), getNdxSymbols()]);
  if (!spx && !ndx) throw new Error('no constituent lists available');
  const universe = [...new Set([...(spx || []), ...(ndx || [])])].sort();

  // Pass 1 — batched quotes: price, 52w range (ATH/ATL pre-filter), liquidity
  state.progress = { phase: 'quotes', done: 0, total: universe.length };
  const infos = [];
  for (let i = 0; i < universe.length; i += QUOTE_CHUNK) {
    const chunk = universe.slice(i, i + QUOTE_CHUNK);
    let results;
    try {
      results = await withTimeout(
        yahooFinance.quote(chunk, {}, { validateResult: false }),
        30000, `quote(trending chunk ${i / QUOTE_CHUNK})`
      );
    } catch (err) {
      console.error(`Trending quote chunk failed: ${err.message}`);
      continue;
    }
    for (const r of results || []) {
      const price = r?.regularMarketPrice;
      if (price == null) continue;
      infos.push({
        symbol: r.symbol,
        name: r.shortName || r.longName || r.symbol,
        price,
        dayPct: r.regularMarketChangePercent != null ? r.regularMarketChangePercent / 100 : null,
        high52: r.fiftyTwoWeekHigh ?? null,
        low52: r.fiftyTwoWeekLow ?? null,
        dollarVol: r.averageDailyVolume3Month != null ? r.averageDailyVolume3Month * price : null,
      });
    }
    state.progress.done = Math.min(i + QUOTE_CHUNK, universe.length);
  }
  if (infos.length < 300) throw new Error(`only ${infos.length} quotes — aborting scan`);

  // Pre-filter on the 52-week range: within X% of the ATH implies within X%
  // of the 52w high (ATH >= 52w high), so this is a strict superset of the
  // real condition and keeps the chart() pass small.
  const longPool = [], shortPool = [];
  for (const q of infos) {
    if (!q.high52 || !q.low52) continue;
    q.offHigh52 = q.price / q.high52 - 1;
    q.offLow52 = q.low52 > 0 ? q.price / q.low52 - 1 : null;
    if (q.offHigh52 >= -POOL_BAND) {
      longPool.push(q);
    } else if (
      q.offLow52 != null && q.offLow52 <= POOL_BAND
      && q.price >= MIN_PRICE_SHORT && (q.dollarVol ?? 0) >= MIN_DOLLAR_VOL_SHORT
    ) {
      shortPool.push(q);
    }
  }
  longPool.sort((a, b) => b.offHigh52 - a.offHigh52);
  shortPool.sort((a, b) => a.offLow52 - b.offLow52);
  const longs = longPool.slice(0, LONG_POOL_MAX);
  const shorts = shortPool.slice(0, SHORT_POOL_MAX);
  const candidates = [...longs, ...shorts];

  // Pass 2 — sequential chart(): daily bars for EVERY symbol (EMA/ATR/
  // returns feed both the setups and the momentum list), plus full-history
  // weekly bars for pool candidates only (ATH, weekly EMA/ATR)
  const candidateSet = new Set(candidates.map(c => c.symbol));
  state.progress = { phase: 'charts', done: 0, total: infos.length + candidates.length + 1 };
  let spyRet = {};
  try {
    const spyCloses = (await fetchDailyBars('SPY')).map(b => b.close);
    spyRet = { r21: retN(spyCloses, 21), r63: retN(spyCloses, 63), r126: retN(spyCloses, 126) };
  } catch (err) {
    console.error(`Trending SPY benchmark failed: ${err.message} — RS degraded`);
  }
  state.progress.done = 1;

  for (const c of infos) {
    const isCandidate = candidateSet.has(c.symbol);
    try {
      enrichDaily(c, await fetchDailyBars(c.symbol));
      c.rs = rsScore(c, spyRet);
      state.progress.done++;
      if (isCandidate) {
        await new Promise(r => setTimeout(r, CHART_GAP_MS));
        enrichWeekly(c, await fetchWeeklyHistory(c.symbol));
        state.progress.done++;
      }
    } catch {
      state.progress.done += isCandidate ? 2 : 1;
    }
    await new Promise(r => setTimeout(r, CHART_GAP_MS));
  }

  // Strongest / Weakest Trending: whole-universe momentum extremes in
  // active trends (right side of the daily 12 EMA)
  const momoRow = (c) => {
    const emaDistAtr = c.atr14d ? (c.price - c.ema12d) / c.atr14d : null;
    return {
      symbol: c.symbol,
      name: c.name,
      price: c.price,
      dayPct: c.dayPct,
      r21: c.r21,
      r63: c.r63,
      r126: c.r126,
      rs: c.rs,
      offHigh: c.offHigh52 ?? null,
      offLow: c.offLow52 ?? null,
      emaDistAtr,
      setup: emaDistAtr == null ? null
        : Math.abs(emaDistAtr) <= PULLBACK_ATR ? 'PULLBACK'
        : Math.abs(emaDistAtr) <= EXTENDED_ATR ? 'TRENDING' : 'EXTENDED',
      spark: c.sparkD ?? null,
      sparkTf: 'day',
    };
  };
  const momentum = infos
    .filter(c => c.rs != null && c.ema12d != null && c.price > c.ema12d)
    .sort((a, b) => b.rs - a.rs)
    .slice(0, TOP_N)
    .map(momoRow);
  const weakest = infos
    .filter(c => c.rs != null && c.ema12d != null && c.price < c.ema12d
      && c.price >= MIN_PRICE_SHORT && (c.dollarVol ?? 0) >= MIN_DOLLAR_VOL_SHORT)
    .sort((a, b) => a.rs - b.rs)
    .slice(0, TOP_N)
    .map(momoRow);

  const lists = (tf) => ({
    long: rank(longs.map(c => buildRow(c, 'long', tf)).filter(Boolean)),
    short: rank(shorts.map(c => buildRow(c, 'short', tf)).filter(Boolean)),
  });

  return {
    scannedAt: new Date().toISOString(),
    universe: {
      total: universe.length,
      sp500: spx?.length || 0,
      ndx100: ndx?.length || 0,
      longPool: longs.length,
      shortPool: shorts.length,
    },
    day: lists('day'),
    swing: lists('swing'),
    momentum,
    weakest,
  };
}

async function runScan() {
  if (state.inflight) return;
  state.inflight = true;
  state.lastStart = Date.now();
  console.log('Trending scan starting...');
  try {
    const data = await scan();
    // Names newly in a top-5 vs the previous scan → feeds the alert strip.
    const top5 = (list) => (list || []).slice(0, 5).map(r => r.symbol);
    const entered = (cur, old) => top5(cur).filter(s => !top5(old).includes(s));
    data.newEntrants = state.data ? {
      dayLong: entered(data.day.long, state.data.day?.long),
      dayShort: entered(data.day.short, state.data.day?.short),
    } : null;
    state.data = data;
    state.scannedAt = Date.now();
    try { fs.writeFileSync(DISK_CACHE, JSON.stringify({ scannedAt: state.scannedAt, data })); } catch {}
    console.log(`Trending scan complete: day ${data.day.long.length}L/${data.day.short.length}S, swing ${data.swing.long.length}L/${data.swing.short.length}S, momentum ${data.momentum.length}/${data.weakest.length} (pools ${data.universe.longPool}/${data.universe.shortPool})`);
  } catch (err) {
    console.error('Trending scan failed:', err.message);
  } finally {
    state.inflight = false;
    state.progress = null;
  }
}

export async function getTrending(force = false) {
  const now = Date.now();
  const stale = !state.data || now - state.scannedAt > SCAN_TTL_MS;
  const forceOk = force && now - state.lastStart > FORCE_MIN_GAP_MS;
  if ((stale || forceOk) && !state.inflight) {
    runScan(); // fire and forget; requests keep serving the last result
  }
  if (state.data) {
    return {
      status: state.inflight ? 'rescanning' : 'ok',
      progress: state.inflight ? state.progress : null,
      ...state.data,
    };
  }
  return { status: 'scanning', progress: state.progress };
}

// Last completed scan without side effects (no lazy rescan trigger).
// Used by the alert rules on the /api/quotes hot path.
export function peekTrending() {
  return state.data;
}

export function startTrendingScheduler() {
  // Rescan after the US close so European mornings see fresh completed bars
  cron.schedule('45 16 * * 1-5', () => {
    runScan().catch(err => console.error('Scheduled trending scan failed:', err.message));
  }, { timezone: 'America/New_York' });
  console.log('Trending scheduler started: daily scan at 16:45 ET, Mon-Fri');
}
