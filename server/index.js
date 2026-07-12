import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllSeries, SERIES } from './fred.js';
import { computeIndicators } from './indicators.js';
import { saveObservations, saveSnapshot, getHistory, getHYHistory, getLatestSnapshot, getObservations } from './db.js';
import { startScheduler } from './scheduler.js';
import { getQuotes } from './yahoo.js';
import { getCalendar } from './calendar.js';
import { getEarnings } from './earnings.js';
import { getFearGreed } from './sentiment.js';
import { getSpxBreadth } from './sp500.js';
import { getCrypto } from './crypto.js';
import { recordMetrics, getHistoryBundle, computeDivergence } from './metrics.js';
import { computeTapeScore } from './tape.js';
import { composeBriefing } from './briefing.js';
import { getOIWalls } from './options.js';
import { getOptionsDashboard, invalidateSymbol } from './optionsdash.js';
import { importIvCsv } from './ivimport.js';
import { getCot } from './cot.js';
import { getEcbCurve } from './ecb.js';
import { getTrending, startTrendingScheduler } from './trending.js';
import { getNews } from './news.js';
import { evaluateAlerts } from './alerts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

const PORT = (() => {
  const p = parseInt(process.env.PORT, 10);
  return Number.isInteger(p) && p >= 1 && p <= 65535 ? p : 3456;
})();

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: isProduction ? undefined : false,
}));

// CORS — restrict to known origins
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3456'];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
}));

// Rate limiting — 600/15min leaves headroom for the intraday tabs polling
// /api/quotes every 45s (20 req/15min per open window) plus tab switches.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Refresh rate limited. Try again in a minute.' },
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// In production, serve Vite build
if (isProduction) {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
}

// Validate and clamp days param
function parseDays(raw) {
  const d = parseInt(raw, 10);
  if (!Number.isInteger(d) || d < 1) return 90;
  return Math.min(d, 1000);
}

let cachedResult = null;

// ---------- ghost yield curves (1m / 1y ago from stored FRED observations) ----------
const CURVE_SERIES = { '2y': 'DGS2', '5y': 'DGS5', '10y': 'DGS10', '20y': 'DGS20', '30y': 'DGS30' };
const curveCache = { data: null, fetchedAt: 0 };

function yieldsAsOf(obsBySeries, targetDate) {
  const out = { date: null };
  for (const [key, seriesId] of Object.entries(CURVE_SERIES)) {
    // observations are date-DESC; take the newest one at or before the target
    const obs = obsBySeries[seriesId].find(o => o.date <= targetDate);
    if (obs) {
      out[key] = obs.value;
      if (!out.date || obs.date > out.date) out.date = obs.date;
    }
  }
  return out.date ? out : null;
}

function getYieldHistory() {
  const now = Date.now();
  if (curveCache.data && now - curveCache.fetchedAt < 6 * 60 * 60 * 1000) return curveCache.data;
  try {
    const obsBySeries = {};
    for (const seriesId of Object.values(CURVE_SERIES)) {
      obsBySeries[seriesId] = getObservations(seriesId, 600);
    }
    const iso = (msAgo) => new Date(now - msAgo).toISOString().slice(0, 10);
    const data = {
      m1: yieldsAsOf(obsBySeries, iso(30 * 86400000)),
      y1: yieldsAsOf(obsBySeries, iso(365 * 86400000)),
    };
    curveCache.data = data;
    curveCache.fetchedAt = now;
    return data;
  } catch (err) {
    console.error('Yield history failed:', err.message);
    return null;
  }
}

export async function fetchAndStore() {
  console.log('Fetching all FRED series...');
  const allData = await fetchAllSeries(120);

  // Save raw observations
  for (const [key, { seriesId, observations }] of Object.entries(allData)) {
    if (observations.length > 0) {
      saveObservations(seriesId, observations);
    }
  }

  // Compute indicators
  const result = computeIndicators(allData);
  cachedResult = result;

  // Save daily snapshot
  const snapshot = {
    date: result.asOf,
    ...result.raw,
    ...result.scores,
    composite_score: result.composite,
    regime: result.regime,
    signal_active: result.signalActive ? 1 : 0,
  };
  saveSnapshot(snapshot);

  console.log(`Data saved for ${result.asOf} — Composite: ${result.composite} (${result.regime})`);
  return result;
}

