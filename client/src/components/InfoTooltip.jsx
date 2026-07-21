import React, { useState, useRef, useEffect } from 'react';
import { colors, fonts } from '../styles/theme';

const INDICATOR_INFO = {
  hy_oas: {
    name: 'HY OAS',
    short: 'High Yield Credit Spread',
    description: 'The Option-Adjusted Spread (OAS) of the ICE BofA US High Yield Index measures the extra yield investors demand to hold risky corporate bonds instead of safe Treasuries. It is the single most important indicator of credit market stress.',
    interpretation: 'When this spread is low (250-350 bps), investors are comfortable taking risk. When it widens above 450 bps, the market is getting nervous. Above 700 bps signals crisis-level fear that companies may default on their debt.',
    source: 'FRED: BAMLH0A0HYM2',
    weight: '25%',
  },
  ccc_bb: {
    name: 'CCC-BB Dispersion',
    short: 'Quality Spread Divergence',
    description: 'The difference between CCC-rated (junkiest) and BB-rated (highest junk) bond spreads. When the weakest companies see their borrowing costs rise much faster than stronger junk-rated companies, it signals the market is aggressively sorting winners from losers.',
    interpretation: 'A narrow gap (150-250 bps) means the market treats all junk bonds similarly (calm). When it widens to 400-600 bps, credit stress is building. Above 800 bps, investors are panic-selling the weakest credits.',
    source: 'FRED: BAMLH0A3HYC - BAMLH0A1HYBB',
    weight: '15%',
  },
  cp_spread: {
    name: 'CP-TBill Spread',
    short: 'Funding Stress',
    description: 'The difference between 3-month commercial paper rates (what companies pay for short-term borrowing) and 3-month Treasury bills (the risk-free rate). Commercial paper is how large corporations fund day-to-day operations.',
    interpretation: 'Normally near zero (0.05-0.15%). When it widens to 0.4-0.7%, short-term corporate funding is under pressure. Above 1.2% signals a potential funding freeze where companies cannot roll over their short-term debt.',
    source: 'FRED: DCPF3M - DTB3',
    weight: '15%',
  },
  vix: {
    name: 'VIX',
    short: 'Equity Market Fear Gauge',
    description: 'The CBOE Volatility Index measures expected volatility in the S&P 500 over the next 30 days, derived from options prices. Often called the "fear index" because it rises when investors buy protection against market drops.',
    interpretation: 'A reading of 12-17 is calm. Between 24-32, markets are anxious. Above 40 signals extreme fear (seen in major crises like 2008, 2020). The VIX tends to spike suddenly and mean-revert slowly.',
    source: 'FRED: VIXCLS',
    weight: '15%',
  },
  sofr_ff: {
    name: 'SOFR-FF Spread',
    short: 'Repo Market Stress',
    description: 'The gap between the Secured Overnight Financing Rate (SOFR, the rate for borrowing cash against Treasury collateral) and the Federal Funds rate (the rate banks charge each other). Normally these rates track closely.',
    interpretation: 'A spread of 0-3 bps is normal. When it widens to 8-15 bps, there may be a collateral shortage or funding squeeze in the repo market. Above 25 bps signals serious plumbing problems in the financial system.',
    source: 'FRED: SOFR - DFF',
    weight: '10%',
  },
  tsy_vol: {
    name: 'Treasury Volatility',
    short: 'MOVE Index Proxy',
    description: 'The 20-day rolling standard deviation of daily changes in the 10-year Treasury yield, measured in basis points. This proxies the ICE BofA MOVE Index, which measures bond market volatility.',
    interpretation: 'A reading of 3-5 bps/day is calm. Between 8-12, bonds are moving significantly. Above 16 bps/day signals extreme bond market turbulence, which can trigger margin calls and forced selling across markets.',
    source: 'FRED: DGS10 (20-day stdev)',
    weight: '10%',
  },
  hy_momentum: {
    name: 'HY Spread Momentum',
    short: 'CDX Proxy',
    description: 'The 5-day change in the High Yield OAS spread. This captures how fast credit conditions are deteriorating and proxies the CDX.NA.HY index, which institutional investors use to hedge credit risk.',
    interpretation: 'Negative values mean spreads are tightening (improving). A change of 0-15 bps is neutral. Above 35 bps in 5 days signals rapid credit deterioration. Above 60 bps is crisis-pace widening.',
    source: 'FRED: BAMLH0A0HYM2 (5d change)',
    weight: '10%',
  },
  composite: {
    name: 'Composite Stress Score',
    short: 'Weighted Average of All Indicators',
    description: 'A weighted average of all 7 indicator scores, each normalized to 0-100. The composite aggregates credit spreads, volatility, funding stress, and momentum into a single number that captures overall financial market stress.',
    interpretation: '0-24 = CALM (risk-on). 25-49 = ELEVATED (reduce risk). 50-69 = STRESS (defensive). 70-100 = CRISIS (full defensive). When the score crosses 65, it signals the regime transition for duration positioning.',
    source: 'Computed',
    weight: '100%',
  },
  signal: {
    name: 'Duration Signal',
    short: 'Regime Transition Indicator',
    description: 'Fires when the composite stress score crosses above 65. At this level, credit market stress is severe enough that demand destruction begins overwhelming the inflation impulse -- the "growth shock" overtakes the "inflation shock."',
    interpretation: 'When active: initiate long-duration Treasury positions (20Y+). The logic is that severe financial stress will force the Fed to cut rates and flight-to-quality flows will compress long-end yields, making long-duration bonds rally.',
    source: 'Composite Score >= 65',
    weight: 'N/A',
  },
  leadership: {
    name: 'Leadership Ratios',
    short: 'Who Is Driving The Market',
    description: 'Each ratio divides one index ETF by SPY. RSP/SPY compares the equal-weight S&P 500 to the cap-weighted index: when it falls, a handful of mega caps are carrying the market. QQQ/SPY measures growth/tech leadership versus the broad market. IWM/SPY measures small caps versus large caps, a classic risk-appetite gauge.',
    interpretation: 'A rising ratio means the numerator is leading (e.g. rising IWM/SPY = small caps outperforming = broad risk-on). Falling RSP/SPY plus rising QQQ/SPY is the "narrow market" pattern: gains concentrated in mega-cap tech. Watch for turns in these ratios before they show up in the index itself.',
    source: 'Computed from live quotes',
    weight: 'N/A',
  },
  breadth: {
    name: 'Sector Breadth',
    short: '% of Sector ETFs Above Their Moving Average',
    description: 'The share of the 23 tracked sector and industry ETFs (XLF, XLV, SMH, XLE, KRE, ...) trading above their own 20-, 50- and 200-day simple moving average. SPY, QQQ and IWM are excluded because they are broad-market funds, not sectors. This measures how many parts of the market participate in a trend.',
    interpretation: 'Above 70% = broad, healthy participation. 40-70% = mixed tape. Below 40% = weak participation; rallies there are carried by few sectors and are fragile. The 20-day row reacts fastest; the 200-day row defines the regime. 20d% collapsing while 200d% holds = pullback within an uptrend. Both rolling over = regime change.',
    source: 'Computed from Yahoo daily bars (SMAs refresh every 6h)',
    weight: 'N/A',
  },
  spxBreadth: {
    name: 'S&P 500 Market Breadth',
    short: '% of Index Members Above Their Moving Average',
    description: 'The share of all ~500 individual S&P 500 stocks trading above their own 20-, 50- and 200-day simple moving average. Unlike the sector breadth panel (23 sector ETFs), this counts every single index member, so it detects narrow markets where the cap-weighted index rises while most stocks fall.',
    interpretation: 'Above 70% = broad participation. Below 40% = weak internals; an index at highs with breadth this low is a classic divergence warning. Extremes are contrarian signals: readings under ~15% on the 20-day mark washouts, above ~90% mark overbought thrusts. The 200-day row is the cleanest bull/bear regime line.',
    source: 'Computed from Yahoo quotes (50/200d) + daily bars (20d); constituents from Wikipedia',
    weight: 'N/A',
  },
  space: {
    name: 'Space Sector Screener',
    short: 'Short-The-Bounce Workflow',
    description: 'The space/rocket watchlist with everything needed to time shorts into a weak sector: trend filter (price below a FALLING 50-DMA), bounce detection (5-day change + RSI), distance to the declining 12 EMA in volatility units (the classic bounce-short entry is AT the EMA, not deep below it), Bollinger %B oversold/overbought position, plus risk gates — short interest (squeeze fuel), days to cover, earnings proximity (binary events), and liquidity floors (price ≥$5, ≥$20M avg dollar volume). UFO (Procure Space ETF) is the sector benchmark row; the equal-weight index in the header shows the sector trend without cap-weight distortion.',
    interpretation: 'The default ranking IS the workflow: AT EMA rows first — the bounce has carried price back to the declining 12 EMA, where downtrends typically resume. BOUNCING = watchlist (bounce running, not there yet). EXTENDED = deeply stretched below the EMA — late to chase; wait for the bounce instead. Avoid shorts with SI %float >15-20% (squeeze risk), earnings within a few days, or the "thin" liquidity tag. RSI 45-60 on a bounce below a falling 50-DMA marks a mature bounce.',
    source: 'Yahoo quotes (45s) + daily close series; short interest & earnings via quoteSummary (12h)',
    weight: 'N/A',
  },
  mcclellan: {
    name: 'McClellan Oscillator (S&P 500)',
    short: 'Momentum of Market Breadth',
    description: 'The 19-day EMA minus the 39-day EMA of ratio-adjusted net advances across all ~500 S&P members: 1000 × (advancers − decliners) / (advancers + decliners) per session. Where the breadth rows above show the LEVEL of participation, this measures its MOMENTUM — how fast participation is improving or deteriorating. The Summation Index is the running total of the oscillator and tracks the intermediate-term breadth regime (computed over the last ~110 sessions, so its direction matters, not its absolute level).',
    interpretation: 'Zero-line crosses mark breadth-momentum turns. Above +150 = overbought thrust (strong but stretched); below −150 = oversold washout, where bounces often start. The classic warning is divergence: index at new highs while the oscillator makes lower highs. Summation Index rising = intermediate-term breadth uptrend intact.',
    source: 'Computed from the daily S&P member bars (same pass as the 20d SMA breadth)',
    weight: 'N/A',
  },
  tape: {
    name: 'Tape Score',
    short: 'One Number For Risk-On vs Risk-Off',
    description: 'A weighted average of five market-health components, each normalized to a 0-100 scale where higher = healthier: S&P 500 breadth — the % of index members above their 50-day average — at 30% weight; the VIX level at 20% (mapped so VIX 12 scores 100, VIX 26 scores 35, VIX 45+ scores 0); the VIX/VIX3M term structure at 20% (deep contango scores high, backwardation scores 0); CNN Fear & Greed at 10% (used as-is); and the credit stress composite from the Credit & Macro tab at 20%, inverted (calm credit = high score). If a component is unavailable, the remaining weights are re-scaled proportionally.',
    interpretation: '70+ = RISK-ON (broad participation, cheap vol, calm credit). 45-69 = NEUTRAL. 25-44 = DEFENSIVE. Below 25 = RISK-OFF. The component mini-scores next to the big number show WHERE the weakness sits — e.g. a high total with a low breadth component means the rally is narrow. The score is a regime summary, not a timing signal: use it to size and filter trades, and watch for divergences between components rather than the headline number alone.',
    source: 'Computed: breadth 30% + VIX 20% + term structure 20% + F&G 10% + credit (inverted) 20%',
    weight: 'N/A',
  },
  cot: {
    name: 'Speculative Positioning (COT)',
    short: 'What The Big Speculators Are Betting On',
    description: 'Every Friday the US regulator CFTC publishes the "Commitments of Traders" report: how many futures contracts large speculators (hedge funds, managed money) hold long versus short in each market. The number shown is their NET position — for example "−35k" in S&P futures means speculators hold 35,000 more short contracts than long ones, a net bet on falling prices. Δ shows how much that bet changed versus the prior week.',
    interpretation: 'Speculators tend to be trend followers, so their positioning matters most at EXTREMES: the percentile shows where today’s net position ranks within the last year. Above 90% or below 10% means the bet is "crowded" — nearly everyone is already positioned the same way, so there is little fuel left to push the trend further, and a reversal squeezes them out (like a short squeeze). A large one-week Δ often marks exactly such a squeeze in progress. Note: data is as of Tuesday, published Friday — it is positioning context, not a timing signal.',
    source: 'CFTC weekly COT report (legacy, futures only)',
    weight: 'N/A',
  },
  relations: {
    name: 'Market Relations',
    short: 'Cross-Asset Ratio Charts',
    description: 'Each card divides one asset by another and plots the ratio over the last ~60 sessions. A rising line means the first asset is outperforming the second — regardless of whether both are rising or falling. These ratios are how macro traders read risk appetite: stocks vs bonds, junk credit vs Treasuries, copper vs gold, discretionary vs staples.',
    interpretation: 'Read the direction, not the level: a rising Stocks/Bonds line = risk-on; falling Copper/Gold = growth fears (it usually tracks 10-year yields); falling Stocks/Gold = the hard-asset / stagflation trade working. The 20d figure is the trend over roughly one trading month. Click any card to open the full ratio chart in TradingView.',
    source: 'Computed from Yahoo daily closes (refreshed every 6h) + live quotes',
    weight: 'N/A',
  },
  correlations: {
    name: 'Cross-Asset Correlations',
    short: 'Which Markets Move Together',
    description: 'Pearson correlation of daily returns over the last 30 sessions for the ten major assets. +1 (deep blue) = the two move together, −1 (deep red) = they move opposite, near 0 (dark) = unrelated.',
    interpretation: 'The most important cell is SPX·TLT: negative means Treasuries still hedge equities (normal regime); positive with both falling is the 2022-style inflation regime where nothing hedges. BTC·NDX positive = crypto trading as levered tech. GOLD·DXY is usually negative — when it flips positive, something unusual is driving gold. Correlations regime-shift slowly; watch cells that change color week to week.',
    source: 'Computed from Yahoo daily closes, 30-day window',
    weight: 'N/A',
  },
  yields: {
    name: 'Treasury Yields',
    short: 'US Government Bond Rates',
    description: 'The yield (interest rate) on US Treasury bonds at various maturities. These are the benchmark risk-free rates for the entire financial system. The shape of the yield curve (how these rates relate across maturities) tells us about economic expectations.',
    interpretation: 'A normal upward-sloping curve means the economy is expected to grow. An inverted curve (short rates above long rates) historically predicts recession. The 2s10s spread (10Y minus 2Y) and 10s30s spread are key measures of curve shape.',
    source: 'FRED: DGS2, DGS5, DGS10, DGS20, DGS30',
    weight: 'N/A',
  },
};

