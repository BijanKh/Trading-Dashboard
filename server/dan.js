// "Dan" tab — multi-timeframe structure read in the Chart Guys vocabulary
// (Dan / TheChartGuys "Long Term Patterns" series), per ticker on demand.
//
// GET /api/dan?symbol=X returns, for D / W / M (+ 3M context):
//   trend by the last two pivot highs/lows (fractal pivots on CLOSED candles),
//   the last higher low (hold) and lower high (break) with dates, stair-step
//   counts, EMA12 rider, RSI14, retracement of the last leg (38.2/50/61.8),
// plus a rule-based narrative in Dan's words, a 1-5 star setup rating with a
// LONG / SHORT / NO SETUP call, and per-timeframe probabilities of an up move
// over the next 5-10 sessions. The probabilities are NOT a model forecast:
// they are hit rates from the symbol's OWN history — every past session is
// scored with the same closed-candle features, bucketed, and the realized
// 5- and 10-session direction is counted (shrunk toward the base rate).
//
// Data: one chart() call for the full daily history (+ SPY for the ratio
// chart, cached 6h). Per-symbol result cached 30 min (small LRU).

import { yahooFinance, withTimeout } from './yahoo.js';

const CACHE_TTL_MS = 30 * 60 * 1000;
const SPY_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE = 30;
const PIVOT_K = { D: 3, W: 2, M: 2, '3M': 1 };
const HORIZONS = [5, 10];
const SHRINK = 20;             // prior weight (samples) pulling bucket rates to the base rate
const BUCKET_EDGES = [-0.5, -0.15, 0.15, 0.5];
const BUCKET_NAMES = ['strong bear', 'bear', 'neutral', 'bull', 'strong bull'];
const FRAME_WEIGHTS = { D: 0.5, W: 0.3, M: 0.2 };

const cache = new Map();
let spyCache = null;

// ---------------------------------------------------------------- data ----
async function fetchDaily(symbol) {
  const result = await withTimeout(yahooFinance.chart(symbol, {
    period1: new Date(0),
    interval: '1d',
  }, { validateResult: false }), 20000, `chart-dan(${symbol})`);
  const bars = (result?.quotes || [])
    .filter(q => q.close != null && isFinite(q.close) && q.high != null && q.low != null)
    .map(q => ({
      t: q.date instanceof Date ? q.date.getTime() : new Date(q.date).getTime(),
      o: q.open ?? q.close, h: q.high, l: q.low, c: q.close, v: q.volume || 0,
    }));
  if (bars.length < 60) throw new Error(`Not enough history for "${symbol}"`);
  return { bars, name: result?.meta?.shortName || result?.meta?.longName || symbol, currency: result?.meta?.currency || 'USD' };
}

async function getSpyBars() {
  if (spyCache && Date.now() - spyCache.at < SPY_TTL_MS) return spyCache.bars;
  const { bars } = await fetchDaily('SPY');
  spyCache = { bars, at: Date.now() };
  return bars;
}

const DAY = 86400000;
const dayNum = (t) => Math.floor(t / DAY);
function frameKey(t, tf) {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (tf === 'D') return dayNum(t);
  if (tf === 'W') return Math.floor((dayNum(t) + 3) / 7);        // Monday-based ISO-ish week
  if (tf === 'M') return y * 12 + m;
  if (tf === '3M') return y * 4 + Math.floor(m / 3);
  throw new Error(tf);
}

// Resample daily bars into frame bars; each frame bar remembers the index of
// the last daily bar it contains (so a daily index maps to its frame bar).
function resample(bars, tf) {
  if (tf === 'D') return bars.map((b, i) => ({ ...b, lastIdx: i, firstIdx: i }));
  const out = [];
  let cur = null, key = null;
  bars.forEach((b, i) => {
    const k = frameKey(b.t, tf);
    if (k !== key) {
      cur = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, firstIdx: i, lastIdx: i };
      out.push(cur); key = k;
    } else {
      cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; cur.t = b.t; cur.lastIdx = i;
    }
  });
  return out;
}

