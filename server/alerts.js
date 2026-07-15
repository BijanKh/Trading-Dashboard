// Macro alert rules evaluated on every /api/quotes response. Pure function —
// all inputs come from feeds the route already has. Each alert: id (stable,
// used by the client to notify only on NEW alerts), severity, title, detail.
// Severity: 'crisis' (red) > 'stress' (orange) > 'info' (blue).

function groupVal(quotes, group, symbol) {
  return quotes?.groups?.[group]?.find(q => q.symbol === symbol)?.price ?? null;
}

export function evaluateAlerts({ quotes, tape, credit, creditIndicators, divergence, calendar, mcclellan }) {
  const alerts = [];
  const add = (id, severity, title, detail) => alerts.push({ id, severity, title, detail });

  const vix = groupVal(quotes, 'volatility', '^VIX');
  if (vix != null) {
    if (vix > 32) add('vix_crisis', 'crisis', `VIX ${vix.toFixed(1)}`, 'Crisis-level implied volatility (>32).');
    else if (vix > 25) add('vix_high', 'stress', `VIX ${vix.toFixed(1)}`, 'Elevated implied volatility (>25).');
  }

  const vix3m = groupVal(quotes, 'volatility', '^VIX3M');
  if (vix != null && vix3m != null && vix / vix3m > 1) {
    add('term_backwardation', 'stress', `VIX term structure inverted (${(vix / vix3m).toFixed(2)})`,
      'VIX above VIX3M — the market pays up for near-term protection. Typical of active stress episodes.');
  }

  const move = groupVal(quotes, 'volatility', '^MOVE');
  if (move != null && move > 120) {
    add('move_high', 'stress', `MOVE ${move.toFixed(0)}`, 'Bond volatility elevated (>120) — rates are driving markets.');
  }

  if (credit?.composite != null) {
    if (credit.composite >= 65) {
      add('duration_signal', 'crisis', `Credit stress ${Math.round(credit.composite)} — DURATION SIGNAL`,
        'Composite ≥65: growth shock overtaking inflation shock. Long-duration entry per the playbook.');
    } else if (credit.composite >= 50) {
      add('credit_stress', 'stress', `Credit stress composite ${Math.round(credit.composite)}`,
        'STRESS regime (≥50) — defensive positioning zone.');
    }
  }

  const hyOas = creditIndicators?.hy_oas?.value;
  if (hyOas != null && hyOas > 450) {
    add('hy_oas_wide', 'stress', `HY OAS ${Math.round(hyOas)}bp`, 'High-yield spreads wider than 450bp.');
  }

  if (tape?.score != null && tape.score < 25) {
    add('tape_riskoff', 'stress', `Tape score ${Math.round(tape.score)} — RISK-OFF`,
      'Market health composite below 25.');
  }

  const spxTlt = quotes?.correlations?.spxTlt?.value;
  if (spxTlt != null && spxTlt > 0.2) {
    add('stock_bond_corr', 'stress', `SPX·TLT correlation +${spxTlt.toFixed(2)}`,
      'Stocks and Treasuries moving together — bonds are not hedging equities in this tape.');
  }

  // McClellan Oscillator (S&P 500, ratio-adjusted). Zero-cross ids include the
  // session date so each cross notifies once and re-arms on the next one.
  if (mcclellan?.osc != null && mcclellan.prevOsc != null) {
    const { osc, prevOsc, asOf } = mcclellan;
    if (prevOsc >= 0 && osc < 0) {
      add(`mcclellan_cross_down_${asOf}`, 'stress', `McClellan Oscillator crossed below 0 (${osc.toFixed(0)})`,
        'Breadth momentum turned negative — more S&P members declining than advancing on a smoothed basis.');
    } else if (prevOsc <= 0 && osc > 0) {
      add(`mcclellan_cross_up_${asOf}`, 'info', `McClellan Oscillator crossed above 0 (+${osc.toFixed(0)})`,
        'Breadth momentum turned positive.');
    }
    if (osc < -150) {
      add('mcclellan_oversold', 'stress', `McClellan Oscillator ${osc.toFixed(0)}`,
        'Deeply oversold breadth (<-150) — capitulation zone; bounces often start here.');
    } else if (osc > 150) {
      add('mcclellan_overbought', 'info', `McClellan Oscillator +${osc.toFixed(0)}`,
        'Overbought breadth (>+150) — strong but stretched participation.');
    }
  }

  if (divergence?.active) {
    add('breadth_divergence', 'stress', 'Breadth divergence',
      `SPY near its 20d high while S&P >50d breadth fell from ${Math.round(divergence.breadth5dAgo * 100)}% to ${Math.round(divergence.breadthNow * 100)}%.`);
  }

  const next = (calendar?.events || [])
    .filter(e => e.impact === 'High' && ['USD', 'EUR'].includes(e.country))
    .map(e => ({ ...e, t: new Date(e.date).getTime() }))
    .filter(e => e.t > Date.now() && e.t - Date.now() < 45 * 60 * 1000)
    .sort((a, b) => a.t - b.t)[0];
  if (next) {
    const mins = Math.max(1, Math.round((next.t - Date.now()) / 60000));
    add('event_soon', 'info', `${next.country} ${next.title} in ${mins}m`,
      'High-impact release imminent — expect volatility around the print.');
  }

  const order = { crisis: 0, stress: 1, info: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  return alerts;
}
