// Yahoo Finance client — quotes, daily % and week-to-date % for all dashboard
// symbols, with an in-memory cache shared by all API consumers.
//
// Uses yahoo-finance2, which handles Yahoo's cookie/crumb/consent flow. The
// critical property: quote() batches ALL symbols into a single HTTP request,
// so 45s polling produces ~1 upstream request per refresh. Raw unauthenticated
// v8/chart calls (one per symbol) get the IP 429-banned within minutes.
//
// Week-to-date needs one prior-week close per symbol ("week ref"). Those come
// from chart() calls — fetched sequentially with a delay (gentle on Yahoo),
// cached 6h, and refreshed automatically when a new ISO week starts. WTD shows
// as null/-- until the refs finish loading (~30s after first request).

import YahooFinance from 'yahoo-finance2';
import { GROUPS, RATIOS, RELATIONS, CORRELATION_ASSETS, allSymbols, BREADTH_EXCLUDES } from './symbols.js';

export const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const QUOTE_TTL_MS = 45 * 1000;
const WEEKREF_TTL_MS = 6 * 60 * 60 * 1000;
const WEEKREF_GAP_MS = 300;

// ---------- week math ----------

export function localDateParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [y, m, d] = fmt.format(date).split('-').map(Number);
  return { y, m, d };
}

// Days since epoch of the Monday starting the ISO week containing y-m-d.
export function weekStartDays({ y, m, d }) {
  const epochDays = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const dow = (epochDays + 4) % 7;        // 1970-01-01 was a Thursday
  const mondayOffset = (dow + 6) % 7;     // Mon=0 ... Sun=6
  return epochDays - mondayOffset;
}

function currentWeekStart() {
  return weekStartDays(localDateParts(new Date(), 'America/New_York'));
}

export function sameDate(a, b) {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

// ---------- daily refs (prior-week + prior-year-end closes, SMAs) ----------
// All symbols fetch ~450 calendar days of bars: enough for the YTD reference
// (last close of the previous calendar year) and, for sectors, SMA 20/50/200.

const SECTOR_SET = new Set(GROUPS.sectors.map(e => e.s));
// Volatility symbols keep a full ~1y close series for percentile context.
const VOL_SET = new Set(GROUPS.volatility.map(e => e.s));
// Space + sector symbols keep a 120-bar OHLC tail for hover candle popovers.
const SPACE_SET = new Set(GROUPS.space.map(e => e.s));

const dailyRefs = {
  bySymbol: new Map(),   // symbol -> { weekRef, sma20, sma50, sma200 }
  weekStart: null,
  fetchedAt: 0,
  inflight: false,
};

export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms).unref?.()),
  ]);
}

