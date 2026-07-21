import React, { useCallback, useEffect, useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { fetchBacktest } from '../lib/api';
import Sparkline from './Sparkline';

// Historical validation of a tab's entry rule (server/backtest.js).
// Renders the two exit variants side by side + cumulative-R curve.
// The run starts only on the button click — a trending run is ~500
// sequential chart fetches (~4 min).

function Stat({ label, value, good }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.sans }}>{label}</div>
      <div style={{
        fontSize: 14, fontFamily: fonts.mono, fontWeight: 600,
        color: good == null ? colors.text.primary : good ? colors.updown.up : colors.updown.down,
      }}>
        {value}
      </div>
    </div>
  );
}

function Variant({ name, s }) {
  if (!s) return null;
  const pos = s.avgR > 0;
  return (
    <div style={{ flex: '1 1 260px', minWidth: 260 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 8 }}>
        {name}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <Stat label="TRADES" value={s.trades} />
        <Stat label="WIN RATE" value={`${Math.round(s.winRate * 100)}%`} />
        <Stat label="AVG R" value={`${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}`} good={pos} />
        <Stat label="TOTAL R" value={`${s.totalR >= 0 ? '+' : ''}${s.totalR}`} good={s.totalR > 0} />
        <Stat label="PF" value={s.profitFactor == null ? '∞' : s.profitFactor.toFixed(2)} good={s.profitFactor == null || s.profitFactor > 1} />
        <Stat label="MAX DD" value={`${s.maxDrawdownR}R`} />
        <Stat label="MAX LOSS RUN" value={s.maxConsecLoss} />
        <Stat label="AVG HOLD" value={`${Math.round(s.avgHold)}d`} />
      </div>
      {s.curve?.length >= 3 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.sans, marginBottom: 2 }}>cumulative R</div>
          <Sparkline
            data={s.curve.map(p => ({ date: p.d, value: p.v }))}
            width={240} height={34} baseline={0}
            posColor={colors.updown.up} negColor={colors.updown.down}
          />
        </div>
      )}
    </div>
  );
}

export default function BacktestPanel({ strategy, title }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async (refresh = false) => {
    try {
      setError(null);
      setData(await fetchBacktest(strategy, refresh));
    } catch (err) {
      setError(err.message);
    }
  }, [strategy]);

  useEffect(() => { load(); }, [load]);

  const running = data?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
  }, [running, load]);

  const r = data?.report;
  return (
    <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>
          BACKTEST — {title}
        </div>
        <button
          onClick={() => load(true)}
          disabled={running}
          style={{
            background: colors.bg.cardHover,
            color: running ? colors.text.muted : colors.text.accent,
            border: `1px solid ${colors.bg.border}`, borderRadius: 6,
            padding: '5px 12px', cursor: running ? 'default' : 'pointer',
            fontFamily: fonts.mono, fontSize: 11,
          }}
        >
          {running
            ? `RUNNING ${data?.progress ? `${data.progress.done}/${data.progress.total}` : '...'}`
            : r ? 'RE-RUN' : 'RUN BACKTEST'}
        </button>
      </div>

      {error && <div style={{ color: colors.updown.down, fontFamily: fonts.mono, fontSize: 11, marginTop: 8 }}>{error}</div>}

      {!r && !running && (
        <div style={{ color: colors.text.muted, fontFamily: fonts.mono, fontSize: 11, marginTop: 8 }}>
          Not run yet. Validates the entry rule over historical daily bars — results measure the edge of the
          entry shape, not tradable returns.{strategy === 'trending-long' ? ' Takes ~4 min (500 symbols).' : ' Takes ~15 s.'}
        </div>
      )}
      {running && !r && (
        <div style={{ color: colors.text.muted, fontFamily: fonts.mono, fontSize: 11, marginTop: 8 }}>
          Fetching history and simulating trades...
        </div>
      )}

      {r && (
        <>
          <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono, margin: '6px 0 12px' }}>
            {r.rules} · {r.years}y of daily bars · {r.universe.withData}/{r.universe.requested} symbols ·
            ran {new Date(r.ranAt).toLocaleString()}
          </div>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            <Variant name={`FIXED TARGET 2R (stop 1.5×vol, target 2R)`} s={r.exits.fixed2R} />
            <Variant name="EMA TRAIL (stop 1.5×vol, exit on close across 12 EMA)" s={r.exits.emaTrail} />
          </div>
          <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 12, lineHeight: 1.5 }}>
            {r.caveats}
          </div>
        </>
      )}
    </div>
  );
}
