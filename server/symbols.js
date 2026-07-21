// Single source of truth for all quoted symbols, grouped by dashboard section.
// kind: 'price' (default) | 'yield' (^TNX family — value is a yield in %)
// dec: display decimals hint for the frontend

export const GROUPS = {
  futures: [
    { s: 'ES=F', label: 'S&P 500', dec: 2 },
    { s: 'NQ=F', label: 'Nasdaq 100', dec: 2 },
    { s: 'RTY=F', label: 'Russell 2000', dec: 2 },
    { s: 'YM=F', label: 'Dow', dec: 0 },
    { s: '^SPXEW', label: 'S&P 500 Equal Weight', dec: 0 },
  ],
  world: [
    { s: '^GDAXI', label: 'DAX', dec: 0 },
    { s: '^STOXX50E', label: 'EuroStoxx 50', dec: 0 },
    { s: '^FTSE', label: 'FTSE 100', dec: 0 },
    { s: '^N225', label: 'Nikkei 225', dec: 0 },
    { s: '^HSI', label: 'Hang Seng', dec: 0 },
    { s: '^KS11', label: 'KOSPI', dec: 0 },
    { s: 'EEM', label: 'MSCI Emerging Mkts', dec: 2 },
  ],
  volatility: [
    { s: '^VIX', label: 'VIX', dec: 2 },
    { s: '^VIX3M', label: 'VIX 3M', dec: 2 },
    { s: '^MOVE', label: 'MOVE', dec: 2 },
  ],
  megacaps: [
    { s: 'AAPL', label: 'Apple', dec: 2 },
    { s: 'MSFT', label: 'Microsoft', dec: 2 },
    { s: 'NVDA', label: 'Nvidia', dec: 2 },
    { s: 'AMZN', label: 'Amazon', dec: 2 },
    { s: 'GOOGL', label: 'Alphabet', dec: 2 },
    { s: 'META', label: 'Meta', dec: 2 },
    { s: 'TSLA', label: 'Tesla', dec: 2 },
    { s: 'AVGO', label: 'Broadcom', dec: 2 },
    { s: 'SPCX', label: 'SpaceX', dec: 2 },
  ],
  commodities: [
    { s: 'CL=F', label: 'WTI Crude', dec: 2 },
    { s: 'BZ=F', label: 'Brent', dec: 2 },
    { s: 'GC=F', label: 'Gold', dec: 1 },
    { s: 'SI=F', label: 'Silver', dec: 2 },
    { s: 'HG=F', label: 'Copper', dec: 3 },
    { s: 'NG=F', label: 'Nat Gas', dec: 3 },
  ],
  crypto: [
    { s: 'BTC-USD', label: 'Bitcoin', dec: 0 },
    { s: 'ETH-USD', label: 'Ethereum', dec: 0 },
  ],
  sectors: [
    { s: 'SPY', label: 'S&P 500', dec: 2 },
    { s: 'QQQ', label: 'Nasdaq 100', dec: 2 },
    { s: 'IWM', label: 'Russell 2000', dec: 2 },
    { s: 'XLK', label: 'Technology', dec: 2 },
    { s: 'XLF', label: 'Financials', dec: 2 },
    { s: 'XLV', label: 'Healthcare', dec: 2 },
    { s: 'XLY', label: 'Discretionary', dec: 2 },
    { s: 'XLP', label: 'Staples', dec: 2 },
    { s: 'XLE', label: 'Energy', dec: 2 },
    { s: 'XLI', label: 'Industrials', dec: 2 },
    { s: 'XLB', label: 'Materials', dec: 2 },
    { s: 'XLU', label: 'Utilities', dec: 2 },
    { s: 'XLC', label: 'Communications', dec: 2 },
    { s: 'XLRE', label: 'Real Estate', dec: 2 },
    { s: 'SMH', label: 'Semiconductors', dec: 2 },
    { s: 'XBI', label: 'Biotech', dec: 2 },
    { s: 'KRE', label: 'Regional Banks', dec: 2 },
    { s: '^BKX', label: 'KBW Banks', dec: 2 },
    { s: 'XRT', label: 'Retail', dec: 2 },
    { s: 'XHB', label: 'Homebuilders', dec: 2 },
    { s: 'IYT', label: 'Transports', dec: 2 },
    { s: 'IGV', label: 'Software', dec: 2 },
    { s: 'KWEB', label: 'China Internet', dec: 2 },
    { s: 'FXI', label: 'China Large-Cap', dec: 2 },
    { s: 'TAN', label: 'Solar', dec: 2 },
    { s: 'FAN', label: 'Wind', dec: 2 },
  ],
  fx: [
    { s: 'DX-Y.NYB', label: 'DXY', dec: 3 },
    { s: 'EURUSD=X', label: 'EUR/USD', dec: 4 },
    { s: 'GBPUSD=X', label: 'GBP/USD', dec: 4 },
    { s: 'JPY=X', label: 'USD/JPY', dec: 2 },
    { s: 'EURJPY=X', label: 'EUR/JPY', dec: 2 },
    { s: 'EURCHF=X', label: 'EUR/CHF', dec: 4 },
    { s: 'CNH=X', label: 'USD/CNH', dec: 4 },
    { s: 'TRY=X', label: 'USD/TRY', dec: 4 },
    { s: 'MXN=X', label: 'USD/MXN', dec: 4 },
    { s: 'CAD=X', label: 'USD/CAD', dec: 4 },
  ],
  bonds: [
    { s: '2YY=F', label: '2Y Yield (CME fut)', kind: 'yield', dec: 3 },
    { s: '^IRX', label: '13W Yield', kind: 'yield', dec: 3 },
    { s: '^FVX', label: '5Y Yield', kind: 'yield', dec: 3 },
    { s: '^TNX', label: '10Y Yield', kind: 'yield', dec: 3 },
    { s: '^TYX', label: '30Y Yield', kind: 'yield', dec: 3 },
    { s: 'ZT=F', label: '2Y Note Fut', dec: 3 },
    { s: 'ZN=F', label: '10Y Note Fut', dec: 3 },
    { s: 'ZB=F', label: '30Y Bond Fut', dec: 3 },
    { s: 'TLT', label: '20Y+ Treasury', dec: 2 },
    { s: 'AGG', label: 'Agg Bond', dec: 2 },
    { s: 'TMF', label: '3x Long Tsy', dec: 2 },
    { s: 'JNK', label: 'High Yield', dec: 2 },
    { s: 'HYG', label: 'High Yield', dec: 2 },
  ],
  // Commodities tab — categorized from the user's TradingView watchlist.
  // Not on Yahoo (no free feed): LME nickel/lead/tin, XFRM. Spot XAUUSD/
  // SILVER/COPPER are represented by their futures.
  cmdEnergy: [
    { s: 'CL=F', label: 'WTI Crude', dec: 2 },
    { s: 'BZ=F', label: 'Brent Crude', dec: 2 },
    { s: 'NG=F', label: 'Nat Gas', dec: 3 },
    { s: 'HO=F', label: 'Heating Oil', dec: 3 },
    { s: 'RB=F', label: 'Gasoline RBOB', dec: 3 },
    { s: 'USO', label: 'US Oil Fund', dec: 2 },
    { s: 'OIH', label: 'Oil Services ETF', dec: 2 },
    { s: 'OXY', label: 'Occidental', dec: 2 },
  ],
  cmdPrecious: [
    { s: 'GC=F', label: 'Gold', dec: 1 },
    { s: 'SI=F', label: 'Silver', dec: 2 },
    { s: 'PL=F', label: 'Platinum', dec: 1 },
    { s: 'PA=F', label: 'Palladium', dec: 1 },
    { s: 'GLD', label: 'SPDR Gold', dec: 2 },
    { s: 'SLV', label: 'iShares Silver', dec: 2 },
    { s: 'PSLV', label: 'Sprott Phys Silver', dec: 2 },
  ],
  cmdMiners: [
    { s: 'GDX', label: 'Gold Miners', dec: 2 },
    { s: 'NUGT', label: 'Gold Miners 2x', dec: 2 },
    { s: 'JNUG', label: 'Jr Gold Miners 2x', dec: 2 },
    { s: 'SIL', label: 'Silver Miners', dec: 2 },
    { s: 'EXK', label: 'Endeavour Silver', dec: 2 },
  ],
  cmdBase: [
    { s: 'HG=F', label: 'Copper', dec: 3 },
    { s: 'ALI=F', label: 'Aluminum', dec: 1 },
    { s: 'TIO=F', label: 'Iron Ore', dec: 2 },
    { s: 'COPX', label: 'Copper Miners', dec: 2 },
    { s: 'ALUM', label: 'Aluminum Strategy', dec: 2 },
    { s: 'PICK', label: 'Metals & Mining', dec: 2 },
  ],
  cmdUranium: [
    { s: 'CCJ', label: 'Cameco', dec: 2 },
    { s: 'URA', label: 'Uranium ETF', dec: 2 },
    { s: 'URNM', label: 'Uranium Miners', dec: 2 },
    { s: 'UEC', label: 'Uranium Energy', dec: 2 },
    { s: 'UUUU', label: 'Energy Fuels', dec: 2 },
  ],
  cmdBattery: [
    { s: 'LIT', label: 'Lithium & Battery', dec: 2 },
    { s: 'REMX', label: 'Rare Earths', dec: 2 },
    { s: 'SETM', label: 'Critical Materials', dec: 2 },
    { s: 'ION', label: 'Battery Metals', dec: 2 },
  ],
  cmdAgri: [
    { s: 'ZS=F', label: 'Soybeans', dec: 2 },
    { s: 'ZW=F', label: 'Wheat', dec: 2 },
    { s: 'CC=F', label: 'Cocoa', dec: 0 },
    { s: 'WEAT', label: 'Wheat Fund', dec: 2 },
    { s: 'CAG', label: 'Conagra Brands', dec: 2 },
  ],
  cmdBroad: [
    { s: 'DBC', label: 'DB Commodity Index', dec: 2 },
    { s: 'SXRS.DE', label: 'Div Commodity Swap (EUR)', dec: 3 },
  ],
  // Space tab — the user's space/rocket watchlist (short-the-bounce focus).
  // UFO (Procure Space ETF) is the sector benchmark row; SPCX (SpaceX) also
  // appears in megacaps. Labels fall back to Yahoo shortName if a ticker's
  // company changes (several are recent IPOs / renames).
  space: [
    { s: 'UFO', label: 'Procure Space ETF', dec: 2 },
    { s: 'SPCX', label: 'SpaceX', dec: 2 },
    { s: 'RKLB', label: 'Rocket Lab', dec: 2 },
    { s: 'ASTS', label: 'AST SpaceMobile', dec: 2 },
    { s: 'LUNR', label: 'Intuitive Machines', dec: 2 },
    { s: 'FLY', label: 'Firefly Aerospace', dec: 2 },
    { s: 'VOYG', label: 'Voyager Tech', dec: 2 },
    { s: 'SPIR', label: 'Spire Global', dec: 2 },
    { s: 'RDW', label: 'Redwire', dec: 2 },
    { s: 'PL', label: 'Planet Labs', dec: 2 },
    { s: 'BKSY', label: 'BlackSky Tech', dec: 2 },
    { s: 'SATL', label: 'Satellogic', dec: 2 },
    { s: 'MNTS', label: 'Momentus', dec: 2 },
    { s: 'VELO', label: 'Velo3D', dec: 2 },
    { s: 'SIDU', label: 'Sidus Space', dec: 2 },
    { s: 'YSS', label: 'York Space', dec: 2 },
    { s: 'LPTH', label: 'LightPath', dec: 2 },
    { s: 'CPSH', label: 'CPS Tech', dec: 2 },
    { s: 'VPG', label: 'Vishay Precision', dec: 2 },
    { s: 'KRMN', label: 'Karman', dec: 2 },
    { s: 'GILT', label: 'Gilat Satellite', dec: 2 },
  ],
  // fetched only as ratio legs, not displayed as a group
  ratioLegs: [
    { s: 'RSP', label: 'S&P Equal Weight', dec: 2 },
    { s: 'IEF', label: '7-10Y Treasury', dec: 2 },
  ],
};