function sma(closes, n) {
  if (closes.length < n) return null;
  const slice = closes.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

async function fetchDailyRef(symbol) {
  const needsSma = SECTOR_SET.has(symbol);
  const result = await withTimeout(yahooFinance.chart(symbol, {
    period1: new Date(Date.now() - 450 * 86400000),
    interval: '1d',
  }, { validateResult: false }), 15000, `chart(${symbol})`);

  const tz = result?.meta?.exchangeTimezoneName;
  const bars = (result?.quotes || []).filter(q => q.close != null && isFinite(q.close));

  const nowWeek = weekStartDays(localDateParts(new Date(), tz));
  let weekRef = null;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (weekStartDays(localDateParts(bars[i].date, tz)) < nowWeek) {
      weekRef = bars[i].close;
      break;
    }
  }

  // YTD reference: last close of the previous calendar year (exchange tz)
  const nowYear = localDateParts(new Date(), tz).y;
  let ytdRef = null;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (localDateParts(bars[i].date, tz).y < nowYear) {
      ytdRef = bars[i].close;
      break;
    }
  }

  const ref = { weekRef, ytdRef, sma20: null, sma50: null, sma200: null, series: null, high20: null };

  // Completed sessions only — drop a still-forming today bar
  const today = localDateParts(new Date(), tz);
  const last = bars[bars.length - 1];
  const completed = last && sameDate(localDateParts(last.date, tz), today)
    ? bars.slice(0, -1) : bars;

  // Last ~70 dated closes for every symbol: RRG ratio series, Market
  // Relations ratio charts, and the cross-asset correlation matrix.
  const toPoint = (b) => {
    const d = localDateParts(b.date, tz);
    return { d: `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`, c: b.close };
  };
  ref.series = completed.slice(-70).map(toPoint);
  if (VOL_SET.has(symbol)) ref.series1y = completed.slice(-260).map(toPoint);
  if (SPACE_SET.has(symbol) || SECTOR_SET.has(symbol)) {
    ref.ohlc = completed.slice(-120).map(b => [
      b.open ?? b.close, b.high ?? b.close, b.low ?? b.close, b.close,
    ].map(v => Number(v.toPrecision(5))));
  }

  if (needsSma) {
    const closes = completed.map(b => b.close);
    ref.sma20 = sma(closes, 20);
    ref.sma50 = sma(closes, 50);
    ref.sma200 = sma(closes, 200);
    if (closes.length >= 20) ref.high20 = Math.max(...closes.slice(-20));
  }
  return ref;
}

// ---------- RRG (relative rotation vs SPY) ----------
// Simplified JdK: rsRatio = 100 * ratio / SMA50(ratio); rsMomentum =
// 100 * rsRatio_t / rsRatio_(t-10). Tail = last 5 daily points.
function computeRRG() {
  const spyRef = dailyRefs.bySymbol.get('SPY');
  if (!spyRef?.series?.length) return null;
  const spyByDate = new Map(spyRef.series.map(p => [p.d, p.c]));

  const out = [];
  for (const e of GROUPS.sectors) {
    if (e.s === 'SPY') continue;
    const ref = dailyRefs.bySymbol.get(e.s);
    if (!ref?.series?.length) continue;

    const ratios = [];
    for (const p of ref.series) {
      const spy = spyByDate.get(p.d);
      if (spy) ratios.push(p.c / spy);
    }
    if (ratios.length < 61) continue; // need 50 for SMA + 10 lag + tail

    const rsSeries = [];
    for (let i = 49; i < ratios.length; i++) {
      const mean = ratios.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50;
      rsSeries.push(100 * ratios[i] / mean);
    }
    if (rsSeries.length < 15) continue;

    const points = [];
    for (let i = 10; i < rsSeries.length; i++) {
      points.push({ x: rsSeries[i], y: 100 * rsSeries[i] / rsSeries[i - 10] });
    }
    const tail = points.slice(-5);
    const cur = tail[tail.length - 1];
    out.push({ symbol: e.s, label: e.label, rsRatio: cur.x, rsMomentum: cur.y, tail });
  }
  return out.length ? out : null;
}

// ---------- market relations (cross-asset ratio series) ----------
// Ratio of two close series on their overlapping session dates, last 60
// points. Different calendars (crypto trades weekends, futures holidays)
// are handled by the date intersection.
function ratioSeries(numSym, denSym) {
  const num = dailyRefs.bySymbol.get(numSym)?.series;
  const den = dailyRefs.bySymbol.get(denSym)?.series;
  if (!num?.length || !den?.length) return null;
  const denByDate = new Map(den.map(p => [p.d, p.c]));
  const out = [];
  for (const p of num) {
    const d = denByDate.get(p.d);
    if (d) out.push({ d: p.d, v: p.c / d });
  }
  return out.length >= 20 ? out.slice(-60) : null;
}