// API Routes
app.get('/api/current', async (req, res) => {
  try {
    if (!cachedResult) {
      const dbSnapshot = getLatestSnapshot();
      if (dbSnapshot) {
        res.json({
          asOf: dbSnapshot.date,
          indicators: {
            hy_oas: { value: dbSnapshot.hy_oas, score: dbSnapshot.score_hy_oas, weight: 0.25 },
            ccc_bb: { value: dbSnapshot.ccc_bb, score: dbSnapshot.score_ccc_bb, weight: 0.15 },
            cp_spread: { value: dbSnapshot.cp_spread, score: dbSnapshot.score_cp_spread, weight: 0.15 },
            vix: { value: dbSnapshot.vix, score: dbSnapshot.score_vix, weight: 0.15 },
            sofr_ff: { value: dbSnapshot.sofr_ff, score: dbSnapshot.score_sofr_ff, weight: 0.10 },
            tsy_vol: { value: dbSnapshot.tsy_vol, score: dbSnapshot.score_tsy_vol, weight: 0.10 },
            hy_momentum: { value: dbSnapshot.hy_momentum, score: dbSnapshot.score_hy_momentum, weight: 0.10 },
          },
          composite: dbSnapshot.composite_score,
          regime: dbSnapshot.regime,
          signalActive: dbSnapshot.signal_active === 1,
          yields: {
            '2y': dbSnapshot.dgs2, '5y': dbSnapshot.dgs5, '10y': dbSnapshot.dgs10,
            '20y': dbSnapshot.dgs20, '30y': dbSnapshot.dgs30,
          },
          context: { fedFunds: dbSnapshot.fed_funds, sofr: dbSnapshot.sofr },
          yieldHistory: getYieldHistory(),
        });
        return;
      }
      cachedResult = await fetchAndStore();
    }
    res.json({ ...cachedResult, yieldHistory: getYieldHistory() });
  } catch (err) {
    console.error('Error in /api/current:', err);
    res.status(500).json({ error: 'Failed to load current data.' });
  }
});

app.get('/api/history', (req, res) => {
  const days = parseDays(req.query.days);
  const history = getHistory(days);
  res.json({
    history: history.map(h => ({
      date: h.date,
      composite: h.composite_score,
      regime: h.regime,
      signalActive: h.signal_active === 1,
    })),
  });
});

app.get('/api/hy-history', (req, res) => {
  const days = parseDays(req.query.days);
  res.json({ history: getHYHistory(days) });
});

app.get('/api/quotes', async (req, res) => {
  try {
    const [quotes, fearGreed, spxBreadth, calendar] = await Promise.all([
      getQuotes(), getFearGreed(), getSpxBreadth(),
      getCalendar().catch(() => null),
    ]);
    recordMetrics(quotes, spxBreadth);
    const creditSnapshot = cachedResult
      ? { composite: cachedResult.composite }
      : (() => { const s = getLatestSnapshot(); return s ? { composite: s.composite_score } : null; })();
    const tape = computeTapeScore({
      quotes, spxBreadth, fearGreed,
      creditComposite: creditSnapshot?.composite ?? null,
    });
    const divergence = computeDivergence(quotes, spxBreadth);
    const alerts = evaluateAlerts({
      quotes, tape, divergence, calendar,
      credit: creditSnapshot,
      creditIndicators: cachedResult?.indicators ?? null,
    });
    res.json({
      ...quotes,
      fearGreed,
      spxBreadth,
      tape,
      alerts,
      history: getHistoryBundle(30),
      divergence,
    });
  } catch (err) {
    console.error('Error in /api/quotes:', err);
    res.status(502).json({ error: 'Failed to load quotes.' });
  }
});

app.get('/api/news', async (req, res) => {
  try {
    res.json(await getNews());
  } catch (err) {
    console.error('Error in /api/news:', err);
    res.status(502).json({ error: 'Failed to load news.' });
  }
});

