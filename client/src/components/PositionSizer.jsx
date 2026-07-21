import React, { useEffect, useMemo, useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { fmtPrice } from '../lib/format';

// Position-size calculator shown inside the chart modal. Pure math:
// risk$ = account × risk%; size = risk$ / |entry − stop|.
// Account and risk% persist in localStorage; entry/stop are per-open.
// Direction is inferred from stop vs entry (stop below → long).

const LS_KEY = 'positionSizer';

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    return { account: Number(s.account) || 10000, riskPct: Number(s.riskPct) || 1 };
  } catch {
    return { account: 10000, riskPct: 1 };
  }
}

function Field({ label, value, onChange, width = 90, suffix }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.sans }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width, background: colors.bg.cardHover, color: colors.text.primary,
            border: `1px solid ${colors.bg.border}`, borderRadius: 6,
            padding: '4px 8px', fontFamily: fonts.mono, fontSize: 12,
          }}
        />
        {suffix && <span style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono }}>{suffix}</span>}
      </span>
    </label>
  );
}

function Out({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.sans }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: fonts.mono, fontWeight: 600, color: color || colors.text.primary }}>{value}</div>
    </div>
  );
}

export default function PositionSizer({ livePrice }) {
  const [settings, setSettings] = useState(loadSettings);
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  // Prefill entry once from the live quote if the field is untouched
  useEffect(() => {
    if (livePrice != null && entry === '') setEntry(String(livePrice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePrice]);

  const calc = useMemo(() => {
    const e = parseFloat(entry), s = parseFloat(stop);
    const account = Number(settings.account), riskPct = Number(settings.riskPct);
    if (!isFinite(e) || !isFinite(s) || e <= 0 || s <= 0 || e === s || account <= 0 || riskPct <= 0) return null;
    const riskUsd = account * riskPct / 100;
    const perShare = Math.abs(e - s);
    const shares = riskUsd / perShare;
    const value = shares * e;
    const dir = s < e ? 1 : -1; // stop below entry = long
    return {
      dir,
      riskUsd,
      shares,
      value,
      pctOfAccount: value / account,
      riskPctOfPrice: perShare / e,
      t2: e + dir * 2 * perShare,
      t3: e + dir * 3 * perShare,
    };
  }, [entry, stop, settings]);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap',
      padding: '10px 14px', borderTop: `1px solid ${colors.bg.border}`,
      background: colors.bg.card,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, alignSelf: 'center' }}>
        POSITION SIZE
      </span>
      <Field label="ACCOUNT" value={settings.account} width={80}
        onChange={v => setSettings(prev => ({ ...prev, account: v }))} suffix="$" />
      <Field label="RISK" value={settings.riskPct} width={44}
        onChange={v => setSettings(prev => ({ ...prev, riskPct: v }))} suffix="%" />
      <Field label="ENTRY" value={entry} onChange={setEntry} />
      <Field label="STOP" value={stop} onChange={setStop} />
      {calc ? (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Out
            label={calc.dir === 1 ? 'LONG SIZE' : 'SHORT SIZE'}
            value={calc.shares >= 100 ? Math.floor(calc.shares).toLocaleString() : calc.shares.toFixed(calc.shares >= 1 ? 1 : 4)}
            color={calc.dir === 1 ? colors.updown.up : colors.updown.down}
          />
          <Out label="VALUE" value={`$${fmtPrice(calc.value, 0)}`} />
          <Out label="% OF ACCT" value={`${(calc.pctOfAccount * 100).toFixed(0)}%`}
            color={calc.pctOfAccount > 1 ? colors.regime.ELEVATED : undefined} />
          <Out label="RISK $" value={`$${fmtPrice(calc.riskUsd, 0)}`} />
          <Out label="STOP DIST" value={`${(calc.riskPctOfPrice * 100).toFixed(1)}%`} />
          <Out label="2R / 3R" value={`${fmtPrice(calc.t2, 2)} / ${fmtPrice(calc.t3, 2)}`} />
          {calc.pctOfAccount > 1 && (
            <span style={{ fontSize: 10, color: colors.regime.ELEVATED, fontFamily: fonts.mono, alignSelf: 'center' }}>
              needs {(calc.pctOfAccount).toFixed(1)}x leverage
            </span>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono, alignSelf: 'center' }}>
          enter entry + stop → size
        </span>
      )}
    </div>
  );
}