function computeRelations(quoteFor) {
  const out = [];
  for (const rel of RELATIONS) {
    const series = ratioSeries(rel.num, rel.den);
    const num = quoteFor(rel.num);
    const den = quoteFor(rel.den);
    const value = num?.price && den?.price ? num.price / den.price : null;
    const dayPct = num?.dayPct != null && den?.dayPct != null
      ? (1 + num.dayPct) / (1 + den.dayPct) - 1 : null;
    // 20-session trend: live ratio vs the close ratio 20 sessions back
    const back20 = series && series.length >= 20 ? series[series.length - 20].v : null;
    const pct20d = value != null && back20 ? value / back20 - 1 : null;
    out.push({
      id: rel.id, title: rel.title, group: rel.group,
      num: rel.num, den: rel.den, label: `${rel.num}/${rel.den}`,
      up: rel.up, down: rel.down,
      value, dayPct, pct20d, series,
    });
  }
  return out.some(r => r.series) ? out : null;
}

// ---------- cross-asset correlation matrix (30d daily log returns) ----------
function pearson(xs, ys) {
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let k = 0; k < xs.length; k++) {
    sxy += (xs[k] - mx) * (ys[k] - my);
    sxx += (xs[k] - mx) ** 2;
    syy += (ys[k] - my) ** 2;
  }
  const denom = Math.sqrt(sxx * syy);
  return denom > 0 ? sxy / denom : null;
}

function logReturns(series) {
  const rets = new Map();
  for (let i = 1; i < series.length; i++) {
    if (series[i].c > 0 && series[i - 1].c > 0) {
      rets.set(series[i].d, Math.log(series[i].c / series[i - 1].c));
    }
  }
  return rets;
}

// Rolling 30-session correlation series for the stock-bond regime chart: at
// each date, the correlation of the trailing 30 aligned daily returns.
function rollingCorrelation(symA, symB, window = 30) {
  const sa = dailyRefs.bySymbol.get(symA)?.series;
  const sb = dailyRefs.bySymbol.get(symB)?.series;
  if (!sa?.length || !sb?.length) return null;
  const ra = logReturns(sa);
  const rb = logReturns(sb);
  const dates = [...ra.keys()].filter(d => rb.has(d)).sort();
  if (dates.length < window + 5) return null;
  const out = [];
  for (let i = window - 1; i < dates.length; i++) {
    const win = dates.slice(i - window + 1, i + 1);
    const corr = pearson(win.map(d => ra.get(d)), win.map(d => rb.get(d)));
    if (corr != null) out.push({ d: dates[i], v: corr });
  }
  return out.length ? out : null;
}

function computeCorrelations() {
  const returnsBySymbol = new Map();
  for (const a of CORRELATION_ASSETS) {
    const series = dailyRefs.bySymbol.get(a.s)?.series;
    if (!series || series.length < 21) continue;
    returnsBySymbol.set(a.s, logReturns(series));
  }
  if (returnsBySymbol.size < 2) return null;

  const assets = CORRELATION_ASSETS.filter(a => returnsBySymbol.has(a.s));
  const matrix = assets.map(() => assets.map(() => null));
  for (let i = 0; i < assets.length; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < assets.length; j++) {
      const ra = returnsBySymbol.get(assets[i].s);
      const rb = returnsBySymbol.get(assets[j].s);
      const dates = [...ra.keys()].filter(d => rb.has(d)).sort().slice(-30);
      if (dates.length < 20) continue;
      const corr = pearson(dates.map(d => ra.get(d)), dates.map(d => rb.get(d)));
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }
  const spxTltSeries = rollingCorrelation('SPY', 'TLT', 30);
  return {
    assets: assets.map(a => ({ symbol: a.s, label: a.label })),
    matrix,
    window: 30,
    spxTlt: spxTltSeries
      ? { series: spxTltSeries, value: spxTltSeries[spxTltSeries.length - 1].v }
      : null,
  };
}

// ---------- volatility percentile context (1y) ----------
function percentile(values, v) {
  if (v == null || !values?.length) return null;
  let below = 0;
  for (const x of values) if (x <= v) below++;
  return Math.round((below / values.length) * 100);
}