// Cross-asset relation pairs for the Market Relations panel (Overview).
// `up`/`down` are the plain-language reading of a rising/falling ratio.
// group 'macro' renders as a chart card; 'leadership' feeds the Leadership
// panel sparklines only.
export const RELATIONS = [
  { id: 'spy_tlt', num: 'SPY', den: 'TLT', title: 'Stocks vs Bonds', group: 'macro',
    up: 'Risk appetite — stocks outrunning Treasuries',
    down: 'Flight to safety — bonds outrunning stocks' },
  { id: 'hyg_ief', num: 'HYG', den: 'IEF', title: 'Credit Appetite', group: 'macro',
    up: 'Junk bonds lead Treasuries — credit calm',
    down: 'Credit stress — junk sold vs Treasuries' },
  { id: 'xly_xlp', num: 'XLY', den: 'XLP', title: 'Discretionary vs Staples', group: 'macro',
    up: 'Discretionary leads staples — cyclical confidence',
    down: 'Defensive rotation into staples' },
  { id: 'copper_gold', num: 'HG=F', den: 'GC=F', title: 'Copper vs Gold', group: 'macro',
    up: 'Growth trade — tends to track yields higher',
    down: 'Fear trade — growth doubts, tracks yields lower' },
  { id: 'spy_gold', num: 'SPY', den: 'GC=F', title: 'Stocks vs Gold', group: 'macro',
    up: 'Paper assets lead hard assets',
    down: 'Hard assets lead — debasement / stagflation trade' },
  { id: 'smh_spy', num: 'SMH', den: 'SPY', title: 'Semis Leadership', group: 'macro',
    up: 'Semis lead the market — tech risk appetite',
    down: 'Semis lag — leadership narrowing' },
  { id: 'eem_spy', num: 'EEM', den: 'SPY', title: 'Emerging vs US', group: 'macro',
    up: 'EM leads — global liquidity, softer dollar',
    down: 'US exceptionalism — capital hides in the S&P' },
  { id: 'btc_gold', num: 'BTC-USD', den: 'GC=F', title: 'Bitcoin vs Gold', group: 'macro',
    up: 'Speculative hard asset leads defensive one',
    down: 'Gold leads — defensive hard-asset demand' },
  { id: 'rsp_spy', num: 'RSP', den: 'SPY', title: 'Equal-Weight vs S&P 500', group: 'leadership',
    up: 'Broad participation', down: 'Narrow, top-heavy tape' },
  { id: 'qqq_spy', num: 'QQQ', den: 'SPY', title: 'Nasdaq 100 vs S&P 500', group: 'leadership',
    up: 'Growth/tech leading', down: 'Growth/tech lagging' },
  { id: 'iwm_spy', num: 'IWM', den: 'SPY', title: 'Small Caps vs S&P 500', group: 'leadership',
    up: 'Small caps leading', down: 'Small caps lagging' },
];

