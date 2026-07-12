// Watchlist news via yahoo-finance2 search() — the classic Yahoo RSS
// endpoints are dead. One search per symbol, sequential with gaps, cached
// 15min, stale-served on failure. Stories are deduped by uuid/link and keep
// the list of watchlist symbols they surfaced under.

import { yahooFinance, withTimeout } from './yahoo.js';
import { GROUPS } from './symbols.js';

const MARKET_SYMBOLS = ['SPY', 'QQQ', 'TLT', 'GC=F', 'CL=F', 'BTC-USD'];
const NEWS_SYMBOLS = [...new Set([
  ...MARKET_SYMBOLS,
  ...GROUPS.megacaps.map(e => e.s),
])];

const CACHE_TTL_MS = 15 * 60 * 1000;
const GAP_MS = 250;
const MAX_ITEMS = 40;

const cache = { data: null, fetchedAt: 0, inflight: null };

async function fetchAllNews() {
  const byId = new Map();
  for (const symbol of NEWS_SYMBOLS) {
    try {
      const r = await withTimeout(
        yahooFinance.search(symbol, { newsCount: 8, quotesCount: 0 }, { validateResult: false }),
        10000, `news(${symbol})`,
      );
      for (const n of r?.news || []) {
        if (!n?.title || !n?.link) continue;
        const id = n.uuid || n.link;
        const time = n.providerPublishTime instanceof Date
          ? n.providerPublishTime.toISOString()
          : new Date(n.providerPublishTime).toISOString();
        const existing = byId.get(id);
        if (existing) {
          if (!existing.symbols.includes(symbol)) existing.symbols.push(symbol);
        } else {
          byId.set(id, {
            id,
            title: String(n.title),
            publisher: n.publisher ? String(n.publisher) : null,
            link: String(n.link),
            time,
            symbols: [symbol],
          });
        }
      }
    } catch (err) {
      console.error(`News fetch failed for ${symbol}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, GAP_MS));
  }
  return [...byId.values()]
    .filter(n => !Number.isNaN(Date.parse(n.time)))
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, MAX_ITEMS);
}

export async function getNews() {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { fetchedAt: new Date(cache.fetchedAt).toISOString(), stale: false, items: cache.data };
  }
  if (cache.inflight) return cache.inflight;

  cache.inflight = (async () => {
    try {
      const items = await fetchAllNews();
      if (items.length) {
        cache.data = items;
        cache.fetchedAt = Date.now();
      }
      return { fetchedAt: new Date(cache.fetchedAt).toISOString(), stale: false, items: cache.data || [] };
    } catch (err) {
      console.error('News fetch failed:', err.message);
      return { fetchedAt: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null, stale: true, items: cache.data || [] };
    } finally {
      cache.inflight = null;
    }
  })();

  return cache.inflight;
}
