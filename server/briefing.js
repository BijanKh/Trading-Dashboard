// Rule-based morning briefing: composes prose lines from already-cached data.
// Pure function — no fetching of its own.

function pct(v, dec = 1) {
  if (v == null || !isFinite(v)) return 'n/a';
  const p = v * 100;
  return `${p > 0 ? '+' : ''}${p.toFixed(dec)}%`;
}

function find(quotes, group, symbol) {
  return quotes?.groups?.[group]?.find(q => q.symbol === symbol);
}

export function composeBriefing({ quotes, spxBreadth, fearGreed, calendar, earnings, crypto, tape, divergence, credit, mcclellan }) {
  const lines = [];
  if (!quotes) return { generatedAt: new Date().toISOString(), lines };

  // Tape
  if (tape) {
    lines.push({ tag: 'TAPE', text: `Tape score ${tape.score}/100 — ${tape.label}.` });
  }

  // Overnight / futures
  const es = find(quotes, 'futures', 'ES=F');
  const nq = find(quotes, 'futures', 'NQ=F');
  const world = ['^N225', '^HSI', '^GDAXI', '^STOXX50E']
    .map(s => find(quotes, 'world', s))
    .filter(q => q?.dayPct != null)
    .map(q => `${q.label} ${pct(q.dayPct)}`);
  if (es?.dayPct != null || world.length) {
    const fut = [es, nq].filter(q => q?.dayPct != null).map(q => `${q.label} fut ${pct(q.dayPct)}`);
    lines.push({ tag: 'GLOBAL', text: [...fut, ...world].join(', ') + '.' });
  }

  // Vol & breadth
  const vix = find(quotes, 'volatility', '^VIX');
  const vix3m = find(quotes, 'volatility', '^VIX3M');
  const term = vix?.price && vix3m?.price ? vix.price / vix3m.price : null;
  const parts = [];
  if (vix?.price != null) parts.push(`VIX ${vix.price.toFixed(1)} (${pct(vix.dayPct)})`);
  if (term != null) parts.push(`term ${term.toFixed(2)} ${term > 1 ? 'BACKWARDATION' : 'contango'}`);
  if (spxBreadth?.pctAbove50 != null) parts.push(`${Math.round(spxBreadth.pctAbove50 * 100)}% of S&P above 50d`);
  if (mcclellan?.osc != null) {
    const dir = mcclellan.summation > mcclellan.prevSummation ? 'rising' : 'falling';
    parts.push(`McClellan ${mcclellan.osc > 0 ? '+' : ''}${Math.round(mcclellan.osc)} (summation ${dir})`);
  }
  if (typeof fearGreed?.score === 'number') parts.push(`F&G ${fearGreed.score} (${fearGreed.rating})`);
  if (parts.length) lines.push({ tag: 'VOL', text: parts.join(' · ') + '.' });

  if (divergence?.active) {
    lines.push({ tag: 'WARN', text: `Breadth divergence: SPY near its 20d high while S&P >50d breadth fell from ${Math.round(divergence.breadth5dAgo * 100)}% to ${Math.round(divergence.breadthNow * 100)}% in 5 sessions.` });
  }

  // Sector extremes today
  const sectors = (quotes.groups?.sectors || []).filter(q => q.dayPct != null && !['SPY', 'QQQ', 'IWM'].includes(q.symbol));
  if (sectors.length) {
    const best = sectors.reduce((a, b) => b.dayPct > a.dayPct ? b : a);
    const worst = sectors.reduce((a, b) => b.dayPct < a.dayPct ? b : a);
    lines.push({ tag: 'SECTORS', text: `Leader ${best.symbol} ${pct(best.dayPct)}, laggard ${worst.symbol} ${pct(worst.dayPct)}.` });
  }

  // Credit
  if (credit?.composite != null) {
    lines.push({ tag: 'CREDIT', text: `Credit stress composite ${credit.composite} (${credit.regime})${credit.signalActive ? ' — DURATION SIGNAL ACTIVE' : ''}.` });
  }

  // Today's high-impact events
  const now = new Date();
  const todayEvents = (calendar?.events || []).filter(e => {
    const d = new Date(e.date);
    return e.impact === 'High' && d.toDateString() === now.toDateString();
  });
  if (todayEvents.length) {
    const txt = todayEvents.slice(0, 5).map(e =>
      `${new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${e.country} ${e.title}`).join('; ');
    lines.push({ tag: 'EVENTS', text: `High-impact today: ${txt}.` });
  } else {
    lines.push({ tag: 'EVENTS', text: 'No high-impact events today.' });
  }

  // Earnings within 2 days
  const soon = (earnings?.items || []).filter(i => {
    if (!i.date) return false;
    const days = (new Date(i.date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000;
    return days >= 0 && days <= 2;
  });
  if (soon.length) {
    lines.push({ tag: 'EARNINGS', text: `Reporting soon: ${soon.map(i => {
      const im = i.impliedMove?.movePct;
      return `${i.symbol}${im != null ? ` (±${(im * 100).toFixed(1)}% implied)` : ''}`;
    }).join(', ')}.` });
  }

  // Crypto
  const btc = crypto?.top?.find(c => c.symbol === 'BTC');
  if (btc) {
    const dom = crypto?.global?.btcDominance;
    lines.push({ tag: 'CRYPTO', text: `BTC $${Math.round(btc.price).toLocaleString()} (${pct(btc.change24h)}), dominance ${dom != null ? (dom * 100).toFixed(1) + '%' : 'n/a'}.` });
  }

  return { generatedAt: new Date().toISOString(), lines };
}
