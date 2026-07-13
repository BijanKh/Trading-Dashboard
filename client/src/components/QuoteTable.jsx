import React, { useState, useMemo } from 'react';
import { colors, fonts } from '../styles/theme';
import { fmtPrice, fmtBig } from '../lib/format';
import Pct from './Pct';
import { useChartModal } from '../context/ChartModalContext';
import { toTvSymbol } from '../lib/tv';

// Sortable quote table. columns: array of
//   { key, label, type: 'text' | 'price' | 'pct' | 'big', align?, dec?, max? }
// rows: objects with matching keys; 'price' cells read col.dec, else row.dec.
// 'big' renders compact dollar amounts ($2.21T / $184.1B).
// Long text cells truncate with an ellipsis (full value on hover) so the
// numeric columns never get pushed out of the visible card — col.max caps
// the width (default 150px for the name/label column).
// Rows with a chartSym open a TradingView chart modal on click.
export default function QuoteTable({ title, columns, rows }) {
  const [sort, setSort] = useState({ key: null, dir: -1 });
  const { open } = useChartModal();

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find(c => c.key === sort.key);
    return [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (col?.type === 'text') return String(av).localeCompare(String(bv)) * sort.dir;
      return (av - bv) * sort.dir;
    });
  }, [rows, sort, columns]);

  function toggleSort(key) {
    setSort(prev => prev.key === key ? { key, dir: -prev.dir } : { key, dir: -1 });
  }

  return (
    <div style={{
      background: colors.bg.card,
      border: `1px solid ${colors.bg.border}`,
      borderRadius: 12,
      padding: 16,
      overflowX: 'auto',
    }}>
      {title && (
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 10 }}>
          {title}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: fonts.mono }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                style={{
                  textAlign: col.align || (col.type === 'text' ? 'left' : 'right'),
                  color: sort.key === col.key ? colors.text.accent : colors.text.muted,
                  fontWeight: 500,
                  padding: '4px 6px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderBottom: `1px solid ${colors.bg.border}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}{sort.key === col.key ? (sort.dir === -1 ? ' ▾' : ' ▴') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.id || row.symbol || i}
              onClick={row.chartSym ? () => open(toTvSymbol(row.chartSym)) : undefined}
              style={row.chartSym ? { cursor: 'pointer' } : undefined}
            >
              {columns.map(col => {
                const v = row[col.key];
                let content;
                const maxW = col.max ?? (col.key === 'label' ? 150 : null);
                if (col.type === 'pct') content = <Pct value={v} />;
                else if (col.type === 'big') content = <span style={{ color: colors.text.primary }}>{fmtBig(v)}</span>;
                else if (col.type === 'price') content = <span style={{ color: colors.text.primary }}>{fmtPrice(v, col.dec ?? row.dec ?? 2)}</span>;
                else if (maxW) content = (
                  <div title={v ?? ''} style={{
                    color: col.key === 'label' ? colors.text.primary : colors.text.secondary,
                    maxWidth: maxW,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {v ?? '--'}
                  </div>
                );
                else content = <span style={{ color: col.key === 'label' ? colors.text.primary : colors.text.secondary }}>{v ?? '--'}</span>;
                return (
                  <td key={col.key} style={{
                    textAlign: col.align || (col.type === 'text' ? 'left' : 'right'),
                    padding: '5px 6px',
                    borderBottom: `1px solid ${colors.bg.border}`,
                    whiteSpace: 'nowrap',
                  }}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
