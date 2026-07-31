import React, { useState, useEffect } from 'react';
import { colors, fonts } from './styles/theme';
import { MarketDataProvider, useQuotes } from './context/QuotesContext';
import { ChartModalProvider } from './context/ChartModalContext';
import TabBar from './components/TabBar';
import AlertStrip from './components/AlertStrip';
import OverviewTab from './tabs/OverviewTab';
import SectorsTab from './tabs/SectorsTab';
import TrendingTab from './tabs/TrendingTab';
import FXBondsTab from './tabs/FXBondsTab';
import CommoditiesTab from './tabs/CommoditiesTab';
import CryptoTab from './tabs/CryptoTab';
import OptionsTab from './tabs/OptionsTab';
import CreditTab from './tabs/CreditTab';
import CalendarTab from './tabs/CalendarTab';

const TABS = [
  { id: 'overview', label: 'Overview', component: OverviewTab, intraday: true },
  { id: 'calendar', label: 'Calendar', component: CalendarTab, intraday: false },
  { id: 'sectors', label: 'Sectors', component: SectorsTab, intraday: true },
  { id: 'fxbonds', label: 'FX & Bonds', component: FXBondsTab, intraday: true },
  { id: 'commodities', label: 'Commodities', component: CommoditiesTab, intraday: true },
  { id: 'crypto', label: 'Crypto', component: CryptoTab, intraday: false },
  { id: 'options', label: 'Options', component: OptionsTab, intraday: false },
  { id: 'credit', label: 'Credit & Macro', component: CreditTab, intraday: false },
  { id: 'trending', label: 'Trending', component: TrendingTab, intraday: false },
];

function Header({ active }) {
  const quotesCtx = useQuotes();
  const asOf = quotesCtx?.quotes?.asOf;
  const stale = quotesCtx?.quotes?.stale;
  const isIntraday = TABS.find(t => t.id === active)?.intraday;

  return (
    <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.text.primary, fontFamily: fonts.sans, margin: 0, letterSpacing: -0.5 }}>
        Trading Dashboard
      </h1>
      {isIntraday && asOf && (
        <div style={{ fontSize: 11, color: stale ? colors.regime.ELEVATED : colors.text.muted, fontFamily: fonts.mono }}>
          {stale ? 'STALE — ' : ''}quotes {new Date(asOf).toLocaleTimeString()} · auto-refresh 45s
        </div>
      )}
    </header>
  );
}

// Deep-linkable tabs: #credit opens the Credit tab directly.
function initialTab() {
  const hash = window.location.hash.replace('#', '');
  return TABS.some(t => t.id === hash) ? hash : 'overview';
}

export default function App() {
  const [active, setActive] = useState(initialTab);
  // Panels mount lazily on first visit, then stay alive (display:none) so the
  // Credit tab keeps its load-once behavior and intraday tabs keep state.
  const [visited, setVisited] = useState(() => new Set([initialTab()]));

  function switchTab(id) {
    setVisited(prev => prev.has(id) ? prev : new Set(prev).add(id));
    setActive(id);
    window.history.replaceState(null, '', `#${id}`);
  }

  // Keyboard shortcuts: 1-9 switch tabs (ignored while typing in a field)
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < TABS.length) switchTab(TABS[idx].id);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const intradayActive = TABS.find(t => t.id === active)?.intraday === true;

  return (
    <MarketDataProvider active={intradayActive} cryptoActive={active === 'crypto'}>
      <ChartModalProvider>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 24px 40px' }}>
          <Header active={active} />
          <AlertStrip />
          <TabBar tabs={TABS} active={active} onChange={switchTab} />
          {TABS.map(({ id, component: Component }) => (
            visited.has(id) && (
              <div key={id} style={{ display: id === active ? 'block' : 'none' }}>
                <Component />
              </div>
            )
          ))}
        </div>
      </ChartModalProvider>
    </MarketDataProvider>
  );
}
