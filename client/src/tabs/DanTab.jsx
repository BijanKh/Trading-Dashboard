import React, { useState, useCallback, useEffect } from 'react';
import { colors, fonts } from '../styles/theme';
import { fetchDan } from '../lib/api';
import { fmtPrice } from '../lib/format';
import CandleChart from '../components/CandleChart';

// "Dan" — per-ticker multi-timeframe structure read in the Chart Guys
// vocabulary (trend by pivots, stair-steps, EMA12 rider, retracement, the
// shorter-frame pattern that forms the longer-frame pivot), a 1-5 star
// setup rating with LONG / SHORT / NO SETUP, and per-timeframe up/down
// probabilities for the next 5-10 sessions (hit rates of the symbol's own
// history for today's state — always shown next to the base rate).

const QUICK = ['SPY', 'QQQ', 'IWM', 'GC=F', 'SI=F', 'CL=F', 'BTC-USD', 'NVDA', 'TSLA', 'CCJ', 'BA', 'LIT'];
const LS_KEY = 'danTabSymbol';

const card = { background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: '12px 14px', minWidth: 0 };
const dstr = (t) => t ? new Date(t).toISOString().slice(0, 10) : '';
const pct = (x) => x == null ? '--' : `${Math.round(x * 100)}%`;

function Stars({ n }) {
  return (
    <span style={{ fontSize: 26, letterSpacing: 2, color: colors.regime.ELEVATED, fontFamily: fonts.sans }}>
      {'★'.repeat(n)}<span style={{ color: colors.text.muted }}>{'☆'.repeat(5 - n)}</span>
    </span>
  );
}

function ProbBar({ label, p, base, n, bucket }) {
  const up = p?.up ?? 0.5;
  const upColor = colors.updown.up, dnColor = colors.updown.down;
  const edge = p ? up - p.base : 0;
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 600, color: colors.text.primary }}>{label}</span>
        <span style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.text.muted }}>state: {bucket}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
        <span style={{ fontFamily: fonts.mono, fontSize: 22, fontWeight: 700, color: upColor }}>▲ {pct(up)}</span>
        <span style={{ fontFamily: fonts.mono, fontSize: 22, fontWeight: 700, color: dnColor }}>▼ {pct(1 - up)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', marginTop: 8, background: colors.bg.border }}>
        <div style={{ width: `${up * 100}%`, background: upColor }} />
        <div style={{ width: `${(1 - up) * 100}%`, background: dnColor }} />
      </div>
      <div style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.text.muted, marginTop: 6 }}>
        base rate ▲ {pct(p?.base)} · edge {edge >= 0 ? '+' : ''}{(edge * 100).toFixed(0)} pts · n={n ?? '--'} past sessions in this state
      </div>
    </div>
  );
}

