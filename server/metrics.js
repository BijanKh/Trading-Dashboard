// Persists key computed metrics once per market day (upsert, last write wins)
// and serves 30-day series for sparklines + the breadth-divergence check.

import { saveMetrics, getMetricSeries } from './db.js';

let lastWrite = 0;
const WRITE_INTERVAL_MS = 15 * 60 * 1000;

function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function groupVal(quotes, group, symbol) {
  return quotes?.groups?.[group]?.find(q => q.symbol === symbol)?.price ?? null;
}

export function recordMetrics(quotes, spxBreadth, mcclellan) {
  const now = Date.now();
  if (now - lastWrite < WRITE_INTERVAL_MS) return;
  lastWrite = now;

  const vix = groupVal(quotes, 'volatility', '^VIX');
  const vix3m = groupVal(quotes, 'volatility', '^VIX3M');
  saveMetrics(todayET(), {
    vix,
    vix3m,
    term_ratio: vix && vix3m ? vix / vix3m : null,
    move: groupVal(quotes, 'volatility', '^MOVE'),
    spy_close: groupVal(quotes, 'sectors', 'SPY'),
    dxy: groupVal(quotes, 'fx', 'DX-Y.NYB'),
    sector_above20: quotes?.breadth?.pctAbove20,
    sector_above50: quotes?.breadth?.pctAbove50,
    sector_above200: quotes?.breadth?.pctAbove200,
    spx_above20: spxBreadth?.pctAbove20,
    spx_above50: spxBreadth?.pctAbove50,
    spx_above200: spxBreadth?.pctAbove200,
    mcclellan_osc: mcclellan?.osc,
  });
}

export function getHistoryBundle(days = 30) {
  return {
    vix: getMetricSeries('vix', days),
    termRatio: getMetricSeries('term_ratio', days),
    move: getMetricSeries('move', days),
    spxAbove50: getMetricSeries('spx_above50', days),
    sectorAbove50: getMetricSeries('sector_above50', days),
    spyClose: getMetricSeries('spy_close', days),
    dxy: getMetricSeries('dxy', days),
  };
}

// Breadth divergence: SPY within 0.5% of its 20-day high while the share of
// S&P members above their 50d SMA is LOWER than 5 trading days ago.
export function computeDivergence(quotes, spxBreadth) {
  const spy = groupVal(quotes, 'sectors', 'SPY');
  const high20 = quotes?.spyHigh20;
  const nowBreadth = spxBreadth?.pctAbove50;
  const series = getMetricSeries('spx_above50', 10);

  if (spy == null || high20 == null || nowBreadth == null) {
    return { active: false, reason: 'insufficient data' };
  }
  if (series.length < 6) {
    return { active: false, reason: `collecting history (${series.length}/6 days)` };
  }
  const ref = series[series.length - 6].value; // 5 trading days ago
  const nearHigh = spy >= high20 * 0.995;
  const breadthFalling = nowBreadth < ref - 0.02; // >2pp deterioration
  return {
    active: nearHigh && breadthFalling,
    nearHigh,
    breadthNow: nowBreadth,
    breadth5dAgo: ref,
    spy,
    high20,
  };
}
