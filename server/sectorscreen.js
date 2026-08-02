// Per-sector screener (GET /api/sector-screen?etf=XLK) — the Space tab
// workflow applied to 17 sector/industry universes (top 30 members by market
// cap + the ETF itself as benchmark row; lists in server/sectorUniverses.js;
// DRAM = full Roundhill Memory ETF equity holdings, incl. foreign primaries).
//
// Data is fully lazy and per-sector so the shared 45s intraday batch is
// untouched:
//   quotes     one batched quote() call per sector per 45s (stampede-guarded,
//              stale-on-error), only while the tab requests that sector
//   daily bars one sequential chart() pass per sector (~31 calls, 300ms gaps,
//              ~30s), cached 6h, passes serialized globally so flipping
//              through sectors can't stampede Yahoo. Retains a 70-session
//              close series + 120-bar [o,h,l,c] tail per symbol, plus
//              prior-week / prior-year-end reference closes for WTD/YTD.
//   summaries  quoteSummary short interest + next earnings per member,
//              cached 12h, serialized globally (same pattern as space.js).
//
// Screener math (row indicators, SETUP tags, composite) is shared with the
// Space tab via server/screener.js. SPY relative strength uses the main
// dashboard's SPY close series (warm once the main daily pass has run).

import { SECTOR_UNIVERSES } from './sectorUniverses.js';
import {
  yahooFinance, withTimeout, getCloseSeries, fetchAtmIV30,
  localDateParts, sameDate, weekStartDays,
} from './yahoo.js';
import { computeScreenRow, computeComposite } from './screener.js';

const QUOTE_TTL_MS = 45 * 1000;
const DAILY_TTL_MS = 6 * 60 * 60 * 1000;
const SUMMARY_TTL_MS = 12 * 60 * 60 * 1000;
const DAILY_GAP_MS = 300;
const SUMMARY_GAP_MS = 500;

const stores = new Map(); // etf -> { quotes, daily, summary }

function store(etf) {
  if (!stores.has(etf)) {
    stores.set(etf, {
      quotes: { data: null, fetchedAt: 0, inflight: null },
      daily: { bySymbol: new Map(), fetchedAt: 0, inflight: false },
      summary: { bySymbol: new Map(), fetchedAt: 0, inflight: false },
    });
  }
  return stores.get(etf);
}

// Global chains: only one chart()/quoteSummary() pass runs at a time across
// all sectors, whatever order the user flips through them.
let dailyChain = Promise.resolve();
let summaryChain = Promise.resolve();

// ---------- daily bars (chart(), per-sector, 6h cache) ----------

async function fetchDailyBars(symbol) {
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
  const nowYear = localDateParts(new Date(), tz).y;
  let ytdRef = null;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (localDateParts(bars[i].date, tz).y < nowYear) {
      ytdRef = bars[i].close;
      break;
    }
  }

  // Completed sessions only — drop a still-forming today bar
  const today = localDateParts(new Date(), tz);
  const last = bars[bars.length - 1];
  const completed = last && sameDate(localDateParts(last.date, tz), today)
    ? bars.slice(0, -1) : bars;

  const series = completed.slice(-70).map(b => {
    const d = localDateParts(b.date, tz);
    return { d: `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`, c: b.close };
  });
  const ohlc = completed.slice(-120).map(b => [
    b.open ?? b.close, b.high ?? b.close, b.low ?? b.close, b.close,
  ].map(v => Number(v.toPrecision(5))));

  return { weekRef, ytdRef, series, ohlc };
}

function ensureDaily(etf, symbols) {
  const st = store(etf).daily;
  if (Date.now() - st.fetchedAt <= DAILY_TTL_MS || st.inflight) return;
  st.inflight = true;
  dailyChain = dailyChain.then(async () => {
    const t0 = Date.now();
    let ok = 0;
    for (const s of symbols) {
      try {
        st.bySymbol.set(s, await fetchDailyBars(s));
        ok++;
      } catch {}
      await new Promise(r => setTimeout(r, DAILY_GAP_MS));
    }
    st.fetchedAt = Date.now();
    console.log(`Sector daily bars ${etf}: ${ok}/${symbols.length} in ${Math.round((Date.now() - t0) / 1000)}s`);
  }).catch(err => console.error(`Sector daily pass ${etf} failed:`, err.message))
    .finally(() => { st.inflight = false; });
}

// ---------- short interest + earnings + IV30 (12h cache) ----------
// quoteSummary per member, plus 1-2 options() calls per member for the ~30d
// ATM IV column (null for names without listed options — foreign listings).

