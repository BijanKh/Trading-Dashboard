import React, { useCallback, useMemo, useRef, useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { fetchSpace } from '../lib/api';
import { fmtPrice, fmtPct, fmtBig } from '../lib/format';
import Pct from '../components/Pct';
import Sparkline from '../components/Sparkline';
import InfoTooltip from '../components/InfoTooltip';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';
import { useChartModal } from '../context/ChartModalContext';
import { toTvSymbol } from '../lib/tv';
import BacktestPanel from '../components/BacktestPanel';
import HoverChart from '../components/HoverChart';

// Space-sector screener — short-the-bounce workflow. Server math in
// server/space.js; this renders the composite strip + sortable table.

const SETUP_STYLE = {
  'AT EMA': { color: '#F97316', weight: 700 },     // bounce reached the declining 12 EMA — action zone
  BOUNCING: { color: colors.regime.ELEVATED, weight: 600 },
  TRENDING: { color: colors.text.secondary, weight: 400 },
  EXTENDED: { color: colors.text.muted, weight: 400 },
  'EARLY DOWN': { color: colors.regime.ELEVATED, weight: 400 },
  UPTREND: { color: colors.updown.up, weight: 400 },
};

const RANGE_STYLE = {
  'EXTREME OS': { color: colors.updown.up, weight: 700 },
  OVERSOLD: { color: colors.updown.up, weight: 400 },
  NEUTRAL: { color: colors.text.muted, weight: 400 },
  OVERBOUGHT: { color: colors.updown.down, weight: 400 },
  'EXTREME OB': { color: colors.updown.down, weight: 700 },
};

// %B position strip: OS zone (left, green) -> OB zone (right, red)
function RangeStrip({ pctB }) {
  if (pctB == null) return <span style={{ color: colors.text.muted }}>--</span>;
  const w = 72, h = 10;
  const x = Math.max(0, Math.min(1, (pctB + 0.2) / 1.4)) * (w - 6) + 3;
  const zone = (from, to, color, opacity) => {
    const x0 = ((from + 0.2) / 1.4) * w;
    const x1 = ((to + 0.2) / 1.4) * w;
    return <rect x={x0} y={2} width={x1 - x0} height={h - 4} fill={color} opacity={opacity} rx={2} />;
  };
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {zone(-0.2, 0.2, colors.updown.up, 0.25)}
      {zone(0.2, 0.8, colors.text.muted, 0.12)}
      {zone(0.8, 1.2, colors.updown.down, 0.25)}
      <line x1={w / 2} y1={1} x2={w / 2} y2={h - 1} stroke={colors.text.muted} strokeWidth="1" opacity="0.5" />
      <circle cx={x} cy={h / 2} r={3} fill={pctB < 0.2 ? colors.updown.up : pctB > 0.8 ? colors.updown.down : colors.text.primary} />
    </svg>
  );
}

function daysUntil(iso) {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return d >= 0 ? d : null;
}

const SETUP_RANK = { 'AT EMA': 0, BOUNCING: 1, TRENDING: 2, EXTENDED: 3, 'EARLY DOWN': 4, UPTREND: 5 };

const COLS = [
  { key: 'symbol', label: 'SYM', type: 'text' },
  { key: 'label', label: 'NAME', type: 'text' },
  { key: 'price', label: 'LAST', type: 'price' },
  { key: 'dayPct', label: 'DAY', type: 'pct' },
  { key: 'r5', label: '5D', type: 'pct' },
  { key: 'ytdPct', label: 'YTD', type: 'pct' },
  { key: 'vs50', label: 'vs 50DMA', type: 'pct' },
  { key: 'rsi', label: 'RSI', type: 'num' },
  { key: 'dEmaVol', label: 'ΔEMA', type: 'num' },
  { key: 'pctB', label: 'OS ── OB', type: 'range' },
  { key: 'shortPctFloat', label: 'SI %FLT', type: 'sipct' },
  { key: 'daysToCover', label: 'DTC', type: 'num' },
  { key: 'dollarVol', label: 'ADV $', type: 'big' },
  { key: 'earningsDate', label: 'EARN', type: 'earn' },
  { key: 'setup', label: 'SETUP', type: 'setup' },
];

