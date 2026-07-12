// ForexFactory weekly economic calendar via the free faireconomy JSON feed.
// Cached 4h (the feed is a static weekly file; FF throttles frequent fetchers).

const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

const cache = { data: null, fetchedAt: 0, inflight: null };

async function fetchFeed() {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error('Unexpected calendar feed shape');
  return json
    .filter(e => e && e.title && e.date)
    .map(e => ({
      title: String(e.title),
      country: String(e.country || ''),
      date: String(e.date),               // ISO 8601 with offset
      impact: String(e.impact || 'Low'),  // High / Medium / Low / Holiday
      forecast: e.forecast != null ? String(e.forecast) : '',
      previous: e.previous != null ? String(e.previous) : '',
      // The weekly feed currently ships without actuals; pass one through if
      // it ever appears so the UI can show true surprises.
      actual: e.actual != null ? String(e.actual) : '',
    }));
}

export async function getCalendar() {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { fetchedAt: new Date(cache.fetchedAt).toISOString(), stale: false, events: cache.data };
  }
  if (cache.inflight) return cache.inflight;

  cache.inflight = (async () => {
    try {
      const events = await fetchFeed();
      cache.data = events;
      cache.fetchedAt = Date.now();
      return { fetchedAt: new Date(cache.fetchedAt).toISOString(), stale: false, events };
    } catch (err) {
      console.error('Calendar fetch failed:', err.message);
      if (cache.data) {
        return { fetchedAt: new Date(cache.fetchedAt).toISOString(), stale: true, events: cache.data };
      }
      return { fetchedAt: null, stale: true, events: [] };
    } finally {
      cache.inflight = null;
    }
  })();

  return cache.inflight;
}
