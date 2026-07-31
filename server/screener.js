// Shared screener math for the Space tab and the per-sector Screener tab.
// All functions are pure: close series ([{ d, c }], oldest first) and OHLC
// tails ([[o,h,l,c]]) are passed in by the caller, so the same row logic runs
// against the main dashboard's daily-refs store (space) or the sector
// screener's own lazy store.
//
// Row fields and the short-the-bounce SETUP tagging are documented in
// server/space.js.

export function emaLast(values, period) {
  if (values.length < period) return null;
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export function rsi14(values) {
  const period = 14;
  if (values.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch > 0) gain += ch; else loss -= ch;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(ch, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-ch, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export function stdev(values) {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

export function sma(values, period, offsetFromEnd = 0) {
  const end = values.length - offsetFromEnd;
  if (end < period) return null;
  return values.slice(end - period, end).reduce((a, b) => a + b, 0) / period;
}

function classify(pctB) {
  if (pctB == null) return null;
  if (pctB < 0) return 'EXTREME OS';
  if (pctB < 0.2) return 'OVERSOLD';
  if (pctB > 1) return 'EXTREME OB';
  if (pctB > 0.8) return 'OVERBOUGHT';
  return 'NEUTRAL';
}

// q: quote-shaped object (symbol, name/label, price, dayPct, wtdPct, ytdPct,
// sma50, avgVolume, marketCap, open, dayHigh, dayLow). series: [{ d, c }].
// ohlc: [[o,h,l,c]] daily tail or null (falls back to a close-only spark).
export function computeScreenRow(q, spyR21, series, ohlc) {
  const closes = series ? series.map(p => p.c) : null;
  const price = q.price;
  const out = {
    symbol: q.symbol,
    label: q.name || q.label,
    dec: q.dec ?? 2,
    price,
    dayPct: q.dayPct,
    wtdPct: q.wtdPct,
    ytdPct: q.ytdPct,
    marketCap: q.marketCap ?? null,
    r5: null, r30: null, vs50: null, sma50Falling: null, rsi: null, pctB: null,
    range: null, dEmaVol: null, rs21: null, dollarVol: null, thin: null,
    setup: null,
  };
  if (price == null) return out;

  out.dollarVol = q.avgVolume != null ? q.avgVolume * price : null;
  out.thin = out.dollarVol != null ? (price < 5 || out.dollarVol < 20e6) : null;
  out.vs50 = q.sma50 ? price / q.sma50 - 1 : null;

  if (!closes || closes.length < 21) return out;
  const withLive = [...closes, price];
  // Candle tail incl. a live bar for the hover-chart popover (same [o,h,l,c]
  // format as the Trending rows); falls back to a close-only line series
  // when the daily pass has no OHLC yet.
  if (ohlc && ohlc.length >= 15) {
    const liveBar = [
      q.open ?? price,
      Math.max(q.dayHigh ?? price, price),
      Math.min(q.dayLow ?? price, price),
      price,
    ].map(v => Number(v.toPrecision(5)));
    out.spark = [...ohlc.slice(-119), liveBar];
  } else {
    out.spark = withLive.slice(-120).map(v => Number(v.toPrecision(5)));
  }
  out.sparkTf = 'day';

  out.r5 = closes.length >= 5 ? price / closes[closes.length - 5] - 1 : null;
  out.r30 = closes.length >= 30 ? price / closes[closes.length - 30] - 1 : null;
  out.rsi = rsi14(withLive);

  const m20 = sma(withLive, 20);
  const sd20 = stdev(withLive.slice(-20));
  if (m20 != null && sd20 > 0) {
    out.pctB = (price - (m20 - 2 * sd20)) / (4 * sd20);
    out.range = classify(out.pctB);
  }

  const ema12 = emaLast(withLive, 12);
  const changes = [];
  for (let i = withLive.length - 20; i < withLive.length; i++) {
    if (i > 0) changes.push(withLive[i] - withLive[i - 1]);
  }
  const volAbs = stdev(changes);
  if (ema12 != null && volAbs > 0) out.dEmaVol = (price - ema12) / volAbs;

  const sma50Now = sma(withLive, 50);
  const sma50Back = sma(closes, 50, 10);
  if (sma50Now != null && sma50Back != null) out.sma50Falling = sma50Now < sma50Back;
  if (out.vs50 == null && sma50Now != null) out.vs50 = price / sma50Now - 1;

  if (closes.length >= 21 && spyR21 != null) {
    const r21 = price / closes[closes.length - 21] - 1;
    out.rs21 = (r21 - spyR21) * 100; // percentage points vs SPY
  }

  // Downtrend = below the 50-DMA unless the 50-DMA is actually rising.
  // (Slope can be unknown for recent IPOs with a short close series.)
  // Below a RISING 50-DMA = fresh breakdown after a run-up — not yet a
  // confirmed downtrend, tagged EARLY DOWN.
  const trendDown = out.vs50 != null && out.vs50 < 0 && out.sma50Falling !== false;
  if (out.vs50 == null) out.setup = null;
  else if (out.vs50 >= 0) out.setup = 'UPTREND';
  else if (!trendDown) out.setup = 'EARLY DOWN';
  else if (out.dEmaVol != null && Math.abs(out.dEmaVol) <= 0.75) out.setup = 'AT EMA';
  else if (out.dEmaVol != null && out.dEmaVol <= -2) out.setup = 'EXTENDED';
  else if (out.r5 != null && out.r5 > 0) out.setup = 'BOUNCING';
  else out.setup = 'TRENDING';
  return out;
}

// Equal-weight composite + rebased index over the common sessions of the
// member close series. seriesFor(symbol) -> [{ d, c }] | null. Benchmark/
// excluded symbols (the sector ETF, UFO/SPCX on space) don't contribute.
export function computeComposite(rows, seriesFor, exclude = new Set()) {
  const live = rows.filter(r => r.price != null && !exclude.has(r.symbol));
  if (!live.length) return null;
  const avg = (vals) => {
    const v = vals.filter(x => x != null && isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const seriesList = live
    .map(r => seriesFor(r.symbol))
    .filter(s => s && s.length >= 20);
  let index = null;
  if (seriesList.length >= 5) {
    const counts = new Map();
    for (const s of seriesList) for (const p of s) counts.set(p.d, (counts.get(p.d) || 0) + 1);
    const common = [...counts.entries()].filter(([, n]) => n === seriesList.length)
      .map(([d]) => d).sort();
    if (common.length >= 20) {
      const dates = new Set(common);
      index = common.map(d => ({ d, v: 0 }));
      for (const s of seriesList) {
        const byDate = new Map(s.filter(p => dates.has(p.d)).map(p => [p.d, p.c]));
        const base = byDate.get(common[0]);
        index.forEach(pt => { pt.v += (byDate.get(pt.d) / base) / seriesList.length; });
      }
      index = index.map(pt => ({ d: pt.d, v: Math.round(pt.v * 10000) / 10000 }));
    }
  }
  return {
    count: live.length,
    dayPct: avg(live.map(r => r.dayPct)),
    r5: avg(live.map(r => r.r5)),
    ytdPct: avg(live.map(r => r.ytdPct)),
    belowFalling50: live.filter(r => ['AT EMA', 'BOUNCING', 'TRENDING', 'EXTENDED'].includes(r.setup)).length,
    bouncing: live.filter(r => r.setup === 'BOUNCING' || r.setup === 'AT EMA').length,
    atEma: live.filter(r => r.setup === 'AT EMA').length,
    index,
  };
}