export default function SpaceTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ key: null, dir: -1 });
  const [hover, setHover] = useState(null); // { row, x, y }
  const hoverTimer = useRef(null);
  const { open } = useChartModal();

  function onRowEnter(row, e) {
    if (!row.spark) return;
    const x = e.clientX, y = e.clientY;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover({ row, x, y }), 180);
  }
  function onRowLeave() {
    clearTimeout(hoverTimer.current);
    setHover(null);
  }

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchSpace());
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useVisibilityPolling(load, 45000, true);

  const rows = useMemo(() => {
    const rs = (data?.rows || []).filter(r => r.price != null);
    if (!sort.key) {
      // Default rank: most actionable short setups first (AT EMA, then
      // BOUNCING), tightest to the 12 EMA within each bucket. UFO benchmark
      // row pinned on top.
      return [...rs].sort((a, b) => {
        if (a.symbol === 'UFO') return -1;
        if (b.symbol === 'UFO') return 1;
        const ra = SETUP_RANK[a.setup] ?? 9, rb = SETUP_RANK[b.setup] ?? 9;
        if (ra !== rb) return ra - rb;
        const da = a.dEmaVol == null ? 99 : Math.abs(a.dEmaVol);
        const db = b.dEmaVol == null ? 99 : Math.abs(b.dEmaVol);
        return da - db;
      });
    }
    const col = COLS.find(c => c.key === sort.key);
    return [...rs].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (col?.type === 'text' || col?.type === 'setup' || col?.type === 'earn') {
        return String(av).localeCompare(String(bv)) * sort.dir;
      }
      return (av - bv) * sort.dir;
    });
  }, [data, sort]);

  if (error && !data) {
    return <div style={{ color: colors.updown.down, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>Failed to load space screener: {error}</div>;
  }
  if (!data) {
    return <div style={{ color: colors.text.muted, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>Loading space screener...</div>;
  }

  const c = data.composite;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {c && (
        <div style={{
          background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12,
          padding: 16, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>
              SPACE SECTOR — EQUAL WEIGHT ({c.count})
              <InfoTooltip indicatorKey="space" />
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 6, fontFamily: fonts.mono, fontSize: 12 }}>
              <span style={{ color: colors.text.muted }}>DAY <Pct value={c.dayPct} /></span>
              <span style={{ color: colors.text.muted }}>5D <Pct value={c.r5} /></span>
              <span style={{ color: colors.text.muted }}>YTD <Pct value={c.ytdPct} /></span>
            </div>
          </div>
          {c.index?.length >= 3 && (
            <div>
              <div style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.sans, marginBottom: 2 }}>
                equal-weight index — {c.index.length} sessions
              </div>
              <Sparkline data={c.index.map(p => ({ date: p.d, value: p.v }))} width={180} height={30} />
            </div>
          )}
          <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.text.muted, lineHeight: 1.7 }}>
            <div>{c.belowFalling50}/{c.count} below a falling 50-DMA</div>
            <div>
              <span style={{ color: SETUP_STYLE['AT EMA'].color, fontWeight: 700 }}>{c.atEma} at the 12 EMA</span>
              {' · '}{c.bouncing} bouncing or at the EMA
            </div>
          </div>
        </div>
      )}

      <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 10 }}>
          SPACE STOCKS — {data.stale ? 'STALE' : 'LIVE'} · default rank: short-the-bounce (AT EMA first, tightest to the 12 EMA)
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: fonts.mono }}>
          <thead>
            <tr>
              {COLS.map(col => (
                <th
                  key={col.key}
                  onClick={() => setSort(prev => prev.key === col.key ? { key: col.key, dir: -prev.dir } : { key: col.key, dir: -1 })}
                  style={{
                    textAlign: ['text', 'setup'].includes(col.type) ? 'left' : col.type === 'range' ? 'center' : 'right',
                    color: sort.key === col.key ? colors.text.accent : colors.text.muted,
                    fontWeight: 500, padding: '4px 6px', cursor: 'pointer', userSelect: 'none',
                    borderBottom: `1px solid ${colors.bg.border}`, whiteSpace: 'nowrap',
                  }}
                >
                  {col.label}{sort.key === col.key ? (sort.dir === -1 ? ' ▾' : ' ▴') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const earnDays = daysUntil(r.earningsDate);
              const isBench = r.symbol === 'UFO';
              return (
                <tr
                  key={r.symbol}
                  onClick={() => open(toTvSymbol(r.symbol), r.price ?? null)}
                  onMouseEnter={(e) => onRowEnter(r, e)}
                  onMouseLeave={onRowLeave}
                  style={{ cursor: 'pointer', background: isBench ? colors.bg.cardHover : undefined }}
                >
                  {COLS.map(col => {
                    const v = r[col.key];
                    let content;
                    if (col.type === 'pct') content = <Pct value={v} />;
                    else if (col.type === 'price') content = <span style={{ color: colors.text.primary }}>{fmtPrice(v, r.dec)}</span>;
                    else if (col.type === 'big') content = (
                      <span style={{ color: r.thin ? colors.updown.down : colors.text.secondary }}>
                        {fmtBig(v)}{r.thin ? ' ·thin' : ''}
                      </span>
                    );
                    else if (col.type === 'num') {
                      const bounceZone = col.key === 'rsi' && v != null && v >= 45 && v <= 60 && r.setup !== 'UPTREND';
                      content = v == null ? <span style={{ color: colors.text.muted }}>--</span> : (
                        <span style={{
                          color: bounceZone ? colors.regime.ELEVATED : colors.text.secondary,
                          fontWeight: bounceZone ? 700 : 400,
                        }}>
                          {v.toFixed(1)}
                        </span>
                      );
                    }
                    else if (col.type === 'sipct') content = (
                      <span style={{ color: v != null && v > 0.15 ? colors.regime.ELEVATED : colors.text.secondary }}>
                        {v == null ? '--' : `${(v * 100).toFixed(0)}%`}
                      </span>
                    );
                    else if (col.type === 'range') content = (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <RangeStrip pctB={r.pctB} />
                        {r.range && (
                          <span style={{ fontSize: 9, color: RANGE_STYLE[r.range]?.color, fontWeight: RANGE_STYLE[r.range]?.weight }}>
                            {r.range}
                          </span>
                        )}
                      </div>
                    );
                    else if (col.type === 'earn') content = earnDays == null
                      ? <span style={{ color: colors.text.muted }}>--</span>
                      : (
                        <span style={{
                          color: earnDays <= 7 ? colors.regime.ELEVATED : colors.text.secondary,
                          fontWeight: earnDays <= 7 ? 700 : 400,
                        }}>
                          {earnDays}d
                        </span>
                      );
                    else if (col.type === 'setup') content = (
                      <span style={{ color: SETUP_STYLE[v]?.color ?? colors.text.secondary, fontWeight: SETUP_STYLE[v]?.weight ?? 400 }}>
                        {isBench ? 'BENCHMARK' : v ?? '--'}
                      </span>
                    );
                    else content = (
                      <div title={v ?? ''} style={{
                        color: col.key === 'symbol' ? colors.text.primary : colors.text.secondary,
                        maxWidth: col.key === 'label' ? 130 : undefined,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {v ?? '--'}
                      </div>
                    );
                    return (
                      <td key={col.key} style={{
                        textAlign: ['text', 'setup'].includes(col.type) ? 'left' : col.type === 'range' ? 'center' : 'right',
                        padding: '5px 6px', borderBottom: `1px solid ${colors.bg.border}`, whiteSpace: 'nowrap',
                      }}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {hover && (
          <HoverChart
            symbol={hover.row.symbol}
            closes={hover.row.spark}
            tf={hover.row.sparkTf}
            x={hover.x}
            y={hover.y}
          />
        )}
      </div>

      <BacktestPanel
        strategy="space-short"
        title="AT-EMA SHORT (space universe, 5Y)"
      />

      <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono, lineHeight: 1.6 }}>
        5D = 5-session change · vs 50DMA = distance to the 50-day average · ΔEMA = distance to the 12 EMA
        in units of 20-day close-to-close volatility (ATR proxy: 0 = at the EMA, negative = below) ·
        OS──OB = Bollinger(20,2) %B position, dot in the green zone = oversold, red = overbought ·
        SI %FLT = short interest as % of float (amber &gt;15% — squeeze fuel), DTC = days to cover ·
        EARN = days to next earnings (amber ≤7d — binary-event risk for shorts) · ADV $ = avg daily dollar
        volume, "thin" = fails the short liquidity floors (price ≥$5, ≥$20M ADV).
        SETUP (names below a falling 50-DMA only): BOUNCING = 5d up, still under the 12 EMA →
        <span style={{ color: SETUP_STYLE['AT EMA'].color, fontWeight: 700 }}> AT EMA</span> = bounce reached the
        declining 12 EMA (the classic short-entry zone) · EXTENDED = ≥2 vol-units below the EMA (late to chase,
        wait for the bounce) · EARLY DOWN = below a still-RISING 50-DMA (fresh breakdown after a run-up, downtrend
        not confirmed) · UPTREND = above the 50-DMA, no short setup. Short interest/earnings refresh every 12h; the rest ticks
        with the 45s quote cycle.
      </div>
    </div>
  );
}
