/* Kraken Prop Desk - core math (no DOM). Runs in the browser and in Node tests.
   Rules sources (checked Nov 1, 2026): see RULES.md. Every number here is editable in Settings. */
(function (root) {
  'use strict';

  // ---- Kraken Prop rules -------------------------------------------------
  // MDL, MDD, fees, $200k cap: Kraken support centre. Targets, MDD per plan and prices:
  // Kraken Prop storefront as recorded by PropRubric (27 Oct 2026). Confirm on the purchase screen.
  const PLANS = {
    advanced:     { name: 'Advanced',     target: 0.09, mdd: 0.03, mdl: 0.03,
                    price: { 5000: 20, 10000: 40, 25000: 95, 50000: 180, 100000: 330, 200000: 660 } },
    intermediate: { name: 'Intermediate', target: 0.12, mdd: 0.05, mdl: 0.03,
                    price: { 5000: 33, 10000: 65, 25000: 150, 50000: 280, 100000: 545, 200000: 1090 } },
    starter:      { name: 'Starter',      target: 0.10, mdd: 0.06, mdl: 0.03,
                    price: { 5000: 45, 10000: 85, 25000: 215, 50000: 400, 100000: 800 } },
    custom:       { name: 'Custom',       target: 0.10, mdd: 0.05, mdl: 0.03, price: {} }
  };
  const SIZES = [5000, 10000, 25000, 50000, 100000, 200000];
  const FEES = { commission: 0.0004, fundingPerDay: 0.00033, fundingEveryHours: 4 };
  const CAPITAL_CAP = 200000;
  const ADDON_90 = 0.20;            // +20% of base price for the 90/10 split
  const RESET_MIN_UTC = 30;         // MDL resets 00:30 UTC
  // Max leverage per coin (Breakout symbols list, Oct 29 2026; Kraken blog Aug 18 2026: BTC 10x).
  // Evals bought before Aug 18 2026 may still be on BTC 5x: set per account.
  const LEVERAGE = { BTC: 10, ETH: 5, SOL: 5, XRP: 5, LINK: 5, LTC: 5, DOGE: 5, AVAX: 5, SUI: 5, HYPE: 3, WLD: 3, _default: 2 };
  // Checked in the owner's Kraken Prop app (Advanced Eval, Oct 31 2026): BTC 10x, ETH 5x, HYPE 3x, SOL 5x, WLD 3x, XRP 5x.
  // Max position per market, USD notional (Breakout symbols list). Unknown coins: assume 25k.
  const MAX_NOTIONAL = { BTC: 1e6, ETH: 1e6, SOL: 5e5, XRP: 3e5, LINK: 2e5, LTC: 2e5, DOGE: 2e5, AVAX: 2e5, SUI: 2e5, HYPE: 2e5, _default: 25000 };

  // ---- Risk profiles (his written rules; % of STARTING balance) ------------
  const PROFILES = [
    { id: 'safe',       name: 'Safe',       riskPct: 0.25, maxOpenPct: 0.50, maxTrades: 2, stopAfterLosses: 2,
      note: 'Slow and steady. About 12 losses before a 3% floor.' },
    { id: 'steady',     name: 'Steady',     riskPct: 0.50, maxOpenPct: 1.00, maxTrades: 3, stopAfterLosses: 2,
      note: 'About 6 losses of room on Advanced.' },
    { id: 'push',       name: 'Push',       riskPct: 0.75, maxOpenPct: 1.50, maxTrades: 3, stopAfterLosses: 2,
      note: 'About 4 losses of room on Advanced.' },
    { id: 'aggressive', name: 'Aggressive', riskPct: 1.00, maxOpenPct: 2.00, maxTrades: 3, stopAfterLosses: 2,
      note: 'About 3 losses and the account is gone on Advanced.' },
    { id: 'sprint',     name: 'Sprint',     riskPct: 1.25, maxOpenPct: 1.25, maxTrades: 3, stopAfterLosses: 2,
      note: 'One-day pass attempt. 2 losses ends the day; 3 ends the account on Advanced. Fee is the real bet.' }
  ];
  const profileById = id => PROFILES.find(p => p.id === id) || PROFILES[1];

  // ---- Time --------------------------------------------------------------
  // Daily reset, minutes after 00:00 UTC (Kraken Prop: 30 = 00:30 UTC). Each account can set its own.
  function lastReset(nowMs, resetMin) {
    const m = resetMin == null ? RESET_MIN_UTC : resetMin;
    const d = new Date(nowMs);
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, m);
    if (t > nowMs) t -= 86400000;
    return t;
  }
  const nextReset = (nowMs, resetMin) => lastReset(nowMs, resetMin) + 86400000;
  /* "HH:MM" UTC text -> minutes; null if invalid. */
  function parseResetUtc(t) { const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(t || '')); if (!m || +m[1] > 23 || +m[2] > 59) return null; return +m[1] * 60 + +m[2]; }

  const _fmtCache = {};
  const _partCache = new Map();
  function tzParts(tsSec, tz) {
    const key = tz + '|' + tsSec;
    let v = _partCache.get(key);
    if (v) return v;
    let f = _fmtCache[tz];
    if (!f) f = _fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
    const p = {};
    for (const x of f.formatToParts(new Date(tsSec * 1000))) p[x.type] = x.value;
    v = { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + (+p.minute), wd: p.weekday };
    if (_partCache.size > 50000) _partCache.clear();
    _partCache.set(key, v);
    return v;
  }

  // ISO time -> ms without Date.parse (Kraken sends 9 decimal places; older Safari rejects that).
  function parseIsoUtc(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/.exec(String(s));
    if (!m) return NaN;
    const ms = m[7] ? Math.floor(Number((m[7] + '000').slice(0, 3))) : 0;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms);
  }

  /* Prop price estimate: Kraken Prop quotes track USDT-margined perps (Breakout: OKX/Bybit USDT perps
     are the best proxy). Convert the Kraken Futures USD mark into USDT: mark / (USDT price in USD).
     Hypothesis from one same-moment comparison (Oct 31): owner must confirm. Unknown input -> null. */
  function propEstimate(markUsd, usdtUsd) {
    if (!(markUsd > 0) || !(usdtUsd > 0.9 && usdtUsd < 1.1)) return null;
    return markUsd / usdtUsd;
  }

  /* Cross-check live sources. quotes: [{name, price, ageSec}]. Fresh = ageSec <= maxAge.
     Median of fresh prices; any source more than tolBps away is flagged. Fewer than 2 fresh = unverified. */
  function consensus(quotes, maxAge, tolBps) {
    maxAge = maxAge || 60; tolBps = tolBps || 15;
    const fresh = quotes.filter(q => q.price > 0 && q.ageSec != null && q.ageSec <= maxAge);
    if (!fresh.length) return { median: null, fresh: [], outliers: [], verified: false, spreadBps: null };
    const ps = fresh.map(q => q.price).sort((a, b) => a - b);
    const mid = ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2;
    const rows = fresh.map(q => Object.assign({}, q, { devBps: (q.price / mid - 1) * 1e4 }));
    const outliers = rows.filter(r => Math.abs(r.devBps) > tolBps).map(r => r.name);
    return { median: mid, fresh: rows, outliers, verified: fresh.length >= 2 && outliers.length < fresh.length / 2,
      spreadBps: (ps[ps.length - 1] / ps[0] - 1) * 1e4 };
  }
  /* Calibration to Prop's real price. Each entry: {t, sym, prop, est} where est = the app's estimate at
     that moment. Residual = median of (prop/est - 1) over the last 5 entries from the past 7 days, in bps. */
  function calibration(entries, sym, nowMs) {
    const recent = (entries || []).filter(e => e.sym === sym && e.prop > 0 && e.est > 0 && nowMs - e.t <= 7 * 86400000)
      .sort((a, b) => b.t - a.t).slice(0, 5);
    if (!recent.length) return { bps: 0, n: 0, spreadBps: null };
    const r = recent.map(e => (e.prop / e.est - 1) * 1e4).sort((a, b) => a - b);
    const med = r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2;
    return { bps: med, n: r.length, spreadBps: r[r.length - 1] - r[0] };
  }

  /* Read a Kraken Prop screen (OCR text or copied text). Returns what it could read; anything not found
     stays null (never 0). Only the Open section is read; closed positions are ignored. */
  function parseKrakenProp(text) {
    const num = v => (v == null ? null : Number(String(v).replace(/,/g, '')));
    const T = String(text || '').replace(/\r/g, '');
    const grab = re => { const m = re.exec(T); return m ? num(m[1]) : null; };
    const out = { account: {}, positions: [], groups: [], warnings: [] };
    const nm = /\b(Advanced|Intermediate|Starter|Lite)\s*(Eval|Funded)\w*\s*#?\s*(\d+)?/i.exec(T);
    if (nm) out.account = { plan: nm[1].toLowerCase(), phase: /fund/i.test(nm[2]) ? 'funded' : 'eval',
      label: (nm[1][0].toUpperCase() + nm[1].slice(1).toLowerCase()) + ' ' + (nm[2][0].toUpperCase() + nm[2].slice(1).toLowerCase()) + (nm[3] ? ' ' + nm[3] : '') };
    out.account.equity = grab(/(?:Total\s+equity|Account\s+equity|Net\s+liquidation(?:\s+value)?|(?:^|\n)\s*Equity)[^\d-]{0,20}([\d,]+\.\d+)/i);
    if (out.account.equity == null) {   // label scrolled off: first "N,NNN.NNNN USD" above Target equity
      const head = T.split(/Target\s+equity/i)[0];
      const m = /(?:^|\n)\s*([\d,]+\.\d{2,})\s*us/i.exec(head);
      if (m && T.length > head.length) out.account.equity = num(m[1]);
    }
    out.account.target = grab(/(?:Target\s+equity|Profit\s+target(?:\s+balance)?)[^\d]{0,10}([\d,]+\.\d+)/i);
    out.account.dailyLimit = grab(/(?:Daily\s+loss\s+limit|Daily\s+drawdown\s+limit|Max(?:imum)?\s+daily\s+loss\s+(?:limit|level))[^\d]{0,10}([\d,]+\.\d+)/i);
    out.account.drawdownLimit = grab(/(?:Drawdown\s+limit|Max(?:imum)?\s+(?:drawdown|loss)\s+(?:limit|level))[^\d]{0,10}([\d,]+\.\d+)/i);
    const openPart = T.split(/\n\s*Closed\b/i)[0];
    const lines = openPart.split('\n').map(l => l.trim()).filter(Boolean);
    const sideRe = /\b(Short|Long)\b\s*([-+]?\d+(?:\.\d+)?)\s*%/i;
    const qtyRe = /^([\d]*\.?\d+)\s*([A-Z]{2,6})\b(?!\/)\s*([-+]?[\d,]*\.?\d+)?/;
    const entryRe = /@\s*([\d,]+\.?\d*)\s*(?:US[DPB]?|usD|usp)?\s*([\d,]+\.?\d*)?/i;
    for (let i = 0; i < lines.length; i++) {
      const g = /\b([A-Z]{2,6})\/USD\b\s+([\d,]+\.\d+)/.exec(lines[i]);
      if (g) out.groups.push({ base: g[1], notional: num(g[2]) });
      const sm = sideRe.exec(lines[i]);
      if (!sm || !lines[i + 1]) continue;
      const qm = qtyRe.exec(lines[i + 1].replace(/\s+(?=BTC|ETH|SOL|XRP|HYPE|WLD)/, ''));
      const em = lines[i + 2] ? entryRe.exec(lines[i + 2]) : null;
      if (!qm || !em) { out.warnings.push('Could not read a position near: ' + lines[i]); continue; }
      let tp = false, sl = false;
      for (let j = i + 3; j < Math.min(lines.length, i + 5); j++) {
        if (sideRe.test(lines[j]) || /\b[A-Z]{2,6}\/USD\b/.test(lines[j])) break;
        if (/\d\s*TP\b/i.test(lines[j])) tp = true;
        if (/\d\s*S[LlI1|]\b/.test(lines[j])) sl = true;
      }
      out.positions.push({ side: sm[1].toLowerCase(), qty: num(qm[1]), base: qm[2], sym: qm[2] + '/USD',
        upnl: qm[3] != null ? num(qm[3]) : null, entry: num(em[1]), price: em[2] ? num(em[2]) : null, hasTP: tp, hasSL: sl });
    }
    // Generic one-line positions from other platforms, e.g. "BTCUSD Long 0.10 @ 77,606.10 P&L -11.36" or "Sell 0.1 BTC at 77606.1".
    out.layout = out.positions.length || /Avg\s*price|Total\s+equity/i.test(T) ? 'kraken' : 'generic';
    if (!out.positions.length) {
      const gre = /(?:\b([A-Z]{2,6})[-\/]?(?:USDT|USDC|USD)?\b[^\n]{0,12}?)?\b(long|short|buy|sell)\b\s*([\d]*\.?\d+)\s*([A-Z]{2,6})?(?:[-\/]?(?:USDT|USDC|USD))?\s*(?:@|at|entry(?:\s*price)?:?)\s*\$?([\d,]+\.?\d*)(?:[^\n]*?(?:P&L|PnL|uPnL|Unrealized)[:\s]*([-+]?\$?[\d,]*\.?\d+))?/gi;
      let gm;
      while ((gm = gre.exec(T))) {
        const base = (gm[4] || gm[1] || '').toUpperCase(); if (!base || /^(USD|USDT|USDC)$/.test(base)) continue;
        out.positions.push({ side: /short|sell/i.test(gm[2]) ? 'short' : 'long', qty: num(gm[3]), base, sym: base + '/USD', entry: num(gm[5]),
          upnl: gm[6] != null ? num(gm[6].replace('$', '')) : null, price: null, hasTP: false, hasSL: false });
      }
      if (out.positions.length) out.warnings.push('Read with the general reader (not a known platform layout): check every number before syncing.');
    }
    // De-duplicate (the same position can appear on two overlapping screenshots)
    const seen = new Set();
    out.positions = out.positions.filter(p => { const k = [p.side, p.qty, p.entry].join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
    // Position detail sheets (tap a position): side, size, take-profit and stop-loss prices.
    out.details = [];
    const dre = /\b(Short|Long)\s*\n\s*([\d]*\.?\d+)\s*([A-Z]{2,6})\b([\s\S]*?)(?=\n\s*(?:Short|Long)\s*\n|$)/g;
    let dm;
    while ((dm = dre.exec(T))) {
      const body = dm[4];
      const g = re => { const m = re.exec(body); return m ? num(m[1]) : null; };
      const tp = g(/Take\s*profit\s*price\s*([\d,]+\.?\d*)/i), sl = g(/Stop\s*loss\s*price\s*([\d,]+\.?\d*)/i);
      const entry = g(/Average\s*opening\s*price\s*([\d,]+\.?\d*)/i), price = g(/Current\s*price\s*([\d,]+\.?\d*)/i);
      const fee = g(/Opening\s*fee\s*([\d,]*\.?\d+)/i), qty2 = g(/Total\s*open\s*quantity\s*([\d]*\.?\d+)/i);
      // "Open time Oct 31, 2026 at 7:37PM" is the phone's local time.
      const ot = /Open\s*time\s*([A-Z][a-z]{2})[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})\s*(?:at)?\s*(\d{1,2}):(\d{2})\s*([AP])\.?M/i.exec(body);
      let openedMs = null;
      if (ot) { const mo = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(ot[1].toLowerCase()) / 3; let h = +ot[4] % 12; if (/p/i.test(ot[6])) h += 12;
        if (mo >= 0) openedMs = new Date(+ot[3], mo, +ot[2], h, +ot[5]).getTime(); }
      if (tp != null || sl != null || entry != null) out.details.push({ side: dm[1].toLowerCase(), qty: qty2 != null ? qty2 : num(dm[2]), base: dm[3], sym: dm[3] + '/USD',
        tp, sl, entry, price, openFee: fee, openedMs });
    }
    const seenD = new Set();
    out.details = out.details.filter(d => { const k = [d.side, d.qty, d.tp, d.sl, d.entry].join('|'); if (seenD.has(k)) return false; seenD.add(k); return true; });
    // Merge the TP/SL tab and the Details tab of the same position (same side + coin + size, one of each).
    const merged = [];
    for (const d of out.details) {
      const twin = merged.find(m => m.side === d.side && m.base === d.base && m.qty === d.qty &&
        out.details.filter(x => x.side === d.side && x.base === d.base && x.qty === d.qty).length === 2 &&
        ((m.entry == null) !== (d.entry == null)));
      if (twin) { for (const k of Object.keys(d)) if (twin[k] == null && d[k] != null) twin[k] = d[k]; } else merged.push(Object.assign({}, d));
    }
    out.details = merged;
        // "Positions·0" means flat; otherwise no rows read means we don't know the open P&L.
    out.flat = /Positions\s*\W?\s*0\b/i.test(T) && !out.positions.length;
    const known = out.positions.every(p => p.upnl != null);
    out.upnlSum = out.positions.length && known ? out.positions.reduce((a, p) => a + p.upnl, 0) : (out.flat ? 0 : null);
    out.balance = out.account.equity != null && out.upnlSum != null ? out.account.equity - out.upnlSum : null;
    return out;
  }
  /* Account size from Kraken's limits: drawdown limit = size x (1 - MDD). */
  function sizeFromLimits(plan, drawdownLimit, target) {
    const P = PLANS[plan]; if (!P) return null;
    for (const z of SIZES) {
      if (drawdownLimit != null && Math.abs(z * (1 - P.mdd) - drawdownLimit) < 0.5) return z;
      if (target != null && Math.abs(z * (1 + P.target) - target) < 0.5) return z;
    }
    return null;
  }

  // ---- Symbols -----------------------------------------------------------
  const base = sym => String(sym).split('/')[0].toUpperCase();
  const levCap = (sym, lev) => { const b = base(sym); if (lev && lev[b]) return lev[b]; return LEVERAGE[b] || LEVERAGE._default; };
  const maxNotional = sym => MAX_NOTIONAL[base(sym)] || MAX_NOTIONAL._default;
  // Order size step = the coin's smallest unit (owner-confirmed Nov 1, 2026): 1 satoshi for BTC, 1 drop for XRP.
  const QTY_DP = { BTC: 8, ETH: 8, SOL: 8, XRP: 6 };
  const qtyDp = sym => (QTY_DP[base(sym)] != null ? QTY_DP[base(sym)] : 8);
  const floorTo = (x, dp) => { const m = Math.pow(10, dp); return Math.floor(x * m + 1e-9) / m; };

  // ---- Positions & fees --------------------------------------------------
  // Kraken books fees into BALANCE when charged: entry commission at open, swap fee every 4 hours,
  // exit commission at close (Kraken: Understanding Fees). Kraken Prop's position screen shows the next
  // swap charge exactly 4h after each position's own open time (owner's screenshots, Oct 31 2026), and
  // charges it on the position's current value; we use the entry value (difference ~0.1% of a ~$0.43 fee).
  const dir = p => (p.side === 'short' ? -1 : 1);
  const qtyClosedBy = (p, t) => (p.partials || []).reduce((s, x) => s + (x.t <= t ? x.qty : 0), 0);
  const openQty = p => Math.max(0, p.qty - (p.partials || []).reduce((s, x) => s + x.qty, 0));
  function grossPnl(p, price, qty) { return dir(p) * (price - p.entry) * (qty == null ? openQty(p) : qty); }
  const ROLL = 4 * 3600000;
  // Swap charge times for a position opened at openedMs, in (openedMs, toMs]: every 4h from its open.
  function rollovers(openedMs, toMs) {
    const out = [];
    for (let t = openedMs + ROLL; t <= toMs; t += ROLL) out.push(t);
    return out;
  }
  const swapPerCharge = (notional, f) => notional * f.fundingPerDay / (24 / f.fundingEveryHours);
  // Swap fees on `qty` units held from open to atMs (used for a closed portion).
  function fundingEst(notional, openedMs, atMs, f) { f = f || FEES; return swapPerCharge(notional, f) * rollovers(openedMs, atMs).length; }
  // Fee ledger for one position up to nowMs: [{t, amt}] (negative = fee).
  function feeEvents(p, nowMs, f) {
    f = f || FEES;
    const ev = [{ t: p.opened, amt: -p.entry * p.qty * f.commission, kind: 'commission' }];
    const end = Math.min(nowMs, p.closed ? p.closed.t : nowMs);
    for (const t of rollovers(p.opened, end)) {
      const q = p.qty - qtyClosedBy(p, t - 1);
      if (q > 1e-12) ev.push({ t, amt: -swapPerCharge(p.entry * q, f), kind: 'swap' });
    }
    return ev;
  }
  // Fees already charged on the part still open (entry commission share + its swaps).
  function openFeesPaid(p, nowMs, f) {
    f = f || FEES;
    const q = openQty(p);
    return p.entry * q * f.commission + fundingEst(p.entry * q, p.opened, nowMs, f);
  }
  // Net result of the open part if closed at `price` now (all its fees, incl. exit commission).
  function netIfClosed(p, price, nowMs, f) {
    f = f || FEES;
    return grossPnl(p, price) - openFeesPaid(p, nowMs, f) - price * openQty(p) * f.commission;
  }
  // Net realized for closing `qty` at `price` at atMs: gross minus every fee on that portion.
  function realizedFor(p, qty, price, atMs, f) {
    f = f || FEES;
    const n = p.entry * qty;
    return dir(p) * (price - p.entry) * qty - n * f.commission - price * qty * f.commission - fundingEst(n, p.opened, atMs, f);
  }
  function rMultiple(p, price) {
    const risk = Math.abs(p.entry - (p.origStop != null ? p.origStop : p.stop));
    if (!risk) return null;
    return dir(p) * (price - p.entry) / risk;
  }
  const realizedOfPos = p => (p.partials || []).reduce((s, x) => s + (x.realized || 0), 0)
    + (p.closed ? (p.closed.realized || 0) : 0);

  // ---- Account state -----------------------------------------------------
  function planOf(a) {
    const b = PLANS[a.plan] || PLANS.custom;
    const ok = (v, lo, hi) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi);
    return { name: b.name,
      target: ok(a.target, 0.005, 0.5) ? a.target : b.target,
      mdd: ok(a.mdd, 0.005, 0.2) ? a.mdd : b.mdd,
      mdl: ok(a.mdl, 0.005, 0.2) ? a.mdl : b.mdl };
  }
  /* Rule inputs from the form (percent text). Blank = plan default (null). Out of range = error. */
  function parseRulePct(text, lo, hi) {
    const s = String(text == null ? '' : text).trim();
    if (s === '') return { value: null };
    const v = Number(s);
    if (!isFinite(v) || v < lo || v > hi) return { error: `must be between ${lo}% and ${hi}%` };
    return { value: v / 100 };
  }
  /* Balance ledger for one account, matching Kraken's Balance: every fee when charged, and each
     close/partial's remaining amount so that a portion's total equals its stored net `realized`. */
  function ledger(acctId, positions, nowMs, f) {
    f = f || FEES;
    const ev = [];
    for (const p of positions) {
      if (p.acct !== acctId) continue;
      for (const e of feeEvents(p, nowMs, f)) ev.push(e);
      const portions = (p.partials || []).map(x => ({ t: x.t, qty: x.qty, realized: x.realized || 0 }));
      if (p.closed && (p.closed.realized || 0) !== 0) portions.push({ t: p.closed.t, qty: openQty(p), realized: p.closed.realized });
      for (const x of portions) {
        // Fees for this portion already sit in the ledger; add back so the portion nets to `realized`.
        const booked = p.entry * x.qty * f.commission + fundingEst(p.entry * x.qty, p.opened, x.t, f);
        ev.push({ t: x.t, amt: x.realized + booked, kind: 'close', pos: p.id });
      }
    }
    return ev.filter(e => e.t <= nowMs);
  }
  /* prices: {sym: number}. Returns everything the Desk shows. */
  function accountState(a, positions, prices, nowMs, opt) {
    opt = opt || {};
    const f = opt.fees || FEES;
    const pl = planOf(a);
    const start = a.size;
    // Without a Kraken reconcile, every logged event counts (backfilled trades included).
    const anchorT = a.anchor ? a.anchor.t : -Infinity;
    const anchorBal = a.anchor ? a.anchor.bal : start;
    const ev = ledger(a.id, positions, nowMs, f);
    const reset = lastReset(nowMs, a.resetMin);
    let balance = anchorBal;
    for (const e of ev) if (e.t > anchorT) balance += e.amt;
    let dayStart = anchorBal;
    if (anchorT <= reset) { for (const e of ev) if (e.t > anchorT && e.t <= reset) dayStart += e.amt; }
    else { for (const e of ev) if (e.t > reset && e.t <= anchorT) dayStart -= e.amt; }
    if (a.dayStartOverride && a.dayStartOverride.reset === reset) dayStart = a.dayStartOverride.bal;

    const open = positions.filter(p => p.acct === a.id && !p.closed && openQty(p) > 0);
    let upnl = 0, feesOpen = 0, riskToStops = 0, noStop = 0, slUnknown = 0, missingPx = 0, notional = 0, usedMargin = 0;
    const lev = opt.leverage || a.leverage;
    for (const p of open) {
      const px = prices[p.sym], q = openQty(p);
      feesOpen += openFeesPaid(p, nowMs, f);
      notional += p.entry * q;
      usedMargin += p.entry * q / levCap(p.sym, lev);
      const hasStop = p.stop != null && isFinite(p.stop);
      if (!hasStop) { if (p.krakenSL) slUnknown++; else noStop++; }
      if (px == null || !isFinite(px)) {
        // Unknown price: never treat as flat. Value at the stop (worst planned case); no stop = unlimited.
        missingPx++;
        if (hasStop) { upnl += grossPnl(p, p.stop); riskToStops += p.stop * q * f.commission; }
        else riskToStops = Infinity;
        continue;
      }
      upnl += grossPnl(p, px);
      if (!hasStop) { riskToStops = Infinity; continue; }
      // Loss from here if the stop fills exactly (it may not: stops are not guaranteed).
      riskToStops += Math.max(0, grossPnl(p, px) - grossPnl(p, p.stop)) + p.stop * q * f.commission;
    }
    // Kraken: equity = balance (fees already in it) + unrealized P&L.
    const equity = balance + upnl;
    const dailyFloor = dayStart * (1 - pl.mdl);
    const maxFloor = start * (1 - pl.mdd);
    const floor = Math.max(dailyFloor, maxFloor);
    const room = equity - floor;
    const dailyRoom = equity - dailyFloor, maxRoom = equity - maxFloor;
    const targetBal = start * (1 + pl.target);
    const isFunded = a.phase === 'funded';
    const equityIfStopped = equity - riskToStops;
    // A loss = a position fully closed after the reset whose total result is negative.
    const lossesToday = positions.filter(p => p.acct === a.id && p.closed && p.closed.t > reset && realizedOfPos(p) < 0).length;
    const tradesToday = positions.filter(p => p.acct === a.id && p.opened > reset && !p.openedUnknown).length;
    const prof = profileById(a.profile);
    const openRiskAtEntry = open.reduce((s, p) => s + (p.stop != null ? Math.abs(p.entry - p.stop) * openQty(p) : 0), 0);
    const profRisk = start * prof.riskPct / 100;
    const maxOpen = start * prof.maxOpenPct / 100;
    // What the next trade may risk under his profile, never more than the room left. Unknown risk -> 0.
    const nextRisk = isFinite(riskToStops) ? Math.max(0, Math.min(profRisk, maxOpen - riskToStops, (room - riskToStops) * 0.9)) : 0;
    const cost = (a.fee || 0) + (a.extraCosts || []).reduce((s, x) => s + x.amt, 0);
    const paid = (a.payouts || []).reduce((s, x) => s + x.amt, 0);
    const breached = equity <= floor;
    const reachedTarget = !isFunded && equity >= targetBal;
    const warnings = [];
    if (breached) warnings.push({ lvl: 'bad', text: 'Equity is at or below a breach line. Check your platform: the account may already be closed.' });
    if (noStop) warnings.push({ lvl: 'bad', text: `${noStop} open position(s) with no stop logged: risk is unlimited, next trade size set to $0.` });
    if (slUnknown) warnings.push({ lvl: 'warn', text: `${slUnknown} position(s) have a stop on your platform but the app doesn't know its price yet: total risk can't be added up. Import each position's TP/SL screenshot.` });
    if (missingPx) warnings.push({ lvl: 'bad', text: `No live price for ${missingPx} position(s). Valued at the stop (worst planned case) until the feed is back.` });
    if (!breached && open.length && equityIfStopped <= floor)
      warnings.push({ lvl: 'bad', text: isFinite(riskToStops) ? 'If every stop fills, the account breaches. Stops sit past the breach line.' : 'Risk is unlimited until every position has a stop.' });
    if (isFinite(riskToStops) && riskToStops > maxOpen + 0.01)
      warnings.push({ lvl: 'warn', text: `Open risk ${fmtUsd(riskToStops)} is over your ${prof.name} max of ${fmtUsd(maxOpen)}.` });
    if (lossesToday >= prof.stopAfterLosses)
      warnings.push({ lvl: 'warn', text: `${lossesToday} losses today. Your ${prof.name} rule says done for the day.` });
    if (tradesToday >= prof.maxTrades)
      warnings.push({ lvl: 'warn', text: `${tradesToday} trades today: at your ${prof.name} limit of ${prof.maxTrades}.` });
    if (reachedTarget)
      warnings.push({ lvl: 'warn', text: 'Equity is at the profit target. Check your platform (Kraken Prop auto-closes and marks the eval Passed here).' });
    return {
      plan: pl, profile: prof, start, balance, dayStart, equity, upnl, feesOpen, open: open.length,
      dailyFloor, maxFloor, floor, room, dailyRoom, maxRoom, roomPct: room / start,
      binding: dailyFloor >= maxFloor ? 'daily' : 'max',
      targetBal, toTarget: isFunded ? null : targetBal - equity,
      progress: isFunded ? null : (equity - start) / (targetBal - start), reachedTarget,
      riskToStops, riskKnown: isFinite(riskToStops), equityIfStopped, stopsBreach: open.length > 0 && equityIfStopped <= floor,
      priceComplete: missingPx === 0,
      profRisk, maxOpen, nextRisk, lossesToBreach: profRisk > 0 ? Math.floor(Math.max(0, room) / profRisk) : null,
      winsToPass: (!isFunded && profRisk > 0) ? (r => Math.max(0, Math.ceil((targetBal - equity) / (profRisk * r)))) : null,
      lossesToday, tradesToday, reset, nextReset: reset + 86400000,
      cost, paid, net: paid - cost, notional, leverage: notional / Math.max(1, equity), usedMargin,
      availMargin: Math.max(0, equity - usedMargin), breached, warnings, openRiskAtEntry,
      openBySym: open.reduce((m, p) => (m[p.sym] = (m[p.sym] || 0) + p.entry * openQty(p), m), {}),
      payoutAvail: isFunded ? Math.max(0, balance - start) * (a.addon90 ? 0.9 : 0.8) : null
    };
  }

  /* Plain-language account review (same math as a manual review). prices: P&L price per symbol. */
  function accountReview(a, positions, prices, nowMs, opt) {
    const st = accountState(a, positions, prices, nowMs, opt);
    const f = (opt && opt.fees) || FEES;
    const open = positions.filter(p => p.acct === a.id && !p.closed && openQty(p) > 0);
    const bySym = {};
    for (const p of open) {
      const g = bySym[p.sym] || (bySym[p.sym] = { sym: p.sym, long: 0, short: 0, qtyNet: 0, cost: 0, n: 0, plannedRisk: 0, reward: 0, noStop: 0, noTarget: 0, slUnknown: 0 });
      const q = openQty(p), d = dir(p);
      g.n++; g.qtyNet += d * q; g[p.side] += q; g.cost += p.entry * q;
      if (p.stop != null && isFinite(p.stop)) g.plannedRisk += Math.max(0, -d * (p.stop - p.entry)) * q + p.stop * q * f.commission;
      else if (p.krakenSL) g.slUnknown++; else g.noStop++;
      const tgt = p.tp1 != null ? p.tp1 : p.tp2;
      if (tgt != null) g.reward += Math.max(0, d * (tgt - p.entry)) * q - tgt * q * f.commission; else g.noTarget++;
    }
    const groups = Object.values(bySym).map(g => {
      const px = prices[g.sym];
      const gross = g.long + g.short;
      const g2 = Object.assign(g, { price: px, avgEntry: g.cost / gross, notional: px != null ? px * gross : null,
        perHundred: Math.abs(g.qtyNet) * 100 });
      // Price where equity reaches the binding floor if only this coin moves (before closing fees).
      if (px != null && g.qtyNet !== 0 && st.room > 0) g2.breachPrice = px - st.room / g.qtyNet;
      g2.rr = g.plannedRisk > 0 && !g.noTarget && !g.noStop && !g.slUnknown ? g.reward / g.plannedRisk : null;
      return g2;
    });
    const plannedRisk = groups.reduce((x, g) => x + g.plannedRisk, 0);
    const lines = [];
    const add = (lvl, t) => lines.push({ lvl, t });
    if (!open.length) add('ok', 'No open positions.');
    if (st.riskKnown && open.length) add(st.stopsBreach ? 'bad' : 'ok', `If every stop fills: about ${fmtUsd(-st.riskToStops)} from here, leaving ${fmtUsd(st.equityIfStopped - st.floor)} above the ${st.binding} limit.`);
    if (!st.riskKnown) add('bad', 'Total risk is unknown: at least one position has no stop price in the app.');
    for (const g of groups) {
      if (g.breachPrice != null) add('info', `${g.sym}: ${g.qtyNet < 0 ? 'short' : 'long'} ${Math.abs(+g.qtyNet.toFixed(8))} (avg ${fmtPx(g.avgEntry)}). Each $100 move = ${fmtUsd(g.perHundred)}. With no stops, the account breaches near ${fmtPx(g.breachPrice)}.`);
      if (g.rr != null) add('info', `${g.sym}: planned risk ${fmtUsd(g.plannedRisk)} vs reward at targets ${fmtUsd(g.reward)} (${g.rr.toFixed(1)}R, after closing fees).`);
      if (g.noStop) add('bad', `${g.sym}: ${g.noStop} position(s) with no stop.`);
      if (g.slUnknown) add('warn', `${g.sym}: ${g.slUnknown} stop price(s) not imported yet.`);
      if (g.long > 0 && g.short > 0) add('warn', `${g.sym}: long and short at the same time. Check that it's intentional.`);
    }
    if (open.length && st.riskKnown && plannedRisk > st.maxOpen + 0.01) add('warn', `Planned risk ${fmtUsd(plannedRisk)} is above your ${st.profile.name} limit of ${fmtUsd(st.maxOpen)} total (${fmtUsd(st.profRisk)} per trade).`);
    if (st.room < st.profRisk) add('bad', `Room left (${fmtUsd(st.room)}) is less than one ${st.profile.name} trade. No new trades today.`);
    return { state: st, groups, plannedRisk, lines };
  }

  function deskTotals(accounts, positions, prices, nowMs, opt) {
    let capital = 0, cost = 0, paid = 0, upnl = 0, active = 0, equity = 0, riskToStops = 0;
    const states = {};
    for (const a of accounts) {
      const s = accountState(a, positions, prices, nowMs, opt);
      states[a.id] = s;
      cost += s.cost; paid += s.paid;
      if (a.phase === 'eval' || a.phase === 'funded') {
        active++; capital += a.size; upnl += s.upnl; equity += s.equity; riskToStops += s.riskToStops;
      }
    }
    return { states, capital, cost, paid, net: paid - cost, upnl, active, equity, riskToStops,
      overCap: capital > CAPITAL_CAP, cap: CAPITAL_CAP };
  }

  // ---- Sizing ------------------------------------------------------------
  function sizeFor(o) {
    // o: {sym, entry, stop, risk, equity, usedMargin?, symNotional?, fees?, leverage?}
    // Margin is one shared pool (Kraken Prop dashboard: Used / Available margin), so other open
    // positions reduce what a new one can take. Each market also has a USD notional cap.
    const f = o.fees || FEES;
    const dist = Math.abs(o.entry - o.stop);
    if (!(dist > 0) || !(o.risk > 0)) return { qty: 0, error: 'Need an entry, a stop on the right side, and risk above $0.' };
    const perUnit = dist + (o.entry + o.stop) * f.commission;
    let qty = o.risk / perUnit;
    const cap = levCap(o.sym, o.leverage);
    const freeMargin = Math.max(0, o.equity - (o.usedMargin || 0));
    const byMargin = freeMargin * cap / o.entry;
    const byMarket = Math.max(0, maxNotional(o.sym) - (o.symNotional || 0)) / o.entry;
    let capped = null;
    if (qty > byMargin) { qty = byMargin; capped = 'margin'; }
    if (qty > byMarket) { qty = byMarket; capped = 'market'; }
    qty = floorTo(qty, qtyDp(o.sym));
    const notional = qty * o.entry;
    return { qty, notional, lossAtStop: qty * perUnit, leverage: notional / o.equity, levCap: cap, capped,
      freeMargin, fees: o.entry * qty * f.commission * 2, dist };
  }

  // ---- Candle analysis ---------------------------------------------------
  // candles: [{time(sec), open, high, low, close, volume, vwap?}] oldest first; last one may be forming.
  function atr(c, n) {
    n = n || 14;
    if (c.length < 2) return null;
    const tr = [];
    for (let i = 1; i < c.length; i++)
      tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)));
    const s = tr.slice(-n);
    return s.reduce((a, b) => a + b, 0) / s.length;
  }
  // Fractal swings, confirmed only (k closed candles each side). No look-ahead.
  function swings(c, k) {
    k = k || 2;
    const closed = c.slice(0, -1);
    const out = [];
    for (let i = k; i < closed.length - k; i++) {
      let hi = true, lo = true;
      for (let j = 1; j <= k; j++) {
        if (!(closed[i].high > closed[i - j].high && closed[i].high >= closed[i + j].high)) hi = false;
        if (!(closed[i].low < closed[i - j].low && closed[i].low <= closed[i + j].low)) lo = false;
      }
      if (hi) out.push({ type: 'H', i, time: closed[i].time, price: closed[i].high, confirmedAt: closed[i + k].time });
      if (lo) out.push({ type: 'L', i, time: closed[i].time, price: closed[i].low, confirmedAt: closed[i + k].time });
    }
    return out;
  }
  /* Market structure by closes through confirmed swings.
     Close above the latest unbroken confirmed swing high = break up; below swing low = break down.
     Break in the same direction as the current bias = BOS; against it = CHoCH (bias flips). */
  function structure(c, k) {
    k = k || 2;
    const sw = swings(c, k);
    const closed = c.slice(0, -1);
    let bias = 'range', lastH = null, lastL = null, events = [], si = 0;
    for (let i = 0; i < closed.length; i++) {
      const x = closed[i];
      while (si < sw.length && sw[si].i + k <= i - 0) {   // swing confirmed by candle i-1 or earlier
        const s = sw[si++];
        if (s.type === 'H') lastH = Object.assign({ broken: false }, s); else lastL = Object.assign({ broken: false }, s);
      }
      if (lastH && !lastH.broken && x.close > lastH.price) {
        lastH.broken = true;
        events.push({ kind: bias === 'bear' ? 'CHoCH' : 'BOS', dir: 'up', time: x.time, level: lastH.price });
        bias = 'bull';
      } else if (lastL && !lastL.broken && x.close < lastL.price) {
        lastL.broken = true;
        events.push({ kind: bias === 'bull' ? 'CHoCH' : 'BOS', dir: 'down', time: x.time, level: lastL.price });
        bias = 'bear';
      }
    }
    const highs = sw.filter(s => s.type === 'H'), lows = sw.filter(s => s.type === 'L');
    const h2 = highs.slice(-2), l2 = lows.slice(-2);
    let shape = 'mixed';
    if (h2.length === 2 && l2.length === 2) {
      if (h2[1].price > h2[0].price && l2[1].price > l2[0].price) shape = 'HH/HL';
      else if (h2[1].price < h2[0].price && l2[1].price < l2[0].price) shape = 'LH/LL';
    }
    return { bias, last: events[events.length - 1] || null, events, swingHigh: highs[highs.length - 1] || null,
      swingLow: lows[lows.length - 1] || null, shape, swings: sw };
  }
  /* FVG: 3-candle gap. Bullish when candle[i].low > candle[i-2].high; bearish when candle[i].high < candle[i-2].low.
     Only closed candles. Min size = minAtr x ATR(14). Tracks mitigation by later candles. */
  function fvgs(c, opt) {
    opt = opt || {};
    const minAtr = opt.minAtr != null ? opt.minAtr : 0.15;
    const closed = c.slice(0, -1);
    const a = atr(closed, 14) || 0;
    const out = [];
    for (let i = 2; i < closed.length; i++) {
      const p = closed[i - 2], m = closed[i - 1], n = closed[i];
      let g = null;
      if (n.low > p.high) g = { dir: 'bull', top: n.low, bottom: p.high };
      else if (n.high < p.low) g = { dir: 'bear', top: p.low, bottom: n.high };
      if (!g || g.top - g.bottom < minAtr * a) continue;
      g.time = m.time; g.formed = n.time; g.displacement = Math.abs(m.close - m.open) / (a || 1);
      g.status = 'open';
      for (let j = i + 1; j < c.length; j++) {          // includes forming candle for live mitigation
        const y = c[j];
        if (g.dir === 'bull') { if (y.low <= g.bottom) { g.status = 'filled'; break; } if (y.low < g.top) g.status = 'partial'; }
        else { if (y.high >= g.top) { g.status = 'filled'; break; } if (y.high > g.bottom) g.status = 'partial'; }
      }
      out.push(g);
    }
    return out;
  }
  function liveFvgs(c, n, opt) { return fvgs(c, opt).filter(g => g.status !== 'filled').slice(-(n || 8)); }

  function vwapSince(c, startSec) {
    let pv = 0, v = 0;
    for (const x of c) if (x.time >= startSec) { const tp = x.vwap || (x.high + x.low + x.close) / 3; pv += tp * x.volume; v += x.volume; }
    return v > 0 ? pv / v : null;
  }

  const SESSIONS = [   // ICT-style killzones, New York time (minutes from midnight)
    { id: 'asia', name: 'Asia', from: 20 * 60, to: 24 * 60 },
    { id: 'london', name: 'London', from: 2 * 60, to: 5 * 60 },
    { id: 'nyam', name: 'NY AM', from: 7 * 60, to: 10 * 60 },
    { id: 'nypm', name: 'NY PM', from: 13 * 60 + 30, to: 16 * 60 }
  ];
  function sessionRanges(c, tz) {
    tz = tz || 'America/New_York';
    const res = {};
    for (const s of SESSIONS) {
      let cur = null, last = null;
      for (const x of c) {
        const tp = tzParts(x.time, tz);
        const inS = tp.min >= s.from && tp.min < s.to;
        if (inS) {
          const key = tp.date;
          if (!cur || cur.key !== key) { if (cur) last = cur; cur = { key, id: s.id, name: s.name, high: x.high, low: x.low, from: x.time, to: x.time }; }
          else { cur.high = Math.max(cur.high, x.high); cur.low = Math.min(cur.low, x.low); cur.to = x.time; }
        }
      }
      if (cur) {
        const lastC = c[c.length - 1];
        const tp = tzParts(lastC.time, tz);
        cur.forming = tp.date === cur.key && tp.min >= s.from && tp.min < s.to;
        res[s.id] = cur; res[s.id + '_prev'] = last;
      }
    }
    return res;
  }
  /* Opening range. anchor: 'ny' (09:30 New York), 'utc' (00:00 UTC), 'kraken' (00:30 UTC). durMin: range length.
     breakout = first CLOSED candle after the range that closes beyond it. */
  function openingRange(c, anchor, durMin, tz) {
    if (!c.length) return null;
    const step = c.length > 1 ? c[1].time - c[0].time : 300;
    const inRange = x => {
      if (anchor === 'ny') { const tp = tzParts(x.time, tz || 'America/New_York'); return { on: tp.min >= 570 && tp.min < 570 + durMin, key: tp.date }; }
      const off = anchor === 'kraken' ? 30 : 0;
      const m = Math.floor(((x.time / 60) - off) % 1440 + 1440) % 1440;
      return { on: m < durMin, key: Math.floor((x.time / 60 - off) / 1440) };
    };
    let r = null;
    for (let i = 0; i < c.length; i++) {
      const g = inRange(c[i]);
      if (!g.on) continue;
      if (!r || r.key !== g.key) r = { key: g.key, high: c[i].high, low: c[i].low, from: c[i].time, to: c[i].time, endIdx: i };
      else { r.high = Math.max(r.high, c[i].high); r.low = Math.min(r.low, c[i].low); r.to = c[i].time; r.endIdx = i; }
    }
    if (!r) return null;
    r.complete = (r.to + step - r.from) >= durMin * 60 && r.endIdx < c.length - 1;
    r.breakout = null;
    if (r.complete) {
      for (let i = r.endIdx + 1; i < c.length - 1; i++) {
        if (inRange(c[i]).on) break;
        if (c[i].close > r.high) { r.breakout = { dir: 'up', time: c[i].time, close: c[i].close }; break; }
        if (c[i].close < r.low) { r.breakout = { dir: 'down', time: c[i].time, close: c[i].close }; break; }
      }
    }
    r.anchor = anchor; r.dur = durMin;
    return r;
  }
  /* Key levels from daily candles (UTC days) plus sessions, ORB and VWAP from intraday. */
  function keyLevels(d1, intraday, opt) {
    opt = opt || {};
    const L = [];
    const add = (id, name, price, kind) => { if (price != null && isFinite(price)) L.push({ id, name, price, kind }); };
    if (d1 && d1.length >= 2) {
      const pd = d1[d1.length - 2], cd = d1[d1.length - 1];
      add('pdh', 'PDH', pd.high, 'day'); add('pdl', 'PDL', pd.low, 'day'); add('do', 'Day open', cd.open, 'open');
      // previous ISO week (Mon 00:00 UTC)
      const wk = t => Math.floor((t / 86400 + 3) / 7);
      const curW = wk(cd.time);
      const prev = d1.filter(x => wk(x.time) === curW - 1);
      if (prev.length) { add('pwh', 'PWH', Math.max(...prev.map(x => x.high)), 'week'); add('pwl', 'PWL', Math.min(...prev.map(x => x.low)), 'week'); }
    }
    if (intraday && intraday.length) {
      const sr = sessionRanges(intraday, opt.tz);
      for (const s of SESSIONS) { const r = sr[s.id]; if (r) { add(s.id + 'h', s.name + ' H', r.high, 'session'); add(s.id + 'l', s.name + ' L', r.low, 'session'); } }
      const orb = openingRange(intraday, opt.orbAnchor || 'ny', opt.orbMin || 15, opt.tz);
      if (orb) { add('orbh', 'ORB H', orb.high, 'orb'); add('orbl', 'ORB L', orb.low, 'orb'); }
      const last = intraday[intraday.length - 1];
      const dayStart = Math.floor(last.time / 86400) * 86400;
      add('vwap', 'VWAP (UTC day)', vwapSince(intraday, dayStart), 'vwap');
    }
    return L;
  }

  // ---- Coach -------------------------------------------------------------
  const SIDE_BIAS = { long: 'bull', short: 'bear' };
  /* ctx: {price, ageSec, struct:{'15':s,'60':s,'240':s,'1440':s}, fvg:{'15':[],'60':[]}, levels:[], atr:{'60':n},
           acct: accountState, rules:{beAt1R:bool}, entryStruct: structure on the position's TF} */
  function health(p, ctx) {
    const items = [];
    const obs = t => items.push({ k: 'observed', t }), inf = t => items.push({ k: 'inferred', t }), act = t => items.push({ k: 'proposal', t });
    if (ctx.price == null || ctx.ageSec == null || ctx.ageSec > (ctx.maxAge || 90))
      return { score: null, label: 'Not assessed', items: [{ k: 'unknown', t: 'Price data is missing or stale. No health score until the feed is current.' }], proposal: 'Wait for fresh data' };
    let score = 5, cap = 5;
    const px = ctx.price, d = dir(p), q = openQty(p);
    const r = rMultiple(p, px);
    const want = SIDE_BIAS[p.side];
    const opp = want === 'bull' ? 'bear' : 'bull';
    let proposal = 'Keep the existing plan';

    // 1. Stop exists and is on the right side
    if ((p.stop == null || !isFinite(p.stop)) && p.krakenSL) { cap = 2; obs('Your platform shows a stop on this position, but its price isn\'t in the app, so the risk can\'t be measured.'); act('Import a screenshot of this position\'s TP/SL so the stop price is known.'); proposal = 'Import the stop price'; }
    else if (p.stop == null || !isFinite(p.stop)) { cap = 1; obs('No stop. Unlimited risk to the account.'); act('Set a stop on your platform now.'); proposal = 'Add protection'; }
    else if ((d > 0 && px <= p.stop) || (d < 0 && px >= p.stop)) { cap = Math.min(cap, 1); obs(`Price ${fmtPx(px)} is through your stop ${fmtPx(p.stop)}. Stop orders can slip or fail to fill.`); act('Check the order state on your platform now. If it filled, log the close.'); proposal = 'Verify order state'; }

    // 2. Account breach line
    const A = ctx.acct;
    if (A && p.stop != null) {
      const lossToStop = -(grossPnl(p, p.stop) - grossPnl(p, px)) + p.stop * q * FEES.commission;
      if (A.equity - lossToStop <= A.floor) { cap = Math.min(cap, 1); obs(`If this stop fills, equity lands at ${fmtUsd(A.equity - lossToStop)}, at or below the breach line ${fmtUsd(A.floor)}. The account dies before the stop does.`); act('Reduce size. Do not move the stop farther away.'); proposal = 'Reduce exposure'; }
      else if ((A.equity - lossToStop - A.floor) < A.start * 0.003) { score -= 1; obs(`A stop-out leaves only ${fmtUsd(A.equity - lossToStop - A.floor)} above the breach line.`); }
      const riskNow = Math.abs(p.entry - (p.origStop != null ? p.origStop : p.stop)) * q;
      if (A.profRisk && riskNow > A.profRisk * 1.25) { score -= 1; obs(`Planned risk ${fmtUsd(riskNow)} is over your ${A.profile.name} size of ${fmtUsd(A.profRisk)}.`); }
    }

    // 3. Structure alignment (higher timeframes)
    const S = ctx.struct || {};
    const b4 = S['240'] && S['240'].bias, b1 = S['60'] && S['60'].bias, bD = S['1440'] && S['1440'].bias;
    if (b4 === opp) { score -= 1; inf(`4h structure is ${opp === 'bull' ? 'bullish' : 'bearish'}; you are ${p.side}. Counter-trend.`); }
    if (b1 === opp) { score -= 1; inf(`1h structure is ${opp === 'bull' ? 'bullish' : 'bearish'}; you are ${p.side}.`); }
    if (b4 === want && b1 === want) inf(`1h and 4h structure agree with your ${p.side}.`);
    if (bD && bD === opp) inf(`Daily structure leans the other way (${opp}).`);

    // 4. Entry-timeframe thesis
    const es = ctx.entryStruct;
    if (es && es.last && es.last.time * 1000 > p.opened && es.last.dir === (d > 0 ? 'down' : 'up')) {
      score -= 2; obs(`${tfName(p.tf)} closed ${d > 0 ? 'below' : 'above'} swing ${fmtPx(es.last.level)} after entry (${es.last.kind}). Thesis weakened.`);
      if (cap > 1) { act('Your plan decides: exit, reduce, or hold to the original stop. Do not widen it.'); proposal = 'Reassess: structure broke against you'; }
    }

    // 5. Targets and obstacles
    const tgt = p.tp1 != null ? p.tp1 : p.tp2;
    if (tgt == null) { score -= 0.5; obs('No target logged.'); }
    const lvls = (ctx.levels || []).concat(...Object.keys(ctx.fvg || {}).map(tf => (ctx.fvg[tf] || [])
      .filter(g => g.dir === opp).map(g => ({ name: `${tfName(tf)} ${g.dir} FVG`, price: d > 0 ? g.bottom : g.top, kind: 'fvg' }))));
    const a1 = (ctx.atr && ctx.atr['60']) || 0;
    const ahead = lvls.filter(l => d > 0 ? (l.price > px * 1.0005 && (tgt == null || l.price < tgt)) : (l.price < px * 0.9995 && (tgt == null || l.price > tgt)))
      .sort((x, y) => Math.abs(x.price - px) - Math.abs(y.price - px));
    if (ahead.length && tgt != null) {
      const o = ahead[0];
      score -= 0.5;
      obs(`${o.name} at ${fmtPx(o.price)} sits between price and your target ${fmtPx(tgt)}.`);
      act(`If your playbook takes partials at the first opposing level, ${fmtPx(o.price)} is it.`);
    }

    // 6. Management rules (only his rules; nothing widens a stop)
    if (r != null) {
      obs(`Open at ${r >= 0 ? '+' : ''}${r.toFixed(2)}R (${fmtUsd(netIfClosed(p, px, ctx.now || Date.now()))} net if closed now, estimate).`);
      const stopBehindEntry = p.stop != null && (d > 0 ? p.stop < p.entry : p.stop > p.entry);
      if (r >= 1 && stopBehindEntry) {
        if (ctx.rules && ctx.rules.beAt1R) { score -= 1; act(`Your rule: stop to breakeven at +1R. Move stop to ${fmtPx(p.entry)} (plus fees).`); proposal = 'Rule-based stop adjustment'; }
        else inf('Past +1R with the stop still behind entry. Only move it if your playbook says so.');
      }
      if (r >= 1 && es && p.stop != null) {
        const sw = d > 0 ? es.swingLow : es.swingHigh;
        if (sw && sw.time * 1000 > p.opened && (d > 0 ? sw.price > p.stop && sw.price < px : sw.price < p.stop && sw.price > px)) {
          const buf = a1 * 0.1;
          const ns = d > 0 ? sw.price - buf : sw.price + buf;
          act(`Trail option (rule to evaluate): new ${tfName(p.tf)} swing ${d > 0 ? 'low' : 'high'} ${fmtPx(sw.price)} formed after entry; a stop behind it (~${fmtPx(ns)}) tightens risk.`);
        }
      }
      if (tgt != null && (d > 0 ? px >= tgt : px <= tgt)) { act(`Price reached target ${fmtPx(tgt)}. Stick to the exit plan; don't stretch the target because it's close.`); proposal = 'Target hit: follow the plan'; }
    }
    // 7. Stop sitting on an obvious swing
    if (p.stop != null && es && a1) {
      const sw = d > 0 ? es.swingLow : es.swingHigh;
      if (sw && Math.abs(p.stop - sw.price) < a1 * 0.1) inf(`Stop is right at the obvious ${tfName(p.tf)} swing ${fmtPx(sw.price)}. Sweeps often tag those. That's an observation, not a reason to widen.`);
    }
    // 8. Holding cost
    const hrs = ((ctx.now || Date.now()) - p.opened) / 3600000;
    if (hrs > 24) obs(`Held ${Math.round(hrs)}h: margin funding about ${fmtUsd(fundingEst(p.entry * q, p.opened, ctx.now || Date.now()))} so far (estimate). It counts toward both loss limits.`);

    score = Math.max(1, Math.min(cap, Math.round(score)));
    const label = ['', 'Danger', 'Weak', 'Watch', 'OK', 'Healthy'][score];
    return { score, label, items, proposal, r };
  }

  /* Ideas to watch: open FVGs in the direction of 4h bias near price. Untested ideas, not signals. */
  function setupsToWatch(sym, data, opt) {
    opt = opt || {};
    const out = [];
    const s4 = data.struct['240'], px = data.price;
    if (!s4 || px == null || s4.bias === 'range') return out;
    const want = s4.bias, a1 = data.atr['60'] || px * 0.005;
    for (const tf of ['15', '60']) {
      for (const g of (data.fvg[tf] || [])) {
        if (g.dir !== want) continue;
        const edge = want === 'bull' ? g.top : g.bottom;
        if (Math.abs(edge - px) > a1 * 2) continue;
        if (want === 'bull' && edge > px) continue;
        if (want === 'bear' && edge < px) continue;
        const sl = want === 'bull' ? g.bottom - a1 * 0.1 : g.top + a1 * 0.1;
        const st = data.struct[tf];
        // Target: nearest opposing liquidity in the profit direction (1h/4h swings, key levels).
        const pool = [];
        for (const iv of ['60', '240']) for (const s of ((data.struct[iv] || {}).swings || []).slice(-12))
          if (s.type === (want === 'bull' ? 'H' : 'L')) pool.push(s.price);
        for (const l of (data.levels || [])) pool.push(l.price);
        const minDist = Math.abs(edge - sl) * (opt.minRR || 2);
        const cands = pool.filter(p => want === 'bull' ? p >= edge + minDist : p <= edge - minDist)
          .sort((a, b) => Math.abs(a - edge) - Math.abs(b - edge));
        const tgt = cands[0];
        if (tgt == null) continue;
        const rr = Math.abs(tgt - edge) / Math.abs(edge - sl);
        if (!(rr >= (opt.minRR || 2))) continue;
        out.push({ sym, tf, dir: want === 'bull' ? 'long' : 'short', entry: edge, stop: sl, target: tgt, rr,
          aligned1h: data.struct['60'] && data.struct['60'].bias === want, entryTfBias: st && st.bias,
          text: `${tfName(tf)} ${want} FVG ${fmtPx(g.bottom)}–${fmtPx(g.top)} with 4h ${want}. Retest entry ~${fmtPx(edge)}, stop ${fmtPx(sl)}, target next liquidity ${fmtPx(tgt)} (${rr.toFixed(1)}R).` });
      }
    }
    return out.sort((a, b) => Math.abs(a.entry - px) - Math.abs(b.entry - px)).slice(0, 4);
  }

  /* Entry check: a setup is READY only when every rule passes. Returns each setup with its checklist.
     Rules (owner's playbook, v1): 4h trending; 1h agrees with 4h; 15m agrees (bias or last break);
     open FVG in that direction with >= minRR to the next liquidity; price at the zone now (within 0.25 x 1h ATR);
     account allows a trade (risk known, room >= one profile trade, under max trades, under the loss stop);
     no open position the other way on this coin; not within 30 min before the daily reset.
     Untested idea, not a signal: no backtest yet. */
  function entryCheck(sym, data, A, positions, nowMs, opt) {
    opt = opt || {};
    const ups = setupsToWatch(sym, data, { minRR: opt.minRR || 2 });
    const s4 = data.struct['240'], s1 = data.struct['60'], s15 = data.struct['15'], a1 = data.atr['60'] || 0;
    const out = [];
    for (const u of ups) {
      const want = u.dir === 'long' ? 'bull' : 'bear';
      const rules = [];
      const R = (ok, t) => rules.push({ ok: !!ok, t });
      R(s4 && s4.bias === want, '4h structure ' + (s4 ? s4.bias : '?'));
      R(s1 && s1.bias === want, '1h agrees with 4h');
      R(s15 && (s15.bias === want || (s15.last && s15.last.dir === (want === 'bull' ? 'up' : 'down'))), '15m agrees');
      R(u.rr >= (opt.minRR || 2), `${u.rr.toFixed(1)}R to next liquidity`);
      R(data.price != null && Math.abs(data.price - u.entry) <= Math.max(a1 * 0.25, data.price * 0.0005), 'price at the zone now');
      R(A && A.riskKnown, 'all open positions have stops');
      R(A && A.room >= A.profRisk, 'room for one ' + (A ? A.profile.name : '') + ' trade');
      R(A && A.tradesToday < A.profile.maxTrades, 'under max trades today');
      R(A && A.lossesToday < A.profile.stopAfterLosses, 'under the daily loss stop');
      R(!positions.some(p => !p.closed && p.sym === sym && p.side !== u.dir && openQty(p) > 0), 'no open position the other way');
      R(A && A.nextReset - nowMs > 30 * 60000, 'not in the 30 min before reset');
      const ready = rules.every(r => r.ok);
      const size = ready && A ? sizeFor({ sym, entry: u.entry, stop: u.stop, risk: A.nextRisk, equity: A.equity, usedMargin: A.usedMargin, symNotional: A.openBySym[sym] || 0, leverage: opt.leverage }) : null;
      out.push(Object.assign({}, u, { rules, ready, size, key: [sym, u.tf, u.dir, Math.round(u.entry)].join('|') }));
    }
    return out;
  }

  /* Heikin Ashi (display only, never used for analysis): HAclose = (O+H+L+C)/4; HAopen = (prev HAopen + prev HAclose)/2,
     first HAopen = (O+C)/2; HAhigh = max(H, HAopen, HAclose); HAlow = min(L, HAopen, HAclose). */
  function heikinAshi(c) {
    const out = [];
    for (let i = 0; i < c.length; i++) {
      const x = c[i], cl = (x.open + x.high + x.low + x.close) / 4;
      const op = i ? (out[i - 1].open + out[i - 1].close) / 2 : (x.open + x.close) / 2;
      out.push({ time: x.time, open: op, close: cl, high: Math.max(x.high, op, cl), low: Math.min(x.low, op, cl) });
    }
    return out;
  }
  /* EMA with SMA seed: k = 2/(n+1); first value at index n-1 = average of first n closes. */
  function ema(c, n) {
    const out = [], k = 2 / (n + 1);
    if (c.length < n) return out;
    let e = c.slice(0, n).reduce((a, x) => a + x.close, 0) / n;
    out.push({ time: c[n - 1].time, value: e });
    for (let i = n; i < c.length; i++) { e = c[i].close * k + e * (1 - k); out.push({ time: c[i].time, value: e }); }
    return out;
  }

  // ---- Formatting --------------------------------------------------------
  function fmtUsd(x) {
    if (x == null || !isFinite(x)) return '—';
    const s = Math.abs(x) >= 1000 ? Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 }) : Math.abs(x).toFixed(2);
    return (x < 0 ? '-$' : '$') + s;
  }
  function fmtPx(x) {
    if (x == null || !isFinite(x)) return '—';
    const a = Math.abs(x);
    const dp = a >= 1000 ? 1 : a >= 10 ? 2 : a >= 1 ? 4 : 5;
    return x.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  const tfName = tf => ({ '1': '1m', '5': '5m', '15': '15m', '60': '1h', '240': '4h', '1440': '1D' }[String(tf)] || tf + 'm');

  const Core = { parseResetUtc, heikinAshi, ema, entryCheck, accountReview, parseIsoUtc, propEstimate, consensus, calibration, parseKrakenProp, sizeFromLimits, PLANS, SIZES, FEES, CAPITAL_CAP, ADDON_90, LEVERAGE, MAX_NOTIONAL, maxNotional, parseRulePct, ledger, feeEvents, rollovers, PROFILES, SESSIONS, profileById, lastReset, nextReset,
    tzParts, base, levCap, qtyDp, openQty, grossPnl, fundingEst, openFeesPaid, netIfClosed, realizedFor, rMultiple,
    realizedOfPos, planOf, accountState, deskTotals, sizeFor, atr, swings, structure, fvgs, liveFvgs, vwapSince,
    sessionRanges, openingRange, keyLevels, health, setupsToWatch, fmtUsd, fmtPx, tfName };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core; else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
