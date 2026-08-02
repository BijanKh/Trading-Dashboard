// Sector-screener universes: top 30 members by market cap per ETF, plus the
// ETF itself as benchmark. 10 SPDR sectors derived from Wikipedia S&P 500 GICS
// membership; SMH/XBI/XRT/XHB/IYT/IGV from provider holdings files (SSGA XLSX,
// iShares latest-holdings.csv, VanEck via stockanalysis). Ranked by Yahoo
// marketCap on 2026-07-31. Static snapshot — re-run the ranking to refresh.

export const SECTOR_UNIVERSES = {
  XLK: {
    label: 'Technology',
    members: [
      'NVDA', 'AAPL', 'MSFT', 'AVGO', 'MU', 'AMD', 'INTC', 'CSCO', 'AMAT', 'LRCX',
      'ORCL', 'PLTR', 'PANW', 'DELL', 'TXN', 'KLAC', 'ANET', 'IBM', 'APH', 'STX',
      'WDC', 'CRWD', 'SNDK', 'ADI', 'MRVL', 'QCOM', 'CRM', 'APP', 'GLW', 'FTNT',
    ],
  },
  XLF: {
    label: 'Financials',
    members: [
      'BRK-B', 'JPM', 'V', 'MA', 'BAC', 'MS', 'GS', 'WFC', 'AXP', 'C',
      'SCHW', 'BLK', 'BX', 'IBKR', 'CB', 'COF', 'PGR', 'SPGI', 'BNY', 'PNC',
      'USB', 'CME', 'KKR', 'MRSH', 'ICE', 'MCO', 'TRV', 'HOOD', 'AON', 'APO',
    ],
  },
  XLV: {
    label: 'Health Care',
    members: [
      'LLY', 'JNJ', 'ABBV', 'UNH', 'MRK', 'TMO', 'AMGN', 'ABT', 'GILD', 'PFE',
      'DHR', 'CVS', 'BMY', 'ISRG', 'SYK', 'VRTX', 'MDT', 'MCK', 'HCA', 'ELV',
      'REGN', 'CI', 'BSX', 'COR', 'CAH', 'EW', 'BDX', 'HUM', 'IDXX', 'A',
    ],
  },
  XLY: {
    label: 'Discretionary',
    members: [
      'AMZN', 'TSLA', 'HD', 'MCD', 'TJX', 'BKNG', 'SBUX', 'LOW', 'MAR', 'ABNB',
      'CVNA', 'RCL', 'DASH', 'ROST', 'GM', 'ORLY', 'HLT', 'NKE', 'F', 'GRMN',
      'EBAY', 'AZO', 'CMG', 'YUM', 'DHI', 'CCL', 'EXPE', 'LVS', 'TPR', 'WSM',
    ],
  },
  XLP: {
    label: 'Staples',
    members: [
      'WMT', 'COST', 'KO', 'PG', 'PM', 'PEP', 'MO', 'MNST', 'MDLZ', 'CL',
      'TGT', 'KDP', 'SYY', 'ADM', 'KVUE', 'KMB', 'KR', 'HSY', 'CASY', 'KHC',
      'EL', 'DG', 'DLTR', 'CHD', 'STZ', 'TSN', 'BG', 'GIS', 'HRL', 'MKC',
    ],
  },
  XLE: {
    label: 'Energy',
    members: [
      'XOM', 'CVX', 'COP', 'VLO', 'MPC', 'WMB', 'PSX', 'EOG', 'SLB', 'KMI',
      'BKR', 'TRGP', 'FANG', 'OKE', 'OXY', 'DVN', 'EQT', 'TPL', 'HAL', 'EXE',
      'APA',
    ],
  },
  XLI: {
    label: 'Industrials',
    members: [
      'CAT', 'GE', 'RTX', 'GEV', 'UNP', 'BA', 'DE', 'ETN', 'UBER', 'LMT',
      'PH', 'HWM', 'ADP', 'GD', 'TT', 'PWR', 'VRT', 'CSX', 'MMM', 'WM',
      'UPS', 'CMI', 'JCI', 'EMR', 'ITW', 'CTAS', 'HON', 'NOC', 'NSC', 'FDX',
    ],
  },
  XLB: {
    label: 'Materials',
    members: [
      'LIN', 'NEM', 'FCX', 'SHW', 'ECL', 'APD', 'CRH', 'NUE', 'CTVA', 'STLD',
      'VMC', 'MLM', 'PPG', 'SW', 'IP', 'PKG', 'DOW', 'AMCR', 'IFF', 'LYB',
      'CF', 'DD', 'BALL', 'ALB', 'AVY', 'MOS',
    ],
  },
  XLC: {
    label: 'Communications',
    members: [
      'GOOGL', 'GOOG', 'META', 'NFLX', 'VZ', 'TMUS', 'DIS', 'T', 'CMCSA', 'WBD',
      'EA', 'TTWO', 'LYV', 'TKO', 'ECHO', 'FOXA', 'OMC', 'FOX', 'CHTR', 'NWS',
      'NWSA', 'PSKY', 'TTD',
    ],
  },
  XLRE: {
    label: 'Real Estate',
    members: [
      'WELL', 'PLD', 'EQIX', 'SPG', 'AMT', 'DLR', 'PSA', 'O', 'VTR', 'CBRE',
      'IRM', 'CCI', 'EXR', 'VICI', 'AVB', 'EQR', 'ESS', 'SBAC', 'WY', 'INVH',
      'HST', 'KIM', 'MAA', 'DOC', 'REG', 'UDR', 'BXP', 'CSGP', 'CPT', 'FRT',
    ],
  },
  SMH: {
    label: 'Semiconductors',
    members: [
      'NVDA', 'TSM', 'AVGO', 'MU', 'AMD', 'ASML', 'INTC', 'AMAT', 'LRCX', 'ARM',
      'TXN', 'KLAC', 'ADI', 'MRVL', 'QCOM', 'CDNS', 'SNPS', 'MPWR', 'NXPI', 'TER',
      'ALAB', 'STM', 'MCHP', 'ON', 'SWKS',
    ],
  },
  // Roundhill Memory ETF: full equity holdings (DRAM/NAND/HBM pure plays, only
  // ~12 names), deduped across swap/ADR lines to one row per company (primary
  // listings — Yahoo carries full daily history for all of them). Ranked by
  // USD-converted market cap on 2026-08-02.
  DRAM: {
    label: 'Memory',
    members: [
      '005930.KS',  // Samsung Electronics (KRX)
      'MU',         // Micron
      '000660.KS',  // SK hynix (KRX; SKHY US line skipped as duplicate)
      'STX',        // Seagate
      'WDC',        // Western Digital
      'SNDK',       // Sandisk
      '285A.T',     // Kioxia (Tokyo)
      '603986.SS',  // GigaDevice (Shanghai)
      '2408.TW',    // Nanya Technology (Taiwan)
      '2344.TW',    // Winbond (Taiwan)
      '8299.TWO',   // Phison (Taipei Exchange)
      '2337.TW',    // Macronix (Taiwan)
    ],
  },
  XBI: {
    label: 'Biotech',
    members: [
      'ABBV', 'AMGN', 'GILD', 'VRTX', 'REGN', 'RVMD', 'NTRA', 'BIIB', 'ALNY', 'UTHR',
      'ROIV', 'INCY', 'MRNA', 'INSM', 'NBIX', 'BBIO', 'EXEL', 'ARWR', 'BMRN', 'MDGL',
      'CYTK', 'SMMT', 'KRYS', 'APGE', 'HALO', 'PTGX', 'IONS', 'KYMR', 'SYRE', 'PRAX',
    ],
  },
  XRT: {
    label: 'Retail',
    members: [
      'AMZN', 'WMT', 'COST', 'TJX', 'CVNA', 'ROST', 'ORLY', 'TGT', 'EBAY', 'AZO',
      'KR', 'CASY', 'CPNG', 'DG', 'DLTR', 'BURL', 'ULTA', 'BBY', 'DKS', 'TSCO',
      'PAG', 'BJ', 'FIVE', 'MUSA', 'CART', 'GME', 'DDS', 'CHWY', 'LAD', 'KMX',
    ],
  },
  XHB: {
    label: 'Homebuilders',
    members: [
      'HD', 'LOW', 'TT', 'JCI', 'CARR', 'DHI', 'WSM', 'PHM', 'LEN', 'NVR',
      'LII', 'CSL', 'MAS', 'SGI', 'TOL', 'ALLE', 'OC', 'MOD', 'WMS', 'AAON',
      'BLDR', 'IBP', 'MTH', 'SKY', 'CVCO', 'MHO', 'KBH', 'GRBK', 'CCS', 'LGIH',
    ],
  },
  IYT: {
    label: 'Transports',
    members: [
      'UNP', 'UBER', 'CSX', 'UPS', 'NSC', 'FDX', 'DAL', 'ODFL', 'UAL', 'JBHT',
      'XPO', 'LUV', 'EXPD', 'CHRW', 'KNX', 'AAL', 'R', 'SAIA', 'KEX', 'JOBY',
      'SNDR', 'MATX', 'LSTR', 'LYFT', 'GXO', 'ALK', 'CAR', 'SKYW', 'RXO', 'ARCB',
    ],
  },
  IGV: {
    label: 'Software',
    members: [
      'MSFT', 'ORCL', 'PLTR', 'PANW', 'CRWD', 'CRM', 'APP', 'FTNT', 'NOW', 'ADBE',
      'DDOG', 'CDNS', 'INTU', 'SNPS', 'EA', 'ADSK', 'TTWO', 'WDAY', 'ROP', 'MSTR',
      'ZM', 'TEAM', 'ZS', 'FICO', 'IOT', 'GEN', 'CRCL', 'NTNX', 'PTC', 'RBRK',
    ],
  },
};

export const SECTOR_ETFS = Object.keys(SECTOR_UNIVERSES);