// ---------------------------------------------------------- indicators ----
function emaSeries(vals, n = 12) {
  const k = 2 / (n + 1), out = new Array(vals.length);
  let e = vals[0];
  for (let i = 0; i < vals.length; i++) { e = i === 0 ? vals[0] : vals[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
function rsiSeries(vals, n = 14) {
  const out = new Array(vals.length).fill(50);
  let au = 0, ad = 0;
  const a = 1 / n;
  for (let i = 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    const up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i === 1) { au = up; ad = dn; } else { au = up * a + au * (1 - a); ad = dn * a + ad * (1 - a); }
    out[i] = ad === 0 ? (au === 0 ? 50 : 100) : 100 - 100 / (1 + au / ad);
  }
  return out;
}
function atrSeries(fb, n = 14) {
  const out = new Array(fb.length).fill(null);
  let a = null;
  for (let i = 1; i < fb.length; i++) {
    const tr = Math.max(fb[i].h - fb[i].l, Math.abs(fb[i].h - fb[i - 1].c), Math.abs(fb[i].l - fb[i - 1].c));
    a = a == null ? tr : (a * (n - 1) + tr) / n;
    out[i] = a;
  }
  return out;
}

// -------------------------------------------------------------- pivots ----
// Raw k-bar fractal pivots over the whole frame series; pivot at index p is
// only KNOWN at index p + k (confirmation lag), which the walk respects.
function rawPivots(fb, k) {
  const piv = [];
  for (let i = k; i < fb.length - k; i++) {
    let isH = true, isL = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (fb[j].h >= fb[i].h && j < i) isH = false;
      if (fb[j].h > fb[i].h && j > i) isH = false;
      if (fb[j].l <= fb[i].l && j < i) isL = false;
      if (fb[j].l < fb[i].l && j > i) isL = false;
    }
    if (isH) piv.push({ kind: 'H', idx: i, price: fb[i].h, t: fb[i].t });
    if (isL) piv.push({ kind: 'L', idx: i, price: fb[i].l, t: fb[i].t });
  }
  return piv;
}

// Incremental, lookahead-free walk over a frame series: at every closed bar j
// we know the pivots confirmed so far (alternation enforced as they arrive),
// the EMA12 / RSI / stair-step state, and the trend classification.
function walkFrame(fb, tf) {
  const k = PIVOT_K[tf];
  const closes = fb.map(b => b.c);
  const ema = emaSeries(closes), rsi = rsiSeries(closes);
  const atr = tf === 'D' ? atrSeries(fb) : null;
  const raw = rawPivots(fb, k);
  const kept = [];                       // alternating confirmed pivots
  let ptr = 0;
  const states = new Array(fb.length);
  let riderAbove = 0, riderBelow = 0, stairUp = 0, stairDn = 0;

  for (let j = 0; j < fb.length; j++) {
    while (ptr < raw.length && raw[ptr].idx + k <= j) {
      const p = raw[ptr++];
      const last = kept[kept.length - 1];
      if (last && last.kind === p.kind) {
        const better = p.kind === 'H' ? p.price > last.price : p.price < last.price;
        if (better) kept[kept.length - 1] = p;
      } else kept.push(p);
    }
    const above = fb[j].c > ema[j];
    riderAbove = above ? riderAbove + 1 : 0;
    riderBelow = above ? 0 : riderBelow + 1;
    if (j > 0) {
      stairUp = fb[j].l > fb[j - 1].l ? stairUp + 1 : 0;
      stairDn = fb[j].h < fb[j - 1].h ? stairDn + 1 : 0;
    }
    const hs = kept.filter(p => p.kind === 'H').slice(-2);
    const ls = kept.filter(p => p.kind === 'L').slice(-2);
    let trend = 'unclear', code = 0, info = null;
    if (hs.length === 2 && ls.length === 2) {
      const hh = hs[1].price > hs[0].price, hl = ls[1].price > ls[0].price;
      info = { lastHigh: hs[1].price, lastHighT: hs[1].t, prevHigh: hs[0].price, lastLow: ls[1].price, lastLowT: ls[1].t, prevLow: ls[0].price };
      if (hh && hl) { trend = 'uptrend (HH + HL)'; code = 1; }
      else if (!hh && !hl) { trend = 'downtrend (LH + LL)'; code = -1; }
      else if (!hh && hl) { trend = 'tightening — equilibrium (LH + HL)'; code = 0; }
      else { trend = 'expanding — megaphone (HH + LL)'; code = 0; }
      const px = fb[j].c;
      if (px > info.lastHigh && stairUp >= 2 && code !== 1) { trend = 'uptrend — stair-step (HH, no pullback pivot yet)'; code = 1; }
      else if (px < info.lastLow && stairDn >= 2 && code !== -1) { trend = 'downtrend — stair-step (LL, no bounce pivot yet)'; code = -1; }
    }
    states[j] = {
      trend, code, info, ema: ema[j], rsi: rsi[j], atr: atr ? atr[j] : null,
      above, riderAbove, riderBelow, stairUp, stairDn,
      insideBar: j > 0 && fb[j].h < fb[j - 1].h && fb[j].l > fb[j - 1].l,
      score: null,
    };
    states[j].score = scoreState(states[j], tf);
  }
  return { states, ema, rsi, kept };
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

// Directional score in [-1, 1] from the closed-candle state of one frame.
function scoreState(s, tf) {
  const trend = s.code;
  const rider = s.above ? s.riderAbove : s.riderBelow;
  const emaS = (s.above ? 1 : -1) * (0.6 + 0.4 * Math.min(rider, 8) / 8);
  const stair = clamp((s.stairUp - s.stairDn) / 5, -1, 1);
  let rsiS;
  if (tf === 'D') rsiS = s.rsi < 30 ? 0.6 : s.rsi > 70 ? -0.3 : (s.rsi - 50) / 50 * 0.3;
  else rsiS = s.rsi < 30 ? 0.4 : s.rsi > 80 ? -0.2 : (s.rsi - 50) / 50 * 0.3;
  return clamp(0.35 * trend + 0.3 * emaS + 0.15 * stair + 0.2 * rsiS, -1, 1);
}
function bucketOf(score) {
  let b = 0;
  for (const e of BUCKET_EDGES) if (score > e) b++;
  return b;
}

// ---------------------------------------------------------- retracement ---
function retracement(fb, look) {
  const w = fb.slice(-look);
  let iHi = 0, iLo = 0;
  w.forEach((b, i) => { if (b.h > w[iHi].h) iHi = i; if (b.l < w[iLo].l) iLo = i; });
  const hi = w[iHi].h, lo = w[iLo].l, px = w[w.length - 1].c, rng = hi - lo || 1;
  if (iLo < iHi) {
    return { leg: 'up', from: lo, fromT: w[iLo].t, to: hi, toT: w[iHi].t, retracePct: (hi - px) / rng * 100, offHighPct: (px / hi - 1) * 100,
      fib: { '38.2': hi - 0.382 * rng, '50': hi - 0.5 * rng, '61.8': hi - 0.618 * rng } };
  }
  return { leg: 'down', from: hi, fromT: w[iHi].t, to: lo, toT: w[iLo].t, bouncePct: (px - lo) / rng * 100, offLowPct: (px / lo - 1) * 100,
    fib: { '38.2': lo + 0.382 * rng, '50': lo + 0.5 * rng, '61.8': lo + 0.618 * rng } };
}

// ------------------------------------------------------------ main read ---
export async function getDanRead(symbolRaw) {
  const symbol = String(symbolRaw || '').trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.^=\-]{1,12}$/.test(symbol)) throw new Error('Invalid symbol');
  const hit = cache.get(symbol);
  if (hit?.data && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;
  if (hit?.inflight) return hit.inflight;
  const inflight = compute(symbol).then(data => {
    cache.set(symbol, { data, fetchedAt: Date.now() });
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    return data;
  }).catch(err => { cache.delete(symbol); throw err; });
  cache.set(symbol, { inflight });
  return inflight;
}

async function compute(symbol) {
  const { bars, name, currency } = await fetchDaily(symbol);
  const spy = symbol === 'SPY' ? null : await getSpyBars().catch(() => null);
  const n = bars.length;
  const frames = {};
  for (const tf of ['D', 'W', 'M', '3M']) {
    const fb = resample(bars, tf);
    frames[tf] = { fb, ...walkFrame(fb, tf) };
  }

  // --- calibration: every daily session scored with the closed-candle state
  // of each frame (for W/M the last COMPLETED candle before that session)
  const calib = {};
  const closes = bars.map(b => b.c);
  for (const tf of ['D', 'W', 'M']) {
    const { fb, states } = frames[tf];
    const counts = HORIZONS.map(() => BUCKET_NAMES.map(() => ({ n: 0, up: 0 })));
    const base = HORIZONS.map(() => ({ n: 0, up: 0 }));
    let fj = 0;
    const start = Math.max(260, 0);
    for (let i = start; i < n - 10; i++) {
      while (fj + 1 < fb.length && fb[fj + 1].lastIdx <= i) fj++;
      const sIdx = tf === 'D' ? i : (fb[fj].lastIdx === i ? fj : fj - 1 >= 0 ? fj - 1 : null);
      // W/M: use the last frame bar that CLOSED on or before i; if bar fj is
      // still forming at i, step back one.
      const useIdx = tf === 'D' ? i : (fb[fj].lastIdx <= i ? fj : fj - 1);
      if (useIdx == null || useIdx < 0) continue;
      const st = states[useIdx];
      if (!st?.info) continue;
      const b = bucketOf(st.score);
      HORIZONS.forEach((h, hi) => {
        const up = closes[i + h] > closes[i] ? 1 : 0;
        counts[hi][b].n++; counts[hi][b].up += up;
        base[hi].n++; base[hi].up += up;
      });
    }
    calib[tf] = { counts, base };
  }

  // --- live state per frame (forming candle included for the table, closed for the score)
  const reads = {};
  for (const tf of ['D', 'W', 'M', '3M']) {
    const { fb, states, ema, rsi, kept } = frames[tf];
    const last = fb.length - 1;
    const closedIdx = tf === 'D' ? last : (fb[last].lastIdx === n - 1 && fb[last].firstIdx !== fb[last].lastIdx ? last - 1 : last);
    // the forming candle: on W/M the last frame bar is still open unless it ended on the last session
    const forming = tf !== 'D';
    const st = states[last], stClosed = states[Math.max(0, forming ? last - 1 : last)];
    const px = fb[last].c;
    const look = { D: 500, W: 160, M: 48, '3M': 24 }[tf];
    const r = retracement(fb, look);
    const info = st.info;
    const read = {
      tf, bars: fb.length, close: px, lastT: fb[last].t,
      trend: st.trend, code: st.code,
      lastLow: info?.lastLow ?? null, lastLowT: info?.lastLowT ?? null,
      lastHigh: info?.lastHigh ?? null, lastHighT: info?.lastHighT ?? null,
      bullConfirmAbove: info && px < info.lastHigh ? info.lastHigh : null,
      bearConfirmBelow: info && px > info.lastLow ? info.lastLow : null,
      lostLastLow: info ? px < info.lastLow : false,
      clearedLastHigh: info ? px > info.lastHigh : false,
      stairUp: st.stairUp, stairDn: st.stairDn,
      stairUpBrokenAfter: last > 1 && fb[last].l < fb[last - 1].l && states[last - 1].stairUp >= 3 ? states[last - 1].stairUp : 0,
      stairDnBrokenAfter: last > 1 && fb[last].h > fb[last - 1].h && states[last - 1].stairDn >= 3 ? states[last - 1].stairDn : 0,
      insideBar: st.insideBar,
      ema12: st.ema, emaDistPct: (px / st.ema - 1) * 100, emaNow: st.above ? 'above' : 'below',
      riderAbove: stClosed.riderAbove, riderBelow: stClosed.riderBelow,
      atr: st.atr, emaDistAtr: st.atr ? (px - st.ema) / st.atr : null,
      rsi: st.rsi, rsiState: st.rsi < 30 ? 'oversold' : st.rsi > 70 ? 'overbought' : 'neutral',
      retrace: r,
      score: stClosed.score, scoreBucket: BUCKET_NAMES[bucketOf(stClosed.score)],
      forming, formingNote: formingNote(tf, fb[last].t),
      chart: chartPayload(fb, ema, { D: 130, W: 120, M: 72, '3M': 40 }[tf]),
    };
    // RSI oversold since the swing high (D and W only)
    if (r.leg === 'up' && (tf === 'D' || tf === 'W')) {
      const iHi = fb.findIndex(b => b.t === r.toT);
      read.oversoldSinceHigh = rsi.slice(iHi).some(v => v < 30);
    }
    reads[tf] = read;
  }

  // --- probabilities per frame (hit rates, shrunk toward the base rate)
  const probs = {};
  for (const tf of ['D', 'W', 'M']) {
    const { counts, base } = calib[tf];
    const b = bucketOf(reads[tf].score);
    const per = HORIZONS.map((h, hi) => {
      const c = counts[hi][b], br = base[hi].n ? base[hi].up / base[hi].n : 0.5;
      return { h, n: c.n, raw: c.n ? c.up / c.n : null, p: (c.up + SHRINK * br) / (c.n + SHRINK), base: br };
    });
    const pUp = per.reduce((a, x) => a + x.p, 0) / per.length;
    probs[tf] = { up: pUp, down: 1 - pUp, bucket: BUCKET_NAMES[b], n: per[0].n, base: per[0].base, horizons: per };
  }
  const combinedUp = ['D', 'W', 'M'].reduce((a, tf) => a + FRAME_WEIGHTS[tf] * probs[tf].up, 0);

  // --- relative strength vs SPY (ratio chart, EMA12 rider on D and W)
  let ratio = null;
  if (spy) {
    const spyMap = new Map(spy.map(b => [dayNum(b.t), b.c]));
    const rb = bars.filter(b => spyMap.has(dayNum(b.t))).map(b => ({ t: b.t, c: b.c / spyMap.get(dayNum(b.t)) }));
    const mk = (series) => {
      const e = emaSeries(series.map(x => x.c));
      let run = 0; const above = series[series.length - 1].c > e[e.length - 1];
      for (let i = series.length - 2; i >= 0; i--) { if ((series[i].c > e[i]) === above) run++; else break; }
      return { now: above ? 'relative strength' : 'relative weakness', closes: run, distPct: (series[series.length - 1].c / e[e.length - 1] - 1) * 100 };
    };
    const wk = resample(rb.map(x => ({ ...x, o: x.c, h: x.c, l: x.c, v: 0 })), 'W').map(b => ({ t: b.t, c: b.c }));
    ratio = { bench: 'SPY', D: mk(rb.slice(-400)), W: mk(wk.slice(-200)) };
  }

  // --- rating
  const rating = rate(reads, probs, ratio);
  const narrative = narrate(symbol, reads, probs, ratio, rating, combinedUp);

  return {
    symbol, name, currency, asOf: bars[n - 1].t, close: bars[n - 1].c, sessions: n,
    firstBar: bars[0].t,
    reads: { D: strip(reads.D), W: strip(reads.W), M: strip(reads.M), '3M': strip(reads['3M']) },
    charts: { D: reads.D.chart, W: reads.W.chart, M: reads.M.chart },
    probs, combinedUp, ratio, rating, narrative,
    method: 'Probabilities = hit rate of an up close 5 and 10 sessions later across this symbol\'s own history whenever the frame\'s closed-candle score sat in the same bucket as today, shrunk toward the base rate (prior weight 20). Not a forecast of size, and the three frames share the same 5-10 session horizon.',
  };
}

function strip(r) { const { chart, ...rest } = r; return rest; }

function chartPayload(fb, ema, nBars) {
  const s = Math.max(0, fb.length - nBars);
  return {
    bars: fb.slice(s).map(b => [b.t, round(b.o), round(b.h), round(b.l), round(b.c)]),
    ema12: ema.slice(s).map(round),
  };
}
function round(x) { return x == null ? null : Number(Number(x).toPrecision(6)); }

function formingNote(tf, t) {
  const now = new Date();
  if (tf === 'D') return '';
  if (tf === 'W') { const dow = now.getUTCDay(); return `${Math.max(0, 5 - (dow === 0 ? 0 : Math.min(dow, 5)))} sessions left in the week`; }
  if (tf === 'M') { const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)); return `${Math.max(0, Math.round((end - now) / DAY))} days left in the month`; }
  if (tf === '3M') { const q = Math.floor(now.getUTCMonth() / 3); const end = new Date(Date.UTC(now.getUTCFullYear(), q * 3 + 3, 0)); return `${Math.max(0, Math.round((end - now) / DAY))} days left in the quarter`; }
  return '';
}