function Row({ k, v, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: fonts.mono, fontSize: 11, padding: '3px 0', borderBottom: `1px solid ${colors.bg.border}` }}>
      <span style={{ color: colors.text.muted }}>{k}</span>
      <span style={{ color: color || colors.text.primary, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

function FrameCard({ r, label }) {
  if (!r) return null;
  const trendColor = r.code > 0 ? colors.updown.up : r.code < 0 ? colors.updown.down : colors.regime.ELEVATED;
  const retr = r.retrace?.leg === 'up' ? `${r.retrace.retracePct.toFixed(0)}% of the up-leg given back` : r.retrace ? `bounced ${r.retrace.bouncePct.toFixed(0)}% of the drop` : '--';
  const stair = r.stairUp >= r.stairDn ? `${r.stairUp} higher lows` : `${r.stairDn} lower highs`;
  const rider = r.emaNow === 'above' ? `${r.riderAbove} closes above (${r.emaDistPct >= 0 ? '+' : ''}${r.emaDistPct.toFixed(1)}%)` : `${r.riderBelow} closes below (${r.emaDistPct.toFixed(1)}%)`;
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 600, color: colors.text.primary }}>{label}</span>
        <span style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.text.muted }}>{r.formingNote || `${r.bars} bars`}</span>
      </div>
      <Row k="trend" v={r.trend} color={trendColor} />
      <Row k="hold (last higher low)" v={r.lastLow != null ? `${fmtPrice(r.lastLow)} · ${dstr(r.lastLowT)}` : '--'} color={colors.updown.up} />
      <Row k="break (last lower high)" v={r.lastHigh != null ? `${fmtPrice(r.lastHigh)} · ${dstr(r.lastHighT)}` : '--'} color={colors.updown.down} />
      <Row k="stair-step" v={`${stair}${r.stairUpBrokenAfter ? ` · up-run of ${r.stairUpBrokenAfter} just broke` : r.stairDnBrokenAfter ? ` · down-run of ${r.stairDnBrokenAfter} just broke` : ''}${r.insideBar ? ' · inside bar' : ''}`} />
      <Row k="EMA12 rider" v={rider} color={r.emaNow === 'above' ? colors.updown.up : colors.updown.down} />
      {r.emaDistAtr != null && <Row k="distance to EMA12" v={`${r.emaDistAtr.toFixed(1)} ATR ${Math.abs(r.emaDistAtr) <= 1 ? '(PULLBACK)' : Math.abs(r.emaDistAtr) > 2.5 ? '(EXTENDED)' : ''}`} />}
      <Row k="RSI14" v={`${r.rsi.toFixed(0)} ${r.rsiState !== 'neutral' ? r.rsiState.toUpperCase() : ''}${r.oversoldSinceHigh === false ? ' · no oversold since the swing high' : ''}`} color={r.rsiState === 'oversold' ? colors.updown.up : r.rsiState === 'overbought' ? colors.updown.down : undefined} />
      <Row k="retracement" v={retr} />
      {r.retrace?.fib && <Row k="fib 38.2 / 50 / 61.8" v={`${fmtPrice(r.retrace.fib['38.2'])} / ${fmtPrice(r.retrace.fib['50'])} / ${fmtPrice(r.retrace.fib['61.8'])}`} />}
      <Row k="structure score" v={`${r.score >= 0 ? '+' : ''}${r.score.toFixed(2)} (${r.scoreBucket})`} color={r.score > 0.15 ? colors.updown.up : r.score < -0.15 ? colors.updown.down : undefined} />
    </div>
  );
}

