import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { colors, fonts } from '../styles/theme';
import PositionSizer from '../components/PositionSizer';

const Ctx = createContext({ open: () => {} });

export function useChartModal() {
  return useContext(Ctx);
}

// Click-through charting: any symbol opens a TradingView advanced chart in a
// modal (free widget embed) with a position-size calculator underneath.
// open(sym, price) — price optional, prefills the sizer's entry field.
// Esc or backdrop click closes.
export function ChartModalProvider({ children }) {
  const [modal, setModal] = useState(null); // { sym, price }
  const tvSymbol = modal?.sym ?? null;

  const open = useCallback((sym, price = null) => { if (sym) setModal({ sym, price }); }, []);
  const close = useCallback(() => setModal(null), []);

  useEffect(() => {
    if (!tvSymbol) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tvSymbol, close]);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {tvSymbol && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 20000,
            background: 'rgba(2, 4, 10, 0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(1100px, 96vw)', height: 'min(720px, 88vh)',
              background: colors.bg.card, border: `1px solid ${colors.bg.border}`,
              borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: `1px solid ${colors.bg.border}` }}>
              <span style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.text.primary }}>{tvSymbol}</span>
              <button onClick={close} style={{ background: 'none', border: 'none', color: colors.text.secondary, cursor: 'pointer', fontSize: 16, fontFamily: fonts.mono }}>✕</button>
            </div>
            <iframe
              title={`chart-${tvSymbol}`}
              src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tvSymbol)}&interval=D&theme=dark&style=1&locale=en&hidesidetoolbar=0&saveimage=0`}
              style={{ border: 'none', flex: 1, width: '100%' }}
            />
            <PositionSizer key={tvSymbol} livePrice={modal?.price ?? null} />
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
