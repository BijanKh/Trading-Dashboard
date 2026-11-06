import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { fmtPrice } from '../lib/format';
import Pct from './Pct';
import { useChartModal } from '../context/ChartModalContext';
import { toTvSymbol } from '../lib/tv';

// Relative Rotation Graph in the StockCharts layout: four shaded quadrants
// with corner labels, a bold tail per sector (one dot per session, large dot
// = latest) coloured by the quadrant the sector is in NOW, and a linked table
// below whose rows carry the same quadrant tint, a tail-length bar and a
// % change bar. Hovering a tail or a row highlights both; the VISIBLE
// checkboxes take a sector off the chart (the axes re-fit to what is left).
const QUADS = {
  LEADING: { label: 'Leading', color: '#10B981', rgb: '16,185,129', order: 0 },
  WEAKENING: { label: 'Weakening', color: '#FBBF24', rgb: '251,191,36', order: 1 },
  LAGGING: { label: 'Lagging', color: '#EF4444', rgb: '239,68,68', order: 2 },
  IMPROVING: { label: 'Improving', color: '#60a5fa', rgb: '96,165,250', order: 3 },
};

function quadOf(x, y) {
  if (x >= 100) return y >= 100 ? 'LEADING' : 'WEAKENING';
  return y >= 100 ? 'IMPROVING' : 'LAGGING';
}

const MODES = {
  day: { field: 'dayPct', label: '% DAY' },
  wtd: { field: 'wtdPct', label: '% WTD' },
  ytd: { field: 'ytdPct', label: '% YTD' },
};

const HIDDEN_KEY = 'rrgHidden';

// The 11 GICS sector SPDRs — the default chart selection (25 tails at once
// bury the picture; the rest are one tick away in the table).
const CORE = new Set(['XLK', 'XLF', 'XLV', 'XLY', 'XLP', 'XLE', 'XLI', 'XLB', 'XLU', 'XLC', 'XLRE']);

// null = no stored choice yet → default to the core sectors.
function loadHidden() {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || 'null');
    return Array.isArray(v) ? v : null;
  } catch { return null; }
}

function niceStep(span, target = 8) {
  const steps = [0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20];
  return steps.find(s => span / s <= target) || 50;
}

function ticksFor([lo, hi]) {
  const step = niceStep(hi - lo);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(4)));
  const dec = Number.isInteger(step) ? 0 : (Number.isInteger(step * 10) ? 1 : 2);
  return { ticks: out, dec };
}