export function getInfo(key) {
  return INDICATOR_INFO[key] || null;
}

export default function InfoTooltip({ indicatorKey, style }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef(null);
  const tooltipRef = useRef(null);
  const info = INDICATOR_INFO[indicatorKey];

  useEffect(() => {
    if (open && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const tooltipW = 360;
      const tooltipH = 320;

      let left = rect.left + rect.width / 2 - tooltipW / 2;
      let top = rect.bottom + 8;

      if (left < 12) left = 12;
      if (left + tooltipW > viewportW - 12) left = viewportW - tooltipW - 12;
      if (top + tooltipH > viewportH - 12) top = rect.top - tooltipH - 8;

      setPosition({ top, left });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target) && !iconRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!info) return null;

  return (
    <>
      <span
        ref={iconRef}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: `1px solid ${colors.text.muted}`,
          color: colors.text.muted,
          fontSize: 11,
          fontFamily: fonts.sans,
          fontWeight: 600,
          cursor: 'pointer',
          marginLeft: 6,
          transition: 'all 0.2s',
          flexShrink: 0,
          ...(open ? { borderColor: colors.text.accent, color: colors.text.accent } : {}),
          ...style,
        }}
      >
        i
      </span>
      {open && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            width: 360,
            maxHeight: 400,
            overflowY: 'auto',
            background: '#0f1729',
            border: `1px solid ${colors.bg.border}`,
            borderRadius: 10,
            padding: '16px 18px',
            zIndex: 10000,
            boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 1px rgba(96,165,250,0.2)',
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary, fontFamily: fonts.sans, marginBottom: 2 }}>
            {info.name}
          </div>
          <div style={{ fontSize: 11, color: colors.text.accent, fontFamily: fonts.mono, marginBottom: 10, letterSpacing: 0.3 }}>
            {info.short}
          </div>

          <div style={{ fontSize: 12, color: colors.text.secondary, lineHeight: 1.6, marginBottom: 12 }}>
            {info.description}
          </div>

          <div style={{
            background: colors.bg.secondary,
            borderRadius: 6,
            padding: '10px 12px',
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 10, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: fonts.sans }}>
              How to Read
            </div>
            <div style={{ fontSize: 12, color: colors.text.primary, lineHeight: 1.6 }}>
              {info.interpretation}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: fonts.mono, color: colors.text.muted }}>
            <span>{info.source}</span>
            <span>Weight: {info.weight}</span>
          </div>
        </div>
      )}
    </>
  );
}
