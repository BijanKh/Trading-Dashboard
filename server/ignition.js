// Ignition-equilibrium scanner (Bijan's "ideal trade" template, locked 2026-10-22
// from the ZEC trade of 18–21 Oct 2026). The detection logic lives in the
// tradingcoach repo as a Python script (scanner/ignition_scanner.py, spec in
// optionsneutral/ideal_trade_zec_2026-10-20.md); this module runs it as a child
// process, persists its JSON output under data/ and serves it to the Setups tab.
//
// Two universes, scanned separately:
//   crypto — CoinGecko top 100 by market cap, 4h bars (1h resampled), every 4h
//   stock  — S&P 500 + Nasdaq-100, 1h bars, every 2h during the US session
// The scanner's daily gate (steps A–C) is cached on disk by the script itself
// (--daily-cache, 20h TTL) so the intraday refreshes only refetch 1h bars for
// the handful of names that passed the daily gate — the Yahoo load per refresh
// is a few dozen chart calls, not the whole universe.
//
// GET /api/ignition            -> { crypto: {...}, stock: {...} }
// GET /api/ignition?refresh=1  -> kicks off both scans (no-op while running)
// GET /api/ignition?refresh=1&asset=crypto
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const SCANNER_DIR = process.env.IGNITION_SCANNER_DIR
  || path.join(process.env.HOME || '/Users/bijan', 'Claude', 'tradingcoach', 'scanner');
const SCRIPT = path.join(SCANNER_DIR, 'ignition_scanner.py');
const PYTHON = process.env.IGNITION_PYTHON || 'python3';
const ASSETS = ['crypto', 'stock'];
const SCAN_TIMEOUT_MS = 25 * 60 * 1000;

const state = Object.fromEntries(ASSETS.map(a => [a, {
  status: 'idle',          // idle | running | ok | error
  startedAt: null,
  finishedAt: null,
  error: null,
  log: [],
  data: null,              // the scanner's JSON cache (generated_at, candidates, ...)
}]));

function outPath(asset) { return path.join(DATA_DIR, `ignition_${asset}.json`); }
function dailyCachePath(asset) { return path.join(DATA_DIR, `ignition_daily_${asset}.json`); }

function loadDisk(asset) {
  try {
    const raw = fs.readFileSync(outPath(asset), 'utf8');
    state[asset].data = JSON.parse(raw);
    state[asset].status = 'ok';
    state[asset].finishedAt = state[asset].data.generated_at || null;
  } catch { /* no cache yet */ }
}
ASSETS.forEach(loadDisk);

function runScan(asset) {
  const s = state[asset];
  if (s.status === 'running') return Promise.resolve(false);
  if (!fs.existsSync(SCRIPT)) {
    s.status = 'error'; s.error = `scanner not found: ${SCRIPT}`;
    return Promise.resolve(false);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  s.status = 'running'; s.startedAt = new Date().toISOString(); s.error = null; s.log = [];
  const args = [
    SCRIPT, '--asset', asset, '--min-step', 'D', '--top', '60',
    '--out', outPath(asset), '--daily-cache', dailyCachePath(asset),
  ];
  if (asset === 'stock') args.push('--universe', 'sp500ndx');
  console.log(`[ignition] ${asset} scan starting`);
  return new Promise(resolve => {
    const child = spawn(PYTHON, args, { cwd: SCANNER_DIR, env: { ...process.env, PYTHONWARNINGS: 'ignore' } });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, SCAN_TIMEOUT_MS);
    const onLine = chunk => {
      for (const line of String(chunk).split('\n')) {
        const t = line.trim();
        if (!t) continue;
        s.log.push(t); if (s.log.length > 40) s.log.shift();
      }
    };
    child.stdout.on('data', onLine);
    child.stderr.on('data', onLine);
    child.on('error', err => {
      clearTimeout(timer);
      s.status = 'error'; s.error = err.message; s.finishedAt = new Date().toISOString();
      console.error(`[ignition] ${asset} spawn failed:`, err.message);
      resolve(false);
    });
    child.on('close', code => {
      clearTimeout(timer);
      s.finishedAt = new Date().toISOString();
      if (code === 0) {
        loadDisk(asset);
        s.status = s.data ? 'ok' : 'error';
        if (!s.data) s.error = 'scan finished but wrote no output';
        console.log(`[ignition] ${asset} scan done: ${s.data?.count ?? 0} names at step >= D`);
      } else {
        s.status = s.data ? 'ok' : 'error';     // keep serving the last good result
        s.error = `scanner exited ${code}: ${s.log.slice(-3).join(' | ')}`;
        console.error(`[ignition] ${asset} scan failed:`, s.error);
      }
      resolve(code === 0);
    });
  });
}

function view(asset) {
  const s = state[asset];
  const d = s.data || {};
  return {
    asset,
    status: s.status,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    scannedAt: d.generated_at || null,
    error: s.error,
    logTail: s.status === 'running' ? s.log.slice(-3) : [],
    universeSize: d.universe_size ?? null,
    scanned: d.scanned ?? null,
    passedDaily: d.passed_daily ?? null,
    leaderCut: d.leader_cut ?? null,
    params: d.params ?? null,
    candidates: d.candidates || [],
  };
}

export async function getIgnition({ refresh = false, asset = null } = {}) {
  const targets = asset && ASSETS.includes(asset) ? [asset] : ASSETS;
  if (refresh) targets.forEach(a => { runScan(a); });        // fire and forget
  else targets.forEach(a => {                                 // lazy first scan
    if (state[a].status === 'idle' && !state[a].data) runScan(a);
  });
  return Object.fromEntries(ASSETS.map(a => [a, view(a)]));
}

export function startIgnitionScheduler() {
  // crypto trades around the clock: every 4h on the 4h-bar boundary (+10 min for the bar to close)
  cron.schedule('10 */4 * * *', () => { runScan('crypto'); }, { timezone: 'UTC' });
  // stocks: every 2h through the US session plus one post-close pass
  cron.schedule('40 9,11,13,15,16 * * 1-5', () => { runScan('stock'); }, { timezone: 'America/New_York' });
  console.log('Ignition scheduler started: crypto every 4h (UTC), stocks 09:40/11:40/13:40/15:40/16:40 ET Mon-Fri');
}