// ------------------------------------------------------------- rating -----
function rate(reads, probs, ratio) {
  const D = reads.D, W = reads.W, M = reads.M;
  const combined = FRAME_WEIGHTS.D * D.score + FRAME_WEIGHTS.W * W.score + FRAME_WEIGHTS.M * M.score;
  const dir = combined > 0.15 ? 'LONG' : combined < -0.15 ? 'SHORT' : 'NONE';
  const sign = dir === 'LONG' ? 1 : dir === 'SHORT' ? -1 : 0;
  const reasons = [];
  let pts = 1;
  let historyEdge = null;
  if (sign !== 0) {
    const aligned = ['D', 'W', 'M'].filter(tf => Math.sign(reads[tf].score) === sign);
    pts += aligned.length === 3 ? 2 : aligned.length === 2 ? 1 : 0;
    reasons.push(aligned.length === 3 ? 'all three frames point the same way' : aligned.length === 2 ? `${aligned.join(' + ')} agree, ${['D', 'W', 'M'].find(t => !aligned.includes(t))} does not` : 'frames disagree');
    // low-risk location: pullback to the daily EMA12 rider, or sitting on the last pivot
    const atEma = D.emaDistAtr != null && Math.abs(D.emaDistAtr) <= 1 && (sign > 0 ? D.emaNow === 'above' : D.emaNow === 'below');
    const nearPivot = sign > 0 && D.lastLow && D.close / D.lastLow - 1 < 0.03 && D.close > D.lastLow
      || sign < 0 && D.lastHigh && 1 - D.close / D.lastHigh < 0.03 && D.close < D.lastHigh;
    if (atEma || nearPivot) { pts += 1; reasons.push(atEma ? 'price is at the daily EMA12 rider (≤1 ATR) — low-risk entry, stop under the pivot' : 'price sits on the last daily pivot — invalidation is close'); }
    if (D.emaDistAtr != null && Math.abs(D.emaDistAtr) > 2.5) { pts -= 1; reasons.push(`extended ${D.emaDistAtr.toFixed(1)} ATR from the daily EMA12 — chase risk`); }
    if (sign > 0 && W.rsi > 80 || sign < 0 && W.rsi < 20) { pts -= 1; reasons.push('weekly RSI at an extreme — expect consolidation on the weekly first'); }
    if (sign > 0 && D.rsiState === 'oversold' && M.code === 1) { pts += 1; reasons.push('first daily oversold inside a monthly uptrend — the "backburner" that marks monthly higher lows'); }
    if (W.trend.startsWith('tightening') || M.trend.startsWith('tightening')) reasons.push('a tightening range on the higher frame — the break will decide; want it tight if not positioned');
    if (ratio) {
      const rsOk = sign > 0 ? ratio.W.now === 'relative strength' : ratio.W.now === 'relative weakness';
      if (rsOk) { pts += 0.5; reasons.push(`weekly ${ratio.W.now} vs SPY (${ratio.W.closes} closes)`); }
      else reasons.push(`weekly ${ratio.W.now} vs SPY works against the ${dir.toLowerCase()}`);
    }
    // History check: does this symbol's own past agree with the structure?
    // The structure says what the chart looks like; the hit rate says what
    // the same state did next in this name. A contradiction costs a star and
    // is said out loud (never a bare signal).
    const combinedUp = ['D', 'W', 'M'].reduce((a, tf) => a + FRAME_WEIGHTS[tf] * probs[tf].up, 0);
    const base = probs.D.base;
    const edge = (combinedUp - base) * sign;      // >0 = history agrees with the direction
    const pct = (x) => `${Math.round(x * 100)}%`;
    if (edge >= 0.02) { pts += 0.5; reasons.push(`history check agrees: this state resolved ${sign > 0 ? 'up' : 'down'} ${pct(sign > 0 ? combinedUp : 1 - combinedUp)} of the time within 5–10 sessions (base ${pct(sign > 0 ? base : 1 - base)})`); }
    else if (edge <= -0.02) { pts -= 1; reasons.push(`history check DISAGREES: in this name the same state resolved ${sign > 0 ? 'down' : 'up'} ${pct(sign > 0 ? 1 - combinedUp : combinedUp)} of the time within 5–10 sessions (base ${pct(sign > 0 ? 1 - base : base)}) — the structure says ${dir.toLowerCase()}, the tape says it tends to snap back first; let the ${sign > 0 ? 'higher low' : 'lower high'} form instead of chasing`); }
    else reasons.push(`history check neutral: ${pct(combinedUp)} up vs base ${pct(base)}`);
    historyEdge = edge;
  } else {
    reasons.push('frames net out — no edge in direction; wait for the daily trend to confirm');
  }
  const stars = sign === 0 ? Math.min(2, Math.max(1, Math.round(pts))) : clamp(Math.round(pts), 1, 5);
  return { stars, direction: dir, combinedScore: combined, reasons, historyEdge };
}