export default function DanTab() {
  const [input, setInput] = useState(() => { try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; } });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (symbol) => {
    const sym = String(symbol || '').trim().toUpperCase();
    if (!sym) return;
    setLoading(true); setError(null);
    try {
      const d = await fetchDan(sym);
      setData(d); setInput(sym);
      try { localStorage.setItem(LS_KEY, sym); } catch {}
    } catch (err) {
      setError(err.message.includes('404') ? `No chart data for "${sym}"` : err.message);
    } finally { setLoading(false); }
  }, []);

  // Reload the last symbol on mount
  useEffect(() => { if (input && !data) load(input); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const r = data?.rating;
  const dirColor = r?.direction === 'LONG' ? colors.updown.up : r?.direction === 'SHORT' ? colors.updown.down : colors.text.secondary;
  const levels = (tf) => {
    const x = data?.reads?.[tf]; if (!x) return [];
    return [
      { price: x.lastLow, label: 'hold', legend: 'last higher low (hold)', color: colors.updown.up },
      { price: x.lastHigh, label: 'break', legend: 'last lower high (break)', color: colors.updown.down },
    ];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ borderLeft: `3px solid ${colors.text.accent}`, paddingLeft: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: colors.text.primary, fontFamily: fonts.sans, letterSpacing: 1.5 }}>DAN — MULTI-TIMEFRAME READ</div>
        <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 4 }}>
          Trend by pivots · stair-steps · EMA12 rider · retracement · the shorter-frame pattern that forms the longer-frame pivot. Probabilities are this symbol's own hit rates for today's state, next 5–10 sessions.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <form onSubmit={e => { e.preventDefault(); load(input); }} style={{ display: 'flex', gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="Ticker (e.g. CCJ, GC=F, BTC-USD)"
            style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 8, color: colors.text.primary, fontFamily: fonts.mono, fontSize: 13, padding: '8px 12px', width: 220, outline: 'none' }} />
          <button type="submit" disabled={loading} style={{ background: colors.bg.cardHover, border: `1px solid ${colors.bg.border}`, borderRadius: 8, color: colors.text.accent, fontFamily: fonts.mono, fontSize: 12, padding: '8px 16px', cursor: 'pointer' }}>
            {loading ? 'Reading…' : 'Read chart'}
          </button>
        </form>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {QUICK.map(s => (
            <button key={s} onClick={() => load(s)} style={{ background: data?.symbol === s ? colors.bg.cardHover : 'transparent', border: `1px solid ${colors.bg.border}`, borderRadius: 999, color: data?.symbol === s ? colors.text.accent : colors.text.muted, fontFamily: fonts.mono, fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>{s}</button>
          ))}
        </div>
      </div>

      {error && <div style={{ color: colors.regime.CRISIS, fontFamily: fonts.mono, fontSize: 12 }}>{error}</div>}

      {data && (
        <>
          {/* Verdict */}
          <div style={{ ...card, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'center' }}>
            <div style={{ textAlign: 'center', minWidth: 170 }}>
              <div style={{ fontFamily: fonts.mono, fontSize: 18, fontWeight: 700, color: colors.text.primary }}>
                {data.symbol} <span style={{ fontSize: 12, fontWeight: 400, color: colors.text.muted }}>{fmtPrice(data.close)} · {dstr(data.asOf)}</span>
              </div>
              <Stars n={r.stars} />
              <div style={{ fontFamily: fonts.sans, fontSize: 22, fontWeight: 700, color: dirColor, letterSpacing: 2 }}>{r.direction === 'NONE' ? 'NO SETUP' : r.direction}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.text.muted }}>structure score {r.combinedScore >= 0 ? '+' : ''}{r.combinedScore.toFixed(2)} · {data.name}</div>
            </div>
            <div>
              <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.text.secondary, lineHeight: 1.55 }}>
                {r.reasons.map((x, i) => <div key={i}>· {x}</div>)}
              </div>
              <div style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.text.primary, marginTop: 8 }}>
                Combined next 5–10 sessions: <span style={{ color: colors.updown.up, fontWeight: 700 }}>▲ {pct(data.combinedUp)}</span> / <span style={{ color: colors.updown.down, fontWeight: 700 }}>▼ {pct(1 - data.combinedUp)}</span>
                <span style={{ color: colors.text.muted }}> (D 50% · W 30% · M 20% weights; base ▲ {pct(data.probs.D.base)})</span>
              </div>
            </div>
          </div>

          {/* Probabilities per frame */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <ProbBar label="1D frame → next 5–10 sessions" p={data.probs.D} n={data.probs.D.n} bucket={data.probs.D.bucket} />
            <ProbBar label="1W frame → next 5–10 sessions" p={data.probs.W} n={data.probs.W.n} bucket={data.probs.W.bucket} />
            <ProbBar label="1M frame → next 5–10 sessions" p={data.probs.M} n={data.probs.M.n} bucket={data.probs.M.bucket} />
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12 }}>
            <CandleChart title="Daily" sub={`${data.charts.D.bars.length} sessions`} bars={data.charts.D.bars} ema12={data.charts.D.ema12} levels={levels('D')} />
            <CandleChart title="Weekly" sub={`${data.charts.W.bars.length} weeks`} bars={data.charts.W.bars} ema12={data.charts.W.ema12} levels={levels('W')} />
            <CandleChart title="Monthly" sub={`${data.charts.M.bars.length} months`} bars={data.charts.M.bars} ema12={data.charts.M.ema12} levels={levels('M')} />
          </div>

          {/* Narrative */}
          <div style={card}>
            {data.narrative.map((l, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 600, color: colors.text.primary, marginBottom: 3 }}>{l.h}</div>
                <div style={{ fontFamily: fonts.mono, fontSize: 11.5, color: colors.text.secondary, lineHeight: 1.6 }}>{l.t}</div>
              </div>
            ))}
            <div style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.text.muted, marginTop: 6, borderTop: `1px solid ${colors.bg.border}`, paddingTop: 6 }}>{data.method}</div>
          </div>

          {/* Frame tables */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            <FrameCard r={data.reads.D} label="Daily" />
            <FrameCard r={data.reads.W} label="Weekly" />
            <FrameCard r={data.reads.M} label="Monthly" />
            <FrameCard r={data.reads['3M']} label="Quarterly (context)" />
          </div>
          {data.ratio && (
            <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.text.secondary }}>
              Ratio vs {data.ratio.bench}: daily <span style={{ color: data.ratio.D.now === 'relative strength' ? colors.updown.up : colors.updown.down }}>{data.ratio.D.now}</span> ({data.ratio.D.closes} closes) · weekly <span style={{ color: data.ratio.W.now === 'relative strength' ? colors.updown.up : colors.updown.down }}>{data.ratio.W.now}</span> ({data.ratio.W.closes} closes)
            </div>
          )}
        </>
      )}
    </div>
  );
}
