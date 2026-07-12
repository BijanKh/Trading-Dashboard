import React, { useState, useCallback } from 'react';
import { colors, fonts } from '../styles/theme';
import { fetchNews } from '../lib/api';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';
import { useChartModal } from '../context/ChartModalContext';
import { toTvSymbol } from '../lib/tv';

const POLL_MS = 5 * 60 * 1000;

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function SymbolTag({ symbol }) {
  const { open } = useChartModal();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); open(toTvSymbol(symbol)); }}
      title={`Open ${symbol} chart`}
      style={{
        background: colors.bg.cardHover,
        border: `1px solid ${colors.bg.border}`,
        borderRadius: 4,
        color: colors.text.accent,
        cursor: 'pointer',
        fontFamily: fonts.mono,
        fontSize: 9,
        padding: '1px 5px',
      }}
    >
      {symbol.replace('-USD', '').replace('=F', '')}
    </button>
  );
}

// Watchlist headlines (Yahoo Finance news search over index/commodity/mega-cap
// symbols). Headlines open the source; tags open the chart.
export default function NewsPanel() {
  const [news, setNews] = useState(null);

  const load = useCallback(async () => {
    try { setNews(await fetchNews()); } catch {}
  }, []);
  useVisibilityPolling(load, POLL_MS, true);

  const items = news?.items || [];
  if (!items.length) return null;

  return (
    <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>
          MARKET NEWS
        </span>
        <span style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.mono }}>
          Yahoo Finance · refreshed 15min{news?.stale ? ' · STALE' : ''}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', columnGap: 24, rowGap: 7 }}>
        {items.slice(0, 24).map(n => (
          <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
            <span style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.mono, minWidth: 26, textAlign: 'right', flexShrink: 0 }}>
              {timeAgo(n.time)}
            </span>
            <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {n.symbols.slice(0, 2).map(s => <SymbolTag key={s} symbol={s} />)}
            </span>
            <a
              href={n.link} target="_blank" rel="noopener noreferrer"
              style={{
                color: colors.text.primary, textDecoration: 'none', fontSize: 12,
                fontFamily: fonts.sans, whiteSpace: 'nowrap', overflow: 'hidden',
                textOverflow: 'ellipsis', minWidth: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = colors.text.accent; }}
              onMouseLeave={e => { e.currentTarget.style.color = colors.text.primary; }}
              title={`${n.title}${n.publisher ? ` — ${n.publisher}` : ''}`}
            >
              {n.title}
            </a>
            {n.publisher && (
              <span style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.mono, flexShrink: 0 }}>
                {n.publisher}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
