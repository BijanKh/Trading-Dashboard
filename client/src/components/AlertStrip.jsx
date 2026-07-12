import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { useQuotes } from '../context/QuotesContext';
import { fmtPrice } from '../lib/format';

const SEV_COLOR = {
  crisis: colors.regime.CRISIS,
  stress: colors.regime.STRESS,
  info: colors.text.accent,
};

const RULES_KEY = 'godmode_custom_alerts';
const NOTIFY_KEY = 'godmode_alert_notify';

function loadRules() {
  try { return JSON.parse(localStorage.getItem(RULES_KEY)) || []; } catch { return []; }
}
function saveRules(rules) {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

// Flat symbol -> { price, label } across all quote groups.
function priceMap(quotes) {
  const map = new Map();
  for (const group of Object.values(quotes?.groups || {})) {
    for (const q of group) {
      if (q.price != null && !map.has(q.symbol)) map.set(q.symbol, { price: q.price, label: q.label });
    }
  }
  return map;
}

function AddRuleForm({ onAdd, onClose }) {
  const [symbol, setSymbol] = useState('');
  const [op, setOp] = useState('>');
  const [level, setLevel] = useState('');

  const inputStyle = {
    background: colors.bg.primary, border: `1px solid ${colors.bg.border}`, borderRadius: 6,
    color: colors.text.primary, fontFamily: fonts.mono, fontSize: 11, padding: '5px 8px',
  };

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        placeholder="Symbol (e.g. ^VIX, GC=F)" value={symbol}
        onChange={e => setSymbol(e.target.value.toUpperCase())}
        style={{ ...inputStyle, width: 150 }}
      />
      <select value={op} onChange={e => setOp(e.target.value)} style={inputStyle}>
        <option value=">">above</option>
        <option value="<">below</option>
      </select>
      <input
        placeholder="Level" value={level} inputMode="decimal"
        onChange={e => setLevel(e.target.value)}
        style={{ ...inputStyle, width: 80 }}
      />
      <button
        onClick={() => {
          const lvl = parseFloat(level);
          if (!symbol.trim() || !isFinite(lvl)) return;
          onAdd({ id: `custom_${symbol}_${op}_${lvl}`, symbol: symbol.trim(), op, level: lvl });
          onClose();
        }}
        style={{ ...inputStyle, cursor: 'pointer', color: colors.text.accent }}
      >
        Add
      </button>
      <button onClick={onClose} style={{ ...inputStyle, cursor: 'pointer', color: colors.text.muted }}>Cancel</button>
    </div>
  );
}

