// Space-sector screener (GET /api/space) — short-the-bounce focus.
//
// Per symbol, computed from the shared 45s quote() batch + the ~70-session
// close series of the daily refs pass (zero extra intraday API calls):
//   r5           5-session % change (bounce detector)
//   r30          30-session % change (~30 trading days)
//   vs50         % distance to the 50-DMA (from quote's fiftyDayAverage)
//   sma50Falling 50-DMA now vs 10 sessions ago (trend filter)
//   rsi14        Wilder RSI on closes + live price
//   pctB         Bollinger(20,2) %B -> OS/OB classification like the
//                "Trading Range" column of the user's screener image
//   dEmaVol      (price − EMA12) / stdev20 of daily $ changes — distance to
//                the 12 EMA in close-to-close vol units (ATR proxy; same
//                reading convention as the Trending tab: |x| ≤ ~1 = at the
//                EMA, very negative = extended below it)
//   rs21         21-session return minus SPY's (relative strength, pp)
//   dollarVol    avg daily $ volume; thin = fails the user's short floors
//                (price ≥ $5, ≥ $20M ADV)
//   setup        short-side tag, only for names below a FALLING 50-DMA:
//                AT EMA (bounce reached the declining 12 EMA — entry zone),
//                BOUNCING (5d up, still below the EMA), EXTENDED (≤ −2 vol
//                units below the EMA — late to chase), TRENDING (drifting
//                lower near the EMA), UPTREND for everything else.
//
// The row/composite math lives in server/screener.js, shared with the
// per-sector Screener tab (server/sectorscreen.js).
//
// Short interest (% float, days-to-cover) + next earnings date come from a
// sequential quoteSummary pass cached 12h (same pattern as earnings.js).

import { GROUPS } from './symbols.js';
import { yahooFinance, withTimeout, getCloseSeries, getOhlcSeries, getQuotes } from './yahoo.js';
import { computeScreenRow, computeComposite } from './screener.js';

const SUMMARY_TTL_MS = 12 * 60 * 60 * 1000;
const SUMMARY_GAP_MS = 500;

// ---------- short interest + earnings (quoteSummary, 12h cache) ----------

const summaryCache = { bySymbol: new Map(), fetchedAt: 0, inflight: false };

async function refreshSummaries(symbols) {
  if (summaryCache.inflight) return;
  summaryCache.inflight = true;
  try {
    let ok = 0;
    for (const s of symbols) {
      try {
        const r = await withTimeout(yahooFinance.quoteSummary(s, {
          modules: ['defaultKeyStatistics', 'calendarEvents'],
        }, { validateResult: false }), 15000, `quoteSummary(${s})`);
        const ks = r?.defaultKeyStatistics;
        const earnings = r?.calendarEvents?.earnings?.earningsDate?.[0] ?? null;
        summaryCache.bySymbol.set(s, {
          shortPctFloat: ks?.shortPercentOfFloat ?? null,
          daysToCover: ks?.shortRatio ?? null,
          earningsDate: earnings ? new Date(earnings).toISOString() : null,
        });
        ok++;
      } catch {}
      await new Promise(r => setTimeout(r, SUMMARY_GAP_MS));
    }
    summaryCache.fetchedAt = Date.now();
    console.log(`Space quoteSummary loaded: ${ok}/${symbols.length}`);
  } finally {
    summaryCache.inflight = false;
  }
}

function ensureSummaries(symbols) {
  if (Date.now() - summaryCache.fetchedAt > SUMMARY_TTL_MS && !summaryCache.inflight) {
    refreshSummaries(symbols).catch(err => console.error('Space summaries failed:', err.message));
  }
}

export async function getSpace() {
  const quotes = await getQuotes();
  const spaceQuotes = quotes?.groups?.space || [];
  const symbols = GROUPS.space.map(e => e.s);
  ensureSummaries(symbols);

  const spySeries = getCloseSeries('SPY');
  const spyQuote = quotes?.groups?.sectors?.find(x => x.symbol === 'SPY');
  const spyR21 = spySeries && spySeries.length >= 21 && spyQuote?.price != null
    ? spyQuote.price / spySeries[spySeries.length - 21].c - 1 : null;

  const rows = spaceQuotes.map(q => {
    const row = computeScreenRow(q, spyR21, getCloseSeries(q.symbol), getOhlcSeries(q.symbol));
    const extra = summaryCache.bySymbol.get(q.symbol);
    row.shortPctFloat = extra?.shortPctFloat ?? null;
    row.daysToCover = extra?.daysToCover ?? null;
    row.earningsDate = extra?.earningsDate ?? null;
    return row;
  });

  return {
    asOf: quotes?.asOf ?? new Date().toISOString(),
    stale: quotes?.stale ?? false,
    composite: computeComposite(rows, getCloseSeries, new Set(['UFO', 'SPCX'])),
    rows,
  };
}