// 1y percentile of the LIVE value vs trailing daily closes. For the VIX/VIX3M
// term ratio the historical ratio series is built on aligned dates.
function computeVolPctiles(quoteFor) {
  const closes = (s) => dailyRefs.bySymbol.get(s)?.series1y?.map(p => p.c) ?? null;
  const vix = quoteFor('^VIX');
  const vix3m = quoteFor('^VIX3M');
  const move = quoteFor('^MOVE');

  let termPctile = null;
  const vixSeries = dailyRefs.bySymbol.get('^VIX')?.series1y;
  const vix3mSeries = dailyRefs.bySymbol.get('^VIX3M')?.series1y;
  if (vixSeries && vix3mSeries && vix?.price && vix3m?.price) {
    const byDate = new Map(vix3mSeries.map(p => [p.d, p.c]));
    const ratios = [];
    for (const p of vixSeries) {
      const b = byDate.get(p.d);
      if (b) ratios.push(p.c / b);
    }
    termPctile = percentile(ratios, vix.price / vix3m.price);
  }

  const out = {
    vix: percentile(closes('^VIX'), vix?.price),
    vix3m: percentile(closes('^VIX3M'), vix3m?.price),
    move: percentile(closes('^MOVE'), move?.price),
    termRatio: termPctile,
  };
  return Object.values(out).some(v => v != null) ? out : null;
}