// ---------------------------------------------------------- narrative -----
const fmt = (x, d = 2) => x == null ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const dstr = (t) => t ? new Date(t).toISOString().slice(0, 10) : '';
const FRAME_NAME = { D: 'Daily', W: 'Weekly', M: 'Monthly', '3M': 'Quarterly' };
const UP_ONE = { D: 'weekly', W: 'monthly', M: '3-month / 6-month', '3M': 'yearly' };
const DOWN_ONE = { D: '4-hour', W: 'daily', M: 'weekly', '3M': '2-week' };

function mostLikely(r, tf) {
  const up1 = UP_ONE[tf], unit = { D: 'sessions', W: 'weeks', M: 'months', '3M': 'quarters' }[tf];
  const hold = r.lastLow ? `${fmt(r.lastLow)} (${dstr(r.lastLowT)})` : '—';
  const brk = r.lastHigh ? `${fmt(r.lastHigh)} (${dstr(r.lastHighT)})` : '—';
  if (r.code === 1) {
    const run = Math.max(r.stairUp, r.riderAbove);
    let s = `${FRAME_NAME[tf]} uptrend. `;
    if (r.stairUp >= 3) s += `Stair-step of ${r.stairUp} ${unit} with a higher low every candle — consolidation on this frame is inevitable and will feel like a top; `;
    else if (r.stairUpBrokenAfter) s += `The ${r.stairUpBrokenAfter}-candle stair-step just broke — ${FRAME_NAME[tf].toLowerCase()} consolidation has started, not a trend change; `;
    else s += `Pullback or pause inside the uptrend; `;
    s += `the most likely next pivot is a ${FRAME_NAME[tf].toLowerCase()} higher low. Anything above ${hold} keeps it; losing that level confirms a downtrend on this frame.`;
    if (r.retrace?.leg === 'up' && r.retrace.retracePct > 50) s += ` Caution: ${fmt(r.retrace.retracePct, 0)}% of the last leg is already given back — that creates space for a lower high, so an equilibrium becomes as likely as continuation.`;
    else if (r.retrace?.leg === 'up' && r.retrace.retracePct <= 38.2 && r.retrace.retracePct > 3) s += ` Only ${fmt(r.retrace.retracePct, 0)}% retraced — flag territory, continuation favoured.`;
    if (r.riderAbove >= 4) s += ` EMA12 rider: ${r.riderAbove} closes above — "if ${FRAME_NAME[tf].toLowerCase()} EMA12 is support, nothing has changed"; losing it is the first sign of consolidation on the ${up1} frame.`;
    return s;
  }
  if (r.code === -1) {
    let s = `${FRAME_NAME[tf]} downtrend. `;
    if (r.stairDn >= 3) s += `Lower high every candle for ${r.stairDn} ${unit} — bears in control; `;
    s += `The next bounce is a ${FRAME_NAME[tf].toLowerCase()} lower high until ${brk} breaks. Burden on bulls: the first baby step is a ${DOWN_ONE[tf]} uptrend confirming, then this frame has to break ${brk}.`;
    if (r.retrace?.leg === 'down' && r.retrace.bouncePct > 50) s += ` The bounce has already retraced ${fmt(r.retrace.bouncePct, 0)}% of the drop — space for a higher low; scout an equilibrium rather than fresh lows.`;
    else if (r.retrace?.leg === 'down' && r.retrace.bouncePct < 38.2) s += ` Bounce only ${fmt(r.retrace.bouncePct, 0)}% of the drop — bear-flag territory, lower lows favoured.`;
    if (r.riderBelow >= 4) s += ` EMA12 has been resistance for ${r.riderBelow} closes — nothing changes until that flips.`;
    return s;
  }
  if (r.trend.startsWith('tightening')) {
    return `${FRAME_NAME[tf]} equilibrium: lower high ${brk}, higher low ${hold}, tightening. The direction of the break decides the ${up1} pivot; ${r.insideBar ? 'inside bar — volatility is coming; ' : ''}if you are not positioned you want it as tight as possible before it snaps. Entries inside the range play the levels; conservative traders wait for the break plus the level behind it.`;
  }
  if (r.trend.startsWith('expanding')) {
    return `${FRAME_NAME[tf]} megaphone: higher high ${brk} and lower low ${hold} — breaks both ways with no follow-through. Fade conviction on either break until a trend confirms; a >50% retrace of any breakout leg keeps the pattern alive.`;
  }
  return `${FRAME_NAME[tf]}: not enough pivots to classify.`;
}