app.get('/api/briefing', async (req, res) => {
  try {
    const [quotes, fearGreed, spxBreadth, calendar, earnings] = await Promise.all([
      getQuotes(), getFearGreed(), getSpxBreadth(), getCalendar(), getEarnings(),
    ]);
    let crypto = null;
    try { crypto = await getCrypto(); } catch {}
    const snapshot = cachedResult || getLatestSnapshot();
    const credit = snapshot
      ? {
          composite: snapshot.composite ?? snapshot.composite_score,
          regime: snapshot.regime,
          signalActive: snapshot.signalActive ?? snapshot.signal_active === 1,
        }
      : null;
    const tape = computeTapeScore({
      quotes, spxBreadth, fearGreed, creditComposite: credit?.composite ?? null,
    });
    res.json(composeBriefing({
      quotes, spxBreadth, fearGreed, calendar, earnings, crypto, tape,
      divergence: computeDivergence(quotes, spxBreadth), credit,
    }));
  } catch (err) {
    console.error('Error in /api/briefing:', err);
    res.status(502).json({ error: 'Failed to compose briefing.' });
  }
});

app.get('/api/options', async (req, res) => {
  try {
    res.json({ walls: (await getOIWalls()) || [] });
  } catch (err) {
    console.error('Error in /api/options:', err);
    res.status(502).json({ error: 'Failed to load options data.' });
  }
});

app.get('/api/options-dash', async (req, res) => {
  try {
    res.json(await getOptionsDashboard(req.query.symbol));
  } catch (err) {
    console.error('Error in /api/options-dash:', err.message);
    res.status(404).json({ error: err.message || 'Failed to load options data.' });
  }
});

// IV history CSV import (MarketChameleon export) — backfills iv30_{SYMBOL}
app.post('/api/iv-import', express.text({ limit: '5mb', type: '*/*' }), (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').toUpperCase().trim();
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) {
      return res.status(400).json({ error: 'Invalid symbol' });
    }
    const result = importIvCsv(symbol, req.body);
    invalidateSymbol(symbol);
    res.json(result);
  } catch (err) {
    console.error('Error in /api/iv-import:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/cot', async (req, res) => {
  try {
    res.json(await getCot());
  } catch (err) {
    console.error('Error in /api/cot:', err);
    res.status(502).json({ error: 'Failed to load COT data.' });
  }
});

app.get('/api/ecb-curve', async (req, res) => {
  try {
    res.json((await getEcbCurve()) || { asOf: null, yields: {} });
  } catch (err) {
    console.error('Error in /api/ecb-curve:', err);
    res.status(502).json({ error: 'Failed to load ECB curve.' });
  }
});

app.get('/api/trending', async (req, res) => {
  try {
    res.json(await getTrending(req.query.refresh === '1'));
  } catch (err) {
    console.error('Error in /api/trending:', err);
    res.status(502).json({ error: 'Failed to load trending setups.' });
  }
});

app.get('/api/calendar', async (req, res) => {
  try {
    res.json(await getCalendar());
  } catch (err) {
    console.error('Error in /api/calendar:', err);
    res.status(502).json({ error: 'Failed to load calendar.' });
  }
});

app.get('/api/crypto', async (req, res) => {
  try {
    res.json(await getCrypto());
  } catch (err) {
    console.error('Error in /api/crypto:', err);
    res.status(502).json({ error: 'Failed to load crypto data.' });
  }
});

app.get('/api/earnings', async (req, res) => {
  try {
    res.json(await getEarnings());
  } catch (err) {
    console.error('Error in /api/earnings:', err);
    res.status(502).json({ error: 'Failed to load earnings.' });
  }
});

app.get('/api/refresh', refreshLimiter, async (req, res) => {
  try {
    const result = await fetchAndStore();
    res.json(result);
  } catch (err) {
    console.error('Error in /api/refresh:', err);
    res.status(500).json({ error: 'Refresh failed. Try again later.' });
  }
});

// SPA fallback for production
if (isProduction) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${isProduction ? 'production' : 'development'})`);
  startScheduler(fetchAndStore);
  startTrendingScheduler();
});