async function refreshDailyRefs() {
  if (dailyRefs.inflight) return;
  dailyRefs.inflight = true;
  const week = currentWeekStart();
  console.log('Refreshing daily refs (WTD closes + sector SMAs)...');
  try {
    const entries = allSymbols();
    const failed = [];
    let done = 0;
    for (const entry of entries) {
      try {
        dailyRefs.bySymbol.set(entry.s, await fetchDailyRef(entry.s));
      } catch {
        failed.push(entry.s);
      }
      done++;
      if (done % 20 === 0) console.log(`Daily refs: ${done}/${entries.length}`);
      await new Promise(r => setTimeout(r, WEEKREF_GAP_MS));
    }
    // One retry pass for transient timeouts; a miss just means '--' until 6h refresh
    for (const s of failed) {
      try {
        dailyRefs.bySymbol.set(s, await fetchDailyRef(s));
      } catch (err) {
        console.error(`Daily ref failed for ${s}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, WEEKREF_GAP_MS));
    }
    dailyRefs.weekStart = week;
    dailyRefs.fetchedAt = Date.now();
    cache.fetchedAt = 0; // recompute WTD/SMAs on the next quotes request
    console.log(`Daily refs loaded for ${dailyRefs.bySymbol.size} symbols`);
  } finally {
    dailyRefs.inflight = false;
  }
}

function ensureDailyRefs() {
  const stale = Date.now() - dailyRefs.fetchedAt > WEEKREF_TTL_MS
    || dailyRefs.weekStart !== currentWeekStart();
  if (stale && !dailyRefs.inflight) {
    refreshDailyRefs().catch(err => console.error('Daily ref refresh failed:', err.message));
  }
}

// ---------- quotes ----------

async function fetchAllQuotes() {
  const entries = allSymbols();
  const symbols = entries.map(e => e.s);

  const results = await yahooFinance.quote(symbols, {}, { validateResult: false });
  const bySymbol = new Map();
  for (const r of results || []) {
    if (r?.symbol && r.regularMarketPrice != null) bySymbol.set(r.symbol, r);
  }

  const errors = symbols.filter(s => !bySymbol.has(s));
  if (errors.length) console.error(`No quote data for: ${errors.join(', ')}`);

  const quoteFor = (s) => {
    const r = bySymbol.get(s);
    if (!r) return null;
    const price = r.regularMarketPrice;
    const prevClose = r.regularMarketPreviousClose ?? null;
    const dayPct = r.regularMarketChangePercent != null
      ? r.regularMarketChangePercent / 100
      : (prevClose ? price / prevClose - 1 : null);
    const ref = dailyRefs.bySymbol.get(s);
    const wtdPct = ref?.weekRef ? price / ref.weekRef - 1 : null;
    const ytdPct = ref?.ytdRef ? price / ref.ytdRef - 1 : null;
    return { price, prevClose, dayPct, wtdPct, ytdPct, ref };
  };

  const groups = {};
  for (const [groupName, groupEntries] of Object.entries(GROUPS)) {
    if (groupName === 'ratioLegs') continue;
    groups[groupName] = groupEntries.map(e => {
      const q = quoteFor(e.s);
      const out = {
        symbol: e.s,
        label: e.label,
        kind: e.kind || 'price',
        dec: e.dec ?? 2,
        price: q ? q.price : null,
        prevClose: q ? q.prevClose : null,
        dayPct: q ? q.dayPct : null,
        wtdPct: q ? q.wtdPct : null,
        ytdPct: q ? q.ytdPct : null,
      };
      if (groupName === 'sectors') {
        out.sma20 = q?.ref?.sma20 ?? null;
        out.sma50 = q?.ref?.sma50 ?? null;
        out.sma200 = q?.ref?.sma200 ?? null;
        // Candle tail + live bar for the heatmap hover popover, same
        // [o,h,l,c] format as the Trending/Space rows.
        const ohlc = q?.ref?.ohlc;
        if (ohlc && ohlc.length >= 15 && q?.price != null) {
          const r = bySymbol.get(e.s);
          const p = q.price;
          const liveBar = [
            r?.regularMarketOpen ?? p,
            Math.max(r?.regularMarketDayHigh ?? p, p),
            Math.min(r?.regularMarketDayLow ?? p, p),
            p,
          ].map(v => Number(v.toPrecision(5)));
          out.spark = [...ohlc.slice(-119), liveBar];
          out.sparkTf = 'day';
        }
      }
      if (groupName === 'space') {
        const r = bySymbol.get(e.s);
        out.name = r?.shortName || r?.longName || e.label;
        out.sma50 = r?.fiftyDayAverage ?? null;
        out.avgVolume = r?.averageDailyVolume3Month ?? null;
        out.high52 = r?.fiftyTwoWeekHigh ?? null;
        out.low52 = r?.fiftyTwoWeekLow ?? null;
        out.marketCap = r?.marketCap ?? null;
        out.open = r?.regularMarketOpen ?? null;
        out.dayHigh = r?.regularMarketDayHigh ?? null;
        out.dayLow = r?.regularMarketDayLow ?? null;
        out.forwardPE = r?.forwardPE ?? null;
      }
      return out;
    });
  }

  const ratios = RATIOS.map(r => {
    const num = quoteFor(r.num);
    const den = quoteFor(r.den);
    if (!num || !den || !den.price) {
      return { id: r.id, label: r.label, num: r.num, den: r.den, group: r.group, dec: r.dec, value: null, dayPct: null, wtdPct: null, ytdPct: null };
    }
    const value = num.price / den.price;
    const dayPct = num.dayPct != null && den.dayPct != null
      ? (1 + num.dayPct) / (1 + den.dayPct) - 1 : null;
    const wtdPct = num.wtdPct != null && den.wtdPct != null
      ? (1 + num.wtdPct) / (1 + den.wtdPct) - 1 : null;
    const ytdPct = num.ytdPct != null && den.ytdPct != null
      ? (1 + num.ytdPct) / (1 + den.ytdPct) - 1 : null;
    return { id: r.id, label: r.label, num: r.num, den: r.den, group: r.group, dec: r.dec, value, dayPct, wtdPct, ytdPct };
  });

  // Breadth: % of real sector ETFs (broad-market excluded) above each SMA,
  // plus the symbols below it (the UI shows them on expand)
  const breadth = { pctAbove20: null, pctAbove50: null, pctAbove200: null, count: 0 };
  for (const window of [20, 50, 200]) {
    let above = 0, total = 0;
    const below = [];
    for (const q of groups.sectors) {
      if (BREADTH_EXCLUDES.has(q.symbol)) continue;
      const s = q[`sma${window}`];
      if (q.price == null || s == null) continue;
      total++;
      if (q.price > s) above++;
      else below.push(q.symbol);
    }
    if (total > 0) breadth[`pctAbove${window}`] = above / total;
    breadth[`below${window}`] = below;
    breadth.count = Math.max(breadth.count, total);
  }

  const spyHigh20 = dailyRefs.bySymbol.get('SPY')?.high20 ?? null;

  return {
    asOf: new Date().toISOString(),
    groups, ratios, breadth,
    rrg: computeRRG(),
    relations: computeRelations(quoteFor),
    correlations: computeCorrelations(),
    volPctiles: computeVolPctiles(quoteFor),
    spyHigh20, errors,
  };
}

// Completed-session close series from the daily pass ([{ d, c }], ~70
// sessions, oldest first). Used by server/space.js for screener math.
export function getCloseSeries(symbol) {
  return dailyRefs.bySymbol.get(symbol)?.series ?? null;
}

// 120-bar [o,h,l,c] tail (space + sector symbols) for the hover candle popover.
export function getOhlcSeries(symbol) {
  return dailyRefs.bySymbol.get(symbol)?.ohlc ?? null;
}

// ~30d ATM implied volatility for the screener IV column: one options()
// listing call (nearest-expiry chain + expiration list), plus one more chain
// fetch when the expiry closest to 30d isn't the nearest one. ATM IV = mean
// implied vol of the 2 calls + 2 puts nearest the spot strike (same method as
// optionsdash.js). Returns null when the symbol has no listed options
// (foreign listings, some ETFs). Callers run this inside their serialized
// 12h summary passes — never in an intraday path.
export async function fetchAtmIV30(symbol) {
  const listing = await withTimeout(yahooFinance.options(symbol, {}, { validateResult: false }),
    15000, `options(${symbol})`);
  const spot = listing?.quote?.regularMarketPrice;
  const expirations = listing?.expirationDates || [];
  if (!spot || !expirations.length) return null;

  const target = Date.now() + 30 * 86400000;
  const dist = (d) => Math.abs(new Date(d).getTime() - target);
  const best = expirations.reduce((a, b) => dist(b) < dist(a) ? b : a);

  let chain = listing?.options?.[0];
  if (chain?.expirationDate != null
      && new Date(chain.expirationDate).getTime() !== new Date(best).getTime()) {
    const o = await withTimeout(yahooFinance.options(symbol, { date: best }, { validateResult: false }),
      15000, `options(${symbol},30d)`);
    chain = o?.options?.[0] ?? chain;
  }
  if (!chain) return null;

  const near = (list) => (list || [])
    .filter(c => c.impliedVolatility > 0.001)
    .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
    .slice(0, 2);
  const ivs = [...near(chain.calls), ...near(chain.puts)].map(c => c.impliedVolatility);
  return ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
}

// ---------- cache with stampede guard + stale-on-error ----------

const cache = { data: null, fetchedAt: 0, inflight: null };

export async function getQuotes() {
  ensureDailyRefs();

  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < QUOTE_TTL_MS) {
    return { ...cache.data, stale: false };
  }
  if (cache.inflight) return cache.inflight;

  cache.inflight = (async () => {
    try {
      const data = await fetchAllQuotes();
      cache.data = data;
      cache.fetchedAt = Date.now();
      return { ...data, stale: false };
    } catch (err) {
      console.error('Quote refresh failed:', err.message);
      if (cache.data) return { ...cache.data, stale: true };
      throw err;
    } finally {
      cache.inflight = null;
    }
  })();

  return cache.inflight;
}
