import React, { useState, useEffect } from 'react';
import { colors, fonts } from '../styles/theme';
import { expectationDir, surpriseVsForecast } from '../lib/econ';

function useNow(tickMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return now;
}

function isSameLocalDay(iso, now) {
  const d = new Date(iso);
  const n = new Date(now);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtCountdown(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// Today's high/medium-impact events + countdown to the next high-impact
// USD/EUR release. Times shown in the user's local timezone.
export default function EventStrip({ events }) {
  const now = useNow();
  if (!events || events.length === 0) return null;

  const today = events
    .filter(e => isSameLocalDay(e.date, now) && (e.impact === 'High' || e.impact === 'Medium'))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const nextHigh = events
    .filter(e => e.impact === 'High' && ['USD', 'EUR'].includes(e.country) && new Date(e.date).getTime() > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  return (
    <div style={{
      background: colors.bg.card,
      border: `1px solid ${colors.bg.border}`,
      borderRadius: 12,
      padding: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>
          TODAY&apos;S EVENTS
        </div>
        {nextHigh && (
          <div style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.text.secondary }}>
            next high-impact: <span style={{ color: colors.regime.CRISIS }}>{nextHigh.country} {nextHigh.title}</span>
            {' '}in <span style={{ color: colors.text.primary }}>{fmtCountdown(new Date(nextHigh.date) - now)}</span>
          </div>
        )}
      </div>
      {today.length === 0 ? (
        <div style={{ fontSize: 12, color: colors.text.muted, fontFamily: fonts.mono }}>
          No medium/high-impact events today.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {today.map((e, i) => {
            const past = new Date(e.date).getTime() < now;
            return (
              <div key={`${e.date}-${e.title}-${i}`} style={{
                display: 'flex',
                gap: 10,
                alignItems: 'baseline',
                fontSize: 12,
                fontFamily: fonts.mono,
                opacity: past ? 0.45 : 1,
              }}>
                <span style={{ color: colors.text.muted, minWidth: 44 }}>{fmtTime(e.date)}</span>
                <span style={{ color: colors.impact[e.impact] || colors.text.muted, minWidth: 52, fontSize: 10, fontWeight: 700 }}>
                  {e.impact === 'High' ? '● HIGH' : '● MED'}
                </span>
                <span style={{ color: colors.text.secondary, minWidth: 34 }}>{e.country}</span>
                <span style={{ color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                {e.forecast && <span style={{ color: colors.text.muted, fontSize: 11 }}>f: {e.forecast}</span>}
                {e.previous && <span style={{ color: colors.text.muted, fontSize: 11 }}>p: {e.previous}</span>}
                {e.actual ? (() => {
                  const dev = surpriseVsForecast(e.actual, e.forecast);
                  const color = dev == null || dev === 0 ? colors.text.primary
                    : dev > 0 ? colors.regime.ELEVATED : colors.text.accent;
                  return <span style={{ color, fontSize: 11, fontWeight: 700 }}>a: {e.actual}</span>;
                })() : !past && (() => {
                  const dir = expectationDir(e.forecast, e.previous);
                  return dir ? (
                    <span style={{ color: colors.text.muted, fontSize: 11 }}>
                      cons. {dir > 0 ? '▲' : '▼'}
                    </span>
                  ) : null;
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
