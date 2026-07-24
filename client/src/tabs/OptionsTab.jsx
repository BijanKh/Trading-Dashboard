import React, { useState, useCallback, useRef } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { colors, fonts } from '../styles/theme';
import { fmtOptionsDash, importIvHistory } from '../lib/api';

const QUICK = ['SPY', 'QQQ', 'IWM', 'NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'META', 'SPCX'];

function Tile({ label, value, sub, color }) {
  return (
    <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 10, padding: '10px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.sans, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: color || colors.text.primary, fontFamily: fonts.mono, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function DarkTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0f1729', border: `1px solid ${colors.bg.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 11, fontFamily: fonts.mono }}>
      <div style={{ color: colors.text.muted, marginBottom: 3 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color || colors.text.primary }}>
          {p.name}: {fmt ? fmt(p.value) : p.value?.toLocaleString?.() ?? p.value}
        </div>
      ))}
    </div>
  );
}

const pf = (v) => v != null ? `${(v * 100).toFixed(1)}%` : '--';

export default function OptionsTab() {
  const [input, setInput] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [importMsg, setImportMsg] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async (symbol) => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const d = await fmtOptionsDash(symbol);
      setData(d);
      setExpiryIdx(0);
      setInput(symbol.toUpperCase());
    } catch (err) {
      setError(err.message.includes('404') ? `No options data for "${symbol.toUpperCase()}"` : err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !data?.symbol) return;
    setImportMsg('Importing…');
    try {
      const text = await file.text();
      const r = await importIvHistory(data.symbol, text);
      setImportMsg(`Imported ${r.imported} days (${r.from} → ${r.to}, column "${r.ivColumn}")${r.skipped ? `, ${r.skipped} rows skipped` : ''}. Reloading…`);
      await load(data.symbol);
      setImportMsg(`✓ ${r.imported} days of IV history imported for ${r.symbol}`);
    } catch (err) {
      setImportMsg(`Import failed: ${err.message}`);
    }
  }

  const exp = data?.expiries?.[expiryIdx];
  const strikes = exp?.strikes || [];
  const gexData = (data?.gamma?.profile || []).map(p => ({ strike: p.strike, gex: p.gex / 1e6 }));
  const nearDays = (n) => (data?.expiries || []).reduce((b, e) => !b || Math.abs(e.days - n) < Math.abs(b.days - n) ? e : b, null);
  const em3 = nearDays(90), em6 = nearDays(180);
  const longDated = (data?.expiries || []).filter(e => e.days >= 45);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Ticker input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <form onSubmit={e => { e.preventDefault(); load(input); }} style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            placeholder="Ticker (e.g. NVDA)"
            style={{
              background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 8,
              color: colors.text.primary, fontFamily: fonts.mono, fontSize: 13, padding: '8px 12px', width: 160, outline: 'none',
            }}
          />
          <button type="submit" disabled={loading} style={{
            background: colors.bg.cardHover, border: `1px solid ${colors.bg.border}`, borderRadius: 8,
            color: colors.text.accent, fontFamily: fonts.mono, fontSize: 12, padding: '8px 16px', cursor: 'pointer',
          }}>
            {loading ? 'Loading…' : 'Analyze'}
          </button>
        </form>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {QUICK.map(s => (
            <button key={s} onClick={() => load(s)} style={{
              background: data?.symbol === s ? colors.bg.cardHover : 'transparent',
              border: `1px solid ${colors.bg.border}`, borderRadius: 999,
              color: data?.symbol === s ? colors.text.accent : colors.text.muted,
              fontFamily: fonts.mono, fontSize: 11, padding: '4px 10px', cursor: 'pointer',
            }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ color: colors.regime.CRISIS, fontFamily: fonts.mono, fontSize: 12 }}>{error}</div>}

      {!data && !error && (
        <div style={{ color: colors.text.muted, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>
          Enter a ticker to analyze its options: IV, expected moves, max pain, OI walls, skew, flow and dealer gamma.
        </div>
      )}

      {data && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 12, color: colors.text.secondary, fontFamily: fonts.mono }}>
              {data.name} · spot <span style={{ color: colors.text.primary }}>{data.spot?.toFixed(2)}</span> · as of {new Date(data.asOf).toLocaleTimeString()} (15-min delayed)
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              {importMsg && <span style={{ fontSize: 11, color: importMsg.startsWith('Import failed') ? colors.regime.CRISIS : colors.text.muted, fontFamily: fonts.mono }}>{importMsg}</span>}
              <button onClick={() => fileRef.current?.click()} style={{
                background: 'transparent', border: `1px solid ${colors.bg.border}`, borderRadius: 6,
                color: colors.text.secondary, fontFamily: fonts.mono, fontSize: 10, padding: '4px 10px', cursor: 'pointer',
              }}>
                Import IV history CSV ({data.symbol})
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display: 'none' }} />
            </div>
          </div>

          {/* Summary tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            <Tile label="IV30" value={pf(data.iv30)}
              sub={data.ivRank != null ? `IV rank ${(data.ivRank * 100).toFixed(0)}% (${data.ivRankDays}d)` : `rank builds (${data.ivRankDays}/10d)`} />
            <Tile label="IV90 / IV180" value={`${pf(data.iv90)} / ${pf(data.iv180)}`}
              sub={data.iv90Rank != null ? `IV90 rank ${(data.iv90Rank * 100).toFixed(0)}% (${data.iv90RankDays}d)` : `rank builds (${data.iv90RankDays ?? 0}/10d)`} />
            <Tile label="TERM SLOPE (IV90−IV30)" value={data.termSlope != null ? `${data.termSlope > 0 ? '+' : ''}${(data.termSlope * 100).toFixed(1)}pp` : '--'}
              sub={data.termSlope != null ? (data.termSlope < -0.01 ? 'inverted — long-dated cheap vs front' : data.termSlope > 0.03 ? 'steep — long-dated carries premium' : 'normal contango') : ''}
              color={data.termSlope != null && data.termSlope < -0.01 ? colors.regime.CALM : undefined} />
            <Tile
              label={`IV RANGE (${data.ivRankDays}d tracked)`}
              value={data.ivLow != null && data.ivHigh != null ? `${pf(data.ivLow)} – ${pf(data.ivHigh)}` : '--'}
              sub={data.pctFromHigh != null && data.pctFromLow != null
                ? `${(data.pctFromHigh * 100).toFixed(0)}% vs high · +${(data.pctFromLow * 100).toFixed(0)}% vs low`
                : 'accumulates daily'}
              color={data.pctFromHigh != null && data.pctFromHigh > -0.05 && data.ivRankDays >= 10 ? colors.regime.ELEVATED : undefined}
            />
            <Tile label="REALIZED VOL 20d" value={pf(data.rv20)}
              sub={data.vrp != null ? `VRP ${data.vrp > 0 ? '+' : ''}${(data.vrp * 100).toFixed(1)}pp ${data.vrp > 0.05 ? '— options rich' : data.vrp < -0.02 ? '— options cheap' : ''}` : ''} />
            <Tile label="VRP 3M / 6M" value={`${data.vrp90 != null ? `${data.vrp90 > 0 ? '+' : ''}${(data.vrp90 * 100).toFixed(1)}` : '--'} / ${data.vrp180 != null ? `${data.vrp180 > 0 ? '+' : ''}${(data.vrp180 * 100).toFixed(1)}` : '--'}pp`}
              sub={`IV90 vs RV63 · IV180 vs RV126${data.vrp90 != null && data.vrp90 < -0.02 ? ' — 3M options cheap' : data.vrp90 != null && data.vrp90 > 0.05 ? ' — 3M options rich' : ''}`}
              color={data.vrp90 != null && data.vrp90 < -0.02 ? colors.regime.CALM : undefined} />
            <Tile label={`EXPECTED MOVE ${data.expiries?.[0]?.expiry?.slice(5) || ''}`} value={data.expiries?.[0]?.expectedMovePct != null ? `±${pf(data.expiries[0].expectedMovePct)}` : '--'}
              sub={[
                em3?.expectedMovePct != null && em3.days >= 45 ? `±${pf(em3.expectedMovePct)} by ${em3.expiry.slice(5)}` : null,
                em6?.expectedMovePct != null && em6 !== em3 && em6.days >= 120 ? `±${pf(em6.expectedMovePct)} by ${em6.expiry.slice(5)}` : null,
              ].filter(Boolean).join(' · ')} />
            <Tile label="MAX PAIN (nearest)" value={exp?.maxPain ?? '--'}
              sub={data.spot && exp?.maxPain ? `${((exp.maxPain / data.spot - 1) * 100).toFixed(1)}% from spot` : ''} />
            <Tile label="PUT WALL / CALL WALL" value={`${exp?.putWall?.strike ?? '--'} / ${exp?.callWall?.strike ?? '--'}`}
              sub={`P/C OI ${exp?.pcOIRatio?.toFixed(2) ?? '--'} · vol ${exp?.pcVolRatio?.toFixed(2) ?? '--'}`} />
            <Tile label="SKEW (25Δ approx)" value={data.skew?.spread != null ? `${(data.skew.spread * 100).toFixed(1)}pp` : '--'}
              sub={[
                data.skew?.spread != null ? (data.skew.spread > 0.06 ? 'downside fear expensive' : data.skew.spread < 0.01 ? 'flat — complacent' : 'normal') : null,
                data.skew90?.spread != null ? `90d: ${(data.skew90.spread * 100).toFixed(1)}pp` : null,
              ].filter(Boolean).join(' · ')}
              color={data.skew?.spread > 0.06 ? colors.regime.STRESS : undefined} />
            <Tile label="HEDGE COST (5% OTM put)" value={pf(data.hedgeCostPct)} sub={data.hedgeStrike ? `strike ${data.hedgeStrike} · ${data.skew?.expiry?.slice(5)}` : ''} />
            <Tile label="NET GEX (est)" value={data.gamma?.totalGex != null ? `${(data.gamma.totalGex / 1e9).toFixed(2)}B` : '--'}
              sub={data.gamma?.flipLevel != null ? `flip ~${data.gamma.flipLevel}` : ''}
              color={data.gamma?.totalGex < 0 ? colors.regime.STRESS : undefined} />
          </div>

          {/* Term structure + gamma profile */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
            <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 10 }}>
                IV TERM STRUCTURE (a kink = event premium, e.g. earnings)
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={(data.termStructure || []).filter(t => t.atmIV != null)} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.chart.grid} />
                  <XAxis dataKey="days" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 10, fill: colors.chart.axis, fontFamily: fonts.mono }} unit="d" />
                  <YAxis tick={{ fontSize: 10, fill: colors.chart.axis, fontFamily: fonts.mono }} tickFormatter={v => `${(v * 100).toFixed(0)}%`} width={44} domain={['auto', 'auto']} />
                  <Tooltip content={<DarkTooltip fmt={v => pf(v)} />} />
                  <Line type="monotone" dataKey="atmIV" name="ATM IV" stroke="#FBBF24" strokeWidth={2} dot={{ fill: '#FBBF24', r: 3.5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 10 }}>
                DEALER GAMMA BY STRIKE (estimate, $M per 1% move)
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={gexData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.chart.grid} />
                  <XAxis dataKey="strike" tick={{ fontSize: 9, fill: colors.chart.axis, fontFamily: fonts.mono }} />
                  <YAxis tick={{ fontSize: 10, fill: colors.chart.axis, fontFamily: fonts.mono }} width={48} tickFormatter={v => `${v.toFixed(0)}M`} />
                  <Tooltip content={<DarkTooltip fmt={v => `${v.toFixed(1)}M`} />} />
                  <ReferenceLine x={data.spot} stroke={colors.text.accent} strokeDasharray="4 4" label={{ value: 'spot', fontSize: 9, fill: colors.text.accent }} />
                  {data.gamma?.flipLevel != null && (
                    <ReferenceLine x={data.gamma.flipLevel} stroke={colors.regime.STRESS} strokeDasharray="4 4" label={{ value: 'flip', fontSize: 9, fill: colors.regime.STRESS }} />
                  )}
                  <Bar dataKey="gex" name="net GEX">
                    {gexData.map((d, i) => (
                      <Cell key={i} fill={d.gex >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Long-dated buyer table (3-6 month horizon) */}
          {longDated.length > 0 && (
            <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 4 }}>
                LONG-DATED BUYER VIEW (45d+)
              </div>
              <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.sans, marginBottom: 8 }}>
                ATM mid prices and breakeven moves for buying 3–6 month options — compare premium vs the expected move
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: fonts.mono }}>
                  <thead>
                    <tr style={{ color: colors.text.muted, fontSize: 10, textAlign: 'right' }}>
                      <th style={{ textAlign: 'left', padding: '3px 8px 3px 0' }}>EXPIRY</th>
                      <th style={{ padding: '3px 8px' }}>ATM IV</th>
                      <th style={{ padding: '3px 8px' }}>EXP MOVE</th>
                      <th style={{ padding: '3px 8px' }}>ATM K</th>
                      <th style={{ padding: '3px 8px' }}>CALL MID</th>
                      <th style={{ padding: '3px 8px' }}>CALL BE</th>
                      <th style={{ padding: '3px 8px' }}>PUT MID</th>
                      <th style={{ padding: '3px 8px' }}>PUT BE</th>
                      <th style={{ padding: '3px 0 3px 8px' }}>MAX PAIN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {longDated.map((e) => (
                      <tr key={e.expiry} style={{ borderTop: `1px solid ${colors.bg.border}` }}>
                        <td style={{ color: colors.text.primary, padding: '4px 8px 4px 0' }}>{e.expiry} <span style={{ color: colors.text.muted }}>({e.days}d)</span></td>
                        <td style={{ color: colors.text.primary, padding: '4px 8px', textAlign: 'right' }}>{pf(e.atmIV)}</td>
                        <td style={{ color: colors.text.secondary, padding: '4px 8px', textAlign: 'right' }}>{e.expectedMovePct != null ? `±${pf(e.expectedMovePct)}` : '--'}</td>
                        <td style={{ color: colors.text.secondary, padding: '4px 8px', textAlign: 'right' }}>{e.atmStrike ?? '--'}</td>
                        <td style={{ color: colors.updown.up, padding: '4px 8px', textAlign: 'right' }}>
                          {e.atmCallMid != null ? `${e.atmCallMid.toFixed(2)} (${pf(e.atmCallMid / data.spot)})` : '--'}
                        </td>
                        <td style={{ color: colors.text.secondary, padding: '4px 8px', textAlign: 'right' }}>{e.callBEPct != null ? `+${(e.callBEPct * 100).toFixed(1)}%` : '--'}</td>
                        <td style={{ color: colors.updown.down, padding: '4px 8px', textAlign: 'right' }}>
                          {e.atmPutMid != null ? `${e.atmPutMid.toFixed(2)} (${pf(e.atmPutMid / data.spot)})` : '--'}
                        </td>
                        <td style={{ color: colors.text.secondary, padding: '4px 8px', textAlign: 'right' }}>{e.putBEPct != null ? `${(e.putBEPct * 100).toFixed(1)}%` : '--'}</td>
                        <td style={{ color: colors.text.muted, padding: '4px 0 4px 8px', textAlign: 'right' }}>{e.maxPain ?? '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* OI by strike with expiry selector */}
          <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>
                OPEN INTEREST BY STRIKE
              </span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(data.expiries || []).map((e, i) => (
                  <button key={e.expiry} onClick={() => setExpiryIdx(i)} style={{
                    background: i === expiryIdx ? colors.bg.cardHover : 'transparent',
                    border: `1px solid ${colors.bg.border}`, borderRadius: 6,
                    color: i === expiryIdx ? colors.text.accent : colors.text.muted,
                    fontFamily: fonts.mono, fontSize: 10, padding: '4px 8px', cursor: 'pointer',
                  }}>
                    {e.expiry.slice(5)} ({e.days}d)
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={strikes} margin={{ top: 5, right: 16, bottom: 5, left: 0 }} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" stroke={colors.chart.grid} />
                <XAxis dataKey="strike" tick={{ fontSize: 9, fill: colors.chart.axis, fontFamily: fonts.mono }} />
                <YAxis tick={{ fontSize: 10, fill: colors.chart.axis, fontFamily: fonts.mono }} width={54} tickFormatter={v => Math.abs(v).toLocaleString()} />
                <Tooltip content={<DarkTooltip fmt={v => Math.abs(v).toLocaleString()} />} />
                <ReferenceLine x={data.spot} stroke={colors.text.accent} strokeDasharray="4 4" label={{ value: 'spot', fontSize: 9, fill: colors.text.accent }} />
                {exp?.maxPain != null && (
                  <ReferenceLine x={exp.maxPain} stroke="#FBBF24" strokeDasharray="4 4" label={{ value: 'max pain', fontSize: 9, fill: '#FBBF24' }} />
                )}
                <ReferenceLine y={0} stroke={colors.text.muted} />
                <Bar dataKey="callOI" name="call OI" stackId="oi" fill="rgba(16,185,129,0.7)" />
                <Bar dataKey={(d) => -d.putOI} name="put OI" stackId="oi" fill="rgba(239,68,68,0.7)" />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono }}>
              calls up (green) · puts down (red) · strikes within ±20% of spot
            </div>
          </div>

          {/* Unusual activity */}
          {data.unusual?.length > 0 && (
            <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 4 }}>
                UNUSUAL ACTIVITY (volume ≥ 3× open interest)
              </div>
              <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.sans, marginBottom: 8 }}>
                High volume against low standing OI = fresh positioning today
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: fonts.mono }}>
                <tbody>
                  {data.unusual.map((u, i) => (
                    <tr key={i}>
                      <td style={{ color: u.side === 'C' ? colors.updown.up : colors.updown.down, padding: '3px 8px 3px 0', width: 40, fontWeight: 700 }}>
                        {u.side === 'C' ? 'CALL' : 'PUT'}
                      </td>
                      <td style={{ color: colors.text.primary, padding: '3px 8px' }}>{u.strike}</td>
                      <td style={{ color: colors.text.secondary, padding: '3px 8px' }}>{u.expiry}</td>
                      <td style={{ color: colors.text.primary, padding: '3px 8px', textAlign: 'right' }}>vol {u.volume.toLocaleString()}</td>
                      <td style={{ color: colors.text.muted, padding: '3px 8px', textAlign: 'right' }}>OI {u.openInterest.toLocaleString()}</td>
                      <td style={{ color: colors.text.muted, padding: '3px 0 3px 8px', textAlign: 'right' }}>{u.iv != null ? `IV ${pf(u.iv)}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono, lineHeight: 1.6 }}>
            Yahoo delayed chains (~15 min); IVs approximate. GEX uses Black-Scholes gamma with the standard dealer assumption (long calls / short puts) — treat flip level as an estimate.
            Server caches each symbol for 10 minutes. IV rank builds from daily IV30/IV90 records and becomes meaningful after ~2 weeks per symbol.
            Fetched chains: the first 4 expirations plus those closest to 60/90/135/180 days — IV90/IV180, term slope, 3M/6M VRP and the long-dated table cover the 3–6 month buying horizon.
            Breakevens are at-expiry moves for long ATM options; long-dated mids on thin names can be wide — check the real bid/ask before trading.
          </div>
        </>
      )}
    </div>
  );
}