function narrate(symbol, reads, probs, ratio, rating, combinedUp) {
  const M = reads.M, W = reads.W, D = reads.D, Q = reads['3M'];
  const lines = [];
  lines.push({ h: 'Longest frame first (3M → M)', t: `${mostLikely(Q, '3M')} ${mostLikely(M, 'M')}` });
  lines.push({ h: 'Zoom in (W)', t: `${mostLikely(W, 'W')} Baby step for the monthly pivot: ${W.bullConfirmAbove ? `a weekly uptrend confirms above ${fmt(W.bullConfirmAbove)}` : 'the weekly uptrend is intact'}; ${W.bearConfirmBelow ? `a weekly downtrend confirms below ${fmt(W.bearConfirmBelow)}` : 'the weekly downtrend is intact'}.` });
  let d = `${mostLikely(D, 'D')} RSI ${fmt(D.rsi, 0)}${D.rsiState === 'oversold' ? ' — daily oversold ("backburner"): in the strongest uptrends this is where the monthly higher low prints' : D.rsiState === 'overbought' ? ' — overbought; let it consolidate before adding' : ''}. Price is ${fmt(D.emaDistAtr, 1)} ATR ${D.emaNow} the daily EMA12 (${D.emaDistAtr != null && Math.abs(D.emaDistAtr) <= 1 ? 'at the rider — the low-risk spot' : Math.abs(D.emaDistAtr || 0) > 2.5 ? 'extended' : 'inside the normal band'}).`;
  if (D.retrace?.leg === 'up') d += ` Last leg ${fmt(D.retrace.from)} → ${fmt(D.retrace.to)}; fib 38.2 ${fmt(D.retrace.fib['38.2'])} · 50 ${fmt(D.retrace.fib['50'])} · 61.8 ${fmt(D.retrace.fib['61.8'])}.`;
  else if (D.retrace) d += ` Last leg ${fmt(D.retrace.from)} → ${fmt(D.retrace.to)}; bounce targets 38.2 ${fmt(D.retrace.fib['38.2'])} · 50 ${fmt(D.retrace.fib['50'])} · 61.8 ${fmt(D.retrace.fib['61.8'])}.`;
  lines.push({ h: 'Zoom in (D)', t: d });
  if (ratio) lines.push({ h: 'Relative strength vs SPY', t: `Daily ${ratio.D.now} (${ratio.D.closes} closes, ${ratio.D.distPct >= 0 ? '+' : ''}${fmt(ratio.D.distPct, 1)}% to the ratio EMA12); weekly ${ratio.W.now} (${ratio.W.closes} closes). ${ratio.W.now === 'relative strength' ? 'Capital is rotating in — leaders are where the follow-through is.' : 'Capital is not rotating in yet — laggards only get interesting once the ratio turns over its weekly EMA12.'}` });
  const dirWord = rating.direction === 'NONE' ? 'no setup' : rating.direction.toLowerCase();
  const line = rating.direction === 'LONG'
    ? `"That's the daily higher low at ${fmt(D.lastLow)} or I'm wrong" — stop under ${fmt(D.lastLow)}, first partial into ${D.bullConfirmAbove ? fmt(D.bullConfirmAbove) : 'the next lower high'} to go risk-free, runner waits for the weekly pivot.`
    : rating.direction === 'SHORT'
      ? `"That's the daily lower high at ${fmt(D.lastHigh)} or I'm wrong" — stop above ${fmt(D.lastHigh)}, first partial into ${D.bearConfirmBelow ? fmt(D.bearConfirmBelow) : 'the next higher low'} to go risk-free, runner waits for the weekly pivot.`
      : 'No line: wait for the daily trend to confirm one way, then read the weekly pivot it would form.';
  lines.push({ h: `Verdict: ${'★'.repeat(rating.stars)}${'☆'.repeat(5 - rating.stars)} ${dirWord}`, t: `${rating.reasons.join('; ')}. ${line} Combined read ${fmt(combinedUp * 100, 0)}% up / ${fmt((1 - combinedUp) * 100, 0)}% down over the next 5–10 sessions (D ${fmt(probs.D.up * 100, 0)}%, W ${fmt(probs.W.up * 100, 0)}%, M ${fmt(probs.M.up * 100, 0)}%). Size is yours; the stop distance is what keeps the loss inside the line.` });
  return lines;
}