// Catmull-Rom through the tail points, emitted as cubic Béziers. T = 6 is
// the textbook spline; daily RRG points zig-zag, so a looser T keeps the
// corners rounded without the curls a full-tension spline draws at reversals.
const T = 11;
function smoothPath(pts) {
  if (pts.length < 2) return '';
  const f = (n) => n.toFixed(1);
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += `C${f(p1.x + (p2.x - p0.x) / T)},${f(p1.y + (p2.y - p0.y) / T)},`
      + `${f(p2.x - (p3.x - p1.x) / T)},${f(p2.y - (p3.y - p1.y) / T)},${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

function overlaps(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

// Greedy label placement: right of the head if free, else left / above /
// below — whichever collides with the fewest already-placed labels and heads.
function placeLabels(heads, bounds) {
  const boxes = heads.map(h => ({ x0: h.px - 7, x1: h.px + 7, y0: h.py - 7, y1: h.py + 7, sym: h.symbol }));
  const out = new Map();
  for (const h of heads) {
    const w = h.symbol.length * 6.8 + 2;
    const cands = [
      { x: h.px + 9, y: h.py + 4, anchor: 'start', x0: h.px + 9, x1: h.px + 9 + w },
      { x: h.px - 9, y: h.py + 4, anchor: 'end', x0: h.px - 9 - w, x1: h.px - 9 },
      { x: h.px, y: h.py - 10, anchor: 'middle', x0: h.px - w / 2, x1: h.px + w / 2 },
      { x: h.px, y: h.py + 18, anchor: 'middle', x0: h.px - w / 2, x1: h.px + w / 2 },
    ].map(c => ({ ...c, y0: c.y - 10, y1: c.y + 2 }));
    let best = null, bestHits = Infinity;
    for (const c of cands) {
      const outside = c.x0 < bounds.x0 || c.x1 > bounds.x1 || c.y0 < bounds.y0 || c.y1 > bounds.y1;
      const hits = boxes.filter(b => b.sym !== h.symbol && overlaps(c, b)).length + (outside ? 100 : 0);
      if (hits < bestHits) { best = c; bestHits = hits; }
      if (hits === 0) break;
    }
    boxes.push({ x0: best.x0, x1: best.x1, y0: best.y0, y1: best.y1, sym: h.symbol });
    out.set(h.symbol, best);
  }
  return out;
}

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const M = { left: 48, right: 14, top: 10, bottom: 40 };

function Plot({ rows, hot, setHot, onOpen }) {
  const [ref, width] = useWidth();
  const height = Math.max(380, Math.min(540, Math.round(width * 0.46)));
  const visible = rows.filter(r => r.visible);

  const geo = useMemo(() => {
    if (!width) return null;
    const xs = [99, 101], ys = [99, 101];
    for (const r of visible) for (const p of r.tail) { xs.push(p.x); ys.push(p.y); }
    const dom = (vals) => {
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const pad = (hi - lo) * 0.05;
      return [lo - pad, hi + pad];
    };
    const domX = dom(xs), domY = dom(ys);
    const x0 = M.left, x1 = width - M.right, y0 = M.top, y1 = height - M.bottom;
    const sx = (v) => x0 + (v - domX[0]) / (domX[1] - domX[0]) * (x1 - x0);
    const sy = (v) => y1 - (v - domY[0]) / (domY[1] - domY[0]) * (y1 - y0);
    const series = visible.map(r => {
      const pts = r.tail.map(p => ({ x: sx(p.x), y: sy(p.y) }));
      const head = pts[pts.length - 1];
      return { ...r, pts, px: head.x, py: head.y, path: smoothPath(pts) };
    });
    const labels = placeLabels(series, { x0, x1, y0, y1 });
    return { x0, x1, y0, y1, sx, sy, series, labels, tx: ticksFor(domX), ty: ticksFor(domY) };
  }, [width, height, visible.map(r => `${r.symbol}:${r.rsRatio.toFixed(3)}:${r.rsMomentum.toFixed(3)}:${r.tail.length}`).join('|')]);

  const hotS = geo?.series.find(s => s.symbol === hot);
  const axisText = { fontSize: 10, fill: colors.chart.axis, fontFamily: fonts.mono };
  const cornerText = { fontSize: 15, fontWeight: 600, fontFamily: fonts.sans, opacity: 0.9 };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height }}>
      {geo && (
        <svg width={width} height={height} style={{ display: 'block' }}>
          {(() => {
            const { x0, x1, y0, y1, sx, sy } = geo;
            const cx = sx(100), cy = sy(100);
            const quadRect = (k, x, y, w, h) => (
              <rect key={k} x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)} fill={`rgba(${QUADS[k].rgb},0.13)`} />
            );
            return (
              <g>
                {quadRect('IMPROVING', x0, y0, cx - x0, cy - y0)}
                {quadRect('LEADING', cx, y0, x1 - cx, cy - y0)}
                {quadRect('LAGGING', x0, cy, cx - x0, y1 - cy)}
                {quadRect('WEAKENING', cx, cy, x1 - cx, y1 - cy)}
                {geo.tx.ticks.map(t => (
                  <g key={`x${t}`}>
                    <line x1={sx(t)} x2={sx(t)} y1={y0} y2={y1} stroke="rgba(136,153,170,0.10)" />
                    <text x={sx(t)} y={y1 + 14} textAnchor="middle" style={axisText}>{t.toFixed(geo.tx.dec)}</text>
                  </g>
                ))}
                {geo.ty.ticks.map(t => (
                  <g key={`y${t}`}>
                    <line x1={x0} x2={x1} y1={sy(t)} y2={sy(t)} stroke="rgba(136,153,170,0.10)" />
                    <text x={x0 - 6} y={sy(t) + 3} textAnchor="end" style={axisText}>{t.toFixed(geo.ty.dec)}</text>
                  </g>
                ))}
                <line x1={cx} x2={cx} y1={y0} y2={y1} stroke={colors.text.secondary} strokeWidth={1.2} />
                <line x1={x0} x2={x1} y1={cy} y2={cy} stroke={colors.text.secondary} strokeWidth={1.2} />
                <text x={x0 + 10} y={y0 + 22} fill={QUADS.IMPROVING.color} style={cornerText}>Improving</text>
                <text x={x1 - 10} y={y0 + 22} textAnchor="end" fill={QUADS.LEADING.color} style={cornerText}>Leading</text>
                <text x={x0 + 10} y={y1 - 12} fill={QUADS.LAGGING.color} style={cornerText}>Lagging</text>
                <text x={x1 - 10} y={y1 - 12} textAnchor="end" fill={QUADS.WEAKENING.color} style={cornerText}>Weakening</text>
                <text x={(x0 + x1) / 2} y={height - 6} textAnchor="middle" style={{ ...axisText, fill: colors.text.secondary }}>
                  RS-Ratio (strength vs SPY)
                </text>
                <text
                  transform={`translate(11 ${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle"
                  style={{ ...axisText, fill: colors.text.secondary }}
                >
                  RS-Momentum
                </text>
              </g>
            );
          })()}

          {[...geo.series].sort((a, b) => (a.symbol === hot) - (b.symbol === hot)).map(s => {
            const c = QUADS[s.quad].color;
            const dim = hot && hot !== s.symbol;
            const isHot = hot === s.symbol;
            const lab = geo.labels.get(s.symbol);
            return (
              <g
                key={s.symbol}
                opacity={dim ? 0.16 : 1}
                style={{ cursor: 'pointer', transition: 'opacity 120ms' }}
                onMouseEnter={() => setHot(s.symbol)}
                onMouseLeave={() => setHot(null)}
                onClick={() => onOpen(s)}
              >
                <path d={s.path} fill="none" stroke="transparent" strokeWidth={14} />
                <path d={s.path} fill="none" stroke={c} strokeWidth={isHot ? 3 : 2.2} strokeLinecap="round" strokeLinejoin="round" />
                {s.pts.slice(0, -1).map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={isHot ? 3.2 : 2.6} fill={c} />
                ))}
                <circle cx={s.px} cy={s.py} r={11} fill="transparent" />
                <circle cx={s.px} cy={s.py} r={isHot ? 7 : 6} fill={c} stroke={colors.bg.card} strokeWidth={2} />
                <text
                  x={lab.x} y={lab.y} textAnchor={lab.anchor}
                  style={{
                    fontSize: 11, fontWeight: 600, fontFamily: fonts.mono, fill: colors.text.primary,
                    paintOrder: 'stroke', stroke: colors.bg.card, strokeWidth: 3, strokeLinejoin: 'round',
                  }}
                >
                  {s.symbol}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {geo && !geo.series.length && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.text.muted, fontFamily: fonts.mono, fontSize: 12, pointerEvents: 'none' }}>
          No sectors selected — tick VISIBLE in the table below.
        </div>
      )}

      {hotS && (
        <div style={{
          position: 'absolute',
          left: Math.min(Math.max(hotS.px + 14, 8), width - 230),
          top: Math.max(hotS.py - 74, 4),
          background: '#0f1729', border: `1px solid ${colors.bg.border}`, borderRadius: 6,
          padding: '8px 12px', fontSize: 12, fontFamily: fonts.mono, pointerEvents: 'none',
          whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,0.45)', zIndex: 2,
        }}>
          <div style={{ color: colors.text.primary, fontWeight: 600 }}>{hotS.symbol} — {hotS.label}</div>
          <div style={{ color: colors.text.secondary }}>
            <span style={{ color: QUADS[hotS.quad].color }}>●</span> {QUADS[hotS.quad].label}
            {' · '}RS-Ratio {hotS.rsRatio.toFixed(2)} · RS-Mom {hotS.rsMomentum.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}

const HEAD_BG = '#1c2942';
const th = {
  padding: '7px 10px', fontFamily: fonts.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6,
  color: '#c5d0e0', background: HEAD_BG, whiteSpace: 'nowrap', userSelect: 'none', cursor: 'pointer',
  borderRight: `1px solid ${colors.bg.card}`,
};
const td = {
  padding: '5px 10px', whiteSpace: 'nowrap', borderBottom: `1px solid ${colors.bg.card}`,
  borderRight: `1px solid rgba(7,11,22,0.35)`,
};

function Bar({ frac, color, width = 64, height = 9 }) {
  return (
    <span style={{ display: 'inline-block', width, height, verticalAlign: 'middle' }}>
      <span style={{
        display: 'block', height: '100%', borderRadius: 2, background: color,
        width: frac > 0 ? Math.max(2, Math.round(frac * width)) : 0,
      }} />
    </span>
  );
}

function ChgCell({ value, max }) {
  const frac = value != null && max > 0 ? Math.min(1, Math.abs(value) / max) : 0;
  const color = value >= 0 ? colors.updown.up : colors.updown.down;
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <Bar frac={frac} color={color} width={56} />
      <Pct value={value} />
    </span>
  );
}

