// One-off research script: rank sector universes by market cap and emit
// server/sectorUniverses.js for the dashboard's Screener tab.
import { readFileSync, writeFileSync } from 'fs';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const DIR = process.argv[2];
const gics = JSON.parse(readFileSync(`${DIR}/sp500_sectors.json`, 'utf8'));
const industry = JSON.parse(readFileSync(`${DIR}/industry_full.json`, 'utf8'));

const SPDR = {
  XLK: ['Technology', 'Information Technology'],
  XLF: ['Financials', 'Financials'],
  XLV: ['Health Care', 'Health Care'],
  XLY: ['Discretionary', 'Consumer Discretionary'],
  XLP: ['Staples', 'Consumer Staples'],
  XLE: ['Energy', 'Energy'],
  XLI: ['Industrials', 'Industrials'],
  XLB: ['Materials', 'Materials'],
  XLC: ['Communications', 'Communication Services'],
  XLRE: ['Real Estate', 'Real Estate'],
};
const INDUSTRY = {
  SMH: 'Semiconductors', XBI: 'Biotech', XRT: 'Retail',
  XHB: 'Homebuilders', IYT: 'Transports', IGV: 'Software',
};

const norm = (s) => s.replace('.', '-');
const universes = {};
for (const [etf, [label, sector]] of Object.entries(SPDR)) {
  universes[etf] = { label, members: gics[sector].map(norm) };
}
for (const [etf, label] of Object.entries(INDUSTRY)) {
  universes[etf] = { label, members: industry[etf].map(norm) };
}

const all = [...new Set(Object.values(universes).flatMap(u => u.members))];
console.log(`Quoting ${all.length} unique symbols...`);

const caps = new Map();
for (let i = 0; i < all.length; i += 150) {
  const chunk = all.slice(i, i + 150);
  const res = await yf.quote(chunk, {}, { validateResult: false });
  for (const r of res || []) {
    if (r?.symbol && r.marketCap != null) caps.set(r.symbol, r.marketCap);
  }
  console.log(`  ${Math.min(i + 150, all.length)}/${all.length} (caps: ${caps.size})`);
  await new Promise(r => setTimeout(r, 1500));
}

const missing = all.filter(s => !caps.has(s));
if (missing.length) console.log('No market cap for:', missing.join(', '));

const date = new Date().toISOString().slice(0, 10);
let out = `// Sector-screener universes: top 30 members by market cap per ETF, plus the
// ETF itself as benchmark. 10 SPDR sectors derived from Wikipedia S&P 500 GICS
// membership; SMH/XBI/XRT/XHB/IYT/IGV from provider holdings files (SSGA XLSX,
// iShares latest-holdings.csv, VanEck via stockanalysis). Ranked by Yahoo
// marketCap on ${date}. Static snapshot — re-run the ranking to refresh.

export const SECTOR_UNIVERSES = {
`;
for (const [etf, u] of Object.entries(universes)) {
  const ranked = u.members
    .filter(s => caps.has(s))
    .sort((a, b) => caps.get(b) - caps.get(a))
    .slice(0, 30);
  out += `  ${etf}: {\n    label: '${u.label}',\n    members: [\n`;
  for (let i = 0; i < ranked.length; i += 10) {
    out += `      ${ranked.slice(i, i + 10).map(s => `'${s}'`).join(', ')},\n`;
  }
  out += `    ],\n  },\n`;
  console.log(etf, u.label, '->', ranked.length, 'members; top5:', ranked.slice(0, 5).join(' '));
}
out += `};\n\nexport const SECTOR_ETFS = Object.keys(SECTOR_UNIVERSES);\n`;
writeFileSync('/Users/bijan/Claude/dashboard/server/sectorUniverses.js', out);
console.log('Wrote server/sectorUniverses.js');