// Persistent alert strip under the header: server macro alerts + user-defined
// price thresholds (localStorage). Optional browser notifications fire once
// per alert id when it first becomes active.
export default function AlertStrip() {
  const { quotes } = useQuotes();
  const [rules, setRules] = useState(loadRules);
  const [manageOpen, setManageOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [notify, setNotify] = useState(() => localStorage.getItem(NOTIFY_KEY) === '1');
  const seenIds = useRef(new Set());

  const prices = useMemo(() => priceMap(quotes), [quotes]);

  const customAlerts = useMemo(() => rules.flatMap(r => {
    const entry = prices.get(r.symbol);
    if (!entry) return [];
    const hit = r.op === '>' ? entry.price > r.level : entry.price < r.level;
    if (!hit) return [];
    return [{
      id: r.id,
      severity: 'stress',
      title: `${r.symbol} ${r.op === '>' ? 'above' : 'below'} ${fmtPrice(r.level)}`,
      detail: `${entry.label ?? r.symbol} now at ${fmtPrice(entry.price)}. Custom alert.`,
      custom: true,
    }];
  }), [rules, prices]);

  const alerts = [...(quotes?.alerts || []), ...customAlerts];

  // Browser notification once per newly-active alert id
  useEffect(() => {
    if (!alerts.length) return;
    for (const a of alerts) {
      if (seenIds.current.has(a.id)) continue;
      seenIds.current.add(a.id);
      if (notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(`⚠ ${a.title}`, { body: a.detail, tag: a.id }); } catch {}
      }
    }
    // ids that cleared can fire again if they re-trigger
    const active = new Set(alerts.map(a => a.id));
    for (const id of [...seenIds.current]) if (!active.has(id)) seenIds.current.delete(id);
  }, [alerts, notify]);

  function toggleNotify() {
    if (!notify && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') { setNotify(true); localStorage.setItem(NOTIFY_KEY, '1'); }
      });
      return;
    }
    const next = !notify;
    setNotify(next);
    localStorage.setItem(NOTIFY_KEY, next ? '1' : '0');
  }

  if (!quotes) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 24 }}>
          {alerts.length === 0 ? (
            <span style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono, alignSelf: 'center' }}>
              no active alerts
            </span>
          ) : alerts.map(a => (
            <span
              key={a.id}
              title={a.detail}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: `${SEV_COLOR[a.severity] || colors.text.muted}14`,
                border: `1px solid ${SEV_COLOR[a.severity] || colors.text.muted}`,
                borderRadius: 6, padding: '3px 10px',
                fontSize: 11, fontFamily: fonts.mono,
                color: SEV_COLOR[a.severity] || colors.text.muted,
              }}
            >
              {a.severity === 'crisis' ? '⚡' : a.severity === 'info' ? 'ℹ' : '⚠'} {a.title}
            </span>
          ))}
        </div>
        <button
          onClick={toggleNotify}
          title={notify ? 'Browser notifications ON' : 'Enable browser notifications'}
          style={{
            background: 'none', border: `1px solid ${colors.bg.border}`, borderRadius: 6,
            color: notify ? colors.text.accent : colors.text.muted,
            cursor: 'pointer', fontSize: 12, padding: '2px 8px', fontFamily: fonts.mono,
          }}
        >
          {notify ? '🔔' : '🔕'}
        </button>
        <button
          onClick={() => setManageOpen(o => !o)}
          style={{
            background: manageOpen ? colors.bg.cardHover : 'none',
            border: `1px solid ${colors.bg.border}`, borderRadius: 6,
            color: colors.text.secondary, cursor: 'pointer',
            fontSize: 11, padding: '3px 10px', fontFamily: fonts.mono, whiteSpace: 'nowrap',
          }}
        >
          alerts {rules.length ? `(${rules.length})` : ''}
        </button>
      </div>

      {manageOpen && (
        <div style={{
          marginTop: 8, background: colors.bg.card, border: `1px solid ${colors.bg.border}`,
          borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 11, color: colors.text.secondary, fontFamily: fonts.sans, fontWeight: 600 }}>
            CUSTOM ALERTS — trigger while the condition holds; server macro alerts (VIX, credit, correlation, breadth, events) are always on.
          </div>
          {rules.length === 0 && !addOpen && (
            <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono }}>
              No custom alerts yet.
            </div>
          )}
          {rules.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: fonts.mono }}>
              <span style={{ color: colors.text.primary }}>{r.symbol} {r.op} {fmtPrice(r.level)}</span>
              <span style={{ color: colors.text.muted }}>
                now {prices.get(r.symbol) ? fmtPrice(prices.get(r.symbol).price) : '--'}
              </span>
              <button
                onClick={() => { const next = rules.filter(x => x.id !== r.id); setRules(next); saveRules(next); }}
                style={{ background: 'none', border: 'none', color: colors.regime.CRISIS, cursor: 'pointer', fontFamily: fonts.mono, fontSize: 11 }}
              >
                remove
              </button>
            </div>
          ))}
          {addOpen ? (
            <AddRuleForm
              onAdd={(rule) => { const next = [...rules.filter(x => x.id !== rule.id), rule]; setRules(next); saveRules(next); }}
              onClose={() => setAddOpen(false)}
            />
          ) : (
            <button
              onClick={() => setAddOpen(true)}
              style={{
                alignSelf: 'flex-start', background: 'none', border: `1px solid ${colors.bg.border}`,
                borderRadius: 6, color: colors.text.accent, cursor: 'pointer',
                fontSize: 11, padding: '4px 10px', fontFamily: fonts.mono,
              }}
            >
              + add custom alert
            </button>
          )}
        </div>
      )}
    </div>
  );
}
