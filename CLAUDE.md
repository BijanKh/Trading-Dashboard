# TRADING DASHBOARD ("Godmode")

## Project Overview

A full-stack multi-tab trader dashboard. Five tabs:

1. **Overview** (default, intraday) — index futures, world indices, volatility & sentiment (VIX/VIX3M term structure, MOVE, CNN Fear & Greed), breadth ratios (RSP/SPY, QQQ/SPY, IWM/SPY), sector heat strip, mega caps, commodities, crypto, today's economic events with countdown to the next high-impact USD/EUR release.
2. **Sectors** (intraday) — sector ETF heatmap + sortable screener with daily % and week-to-date %, plus a sector/SPY relative-strength ratio table (replicates the user's TradingView watchlists).
   **Trending** (daily scan) — "Setups Daytrading" (daily 12 EMA) and "Setups Swingtrading" (weekly 12 EMA) over S&P 500 + Nasdaq-100. Longs: above the 12 EMA, within 5% (day) / 10% (swing) of the TRUE all-time high (full-history weekly bars); shorts inverse vs the 52-WEEK low (index members are never near true ATLs — survivorship + decades-old split-adjusted prices; verified: closest was +22%) plus price ≥$5 and ≥$20M avg dollar volume. Ranked by closeness to the 12 EMA — tightest pullbacks first, filter guarantees the right side of the EMA (per user preference — NOT by RS or ATH proximity; RS vs SPY is a context column only). Distance to the 12 EMA shown in ATR units (≤1 = PULLBACK, >2.5 = EXTENDED). Extra lists "Strongest/Weakest Trending": whole-universe top/bottom 10 by RS momentum, filtered to price above/below the daily 12 EMA (weakest also gets the short liquidity floors). Tab sits LAST in the tab bar (user preference). 52w range from batched quote() pre-filters the setup pool (ATH ≥ 52w high makes it a strict superset); chart() pass fetches daily bars for ALL symbols (momentum needs them) + weekly full history for pool candidates (~770 calls, ~7 min). `server/trending.js`, `GET /api/trending`, scans once/day (lazy >20h + cron 16:45 ET), persisted to `data/trending.json`. Nasdaq-100 list scraped from Wikipedia (7d cache + `data/ndx100.json` fallback); degrades to S&P 500 only if that fails.
3. **FX & Bonds** (intraday) — currencies incl. DXY, live US yields (^IRX/^FVX/^TNX/^TYX), FRED curve spreads, bond futures & ETFs. German/EU yields planned via ECB Data Portal.
4. **Commodities** (intraday) — the user's TradingView commodity watchlist, categorized: Energy, Precious Metals, Gold & Silver Miners, Base Metals & Mining, Uranium & Nuclear, Battery & Strategic Metals, Agriculture, Broad Commodity (groups `cmd*` in `server/symbols.js`). LME nickel/lead/tin and XFRM have no free feed.
5. **Crypto** — TOTAL/TOTAL2/TOTAL3 market caps, BTC/ETH dominance, top 20 by market cap (incl. price in BTC + 24h vs BTC), top-10 winners/losers of the day from the top-250 universe (stablecoins/wrapped excluded). Polls only while the tab is open (90s).
6. **Credit & Macro** (weekly cadence) — the original credit-stress monitor, unchanged: 7 FRED indicators, composite stress score (0–100), duration-rotation signal at ≥65.
7. **Calendar** — ForexFactory weekly economic calendar with impact/currency filters + watchlist earnings.

Intraday tabs poll `/api/quotes` every 45s while visible (paused when the browser tab is hidden). The Credit tab loads once on mount with a manual refresh button.

**Credit-tab use case:** The user is a macro investor monitoring credit markets, volatility, and funding stress to identify when the "growth shock" overtakes the "inflation shock" in a stagflationary environment (Iran war / oil crisis, 2026). When the composite score crosses ≥65, it signals the regime transition — time to initiate long-duration Treasury positions (20Y+).

## Market Data Sources

| Source | Used for | Notes |
|---|---|---|
| Yahoo Finance via `yahoo-finance2` | All intraday quotes (~77 symbols) | **Batched**: one `quote()` HTTP request per 45s refresh. Never fetch per-symbol in a loop — raw unauthenticated v8/chart calls get the IP 429-banned within minutes. `quote()`/`chart()` return ^TNX-family values as actual yields (4.47, NOT 44.7 — no /10 scaling). |
| Yahoo `chart()` | Daily refs: week-to-date reference closes (all symbols, 30d bars) + SMA 20/50/200 for sector ETFs (450d bars) | Fetched sequentially with 300ms gaps + 15s timeout per call, cached 6h in memory, auto-refreshed on new ISO week. WTD/SMAs/breadth are null until the first pass completes (~5-8 min after first request). Breadth = % of sector ETFs (excl. SPY/QQQ/IWM broad-market, see `BREADTH_EXCLUDES`) above each SMA, in the `/api/quotes` payload as `breadth`. |
| Yahoo `quoteSummary(calendarEvents)` | Watchlist earnings dates + EPS/revenue estimates (`GET /api/earnings`) | Watchlist = mega caps + `EXTRA_EARNINGS` in `server/symbols.js` (user adds own holdings there). Sequential, cached 12h. |
| `server/sp500.js` | S&P 500 market breadth (% of ~502 members above 20/50/200d SMA), in `/api/quotes` as `spxBreadth`, + ratio-adjusted McClellan Oscillator/Summation Index as `mcclellan` | Constituents scraped from Wikipedia (7d cache + `data/sp500.json` disk fallback; dots→dashes for Yahoo). 50/200d from batched quote() `fiftyDayAverage`/`twoHundredDayAverage` (4 chunks, 15min cache). 20d + McClellan from a once-per-day sequential chart() pass (160 calendar days of bars, 400ms gaps, ~10 min; null until first pass done). McClellan: RANA = 1000·(adv−dec)/(adv+dec) per session (≥300 members required), osc = EMA19−EMA39, summation = window-relative running sum (~110 sessions — direction matters, not level). Rendered in `SpxBreadthPanel.jsx`; daily osc recorded to `metric_history` as `mcclellan_osc`. Junk-bond A/D McClellan investigated 2026-07: FINRA TRACE breadth data exists but the legacy public Morningstar endpoint is dead and the Query API needs free registration + OAuth — not integrated. |
| FRED | Credit tab (unchanged) + curve spreads on FX & Bonds tab | 1-business-day lag |
| ForexFactory (`nfs.faireconomy.media/ff_calendar_thisweek.json`) | Economic calendar | Free weekly JSON, cached 4h, stale-served on failure |
| CNN (`production.dataviz.cnn.io/index/fearandgreed/graphdata`) | Fear & Greed | Best-effort; null → UI hides it. Cached 30min, 5min backoff on failure |
| CoinGecko free API (`/global` + `/coins/markets` top 250) | Crypto tab (`GET /api/crypto`) | No key. TOTAL2/3 derived from dominance %. Public rate limit is TIGHT (~5-15 req/min/IP): keep the 120s server cache and 90s tab-only polling; never poll per-coin. Per-coin YTD refs via `/coins/{id}/history` — 8s gaps + 10min pass backoff or it 429s. |
| OKX public API (funding-rate + open-interest) | BTC/ETH perp funding + OI on Crypto tab | Binance AND Bybit are geo-blocked from this location — use OKX. |
| CFTC Socrata (`publicreporting.cftc.gov/resource/6dca-aqww.json`) | COT card on FX & Bonds (`GET /api/cot`) | Legacy futures-only dataset, weekly. Match markets with `like 'NAME -%'` patterns. |
| ECB Data Portal (`data-api.ecb.europa.eu/service/data/YC/...SR_{tenor}`) | Euro AAA gov curve (`GET /api/ecb-curve`) | ≈ Bund curve, daily, prev business day. |
| Yahoo `options()` | SPY/QQQ OI walls (`GET /api/options`, 1h cache) + implied earnings moves (straddle/spot, enriched into `/api/earnings` for reports ≤14d out) | |
| SQLite `metric_history` | 30d sparklines + breadth-divergence check (both in `/api/quotes` as `history`/`divergence`) | Upserted ≤1×/15min per day-row by `recordMetrics()`. Divergence needs 6 days of history before it can fire. |

Other composed outputs in `/api/quotes`: `tape` (0-100 risk composite), `rrg` (sector rotation vs SPY — computed from the daily-pass close series, null until first pass completes), `relations` (Market Relations: cross-asset ratio series over ~60 sessions — SPY/TLT, HYG/IEF, XLY/XLP, copper/gold, SPY/gold, SMH/SPY, EEM/SPY, BTC/gold + leadership ratios; pairs defined in `RELATIONS` in `server/symbols.js`), and `correlations` (10-asset 30d daily-return correlation matrix, assets in `CORRELATION_ASSETS`). Both are null until the first daily pass completes; the daily pass now retains a 70-session close series for EVERY symbol (not just sectors) and a ~260-session series for volatility symbols. Frontend: `RelationsPanel.jsx` (small-multiple ratio charts on Overview, click-through to TV ratio charts) and `CorrelationMatrix.jsx` (diverging heatmap, blue=together/red=opposite, plus the rolling 30d SPX·TLT stock-bond regime chart from `correlations.spxTlt`).

More `/api/quotes` fields: `volPctiles` (1y percentiles of live VIX/VIX3M/MOVE/term-ratio, shown in VolPanel), `mcclellan` (see `server/sp500.js` row above), `alerts` (macro alert rules evaluated in `server/alerts.js` — VIX levels, term-structure inversion, MOVE>120, credit composite ≥50/65, HY OAS>450, tape<25, SPX·TLT corr>0.2, breadth divergence, McClellan zero-cross (date-stamped id, re-arms per cross) and ±150 extremes, high-impact event <45min; rendered by `client/src/components/AlertStrip.jsx` under the header on all tabs, which also evaluates user-defined price thresholds from localStorage and fires browser notifications on newly-active alert ids).

`GET /api/news` (`server/news.js`): watchlist headlines via yahoo-finance2 `search()` (the classic Yahoo RSS endpoints are DEAD — don't use them), one search per symbol (indices/commodities/megacaps), 15min cache, deduped by uuid with per-story symbol tags. Rendered by `NewsPanel.jsx` on Overview (5min poll).

`/api/current` now includes `yieldHistory` (`{ m1, y1 }` curves from `fred_observations` via `getObservations`, 6h cache) — `YieldCurve.jsx` draws them as faded ghost lines on Credit and FX & Bonds tabs.

Calendar: the ForexFactory feed has NO actual values (forecast/previous only) — `client/src/lib/econ.js` parses them and the Calendar tab + EventStrip show the consensus-vs-previous direction ("cons. ▲/▼") and dim released events; if the feed ever ships `actual`, it passes through and renders as a hot/cold surprise (amber/blue) automatically. `GET /api/briefing` composes a rule-based morning briefing from all cached feeds. Frontend: chart-modal click-through on every tile/table row (TradingView widget embed, symbol mapping in `client/src/lib/tv.js`), keyboard shortcuts 1-7 for tabs.

New API routes: `GET /api/quotes` (all groups + computed ratios + fearGreed, server-cached 45s with stampede guard, stale-on-error flag) and `GET /api/calendar`. Symbol universe lives in `server/symbols.js` — single source of truth for groups, labels and ratio pairs.

---

## Architecture

```
dashboard/
├── CLAUDE.md                  # This file
├── .env                       # FRED API key (FRED_API_KEY=...)
├── package.json
├── server/
│   ├── index.js               # Express server — API routes + static file serving
│   ├── fred.js                # FRED API client — credit-stress series
│   ├── indicators.js          # Indicator computation + composite score logic
│   ├── scheduler.js           # Cron job — auto-fetch FRED during market hours
│   ├── db.js                  # SQLite interface — daily snapshots
│   ├── symbols.js             # Symbol universe: groups, labels, ratio pairs
│   ├── yahoo.js               # yahoo-finance2 client — quotes, WTD refs, cache
│   ├── calendar.js            # ForexFactory calendar feed (4h cache)
│   ├── earnings.js            # Watchlist earnings via quoteSummary (12h cache)
│   ├── sentiment.js           # CNN Fear & Greed (best-effort, 30min cache)
│   ├── sp500.js               # S&P 500 constituents + market breadth (20/50/200d) + McClellan osc/summation
│   ├── crypto.js              # CoinGecko + OKX derivs: caps, dominance, funding/OI
│   ├── metrics.js             # Daily metric_history persistence + divergence check
│   ├── tape.js                # Tape Score composite (breadth/vol/term/sentiment/credit)
│   ├── briefing.js            # Rule-based briefing composer (pure function)
│   ├── options.js             # Yahoo option chains: SPY/QQQ OI walls, implied earnings moves
│   ├── cot.js                 # CFTC COT via Socrata (weekly, 9 markets, 1y percentile)
│   ├── optionsdash.js         # Per-ticker options dashboard (GET /api/options-dash?symbol=X):
│   │                          #   IV30/term structure/skew, expected moves, max pain, OI walls,
│   │                          #   IV vs RV20, unusual activity, BS dealer-gamma profile + flip.
│   │                          #   10min LRU cache; IV30 recorded daily to metric_history for IV rank.
│   ├── trending.js            # Daily trend scan (S&P 500 + NDX-100): 12 EMA day/week setups,
│   │                          #   ATH band longs / 52w-low band shorts, ranked by 12-EMA closeness
│   └── ecb.js                 # Euro AAA gov curve from ECB Data Portal (6h cache)
├── client/
│   ├── index.html             # Entry HTML
│   ├── src/
│   │   ├── App.jsx            # Tab shell (header + TabBar + keep-alive panels)
│   │   ├── tabs/
│   │   │   ├── OverviewTab.jsx    # Godmode: futures, world, vol, breadth, heat strip, events
│   │   │   ├── SectorsTab.jsx     # Heatmap + sector screener + sector/SPY ratios
│   │   │   ├── TrendingTab.jsx    # Daytrading/Swingtrading setup lists (10 long / 10 short each)
│   │   │   ├── FXBondsTab.jsx     # Currencies, live US yields, curve, bond futures/ETFs
│   │   │   ├── CreditTab.jsx      # Original credit-stress dashboard (moved verbatim)
│   │   │   └── CalendarTab.jsx    # Weekly calendar with impact/currency filters
│   │   ├── components/
│   │   │   ├── TabBar.jsx, Pct.jsx, QuoteTile.jsx, QuoteTable.jsx
│   │   │   ├── SectorHeatmap.jsx, VolPanel.jsx, EventStrip.jsx
│   │   │   ├── BreadthPanel.jsx, EarningsPanel.jsx
│   │   │   ├── Gauge.jsx, IndicatorCard.jsx, HYChart.jsx, YieldCurve.jsx
│   │   │   ├── ScoreHistory.jsx, SignalBox.jsx, ScoreBar.jsx, InfoTooltip.jsx
│   │   ├── context/
│   │   │   └── QuotesContext.jsx  # Shared 45s quote poller + 30min calendar poller
│   │   ├── hooks/
│   │   │   └── useVisibilityPolling.js  # Poll while enabled + tab visible
│   │   ├── lib/
│   │   │   ├── api.js         # Frontend API client
│   │   │   └── format.js      # fmtPrice / fmtPct (signed)
│   │   └── styles/
│   │       └── theme.js       # Design tokens incl. updown + impact colors
│   └── vite.config.js
├── data/
│   └── stress.db              # SQLite database (auto-created)
└── scripts/
    └── backfill.js            # One-time script to backfill historical data
```

---

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite via `better-sqlite3`
- **Scheduler:** `node-cron`
- **Frontend:** React + Vite + Recharts
- **Styling:** CSS-in-JS (inline styles, no Tailwind needed — dark financial terminal aesthetic)
- **FRED API:** Direct HTTP fetch, no SDK needed

### Dependencies

```json
{
  "dependencies": {
    "express": "^4.18",
    "better-sqlite3": "^11",
    "node-cron": "^3",
    "dotenv": "^16",
    "cors": "^2"
  },
  "devDependencies": {
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "react": "^18",
    "react-dom": "^18",
    "recharts": "^2"
  }
}
```

---

## Environment Variables

```env
FRED_API_KEY=<your_fred_api_key>   # Get one free at https://fred.stlouisfed.org/docs/api/api_key.html
PORT=3456
```

---

## FRED Series Configuration

All data comes from the FRED API (Federal Reserve Economic Data). Free API, 1-day lag, daily frequency.

| Indicator Key | FRED Series ID  | Description                        |
|---------------|----------------|------------------------------------|
| HY_OAS        | BAMLH0A0HYM2   | ICE BofA US High Yield OAS          |
| CCC_OAS       | BAMLH0A3HYC    | ICE BofA CCC & Lower OAS            |
| BB_OAS        | BAMLH0A1HYBB   | ICE BofA BB OAS                      |
| VIX           | VIXCLS         | CBOE Volatility Index                |
| CP_3M         | DCPF3M         | 3-Month Financial Commercial Paper   |
| TBILL_3M      | DTB3           | 3-Month Treasury Bill                |
| DGS10         | DGS10          | 10-Year Treasury Yield               |
| DGS20         | DGS20          | 20-Year Treasury Yield               |
| DGS30         | DGS30          | 30-Year Treasury Yield               |
| DGS2          | DGS2           | 2-Year Treasury Yield                |
| DGS5          | DGS5           | 5-Year Treasury Yield                |
| SOFR          | SOFR           | Secured Overnight Financing Rate     |
| FED_FUNDS     | DFF            | Effective Federal Funds Rate         |

### FRED API Pattern

```
GET https://api.stlouisfed.org/fred/series/observations
  ?series_id={SERIES_ID}
  &api_key={FRED_API_KEY}
  &file_type=json
  &sort_order=desc
  &limit={LIMIT}
```

- Response: `{ observations: [{ date: "2026-03-27", value: "448.00" }, ...] }`
- Values of `"."` mean no data for that date — filter these out
- Parse values as floats
- Rate limit: 120 requests per minute (generous, no issue for us)

---

## 7 Indicators — Computation Logic

### 1. HY OAS (weight: 25%)
- **Raw value:** Latest `BAMLH0A0HYM2` observation (in basis points)
- **What it measures:** Broad high-yield credit spread — the single most important stress indicator
- **Interpretation:** 250–350 = calm, 450–550 = elevated, 700+ = crisis

### 2. CCC–BB Dispersion (weight: 15%)
- **Raw value:** `BAMLH0A3HYC` minus `BAMLH0A1HYBB` (in basis points)
- **What it measures:** Quality spread divergence — when CCC spreads widen faster than BB, the market is discriminating aggressively, an early warning of credit stress
- **Interpretation:** 150–250 = calm, 400–600 = stress, 800+ = crisis

### 3. CP–TBill Spread (weight: 15%)
- **Raw value:** `DCPF3M` minus `DTB3` (in percentage points)
- **What it measures:** Commercial paper funding stress — when this blows out, short-term corporate funding markets are freezing
- **Interpretation:** 0.05–0.15 = calm, 0.4–0.7 = stress, 1.2+ = crisis

### 4. VIX (weight: 15%)
- **Raw value:** Latest `VIXCLS` observation
- **What it measures:** S&P 500 implied volatility — equity market fear gauge
- **Interpretation:** 12–17 = calm, 24–32 = elevated, 40+ = crisis

### 5. SOFR–FF Spread (weight: 10%)
- **Raw value:** `abs(SOFR - DFF) * 100` (convert to basis points)
- **What it measures:** Repo market stress — dislocations between SOFR and Fed Funds signal collateral shortages
- **Interpretation:** 0–3 = calm, 8–15 = stress, 25+ = crisis

### 6. Treasury Volatility — MOVE Index Proxy (weight: 10%)
- **Raw value:** 20-day rolling standard deviation of daily 10Y yield changes (in basis points)
- **Computation:**
  1. Take the last 21 observations of `DGS10`
  2. Compute 20 daily changes: `(obs[i] - obs[i+1]) * 100` (convert to bps; data is sorted desc)
  3. Compute standard deviation of these 20 changes
- **What it measures:** Bond market volatility — proxies the ICE BofA MOVE index
- **Interpretation:** 3–5 = calm, 8–12 = elevated, 16+ = crisis

### 7. HY Spread Momentum — CDX Proxy (weight: 10%)
- **Raw value:** 5-day change in HY OAS: `HY_OAS[0] - HY_OAS[5]` (bps, data sorted desc)
- **What it measures:** Rate of change in credit spreads — proxies CDX.NA.HY institutional hedging
- **Interpretation:** Negative = tightening (calm), 0–15 = neutral, 35+ = rapid widening (stress), 60+ = crisis

---

## Scoring System — Piecewise Linear Interpolation

Each indicator is normalized to a 0–100 score using piecewise linear interpolation between threshold pairs `[value, score]`:

```javascript
const THRESHOLDS = {
  hy_oas:      [[250,0],[350,15],[450,35],[550,55],[700,75],[1000,95],[1500,100]],
  ccc_bb:      [[150,0],[250,15],[400,35],[600,55],[800,75],[1200,100]],
  cp_spread:   [[0.05,0],[0.15,10],[0.25,20],[0.4,35],[0.7,55],[1.2,75],[2.0,100]],
  vix:         [[12,0],[17,15],[24,35],[32,55],[40,75],[55,95],[80,100]],
  sofr_ff:     [[0,0],[3,10],[8,30],[15,50],[25,70],[50,95],[100,100]],
  tsy_vol:     [[3,0],[5,15],[8,35],[12,55],[16,75],[22,100]],
  hy_momentum: [[-10,0],[0,5],[15,25],[35,45],[60,65],[100,85],[160,100]],
};
```

**Interpolation function:**
```javascript
function interpolate(value, thresholds) {
  if (value <= thresholds[0][0]) return thresholds[0][1];
  if (value >= thresholds[thresholds.length - 1][0]) return thresholds[thresholds.length - 1][1];
  for (let i = 0; i < thresholds.length - 1; i++) {
    const [v0, s0] = thresholds[i];
    const [v1, s1] = thresholds[i + 1];
    if (value >= v0 && value <= v1) {
      const t = (value - v0) / (v1 - v0);
      return s0 + t * (s1 - s0);
    }
  }
  return 50;
}
```

**Composite score** = weighted sum of all indicator scores using WEIGHTS defined above.

If any indicator is missing (FRED returns no data), reweight the remaining indicators proportionally.

---

## Regime Classification

| Composite Score | Regime    | Color   | Action                              |
|----------------|-----------|---------|-------------------------------------|
| 0–24           | CALM      | #10B981 | Risk-on, short vol                  |
| 25–49          | ELEVATED  | #FBBF24 | Caution, reduce risk                |
| 50–69          | STRESS    | #F97316 | Defensive, raise cash               |
| 70–100         | CRISIS    | #EF4444 | Full defensive, consider duration   |

### Duration Signal
- **Fires when:** Composite score ≥ 65
- **Meaning:** Growth shock is overtaking inflation shock — initiate long-duration Treasury position (20Y+)
- **Historical context:** This level aligns with credit market stress severe enough that demand destruction begins killing the inflation impulse

---

## SQLite Schema

```sql
-- Daily snapshots of all indicators and composite score
CREATE TABLE IF NOT EXISTS daily_snapshots (
  date TEXT PRIMARY KEY,             -- YYYY-MM-DD
  hy_oas REAL,
  ccc_oas REAL,
  bb_oas REAL,
  ccc_bb REAL,                       -- computed: ccc_oas - bb_oas
  vix REAL,
  cp_3m REAL,
  tbill_3m REAL,
  cp_spread REAL,                    -- computed: cp_3m - tbill_3m
  sofr REAL,
  fed_funds REAL,
  sofr_ff REAL,                      -- computed: abs(sofr - ff) * 100
  dgs2 REAL,
  dgs5 REAL,
  dgs10 REAL,
  dgs20 REAL,
  dgs30 REAL,
  tsy_vol REAL,                      -- computed: 20d stdev
  hy_momentum REAL,                  -- computed: 5d change
  -- Scores (0-100)
  score_hy_oas REAL,
  score_ccc_bb REAL,
  score_cp_spread REAL,
  score_vix REAL,
  score_sofr_ff REAL,
  score_tsy_vol REAL,
  score_hy_momentum REAL,
  composite_score REAL,
  regime TEXT,                        -- CALM / ELEVATED / STRESS / CRISIS
  signal_active INTEGER DEFAULT 0,   -- 1 if composite >= 65
  created_at TEXT DEFAULT (datetime('now'))
);

-- Raw FRED observations for historical reference
CREATE TABLE IF NOT EXISTS fred_observations (
  series_id TEXT NOT NULL,
  date TEXT NOT NULL,
  value REAL NOT NULL,
  fetched_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (series_id, date)
);
```

---

## Scheduler

Use `node-cron` to auto-fetch during US market hours:

```javascript
// Fetch every 30 minutes, Mon-Fri, 8am-6pm ET
// FRED data updates daily around 8:30am ET, but this catches intraday VIX updates
cron.schedule('*/30 8-18 * * 1-5', fetchAndStore, {
  timezone: "America/New_York"
});
```

On each scheduled run:
1. Fetch all 13 FRED series (latest 120 observations each for history)
2. Upsert raw observations into `fred_observations`
3. Compute all 7 indicators + composite score
4. Insert/update `daily_snapshots` for today's date
5. Log the result to console

---

## API Endpoints

### `GET /api/current`
Returns the latest computed indicators and composite score.

```json
{
  "asOf": "2026-03-30",
  "indicators": {
    "hy_oas": { "value": 448, "score": 34.0, "weight": 0.25 },
    "ccc_bb": { "value": 655, "score": 63.8, "weight": 0.15 },
    "cp_spread": { "value": 0.240, "score": 18.0, "weight": 0.15 },
    "vix": { "value": 29.6, "score": 48.5, "weight": 0.15 },
    "sofr_ff": { "value": 0.0, "score": 0.0, "weight": 0.10 },
    "tsy_vol": { "value": 7.2, "score": 28.3, "weight": 0.10 },
    "hy_momentum": { "value": 28, "score": 37.5, "weight": 0.10 }
  },
  "composite": 33.5,
  "regime": "ELEVATED",
  "signalActive": false,
  "yields": {
    "2y": 3.82, "5y": 3.97, "10y": 4.35, "20y": 4.92, "30y": 4.91
  },
  "context": {
    "fedFunds": "3.50-3.75",
    "sofr": 3.63
  }
}
```

### `GET /api/history?days=90`
Returns daily composite score history for the chart.

```json
{
  "history": [
    { "date": "2026-01-02", "composite": 8.2, "regime": "CALM", "signalActive": false },
    { "date": "2026-01-03", "composite": 8.5, "regime": "CALM", "signalActive": false },
    ...
  ]
}
```

### `GET /api/hy-history?days=90`
Returns HY OAS daily values for the spread chart.

### `GET /api/refresh`
Triggers an immediate data fetch + recompute (manual refresh button).

---

## Frontend Design Specification

### Aesthetic
- **Dark financial terminal** — deep navy/charcoal background (#070b16, #0a0f1e, #0d1424)
- **Monospace data** — JetBrains Mono or IBM Plex Mono for all numbers and data labels
- **Sans-serif headers** — Space Grotesk or system sans-serif for section headers
- **Color-coded stress levels** — green (#10B981), amber (#FBBF24), orange (#F97316), red (#EF4444)
- **Subtle glows and gradients** — not flashy, professional and readable
- **No emojis in the UI** (except ⚡ for the signal indicator)

### Layout (top to bottom)
1. **Header bar** — title, data timestamp, WTI oil price badge
2. **Top row** (3 columns, responsive):
   - Left: Semicircular gauge with composite score + regime label
   - Center: Key levels table (HY OAS, VIX, CCC-BB, yields, curve spreads, SOFR, Fed Funds)
   - Right: Duration signal box (green/red with threshold bar) + regime context paragraph
3. **Indicator cards grid** — 7 cards, each showing: label, description, raw value, score/100, stress bar, FRED series ID, weight
4. **Charts row** (2 columns):
   - Left: HY OAS YTD area chart with 500/700 reference lines
   - Right: Treasury yield curve (3M through 30Y) with 2s10s/10s30s annotations
5. **Composite score history chart** (full width) — area chart from SQLite daily_snapshots, with regime color bands and the 65-threshold reference line. THIS IS THE KEY NEW CHART that the static version couldn't have.
6. **Score comparison bar chart** — horizontal bars for each indicator score with 65-threshold line
7. **Methodology footer** — compact explanation

### Charts
- Use Recharts for all charts
- Dark backgrounds, muted grid lines (#141e33)
- Axis text in monospace, muted color (#3a4d6b)
- Custom dark tooltips matching the theme
- Area charts with subtle gradient fills

---

## Backfill Script

`scripts/backfill.js` should:
1. Fetch the last 252 trading days (~1 year) of data for all series
2. For each trading day, compute indicators and composite score
3. Insert into `daily_snapshots`
4. This populates the composite score history chart immediately

Run once after first setup: `node scripts/backfill.js`

---

## Running the Project

```bash
# Install
npm install

# Set up .env
echo "FRED_API_KEY=<your_fred_api_key>" > .env
echo "PORT=3456" >> .env

# Backfill historical data (one-time, takes ~30 seconds)
node scripts/backfill.js

# Development — runs Express backend + Vite dev server
npm run dev

# Production build
npm run build
npm start
```

### package.json scripts
```json
{
  "scripts": {
    "dev": "concurrently \"node server/index.js\" \"vite --config client/vite.config.js\"",
    "build": "vite build --config client/vite.config.js",
    "start": "NODE_ENV=production node server/index.js",
    "backfill": "node scripts/backfill.js"
  }
}
```

In production, Express serves the built Vite output as static files from `client/dist/`.

In development, Vite runs on port 5173 and proxies API calls to Express on port 3456.

---

## Important Implementation Notes

1. **FRED data has a 1-day lag.** The latest observation is typically from the previous business day. The dashboard should display the observation date, not "today."

2. **Weekend/holiday handling.** FRED returns no data on weekends/holidays. The computation should always use the latest available observation, not assume today has data.

3. **Missing series.** If any FRED series returns no data (happens occasionally), compute the composite from available indicators and reweight proportionally. Flag the missing indicator in the UI.

4. **Treasury vol computation** requires 21 observations of DGS10 to compute the 20-day rolling stdev. During backfill, skip dates where fewer than 21 prior observations exist.

5. **HY momentum** requires 6 observations (current + 5 prior). Same skip logic for backfill.

6. **The composite score ≥65 signal** is the most important output. It should be visually prominent and unmistakable.

7. **Vite proxy config** for development:
```javascript
// client/vite.config.js
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:3456'
    }
  }
}
```

8. **Error handling:** FRED API can occasionally return 500s or rate limit. Implement retry with exponential backoff (max 3 retries, 1s/2s/4s delays).

9. **The `.env` file should be in `.gitignore`** but the FRED API key is not particularly sensitive (it's free and tied to FRED, not a financial account).