// Assets in the 30-day return-correlation matrix (order = display order).
export const CORRELATION_ASSETS = [
  { s: 'SPY', label: 'SPX' },
  { s: 'QQQ', label: 'NDX' },
  { s: 'IWM', label: 'RUT' },
  { s: 'TLT', label: 'TLT' },
  { s: 'HYG', label: 'HY' },
  { s: 'DX-Y.NYB', label: 'DXY' },
  { s: 'GC=F', label: 'GOLD' },
  { s: 'HG=F', label: 'COPPER' },
  { s: 'CL=F', label: 'OIL' },
  { s: 'BTC-USD', label: 'BTC' },
];

const SECTOR_RATIO_EXCLUDES = new Set(['SPY', '^BKX']);

// qqq_spy / iwm_spy live in the sectorRatio group; the Overview breadth panel
// picks them out by id alongside rsp_spy.
export const RATIOS = [
  { id: 'rsp_spy', num: 'RSP', den: 'SPY', label: 'RSP/SPY', group: 'breadth', dec: 4 },
  ...GROUPS.sectors
    .filter(e => !SECTOR_RATIO_EXCLUDES.has(e.s))
    .map(e => ({
      id: `${e.s.toLowerCase()}_spy`,
      num: e.s,
      den: 'SPY',
      label: `${e.s}/SPY`,
      group: 'sectorRatio',
      dec: 4,
    })),
];

// Broad-market ETFs don't count toward "% of sectors above SMA" breadth.
export const BREADTH_EXCLUDES = new Set(['SPY', 'QQQ', 'IWM']);

// Add your own holdings here to see their earnings dates on the Calendar tab.
export const EXTRA_EARNINGS = [];

export const EARNINGS_WATCHLIST = [...new Set([
  ...GROUPS.megacaps.map(e => e.s),
  ...EXTRA_EARNINGS,
])];

export function allSymbols() {
  const set = new Map();
  for (const entries of Object.values(GROUPS)) {
    for (const e of entries) {
      if (!set.has(e.s)) set.set(e.s, e);
    }
  }
  return [...set.values()];
}