function ensureSummaries(etf, symbols) {
  const st = store(etf).summary;
  if (Date.now() - st.fetchedAt <= SUMMARY_TTL_MS || st.inflight) return;
  st.inflight = true;
  summaryChain = summaryChain.then(async () => {
    let ok = 0;
    for (const s of symbols) {
      const entry = {
        shortPctFloat: null, daysToCover: null, earningsDate: null, iv: null,
      };
      try {
        const r = await withTimeout(yahooFinance.quoteSummary(s, {
          modules: ['defaultKeyStatistics', 'calendarEvents'],
        }, { validateResult: false }), 15000, `quoteSummary(${s})`);
        const ks = r?.defaultKeyStatistics;
        const earnings = r?.calendarEvents?.earnings?.earningsDate?.[0] ?? null;
        entry.shortPctFloat = ks?.shortPercentOfFloat ?? null;
        entry.daysToCover = ks?.shortRatio ?? null;
        entry.earningsDate = earnings ? new Date(earnings).toISOString() : null;
        ok++;
      } catch {}
      try {
        entry.iv = await fetchAtmIV30(s);
      } catch {}
      st.bySymbol.set(s, entry);
      await new Promise(r => setTimeout(r, SUMMARY_GAP_MS));
    }
    st.fetchedAt = Date.now();
    console.log(`Sector summaries ${etf}: ${ok}/${symbols.length}`);
  }).catch(err => console.error(`Sector summaries ${etf} failed:`, err.message))
    .finally(() => { st.inflight = false; });
}

// ---------- quotes (one batched call per sector per 45s) ----------

async function fetchSectorQuotes(etf, symbols) {
  const results = await yahooFinance.quote([...symbols, 'SPY'], {}, { validateResult: false });
  const bySymbol = new Map();
  for (const r of results || []) {
    if (r?.symbol && r.regularMarketPrice != null) bySymbol.set(r.symbol, r);
  }
  const daily = store(etf).daily.bySymbol;
  const quotes = symbols.map(s => {
    const r = bySymbol.get(s);
    const ref = daily.get(s);
    const price = r?.regularMarketPrice ?? null;
    return {
      symbol: s,
      name: r?.shortName || r?.longName || s,
      price,
      dayPct: r?.regularMarketChangePercent != null
        ? r.regularMarketChangePercent / 100
        : (r?.regularMarketPreviousClose && price != null ? price / r.regularMarketPreviousClose - 1 : null),
      wtdPct: ref?.weekRef && price != null ? price / ref.weekRef - 1 : null,
      ytdPct: ref?.ytdRef && price != null ? price / ref.ytdRef - 1 : null,
      sma50: r?.fiftyDayAverage ?? null,
      avgVolume: r?.averageDailyVolume3Month ?? null,
      marketCap: r?.marketCap ?? null,
      forwardPE: r?.forwardPE ?? null,
      open: r?.regularMarketOpen ?? null,
      dayHigh: r?.regularMarketDayHigh ?? null,
      dayLow: r?.regularMarketDayLow ?? null,
    };
  });
  return { asOf: new Date().toISOString(), quotes, spyPrice: bySymbol.get('SPY')?.regularMarketPrice ?? null };
}

function getSectorQuotes(etf, symbols) {
  const st = store(etf).quotes;
  const now = Date.now();
  if (st.data && now - st.fetchedAt < QUOTE_TTL_MS) {
    return Promise.resolve({ ...st.data, stale: false });
  }
  if (st.inflight) return st.inflight;
  st.inflight = (async () => {
    try {
      const data = await fetchSectorQuotes(etf, symbols);
      st.data = data;
      st.fetchedAt = Date.now();
      return { ...data, stale: false };
    } catch (err) {
      console.error(`Sector quotes ${etf} failed:`, err.message);
      if (st.data) return { ...st.data, stale: true };
      throw err;
    } finally {
      st.inflight = null;
    }
  })();
  return st.inflight;
}

// ---------- public API ----------

export function isSectorEtf(etf) {
  return Object.prototype.hasOwnProperty.call(SECTOR_UNIVERSES, etf);
}

export async function getSectorScreen(etf) {
  const u = SECTOR_UNIVERSES[etf];
  if (!u) throw new Error(`Unknown sector ETF: ${etf}`);
  const symbols = [etf, ...u.members];

  ensureDaily(etf, symbols);
  ensureSummaries(etf, symbols); // incl. the ETF itself, so the benchmark row gets IV
  const { asOf, quotes, spyPrice, stale } = await getSectorQuotes(etf, symbols);

  const st = store(etf);
  const spySeries = getCloseSeries('SPY');
  const spyR21 = spySeries && spySeries.length >= 21 && spyPrice != null
    ? spyPrice / spySeries[spySeries.length - 21].c - 1 : null;

  const seriesFor = (s) => st.daily.bySymbol.get(s)?.series ?? null;
  const rows = quotes.map(q => {
    const bars = st.daily.bySymbol.get(q.symbol);
    const row = computeScreenRow(q, spyR21, bars?.series ?? null, bars?.ohlc ?? null);
    const extra = st.summary.bySymbol.get(q.symbol);
    row.shortPctFloat = extra?.shortPctFloat ?? null;
    row.daysToCover = extra?.daysToCover ?? null;
    row.earningsDate = extra?.earningsDate ?? null;
    row.iv = extra?.iv ?? null;
    if (q.symbol === etf) row.benchmark = true;
    return row;
  });

  return {
    asOf,
    stale,
    etf,
    label: u.label,
    loading: st.daily.fetchedAt === 0,
    composite: computeComposite(rows, seriesFor, new Set([etf])),
    rows,
  };
}
