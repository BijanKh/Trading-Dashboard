// Parsing helpers for economic-calendar values like "3.4%", "225K", "-0.2%",
// "58.6", "1.2M". Suffixes are assumed consistent within one event's fields
// (ForexFactory formats forecast/previous/actual identically).

export function parseEconValue(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(-?\d+(?:\.\d+)?)\s*([%KMBT])?$/i);
  return m ? parseFloat(m[1]) : null;
}

// Direction consensus expects vs the previous print: 1 up, -1 down, 0 flat,
// null when either side is missing/non-numeric.
export function expectationDir(forecast, previous) {
  const f = parseEconValue(forecast);
  const p = parseEconValue(previous);
  if (f == null || p == null) return null;
  return f > p ? 1 : f < p ? -1 : 0;
}

// Signed surprise of an actual print vs forecast, in the value's own units.
export function surpriseVsForecast(actual, forecast) {
  const a = parseEconValue(actual);
  const f = parseEconValue(forecast);
  if (a == null || f == null) return null;
  return a - f;
}