const COLS = [
  { key: 'tailLen', label: 'TAIL', num: true },
  { key: 'symbol', label: 'SYMBOL' },
  { key: 'label', label: 'NAME' },
  { key: 'quad', label: 'QUADRANT' },
  { key: 'rsRatio', label: 'RS-RATIO', num: true },
  { key: 'rsMomentum', label: 'RS-MOM', num: true },
  { key: 'price', label: 'PRICE', num: true },
  { key: 'pct', label: null, num: true },
];

export default function RRGChart({ rrg, quotes = [], mode = 'day' }) {
  const [stored, setStored] = useState(loadHidden);
  const hidden = useMemo(
    () => stored ?? (rrg || []).map(s => s.symbol).filter(s => !CORE.has(s)),
    [stored, rrg],
  );
  const setHidden = (next) => setStored(typeof next === 'function' ? next(hidden) : next);
  const [hot, setHot] = useState(null);
  const [sort, setSort] = useState({ key: 'quad', dir: 1 });
  const { open } = useChartModal();
  const { field, label: pctLabel } = MODES[mode] || MODES.day;

  useEffect(() => {
    if (stored == null) return;
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(stored)); } catch { /* private mode */ }
  }, [stored]);

  const rows = useMemo(() => {
    const bySym = new Map(quotes.map(q => [q.symbol, q]));
    return (rrg || []).map(s => {
      const q = bySym.get(s.symbol) || {};
      let tailLen = 0;
      for (let i = 1; i < s.tail.length; i++) {
        tailLen += Math.hypot(s.tail[i].x - s.tail[i - 1].x, s.tail[i].y - s.tail[i - 1].y);
      }
      return {
        ...s,
        quad: quadOf(s.rsRatio, s.rsMomentum),
        tailLen,
        price: q.price ?? null,
        pct: q[field] ?? null,
        dec: q.dec ?? 2,
        visible: !hidden.includes(s.symbol),
      };
    });
  }, [rrg, quotes, field, hidden]);

  if (!rrg?.length) {
    return (
      <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 20, fontSize: 12, color: colors.text.muted, fontFamily: fonts.mono }}>
        ROTATION MAP — computing (available after the daily history pass, ~15 min after server start).
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => {
    if (sort.key === 'quad') {
      return (QUADS[a.quad].order - QUADS[b.quad].order) * sort.dir
        || (b.visible - a.visible) || b.tailLen - a.tailLen;
    }
    const av = a[sort.key], bv = b[sort.key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * sort.dir;
    return (av - bv) * sort.dir;
  });

  const spy = quotes.find(q => q.symbol === 'SPY');
  const maxTail = Math.max(...rows.map(r => r.tailLen), 1e-9);
  const maxPct = Math.max(...rows.map(r => Math.abs(r.pct ?? 0)), Math.abs(spy?.[field] ?? 0), 1e-9);
  const allVisible = hidden.length === 0;
  const coreOnly = rows.every(r => r.visible === CORE.has(r.symbol));
  const tailN = Math.max(...rrg.map(s => s.tail.length));

  const toggleSort = (key, num) => setSort(p => (p.key === key ? { key, dir: -p.dir } : { key, dir: num ? -1 : 1 }));
  const toggleSym = (sym) => setHidden(h => (h.includes(sym) ? h.filter(s => s !== sym) : [...h, sym]));
  const openRow = (r) => open(toTvSymbol(r.symbol), r.price ?? null);

  return (
    <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>
          SECTOR ROTATION vs SPY (RRG)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 10, fontFamily: fonts.mono, color: colors.text.muted }}>
          tail = last {tailN} sessions · large dot = latest · {rows.filter(r => r.visible).length}/{rows.length} shown
          <span style={{ display: 'inline-flex', border: `1px solid ${colors.bg.border}`, borderRadius: 6, overflow: 'hidden' }}>
            {[
              { label: '11 SECTORS', on: coreOnly, set: () => setHidden(rows.map(r => r.symbol).filter(s => !CORE.has(s))) },
              { label: `ALL ${rows.length}`, on: allVisible, set: () => setHidden([]) },
            ].map(p => (
              <button
                key={p.label} onClick={p.set}
                style={{
                  background: p.on ? colors.bg.cardHover : 'transparent',
                  color: p.on ? colors.text.accent : colors.text.secondary,
                  border: 'none', padding: '4px 10px', cursor: 'pointer', fontFamily: fonts.mono, fontSize: 10,
                }}
              >
                {p.label}
              </button>
            ))}
          </span>
        </span>
      </div>

      <Plot rows={rows} hot={hot} setHot={setHot} onOpen={openRow} />

      <div style={{ overflowX: 'auto', marginTop: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: fonts.mono }}>
          <thead>
            <tr>
              <th
                style={{ ...th, textAlign: 'center', width: 70 }}
                title={allVisible ? 'Hide all' : 'Show all'}
                onClick={() => setHidden(allVisible ? rows.map(r => r.symbol) : [])}
              >
                VISIBLE
              </th>
              {COLS.map(c => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key, c.num)}
                    style={{ ...th, textAlign: c.num && c.key !== 'tailLen' ? 'right' : 'left', color: active ? colors.text.accent : th.color }}
                  >
                    {c.label ?? pctLabel}
                    <span style={{ marginLeft: 6, opacity: active ? 1 : 0.4 }}>{active ? (sort.dir === -1 ? '▾' : '▴') : '⇅'}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const q = QUADS[r.quad];
              const isHot = hot === r.symbol;
              const fade = r.visible ? 1 : 0.45;
              return (
                <tr
                  key={r.symbol}
                  onMouseEnter={() => setHot(r.visible ? r.symbol : null)}
                  onMouseLeave={() => setHot(null)}
                  onClick={() => openRow(r)}
                  style={{ background: `rgba(${q.rgb},${isHot ? 0.3 : 0.15})`, cursor: 'pointer' }}
                >
                  <td style={{ ...td, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox" checked={r.visible} onChange={() => toggleSym(r.symbol)}
                      aria-label={`Show ${r.symbol} on the chart`}
                      style={{ accentColor: colors.text.accent, cursor: 'pointer', margin: 0, verticalAlign: 'middle' }}
                    />
                  </td>
                  <td style={{ ...td, opacity: fade }} title={`Tail length ${r.tailLen.toFixed(2)}`}>
                    <Bar frac={r.tailLen / maxTail} color={q.color} />
                  </td>
                  <td style={{ ...td, opacity: fade, color: colors.text.primary, fontWeight: 600 }}>{r.symbol}</td>
                  <td style={{ ...td, opacity: fade, color: colors.text.primary, fontFamily: fonts.sans }}>{r.label}</td>
                  <td style={{ ...td, opacity: fade, color: colors.text.secondary }}>{q.label}</td>
                  <td style={{ ...td, opacity: fade, textAlign: 'right', color: colors.text.primary }}>{r.rsRatio.toFixed(2)}</td>
                  <td style={{ ...td, opacity: fade, textAlign: 'right', color: colors.text.primary }}>{r.rsMomentum.toFixed(2)}</td>
                  <td style={{ ...td, opacity: fade, textAlign: 'right', color: colors.text.primary }}>{fmtPrice(r.price, r.dec)}</td>
                  <td style={{ ...td, opacity: fade, minWidth: 140 }}><ChgCell value={r.pct} max={maxPct} /></td>
                </tr>
              );
            })}
            {spy && (
              <tr onClick={() => open(toTvSymbol('SPY'), spy.price ?? null)} style={{ cursor: 'pointer' }}>
                <td style={td} />
                <td style={td} />
                <td style={{ ...td, color: colors.text.primary, fontWeight: 600 }}>SPY</td>
                <td style={{ ...td, color: colors.text.primary, fontFamily: fonts.sans }}>{spy.label} — benchmark</td>
                <td style={{ ...td, color: colors.text.muted }}>—</td>
                <td style={{ ...td, textAlign: 'right', color: colors.text.muted }}>100.00</td>
                <td style={{ ...td, textAlign: 'right', color: colors.text.muted }}>100.00</td>
                <td style={{ ...td, textAlign: 'right', color: colors.text.primary }}>{fmtPrice(spy.price, spy.dec ?? 2)}</td>
                <td style={{ ...td, minWidth: 140 }}><ChgCell value={spy[field] ?? null} max={maxPct} /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 8 }}>
        Clockwise rotation is typical: Improving → Leading → Weakening → Lagging. Rows are grouped by the quadrant a sector is in now;
        TAIL = distance travelled over the tail (longer = faster rotation). Click a row or tail for the chart.
      </div>
    </div>
  );
}
