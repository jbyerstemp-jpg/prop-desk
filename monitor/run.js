// Prop Desk monitor: runs the app's own model (js/core.js) on GitHub every ~15 min and sends ntfy alerts
// only when something changes. Read-only: public Kraken data in, phone notification out. No orders.
'use strict';
const fs = require('fs'), path = require('path');
const C = require('../js/core.js');
const DIR = __dirname;
const WATCH = path.join(DIR, 'watch.json'), STATE = path.join(DIR, 'state.json');
const COOLDOWN = 2 * 3600e3, IV = [15, 60, 240, 1440];

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const krPair = s => s.replace('BTC', 'XBT').replace('/', '');
const pf = s => 'PF_' + s.replace('BTC', 'XBT').replace('/', '');

async function getJson(url) { const r = await fetch(url, { headers: { 'User-Agent': 'prop-desk-monitor' } }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }
async function candles(sym, iv) {
  const j = await getJson(`https://api.kraken.com/0/public/OHLC?pair=${krPair(sym)}&interval=${iv}`);
  if (j.error && j.error.length) throw new Error(j.error.join(','));
  const k = Object.keys(j.result).find(x => x !== 'last');
  return j.result[k].map(x => ({ time: +x[0], open: +x[1], high: +x[2], low: +x[3], close: +x[4], vwap: +x[5], volume: +x[6] }));
}

/* Pure decision step (tested): given market data, the watch file and the previous state, return alerts to send and the new state. */
function evaluate(watch, market, prev, now) {
  const state = { active: {}, sent: Object.assign({}, (prev && prev.sent) || {}), lastSummary: prev && prev.lastSummary };
  const fired = [];
  const fire = (key, level, title, body, prio) => {
    state.active[key] = level;
    const was = prev && prev.active && prev.active[key];
    const last = state.sent[key];
    const escalated = was != null && level > was;
    if ((was == null || escalated) && (!last || now - last.t >= COOLDOWN || escalated)) { fired.push({ key, title, body, prio: prio || 3 }); state.sent[key] = { t: now, level }; }
  };
  const positions = (watch.positions || []).filter(p => !p.closed);
  const syms = [...new Set(((watch.symbols || ['BTC/USD'])).concat(positions.map(p => p.sym)))];
  const prices = {};
  for (const s of syms) { const m = market[s]; if (m && m.price) prices[s] = m.price; }
  const stale = market._ageSec != null && market._ageSec > 600;
  const data = {};
  for (const s of syms) {
    const m = market[s]; if (!m) continue;
    const st = {}, fv = {}, at = {};
    for (const iv of IV) if (m.c[iv] && m.c[iv].length > 10) st[iv] = C.structure(m.c[iv]);
    for (const iv of [15, 60]) if (m.c[iv] && m.c[iv].length > 20) fv[iv] = C.liveFvgs(m.c[iv], 6);
    for (const iv of [15, 60]) if (m.c[iv] && m.c[iv].length > 15) at[iv] = C.atr(m.c[iv].slice(0, -1), 14);
    data[s] = { sym: s, struct: st, fvg: fv, atr: at, price: prices[s], ageSec: 0, levels: C.keyLevels(m.c[1440], m.c[15], { tz: 'America/New_York' }) };
  }
  const watchAgeH = watch.updated ? (now - watch.updated) / 3600e3 : null;
  for (const a of (watch.accounts || []).filter(a => a.phase === 'eval' || a.phase === 'funded')) {
    const R = C.accountReview(a, positions, prices, now), A = R.state;
    const name = a.label || 'Prop account';
    if (A.breached) fire(`${a.id}|breach`, 3, `⛔ ${name}: at the breach line`, `Equity ~${C.fmtUsd(A.equity)} vs floor ${C.fmtUsd(A.floor)}. Check your prop platform now.`, 5);
    else if (A.room < A.profRisk) fire(`${a.id}|room`, 2, `${name}: room below one trade`, `Room ${C.fmtUsd(A.room)} (${A.binding} limit). No new trades today.`, 4);
    if (!A.riskKnown && A.open) fire(`${a.id}|nostop`, 2, `${name}: a position has no stop`, 'Risk is unlimited until it has one. Set it on your platform, then re-import.', 4);
    else if (A.stopsBreach) fire(`${a.id}|stopsbreach`, 2, `${name}: stops sit past the breach line`, `If every stop fills, equity lands near ${C.fmtUsd(A.equityIfStopped)}; floor ${C.fmtUsd(A.floor)}.`, 4);
    if (A.reachedTarget) fire(`${a.id}|target`, 1, `🎯 ${name}: equity at the profit target`, 'Check your prop platform (some firms auto-close at the target).', 4);
    for (const p of positions.filter(p => p.acct === a.id)) {
      const px = prices[p.sym]; if (px == null) continue;
      const d = p.side === 'short' ? -1 : 1, tag = `${p.sym} ${p.side} ${p.qty}@${C.fmtPx(p.entry)}`;
      if (p.stop != null) {
        const toStop = d * (px - p.stop), a1 = (data[p.sym] && data[p.sym].atr[60]) || px * 0.004;
        if (toStop <= 0) fire(`${p.id}|stophit`, 3, `${tag}: price through the stop`, `Price ${C.fmtPx(px)}, stop ${C.fmtPx(p.stop)}. It probably filled; re-import to sync.`, 4);
        else if (toStop < a1 * 0.3) fire(`${p.id}|stopnear`, 2, `${tag}: close to the stop`, `Price ${C.fmtPx(px)}, stop ${C.fmtPx(p.stop)} (${C.fmtPx(toStop)} away). Plan says hold or exit; don't widen it.`, 3);
      }
      const tgt = p.tp1 != null ? p.tp1 : p.tp2;
      if (tgt != null && d * (px - tgt) >= 0) fire(`${p.id}|tp`, 1, `${tag}: target reached`, `Price ${C.fmtPx(px)} at/through target ${C.fmtPx(tgt)}. Re-import to sync.`, 3);
      const dd = data[p.sym];
      if (dd) { const h = C.health(p, { price: px, ageSec: 0, struct: dd.struct, fvg: dd.fvg, levels: dd.levels, atr: dd.atr, acct: A, rules: watch.rules || {}, entryStruct: dd.struct[p.tf] || dd.struct[15], now });
        if (h.score != null && h.score <= 2) fire(`${p.id}|health`, 3 - h.score, `${tag}: health ${h.score}/5`, h.proposal + '. ' + h.items.filter(i => i.k !== 'inferred').slice(0, 2).map(i => i.t).join(' '), 4); }
    }
    // Entries: only when every rule passes.
    for (const s of syms) {
      if (!data[s]) continue;
      for (const e of C.entryCheck(s, data[s], A, positions.filter(p => p.acct === a.id), now, { leverage: a.leverage })) {
        if (!e.ready || !e.size || !(e.size.qty > 0)) continue;
        fire(`${a.id}|entry|${e.key}`, 1, `✅ ${s} ${e.dir.toUpperCase()} setup: all rules pass`,
          `${e.text} Size for ${A.profile.name}: ${e.size.qty} (${C.fmtUsd(e.size.lossAtStop)} at stop). Untested idea, not a signal. Your call.`, 4);
      }
    }
    // Daily summary right after the 00:30 UTC reset.
    if (!state.lastSummary || state.lastSummary < A.reset) {
      if (now - A.reset < 12 * 3600e3) fired.push({ key: 'summary', title: `${name}: new trading day`, body: `Equity ~${C.fmtUsd(A.equity)}, daily floor ${C.fmtUsd(A.dailyFloor)}, room ${C.fmtUsd(A.room)}. ${A.open} open. ${R.lines.slice(0, 2).map(l => l.t).join(' ')}`, prio: 2 });
      state.lastSummary = A.reset;
    }
  }
  // Squeezes / fast moves (observations, not signals)
  for (const s of syms) {
    const m = market[s], dd = data[s]; if (!m || !dd) continue;
    const c15 = m.c[15] || [], c60 = m.c[60] || [], a15 = dd.atr[15], a1 = dd.atr[60];
    const l15 = c15[c15.length - 2], l60 = c60[c60.length - 2];
    if (!l15 || !a15) continue;
    const move15 = l15.close - l15.open, big15 = Math.abs(l15.high - l15.low) > 2 * a15, move60 = l60 && a1 ? l60.close - l60.open : 0;
    const oiDrop = false;   // open interest history not kept (keeps the repo quiet)
    const up = move15 > 0 && (big15 || move60 > 1.5 * a1), dn = move15 < 0 && (big15 || -move60 > 1.5 * a1);
    if (up && m.funding != null && m.funding < 0) fire(`${s}|sqz|up`, 2, `⚡ ${s}: short squeeze signs`, `Fast push up (${C.fmtPx(l15.low)}→${C.fmtPx(l15.high)} on 15m) with negative funding${oiDrop ? ' and open interest falling' : ''}. Shorts at risk.`, 4);
    else if (dn && m.funding != null && m.funding > 0) fire(`${s}|sqz|dn`, 2, `⚡ ${s}: long squeeze signs`, `Fast drop (${C.fmtPx(l15.high)}→${C.fmtPx(l15.low)} on 15m) with positive funding${oiDrop ? ' and open interest falling' : ''}. Longs at risk.`, 4);
    else if (Math.abs(l15.high - l15.low) > 2.5 * a15) fire(`${s}|fast`, 1, `${s}: fast 15m move`, `Range ${C.fmtPx(Math.abs(l15.high - l15.low))} vs normal ${C.fmtPx(a15)}.`, 3);
  }
  if (positions.length && watchAgeH != null && watchAgeH > 24) fire('watch|stale', 1, 'Monitor data is over a day old', 'Re-import your Kraken screenshots and tap "Send to monitor" so alerts match your real positions.', 2);
  if (stale) fire('feed|stale', 1, 'Monitor: market data stale', 'Kraken public data looked old this run; alerts may be late.', 2);
  return { fired, state };
}

async function main() {
  // Tolerate a paste that landed below old content: use the last complete JSON object in the file.
  let watch = readJson(WATCH, null);
  if (!watch) { try { const t = fs.readFileSync(WATCH, 'utf8'); const i = t.lastIndexOf('\n{'); if (i >= 0) watch = JSON.parse(t.slice(i + 1)); } catch (e) { } }
  if (!watch) { console.log('no monitor/watch.json yet'); return; }
  const prev = readJson(STATE, {});
  const now = Date.now();
  const positions = (watch.positions || []).filter(p => !p.closed);
  const syms = [...new Set((watch.symbols || ['BTC/USD']).concat(positions.map(p => p.sym)))];
  const market = {};
  let fut = [], usdt = null;
  try { fut = (await getJson('https://futures.kraken.com/derivatives/api/v3/tickers')).tickers || []; } catch (e) { console.log('futures:', e.message); }
  try { const j = await getJson('https://api.kraken.com/0/public/Ticker?pair=USDTUSD'); const k = Object.keys(j.result)[0]; usdt = +j.result[k].c[0]; } catch (e) { console.log('usdt:', e.message); }
  for (const s of syms) {
    const c = {};
    for (const iv of IV) { try { c[iv] = await candles(s, iv); } catch (e) { console.log(s, iv, e.message); } }
    const t = fut.find(x => x.symbol === pf(s));
    const mark = t ? +t.markPrice : null;
    const k = C.calibration(watch.calib || [], s, now);
    const est = C.propEstimate(mark, usdt);
    const spot = c[15] && c[15].length ? c[15][c[15].length - 1].close : null;
    market[s] = { c, price: est != null ? est * (1 + k.bps / 1e4) : (mark || spot), funding: t ? +t.fundingRate : null, oi: t ? +t.openInterest : null };
  }
  const last = market[syms[0]] && market[syms[0]].c[15]; market._ageSec = last && last.length ? now / 1000 - last[last.length - 1].time - 900 : null;
  const { fired, state } = evaluate(watch, market, prev, now);
  const topic = process.env.NTFY_TOPIC;
  for (const f of fired.slice(0, 6)) {
    console.log('ALERT', f.title);
    if (!topic) continue;
    try { await fetch('https://ntfy.sh/' + encodeURIComponent(topic), { method: 'POST', body: f.body, headers: { Title: f.title.replace(/[^\x20-\x7E]/g, '').trim() || 'Prop Desk', Priority: String(f.prio), Tags: 'chart_with_upwards_trend' } }); } catch (e) { console.log('ntfy failed'); }
  }
  if (fired.length > 6) console.log('held back', fired.length - 6, 'alerts (anti-spam)');
  const changed = JSON.stringify([prev.active || {}, prev.sent || {}, prev.lastSummary || null]) !== JSON.stringify([state.active, state.sent, state.lastSummary || null]);
  if (changed) fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
  console.log(fired.length ? `${fired.length} alert(s)` : 'quiet', changed ? '(memory updated)' : '');
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { evaluate };
