/* Prop Desk app: Chart, Desk, Positions, Coach, Settings. Accounts and balances stay in this browser.
   Optional shared-pool uploads wait for the consent choice. Read-only: nothing here places orders or talks to an exchange. */
(function () {
  'use strict';
  const C = window.Core, F = window.Feed;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const num = v => (v === '' || v == null || isNaN(+v) ? null : +v);
  const usd = C.fmtUsd, px = C.fmtPx;

  // ---------- State ----------
  const KEY = 'kpd_v1';
  const DEF = { accounts: [], positions: [], settings: { tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })(), orbAnchor: 'ny', orbMin: 15, beAt1R: false,
    symbols: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD'], sym: 'BTC/USD', tf: 15, layers: { levels: true, fvg: true, sessions: true, orb: true, pos: true },
    budget: 0, notify: false, maxAge: 90, priceBasis: 'usdt', v: 3, theme: 'green', hue: 135, scan: true, glow: true, chartStyle: 'tv', view: 'advanced' } };
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
  const savedV = (S.settings && S.settings.v) || 0;
  S = Object.assign({ calib: [], paper: [] }, DEF, S); if (!Array.isArray(S.calib)) S.calib = []; if (!Array.isArray(S.paper)) S.paper = []; if (!Array.isArray(S.paperAccts)) S.paperAccts = []; if (!Array.isArray(S.planned)) S.planned = []; if (!S.usedSetups || typeof S.usedSetups !== 'object') S.usedSetups = {}; S.settings = Object.assign({}, DEF.settings, S.settings || {});
  S.settings.layers = Object.assign({}, DEF.settings.layers, S.settings.layers || {});
  if (savedV < 2) { S.settings.priceBasis = 'usdt'; S.settings.v = 2; }
  // v3: shared defaults contain no private repo destination; the monitor repo is device-local, not backup state.
  if (savedV < 3) S.settings.v = 3;
  const save = () => { try { C.scrubMonitorConfig(S); localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };
  // Older saves used the previous names. Copy them once so nothing already on this phone is lost.
  (function migrateSaved() {
    let changed = false;
    if (C.scrubMonitorConfig(S)) changed = true;
    if (S.settings.orbAnchor === 'kraken') { S.settings.orbAnchor = 'exchange'; changed = true; }
    const rows = (S.positions || []).concat(S.planned || []);
    for (const p of rows) {
      if (p.krakenSL != null && p.platformSL == null) { p.platformSL = p.krakenSL; changed = true; }
      if (p.krakenTP != null && p.platformTP == null) { p.platformTP = p.krakenTP; changed = true; }
      if ('krakenSL' in p) { delete p.krakenSL; changed = true; }
      if ('krakenTP' in p) { delete p.krakenTP; changed = true; }
      if (typeof p.source === 'string' && p.source.indexOf('kraken-') === 0) { p.source = 'screen-' + p.source.slice('kraken-'.length); changed = true; }
    }
    if (changed) save();
  })();
  const saveAndSync = r => { save(); if (typeof autoPush === 'function') autoPush(r); };
  const T = () => S.settings;

  // ---------- Themes (Pip-Boy style: one phosphor color on black, or Classic) ----------
  const THEMES = [
    { id: 'classic', name: 'Classic' }, { id: 'green', name: 'Pip-Boy', hue: 135 }, { id: 'amber', name: 'Amber', hue: 38 },
    { id: 'blue', name: 'Blue', hue: 195 }, { id: 'white', name: 'White', hue: 0, sat: 0 }, { id: 'pink', name: 'Pink', hue: 320 }, { id: 'custom', name: 'Custom' },
    { id: 'vault', name: 'Vault' }, { id: 'wasteland', name: 'Wasteland' }, { id: 'wastday', name: 'Day' }];
  const Th = window.Theme;
  let PAL = {};
  const hexOk = h => /^#[0-9a-f]{6}$/i.test(h || '');
  /* Saved Pip-Boy themes keep their hue. A preset stores an exact hex until the slider moves. */
  function accentNow(t) {
    if (t.id === 'vault') return hexOk(T().accent) ? T().accent : '#ffc200';
    if (t.id === 'wasteland' || t.id === 'wastday') return hexOk(T().accent) ? T().accent : '#e8a33a';
    if (t.id === 'custom' && hexOk(T().accent)) return T().accent;
    const h = t.id === 'custom' ? (+T().hue || 0) : t.hue, sat = t.sat != null ? t.sat : 100;
    return Th.hslToHex(h, sat, 62);
  }
  function themeColors() {
    const t = THEMES.find(x => x.id === T().theme) || THEMES[1];
    if (t.id === 'classic') return { mode: 'classic', bg: '#000000', card: '#0b0d10', line: '#1e2630', tx: '#d6dde6', mu: '#8696a8', acc: '#5b9cff', up: '#26a69a', dn: '#ef5350',
      upFill: 'rgba(38,166,154,.16)', dnFill: 'rgba(239,83,80,.16)', day: '#8fa3bf', week: '#b18cff', open: '#6e7f94', vwap: '#e3b341', session: '#4d6a8a', orb: '#f778ba', entry: '#5b9cff', tp: '#3fb950', hollow: false, glow: 'none' };
    const accent = accentNow(t);
    if (t.id === 'vault' || t.id === 'wasteland' || t.id === 'wastday') {
      const base = t.id === 'vault' ? Th.VAULT : t.id === 'wastday' ? Th.WASTE_DAY : Th.WASTE;
      const mode = t.id === 'vault' ? 'vault' : t.id === 'wastday' ? 'wastday' : 'waste';
      return { mode, bg: base.bg, card: base.card, line: base.line, tx: base.tx, mu: base.mu, acc: accent,
        up: '#26a69a', dn: '#ef5350', upFill: 'rgba(38,166,154,.16)', dnFill: 'rgba(239,83,80,.16)', day: base.mu, week: accent, open: base.line, vwap: accent, session: base.line, orb: accent, entry: accent, tp: Th.GAIN, hollow: false,
        glow: T().glow === false ? 'none' : `0 0 6px ${accent}` };
    }
    const p = Th.pipFromAccent(accent), rgb = Th.hexToRgb(accent).join(',');
    return { mode: 'pip', bg: p.bg, card: p.card, line: p.line, tx: p.tx, mu: p.mu, acc: p.acc, up: p.acc, dn: p.acc,
      upFill: `rgba(${rgb},.14)`, dnFill: `rgba(${rgb},.07)`, day: p.mu, week: p.tx, open: p.line, vwap: p.tx, session: p.line, orb: p.tx, entry: p.tx, tp: p.acc, hollow: true,
      glow: T().glow === false ? 'none' : `0 0 6px ${p.glow}` };
  }
  // Text contrast (owner, Nov 2): brighten text toward white and darken cards, or make all text white. Gains/losses stay green/red and
  // danger/caution stay red/yellow in every setting (owner's rule).
  const toHex = c => { try { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000'; x.fillStyle = c; return /^#[0-9a-f]{6}$/i.test(x.fillStyle) ? x.fillStyle : null; } catch (e) { return null; } };
  const mixHex = (a, b, k) => { const A = toHex(a), B = toHex(b); if (!A || !B) return a; const h = (s, i) => parseInt(s.slice(i, i + 2), 16);
    return '#' + [1, 3, 5].map(i => Math.round(h(A, i) + (h(B, i) - h(A, i)) * k).toString(16).padStart(2, '0')).join(''); };
  function applyTheme() {
    PAL = themeColors();
    const boost = Math.max(0, Math.min(100, +T().textBoost || 0)) / 100;
    if (T().textWhite) Object.assign(PAL, { tx: '#ffffff', mu: '#ffffff' });
    else if (boost) Object.assign(PAL, { tx: mixHex(PAL.tx, '#ffffff', boost), mu: mixHex(PAL.mu, '#ffffff', boost * 0.85) });
    if (boost) Object.assign(PAL, { card: mixHex(PAL.card, '#000000', boost * 0.7) });
    if (T().chartStyle !== 'theme') Object.assign(PAL, { up: '#26a69a', dn: '#ef5350', upFill: 'rgba(38,166,154,.16)', dnFill: 'rgba(239,83,80,.16)', day: '#8fa3bf', week: '#b18cff',
      open: '#6e7f94', vwap: '#e3b341', session: '#4d6a8a', orb: '#f778ba', entry: '#5b9cff', tp: '#3fb950', hollow: false, chartBg: '#000000', chartTx: '#c9d1d9', chartGrid: '#11161d', chartLine: '#1e2630' });
    else Object.assign(PAL, { chartBg: PAL.bg, chartTx: PAL.tx, chartGrid: PAL.card, chartLine: PAL.line });
    if (T().textWhite) PAL.chartTx = '#ffffff'; else if (boost) PAL.chartTx = mixHex(PAL.chartTx, '#ffffff', boost);
    const simple = C.uiView(T().view) === 'simple';
    // Simple changes layout only. Colors come from the same Settings theme in both views.
    const r = document.documentElement, st = r.style;
    r.dataset.ui = simple ? 'simple' : 'advanced';
    r.dataset.mode = PAL.mode;
    r.dataset.scan = PAL.mode !== 'classic' && T().scan ? 'on' : 'off';
    r.dataset.flicker = T().flicker ? 'on' : 'off';
    r.dataset.grain = T().grain ? 'on' : 'off';
    r.dataset.sweep = T().sweep ? 'on' : 'off';
    r.dataset.glow = PAL.mode !== 'classic' && T().glow !== false ? 'on' : 'off';
    document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === (simple ? 'simple' : 'advanced')));
    const impQ = $('#impHelp'); if (impQ) impQ.hidden = !simple;
    const panels = document.querySelector('#tab-chart > .grid2'); if (panels) panels.hidden = simple;
    // Gains and losses stay green and red in every theme. Glow is headings only, so --glow on the body stays off.
    for (const [k, v] of [['--bg', PAL.bg], ['--card', PAL.card], ['--line', PAL.line], ['--tx', PAL.tx], ['--mu', PAL.mu], ['--acc', PAL.acc], ['--up', Th.GAIN], ['--dn', Th.LOSS], ['--glow', 'none']]) st.setProperty(k, v);
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = PAL.bg || '#000000';
    if (chart) {
      chart.applyOptions({ layout: { background: { type: 'solid', color: PAL.chartBg }, textColor: PAL.chartTx }, grid: { vertLines: { color: PAL.chartGrid }, horzLines: { color: PAL.chartGrid } },
        rightPriceScale: { borderColor: PAL.chartLine }, timeScale: { borderColor: PAL.chartLine } });
      makeSeries(T().ctype || 'candles');
      lastDataKey = ''; if (tab !== 'set') renderAll(true);
    }
  }

  // ---------- Helpers ----------
  const fmtTime = (ms, withDate) => new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: T().tz, hour: 'numeric', minute: '2-digit' },
    withDate ? { month: 'short', day: 'numeric' } : {})).format(new Date(ms));
  const acctById = id => S.accounts.find(a => a.id === id);
  // P&L price: the prop platform values positions at a MARK price (the exchange: Available Markets). We use the
  // the futures feed perp mark when fresh; else the spot feed, labeled. Stale = unknown (never a number).
  function pnlQuote(sym) {
    const mx = T().maxAge;
    const b = T().priceBasis, markOk = F.mark(sym) != null && F.markAge(sym) <= mx;
    if (b === 'usdt' && markOk && F.price('USDT/USD') != null && F.age('USDT/USD') <= 600) {
      const est = C.propEstimate(F.mark(sym), F.price('USDT/USD'));
      if (est != null) { const k = C.calibration(S.calib, sym, Date.now());
        return { price: est * (1 + k.bps / 1e4), raw: est, age: F.markAge(sym), basis: k.n ? `Prop estimate (calibrated ×${k.n})` : 'Prop estimate (uncalibrated)' }; }
    }
    if ((b === 'mark' || b === 'usdt') && markOk) return { price: F.mark(sym), age: F.markAge(sym), basis: b === 'usdt' ? 'perp mark (USDT price missing)' : 'perp mark' };
    if (F.price(sym) != null && F.age(sym) <= mx) return { price: F.price(sym), age: F.age(sym), basis: b === 'spot' ? 'the spot feed' : 'the spot feed (mark unavailable)' };
    return { price: null, age: F.age(sym), basis: 'none (stale or missing)' };
  }
  const pnlPrice = sym => pnlQuote(sym).price;
  const prices = () => { const o = {}; for (const s of allSyms()) { const p = pnlPrice(s); if (p != null) o[s] = p; } return o; };
  const allSyms = () => [...new Set(T().symbols.concat(S.positions.filter(p => !p.closed).map(p => p.sym)))];
  const liveAccts = () => S.accounts.filter(a => a.phase === 'eval' || a.phase === 'funded');
  function showModal(html) { $('#modalCard').innerHTML = html; $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modalCard').innerHTML = ''; }
  $('#modal').addEventListener('click', e => {
    const consent = $('#modalCard').querySelector('[data-consent]');
    if (consent) return;   // the sharing choice stays up until a button is pressed
    if (e.target.id === 'modal' || e.target.dataset.close != null) closeModal();
  });
  const pct = (x, dp) => (x == null || !isFinite(x) ? '—' : (x * 100).toFixed(dp == null ? 2 : dp) + '%');
  const cls = x => (x > 0 ? 'up' : x < 0 ? 'dn' : '');
  /* P&L keeps a sign and an arrow so green/red is never the only cue. */
  const pnlTxt = x => (x == null || !isFinite(+x) ? '—' : (x > 0 ? '▲ +' : x < 0 ? '▼ ' : '') + usd(x));

  // ---------- Analysis cache per symbol ----------
  function analyze(sym) {
    const c = iv => F.candles(sym, iv);
    const struct = {}, fvg = {}, at = {};
    for (const iv of [15, 60, 240, 1440]) { const cc = c(iv); if (cc.length > 10) struct[iv] = C.structure(cc); }
    for (const iv of [15, 60, 240]) { const cc = c(iv); if (cc.length > 20) fvg[iv] = C.liveFvgs(cc, 6); }
    for (const iv of [5, 15, 60, 240]) { const cc = c(iv); if (cc.length > 15) at[iv] = C.atr(cc.slice(0, -1), 14); }
    const intr = c(5).length ? c(5) : c(15);
    const levels = C.keyLevels(c(1440), intr, { tz: 'America/New_York', orbAnchor: T().orbAnchor, orbMin: T().orbMin });
    const orb = intr.length ? C.openingRange(intr, T().orbAnchor, T().orbMin) : null;
    const sessions = intr.length ? C.sessionRanges(intr, 'America/New_York') : {};
    const q = pnlQuote(sym), price = q.price, ageSec = q.price != null ? q.age : null;
    const impulse = {}; for (const iv of [15, 60, 240]) { const cc = c(iv); if (cc.length > 40) impulse[iv] = C.impulseLegs(cc, { price }); }
    return { sym, struct, fvg, atr: at, levels, orb, sessions, price, ageSec, impulse, c: { 15: c(15), 60: c(60) } };
  }

  // ---------- Header ----------
  function renderHeader() {
    const sym = T().sym, age = F.age(sym);
    const pill = $('#feedPill');
    let st = F.status === 'live' && age != null && age < 30 ? 'live' : (F.status === 'demo' ? 'bad' : (age != null && age < T().maxAge ? 'stale' : 'bad'));
    pill.className = 'feed ' + st;
    const mk = F.mark(sym), sp = F.price(sym);
    const pe = C.propEstimate(mk, F.price('USDT/USD'));
    pill.textContent = `${F.source} · ${sym} ${px(sp)} · ${age == null ? 'no data' : Math.round(age) + 's ago'}` + (mk != null ? ` · mark ${px(mk)}` : ' · mark —') + (pe != null ? ` · Prop est ${px(pe)}` : '');
    const ra = liveAccts()[0], nr = C.nextReset(Date.now(), ra && ra.resetMin), left = nr - Date.now();
    $('#resetPill').textContent = `Daily reset ${fmtTime(nr)} (${Math.floor(left / 3600000)}h ${Math.floor(left / 60000) % 60}m)`;
    const mon = $('#monStatus');
    if (C.uiView(T().view) === 'simple' && mon && !mon.textContent) mon.textContent = S.lastPush ? ('Updated ' + fmtTime(S.lastPush, true)) : 'Not sent yet';
    const b = $('#banner');
    const csH = C.consensus(F.sources(sym), 60, 15);
    const note = F.note || (csH.outliers.length ? `Price check: ${csH.outliers.join(', ')} differs from the other feeds by more than 0.15%. Numbers may be off.` : '');
    if (note) { b.hidden = false; b.textContent = note; b.className = 'banner' + (F.demo ? ' demo' : ''); } else b.hidden = true;
  }
  $('#refreshBtn').onclick = async () => { $('#refreshBtn').textContent = '↻ …'; await F.refresh(); await ensureFeeds(); $('#refreshBtn').textContent = '↻ Refresh'; renderAll(true); };
  /* Keep the phone frame the size of the visible screen (toolbar, keyboard, rotation).
     top is a length, not a transform: a transform on body would trap fixed dialogs. */
  function fitViewport() {
    if (window.matchMedia('(min-width:900px)').matches) {
      document.documentElement.style.removeProperty('--app-h');
      document.documentElement.style.removeProperty('--app-top');
      document.documentElement.style.removeProperty('--chart-vp-h');
      document.documentElement.style.removeProperty('--chart-vp-top');
      return;
    }
    const vv = window.visualViewport;
    const ih = window.innerHeight || 0;
    const sh = (window.screen && window.screen.height) || 0;
    const focused = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    let h = ih, top = 0;
    let chartH = vv && vv.height ? vv.height : (ih || sh);
    let chartTop = vv && Number.isFinite(vv.offsetTop) ? vv.offsetTop : 0;
    if (vv && vv.height) {
      if (focused) { h = vv.height; top = vv.offsetTop || 0; }
      else h = Math.max(vv.height, ih);
    }
    // iOS often reports a short visual viewport right after the app is resumed. In the home-screen app, fill the screen instead of leaving a gap under the tab bar.
    if (!focused && standalone && sh && h && h < sh * 0.85) { h = sh; top = 0; }
    if (!focused && standalone && sh && chartH && chartH < sh * 0.85) { chartH = sh; chartTop = 0; }
    document.documentElement.style.setProperty('--app-h', Math.round(h || ih || sh) + 'px');
    document.documentElement.style.setProperty('--app-top', Math.round(top) + 'px');
    document.documentElement.style.setProperty('--chart-vp-h', Math.round(chartH || ih || sh) + 'px');
    document.documentElement.style.setProperty('--chart-vp-top', Math.round(chartTop) + 'px');
  }
  let chartApi = null, frameToken = 0;
  function sizeChart() {
    if (!chartApi) return;
    const box = document.getElementById('chartWrap');
    if (!box) return;
    const r = box.getBoundingClientRect();
    let w = Math.round(r.width), h = Math.round(r.height);
    if (w < 120) w = Math.min(window.innerWidth - 24, 1100);
    if (h < 80) h = Math.max(340, Math.round(window.innerHeight * 0.55));
    const el = document.getElementById('chart');
    if (el) { el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.minWidth = w + 'px'; }
    try {
      chartApi.resize(w, h);
      chartApi.applyOptions({ width: w, height: h });
      chartApi.priceScale('right').applyOptions({ visible: true, borderVisible: true });
      chartApi.timeScale().applyOptions({ visible: true, borderVisible: true, timeVisible: true });
    } catch (e) { }
    try { drawOverlay(); } catch (e) { }
  }
  function scheduleFrame() {
    const token = ++frameToken;
    const run = () => { if (token !== frameToken) return; fitViewport(); sizeChart(); };
    run();
    requestAnimationFrame(run);
    setTimeout(run, 120);
    setTimeout(run, 500);
  }
  scheduleFrame();
  window.addEventListener('resize', scheduleFrame);
  window.addEventListener('orientationchange', scheduleFrame);
  window.addEventListener('focus', scheduleFrame);
  if (window.visualViewport) { visualViewport.addEventListener('resize', scheduleFrame); visualViewport.addEventListener('scroll', scheduleFrame); }
  document.addEventListener('focusin', e => {
    const el = e.target; if (!el || !el.closest || !el.closest('main')) return;
    setTimeout(() => { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (err) { } }, 80);
  });
  $('#viewSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !b.dataset.view) return;
    const next = C.uiView(b.dataset.view); if (T().view === next) return;
    T().view = next; save(); applyTheme();
  });
  if ($('#impHelp')) $('#impHelp').onclick = () => showModal(`<h3>Add trades from a screenshot</h3><div class=small>${$('#impExplain').innerHTML}</div><div class=row style="margin-top:10px"><button class="btn" data-close>Close</button></div>`);

  // ---------- Tabs ----------
  let tab = 'chart';
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    tab = b.dataset.tab; posFormDirty = true;
    document.querySelectorAll('#tabs .tabrow button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.id === 'tab-' + tab)); if (tab === 'chart') setTimeout(sizeChart, 50);
    renderAll(true);
  });
  function sectionLabel(h) {
    const n = [...h.childNodes].find(x => x.nodeType === 3 && x.textContent.trim());
    return (n ? n.textContent : h.textContent).replace(/\s+/g, ' ').trim().slice(0, 18);
  }
  function refreshSub() {
    const bar = $('#subtabs');
    if (bar) { bar.hidden = true; bar.innerHTML = ''; }
  }
  $('#subtabs').onclick = e => {
    const b = e.target.closest('[data-jump]'); if (!b) return;
    const el = document.getElementById(b.dataset.jump), main = document.querySelector('main');
    if (!el || !main) return;
    [...b.parentElement.children].forEach(x => x.classList.toggle('on', x === b));
    main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - 6;
  };

  // ---------- Updates reach every phone (owner's choice, Nov 1 2026) ----------
  // Every 30 min and whenever the app comes back to the screen, compare the app's code on the server with the copy that
  // loaded. If the model or app changed, show "new version ready"; tapping reloads. Never reloads by itself mid-trade.
  const CODE_FILES = ['js/core.js', 'js/app.js', 'js/help.js'];
  let codeSig = null;
  async function codeSignature() { let sig = ''; for (const f of CODE_FILES) { const r = await fetch(f, { cache: 'no-store' }); if (!r.ok) return null; sig += C.fnv(await r.text()); } return sig; }
  async function checkUpdate() {
    if (F.demo) return;
    try { const sig = await codeSignature(); if (!sig) return; if (codeSig == null) codeSig = sig; else if (sig !== codeSig) $('#updBar').hidden = false; } catch (e) { }
  }
  $('#updBar').onclick = () => location.reload();
  checkUpdate(); setInterval(checkUpdate, 30 * 60e3);
  // Coming back to the app (owner, Nov 2: the prop platform's chart goes stale after you leave it; ours must not). After 30 s+ away, or when
  // the connection comes back, reload the candle history for everything watched and reconnect, so no candles are missing.
  let hiddenAt = 0, lastCatchUp = 0;
  const catchUp = why => { if (F.demo || Date.now() - lastCatchUp < 60000) return;   /* at most once a minute (the exchange REST limits) */ lastCatchUp = Date.now(); F.refresh().then(() => renderAll(true)).catch(e => console.warn('catch-up', why, e)); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    scheduleFrame();
    checkUpdate();
    if (hiddenAt && Date.now() - hiddenAt >= 30000) catchUp('back in app');
    hiddenAt = 0;
  });
  window.addEventListener('pageshow', e => { scheduleFrame(); if (e.persisted) catchUp('restored page'); });
  window.addEventListener('online', () => catchUp('back online'));

  // ---------- Help + questions (owner's choice, Nov 1 2026) ----------
  // Questions and comments go to the repo's GitHub Issues, prefilled; nothing is sent until the user submits it there.
  let FEEDBACK_HOME = 'https://github.com/jbyerstemp-jpg/prop-desk';
  const FEEDBACK_PUBLIC = /\/prop-desk$/.test(FEEDBACK_HOME);
  $('#helpBtn').onclick = () => switchTab('help');
  function renderHelp() {
    $('#helpBox').innerHTML = PDHelp.helpHtml();
    $('#fbNote').textContent = FEEDBACK_PUBLIC ? 'Questions on GitHub are public: never include balances, account numbers or keys.' : 'Goes to your private repo\'s Issues (only you can see them).';
    $('#fbBtn').onclick = () => {
      showModal(`<h3>Question or comment</h3>
        <label class=small>Type<select id=fbKind><option>Question</option><option>Idea</option><option>Problem</option></select></label>
        <label class=small style="display:block;margin-top:8px">Message<textarea id=fbMsg rows=6 style="width:100%" placeholder="What happened, or what would make the app easier?"></textarea></label>
        <label class=chk><input type=checkbox id=fbDev checked> Add device info (screen size, browser, open tab; no account data)</label>
        <p class="small mu">${FEEDBACK_PUBLIC ? 'Opens GitHub with this filled in; you press Submit there. It is public: leave out balances and account numbers.' : 'Opens your private repo\'s Issues with this filled in; press Submit there.'}</p>
        <div class=row><button class="btn pri" id=fbGo>Open on GitHub</button><button class=btn id=fbCopy>Copy text</button><button class=btn id=fbX>Close</button></div><p class=small id=fbStat></p>`);
      const body = () => $('#fbMsg').value.trim() + ($('#fbDev').checked ? `\n\n---\nScreen ${innerWidth}x${innerHeight} · ${navigator.userAgent.replace(/[^\x20-\x7E]/g, '').slice(0, 160)}` : '');
      $('#fbX').onclick = closeModal;
      $('#fbCopy').onclick = async () => { try { await navigator.clipboard.writeText(body()); $('#fbStat').textContent = 'Copied.'; } catch (e) { $('#fbStat').textContent = 'Copy failed: select the text and copy it.'; } };
      $('#fbGo').onclick = async () => {
        const msg = $('#fbMsg').value.trim(); if (!msg) { $('#fbStat').textContent = 'Type a message first.'; return; }
        const L = C.issueLink(FEEDBACK_HOME.replace('https://github.com/', ''), `[${$('#fbKind').value}] ${msg.split('\n')[0].slice(0, 70)}`, body());
        if (!L) return;
        if (!L.fits) { try { await navigator.clipboard.writeText(body()); } catch (e) { } }
        window.open(L.url, '_blank', 'noopener'); $('#fbStat').textContent = L.fits ? 'Opened GitHub. Press Submit there.' : 'Long message: copied. Paste it on the GitHub page, then Submit.';
      };
    };
  }
  renderHelp();

  // ---------- Chart ----------
  const TFS = [1, 5, 15, 60, 240, 1440];   // 1m is for watching price move (chart only: no setups, alerts or replay use it)
  const LAYERS = { levels: 'Day/week levels', vwap: 'VWAP', sessions: 'Sessions', orb: 'Opening range', fvg: 'Fair value gaps', marks: 'BOS / CHoCH marks', fib: 'Impulse legs + fib retracements',
    pos: 'My trades and orders (entry/stop/target)', paperStops: 'Paper trade stops (ticked paper trades)', openR: 'Open R next to entries', ema9: 'EMA 9', ema21: 'EMA 21', ema50: 'EMA 50', ema200: 'EMA 200', volume: 'Volume' };
  // One switch for every indicator (owner, Nov 3 2026): off hides them all without losing which ones he had on; on brings them back as they were.
  const ALL_OFF = Object.fromEntries(Object.keys(LAYERS).map(k => [k, false])), LY = () => T().indOff ? ALL_OFF : T().layers;
  const LAYER_DEF = { openR: true, paperStops: true, fib: true, levels: true, vwap: true, sessions: true, orb: true, fvg: true, marks: true, pos: true, ema9: false, ema21: false, ema50: false, ema200: false, volume: false };
  const CTYPES = { candles: 'Candles', hollow: 'Hollow candles', heikin: 'Heikin Ashi', bars: 'Bars (OHLC)', line: 'Line', area: 'Area' };
  const EMA_COL = { ema9: '#f0b90b', ema21: '#2962ff', ema50: '#e040fb', ema200: '#ff9800' };
  let extra = {}, curType = null;
  let chart, series, priceLines = [], lastDataKey = '';
  function initChart() {
    $('#symSel').innerHTML = T().symbols.map(s => `<option ${s === T().sym ? 'selected' : ''}>${esc(s)}</option>`).join('');
    $('#tfSeg').innerHTML = TFS.map(tf => `<button data-tf="${tf}" class="${tf === T().tf ? 'on' : ''}"${tf === 1 ? ' title="1-minute candles (the exchange, last 12 h). For watching price only: setups, alerts and tests do not use 1m."' : ''}>${C.tfName(tf)}</button>`).join('');
    for (const k in LAYER_DEF) if (T().layers[k] === undefined) T().layers[k] = LAYER_DEF[k];
    $('#layerSeg').innerHTML = `<select id=ctypeSel aria-label="Chart type">${Object.keys(CTYPES).map(k => `<option value="${k}" ${k === (T().ctype || 'candles') ? 'selected' : ''}>${CTYPES[k]}</option>`).join('')}</select>
      <button class="btn sm" id=indBtn>Indicators (${T().indOff ? 'off' : Object.keys(LAYERS).filter(k => T().layers[k]).length})</button>
      <label class="chk small" style="display:inline-flex;gap:4px;align-items:center"><input type=checkbox id=indAll ${T().indOff ? '' : 'checked'}> All on</label>`;
    if (chart) return;
    const el = $('#chart');
    const tzFmt = t => new Intl.DateTimeFormat('en-US', { timeZone: T().tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t * 1000));
    const box0 = document.getElementById('chartWrap');
    const initW = box0 ? Math.max(box0.clientWidth || 0, window.innerWidth - 32) : window.innerWidth - 32;
    const initH = box0 ? Math.max(box0.clientHeight || 0, 340) : 340;
    chart = LightweightCharts.createChart(el, {
      width: initW, height: initH,
      layout: { background: { type: 'solid', color: PAL.bg }, textColor: PAL.tx, fontSize: 11 },
      grid: { vertLines: { color: PAL.card }, horzLines: { color: PAL.card } },
      rightPriceScale: { borderColor: PAL.line },
      timeScale: { borderColor: PAL.line, timeVisible: true, secondsVisible: false,
        tickMarkFormatter: (t, type) => new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: T().tz },
          type <= 2 ? { month: 'short', day: 'numeric' } : { hour: 'numeric', minute: '2-digit' })).format(new Date(t * 1000)) },
      localization: { timeFormatter: tzFmt },
      crosshair: { mode: 0 }
    });
    makeSeries(T().ctype || 'candles');
    chartApi = chart;
    chart.subscribeClick(p => missClick(p));
    chart.timeScale().subscribeVisibleTimeRangeChange(drawOverlay);
    const box = document.getElementById('chartWrap') || el;
    if (window.ResizeObserver) new ResizeObserver(() => sizeChart()).observe(box);
    sizeChart();
  }
  $('#symSel').onchange = e => { T().sym = e.target.value; save(); lastDataKey = ''; ensureFeeds(); renderAll(true); };
  $('#tfSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; T().tf = +b.dataset.tf; save(); lastDataKey = ''; initChart(); ensureFeeds(); renderAll(true); };
  $('#layerSeg').onchange = e => { if (e.target.id === 'ctypeSel') { T().ctype = e.target.value; save(); lastDataKey = ''; renderChart(true); }
    if (e.target.id === 'indAll') { T().indOff = !e.target.checked; save(); initChart(); lastDataKey = ''; renderChart(true); } };
  $('#layerSeg').onclick = e => { if (e.target.id !== 'indBtn') return;
    showModal(`<h3>Indicators</h3><div class=form><label class=chk><input type=checkbox id=indAllM ${T().indOff ? '' : 'checked'}> <b>All indicators on</b> (untick to hide every one; tick to bring back the ones you had)</label>${Object.keys(LAYERS).map(k => `<label class=chk><input type=checkbox data-lay="${k}" ${T().layers[k] ? 'checked' : ''}> ${esc(LAYERS[k])}</label>`).join('')}</div><div class=row style="margin-top:10px"><button class="btn pri" data-close>Done</button></div>`);
    $('#indAllM').onchange = e => { T().indOff = !e.target.checked; save(); initChart(); lastDataKey = ''; renderChart(true); };
    document.querySelectorAll('[data-lay]').forEach(x => x.onchange = () => { T().layers[x.dataset.lay] = x.checked; save(); initChart(); lastDataKey = ''; renderChart(true); }); };

  // Full screen: real fullscreen where supported, CSS fill on iPhone.
  const wrap = $('#chartWrap');
  // Keep the screen on while the chart is full screen (owner, Nov 2): Screen Wake Lock API. The phone drops the lock when the app goes
  // to the background, so it's taken again on return while still full screen. Where it isn't supported, say so instead of pretending.
  let wakeLock = null;
  const wakeMsg = t => { const el = $('#fsWake'); if (el) el.textContent = t; };
  async function keepAwake(on) {
    if (!on) { try { if (wakeLock) await wakeLock.release(); } catch (e) { } wakeLock = null; return; }
    if (!('wakeLock' in navigator)) { wakeMsg('Screen may sleep: this browser can\'t keep it on'); return; }
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeMsg('☀ Screen stays on'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    catch (e) { wakeMsg('Screen may sleep (' + (e.name === 'NotAllowedError' ? 'blocked by the phone, e.g. Low Power Mode' : 'not available') + ')'); }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wrap.classList.contains('fs') && !wakeLock) keepAwake(true); });
  function enterFs() {
    wrap.classList.add('fs'); scheduleFrame(); keepAwake(true);
    const r = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
    if (r) { try { const p = r.call(wrap); if (p && p.catch) p.catch(() => { scheduleFrame(); }); } catch (e) { scheduleFrame(); } }
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { }); } catch (e) { }
    setTimeout(drawOverlay, 300);
  }
  function exitFs() {
    wrap.classList.remove('fs'); scheduleFrame(); keepAwake(false);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => { });
    setTimeout(drawOverlay, 300);
  }
  $('#fsBtn').onclick = enterFs; $('#fsExit').onclick = exitFs;
  // Reset view (owner, Nov 3 2026): back to the normal view after zooming or dragging too far: default bar spacing, latest candles at the right
  // edge, price scale automatic again. Chart settings (indicators, type, timeframe) are untouched.
  function resetView() { if (!chart) return; try { chart.timeScale().resetTimeScale(); chart.timeScale().scrollToRealTime(); chart.priceScale('right').applyOptions({ autoScale: true }); if (extra.vol) chart.priceScale('vol').applyOptions({ autoScale: true }); } catch (e) { } drawOverlay(); }
  $('#resetView').onclick = resetView; $('#fsReset').onclick = resetView;
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && wrap.classList.contains('fs')) { wrap.classList.remove('fs'); keepAwake(false); } scheduleFrame(); setTimeout(drawOverlay, 200); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && wrap.classList.contains('fs')) { e.preventDefault(); exitFs(); return; }
    if (e.key === 'f' && tab === 'chart' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) wrap.classList.contains('fs') ? exitFs() : enterFs();
  });

  let curA = null;
  function candleOpts(ct) {
    const hollow = ct === 'hollow' || (PAL.hollow && ct === 'candles');
    return { upColor: hollow ? 'rgba(0,0,0,0)' : PAL.up, downColor: PAL.hollow && ct === 'candles' ? 'rgba(0,0,0,0)' : PAL.dn, borderVisible: true,
      borderUpColor: PAL.up, borderDownColor: PAL.dn, wickUpColor: PAL.up, wickDownColor: PAL.dn };
  }
  function makeSeries(ct) {
    if (series) { try { chart.removeSeries(series); } catch (e) { } }
    priceLines = [];
    if (ct === 'bars') series = chart.addBarSeries({ upColor: PAL.up, downColor: PAL.dn, thinBars: false });
    else if (ct === 'line') series = chart.addLineSeries({ color: PAL.acc, lineWidth: 2 });
    else if (ct === 'area') series = chart.addAreaSeries({ lineColor: PAL.acc, topColor: PAL.upFill, bottomColor: 'rgba(0,0,0,0)', lineWidth: 2 });
    else series = chart.addCandlestickSeries(Object.assign(candleOpts(ct), ct === 'heikin' ? { lastValueVisible: false, priceLineVisible: false } : {}));
    curType = ct;
  }
  function renderStudies(cs) {
    const L = LY();
    for (const k of ['ema9', 'ema21', 'ema50', 'ema200']) {
      if (L[k]) { if (!extra[k]) extra[k] = chart.addLineSeries({ color: EMA_COL[k], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        extra[k].setData(C.ema(cs, +k.slice(3))); }
      else if (extra[k]) { chart.removeSeries(extra[k]); delete extra[k]; }
    }
    if (L.volume) { if (!extra.vol) { extra.vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } }); }
      extra.vol.setData(cs.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? 'rgba(38,166,154,.45)' : 'rgba(239,83,80,.45)' }))); }
    else if (extra.vol) { chart.removeSeries(extra.vol); delete extra.vol; }
    const note = $('#haNote'); if (note) note.hidden = (T().ctype || 'candles') !== 'heikin';
  }
  function renderChart(full) {
    initChart();
    const sym = T().sym, tf = T().tf;
    const cs = F.candles(sym, tf);
    const dk = sym + tf + cs.length + (cs[0] && cs[0].time);
    const ct = T().ctype || 'candles';
    if (ct !== curType) { makeSeries(ct); lastDataKey = ''; }
    // Heikin Ashi is display only; every number and analysis uses real candles.
    const shown = ct === 'heikin' ? C.heikinAshi(cs) : cs;
    const toPt = c => (ct === 'line' || ct === 'area') ? { time: c.time, value: c.close } : { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
    if (dk !== lastDataKey) { series.setData(shown.map(toPt)); lastDataKey = dk; renderStudies(cs); }
    else if (shown.length) { series.update(toPt(shown[shown.length - 1])); if (full) renderStudies(cs); }
    // A new coin or timeframe starts from the normal view (owner, Nov 3 2026): otherwise a stretched price scale from the last coin keeps
    // showing its price range and the new coin's candles sit off the screen.
    // Fit only on symbol/timeframe change so zoom and pan stick on the same chart.
    if (renderChart.viewKey !== sym + '|' + tf) {
      renderChart.viewKey = sym + '|' + tf;
      resetView();
      try { chart.timeScale().applyOptions({ rightOffset: 2 }); chart.timeScale().fitContent(); } catch (e) { }
    }
    if (!full) return;
    const ca = F.candleAge(sym, tf);
    if (ca != null && ca > 120 && !F.demo && (!renderChart.lastReload || Date.now() - renderChart.lastReload > 60000)) { renderChart.lastReload = Date.now(); F.reloadSeries(sym, tf); }
    const A = curA = analyze(sym);
    // price lines
    priceLines.forEach(l => series.removePriceLine(l)); priceLines = [];
    const L = LY();
    const pl = (price, title, color, style, w) => priceLines.push(series.createPriceLine({ price, title, color, lineStyle: style == null ? 2 : style, lineWidth: w || 1, axisLabelVisible: true }));
    for (const l of A.levels) {
      if (((l.kind === 'day' || l.kind === 'week' || l.kind === 'open') && L.levels) || (l.kind === 'vwap' && L.vwap))
        pl(l.price, l.name, PAL[l.kind], l.kind === 'vwap' ? 0 : 2);
      if (l.kind === 'session' && L.sessions) pl(l.price, l.name, PAL.session, 3);
      if (l.kind === 'orb' && L.orb) pl(l.price, l.name, PAL.orb, 1);
    }
    // Heikin Ashi's own last value is an average, not a price: show the real one instead.
    if ((T().ctype || 'candles') === 'heikin' && cs.length) pl(cs[cs.length - 1].close, 'Price', PAL.acc, 0, 1);
    if (L.pos) for (const p of S.positions.filter(p => !p.closed && p.sym === sym)) {
      const rNow = L.openR !== false && pnlPrice(sym) != null ? C.rMultiple(p, pnlPrice(sym)) : null;   // owner: open R next to the entry
      pl(p.entry, `${p.side} entry${rNow != null ? ` · ${rNow >= 0 ? '+' : ''}${rNow.toFixed(2)}R` : ''}`, PAL.entry, 0, 2);
      if (p.stop != null) pl(p.stop, 'stop', '#ff4d4d', 0, 2);   // stops stay red in every theme
      if (p.tp1 != null) pl(p.tp1, 'TP1', PAL.tp, 0, 1);
      if (p.tp2 != null) pl(p.tp2, 'TP2', PAL.tp, 1, 1);
    }
    // Paper trades he ticked "Show on chart" (dotted, labelled "paper" so they can't be mistaken for real positions).
    for (const t of S.paper.filter(x => x.onChart && x.sym === sym && (x.status === 'open' || x.status === 'pending'))) {
      const w = t.status === 'pending' ? 'paper limit' : 'paper ' + t.side;
      const pr = L.openR !== false && t.status === 'open' && pnlPrice(sym) != null ? C.paperR(Object.assign({ stop0: t.stop }, t), pnlPrice(sym), Date.now()) : null;
      const rp = pr != null ? ` · ${pr >= 0 ? '+' : ''}${pr.toFixed(2)}R` : '';
      pl(t.entry, `📝 ${w} entry${rp}`, '#b388ff', 1, 2);
      if (t.stop != null && LY().paperStops !== false) pl(t.stop, `📝 paper stop`, '#ff4d4d', 1, 1);
      if (t.target != null) pl(t.target, `📝 paper target`, PAL.tp, 1, 1);
    }
    // Daily trend system paper position (shown in Coach's Paper workspace).
    if (T().trendOnChart && window.PDTrend && TREND_SYMS.includes(sym)) { const k = trendForward().coins.find(x => x.sym === sym);
      if (k && k.open) { pl(k.open.entry, `📈 trend paper ${k.open.dir > 0 ? 'long' : 'short'} entry${k.openR != null && L.openR !== false ? ` · ${k.openR >= 0 ? '+' : ''}${k.openR.toFixed(2)}R` : ''}`, '#b388ff', 1, 2);
        if (LY().paperStops !== false) pl(k.open.stop, '📈 trend paper stop', '#ff4d4d', 1, 1); } }
    // Working limit orders and plans not placed yet (owner's request, Nov 1): dashed = working on the platform, dotted = planned only.
    if (L.pos) for (const o of S.planned.filter(x => x.sym === sym)) {
      const working = o.status === 'placed', st = working ? 2 : 4, what = o.orderType === 'market' ? 'market' : 'limit';
      const tag = `${working ? '' : 'planned '}${what} ${o.side === 'long' ? 'buy' : 'sell'} ${+(+o.qty).toPrecision(4)}`;
      pl(o.entry, tag, PAL.entry, st, 2);
      if (o.stop != null) pl(o.stop, (working ? 'order' : 'plan') + ' stop', '#ff4d4d', st, 1);
      if (o.tp1 != null) pl(o.tp1, (working ? 'order' : 'plan') + ' TP', PAL.tp, st, 1);
    }
    // markers: structure events on this TF
    const st = cs.length > 10 ? C.structure(cs) : null;
    series.setMarkers(st && L.marks ? st.events.slice(-8).map(e => ({ time: e.time, position: e.dir === 'up' ? 'belowBar' : 'aboveBar',
      color: e.dir === 'up' ? PAL.up : PAL.dn, shape: e.dir === 'up' ? 'arrowUp' : 'arrowDown', text: e.kind })) : []);
    drawOverlay();
    renderChartPanels(A);
    renderDataCheck();
  }
  function drawOverlay() {
    const cv = $('#overlay'); if (!chart || !cv) return;
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    if (!curA) return;
    const ts = chart.timeScale(), right = r.width - 60;
    const x = t => { const v = ts.timeToCoordinate(t); return v == null ? 0 : v; };
    const y = p => series.priceToCoordinate(p);
    const box = (t0, top, bot, fill, stroke) => { const y1 = y(top), y2 = y(bot); if (y1 == null || y2 == null) return; const x0 = Math.max(0, x(t0));
      g.fillStyle = fill; g.fillRect(x0, y1, right - x0, y2 - y1); if (stroke) { g.strokeStyle = stroke; g.strokeRect(x0, y1, right - x0, y2 - y1); } };
    const tf = String(T().tf);
    if (LY().fvg && curA.fvg[tf]) for (const f of curA.fvg[tf]) box(f.time, f.top, f.bottom, f.dir === 'bull' ? PAL.upFill : PAL.dnFill);
    if (LY().sessions) for (const k of ['asia', 'london', 'nyam', 'nypm']) {
      const s = curA.sessions[k]; if (!s) continue;
      const x0 = x(s.from), x1 = x(s.to), y1 = y(s.high), y2 = y(s.low); if (y1 == null || !x1) continue;
      g.strokeStyle = PAL.session; g.setLineDash([3, 3]); g.strokeRect(x0, y1, Math.max(2, x1 - x0), y2 - y1); g.setLineDash([]);
      g.fillStyle = PAL.mu; g.font = '10px ' + (PAL.mode === 'pip' ? 'monospace' : 'sans-serif'); g.fillText(s.name, x0 + 2, y1 - 3);
    }
    if (LY().orb && curA.orb) { const o = curA.orb; box(o.from, o.high, o.low, PAL.upFill, PAL.orb); }
    // Impulse legs on this timeframe: the leg, its fib lines from the leg's end to the right edge, OTE (0.618-0.786) shaded.
    if (LY().fib && curA.impulse && curA.impulse[tf]) for (const L of curA.impulse[tf]) {
      const col = L.dir === 'up' ? PAL.up : PAL.dn, xs = x(L.start.time), xe = x(L.end.time), ys = y(L.start.price), ye = y(L.end.price);
      if (ys == null || ye == null) continue;
      g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(L.end.provisional ? [5, 4] : []); g.beginPath(); g.moveTo(xs, ys); g.lineTo(xe, ye); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
      box(L.end.time, L.ote.top, L.ote.bottom, L.dir === 'up' ? PAL.upFill : PAL.dnFill);
      g.font = '10px ' + (PAL.mode === 'pip' ? 'monospace' : 'sans-serif');
      for (const f of L.fibs) { const yy = y(f.price); if (yy == null) continue;
        g.strokeStyle = col; g.globalAlpha = f.r === 0.618 || f.r === 0.786 ? 0.9 : 0.45; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(xe, yy); g.lineTo(right, yy); g.stroke(); g.setLineDash([]);
        g.globalAlpha = 1; g.fillStyle = col; g.fillText(f.r.toFixed(3).replace(/0+$/, ''), right - 34, yy - 2); }
    }
  }
  function renderDataCheck() {
    if (document.activeElement && document.activeElement.id === 'calIn') return;   // don't wipe what he's typing
    const sym = T().sym, now = Date.now();
    const cs = C.consensus(F.sources(sym), 60, 15);
    const q = pnlQuote(sym), k = C.calibration(S.calib, sym, now);
    const rows = cs.fresh.map(r => `<tr><td>${esc(r.name)}</td><td class=num>${px(r.price)}</td><td class=num>${Math.round(r.ageSec)}s</td><td class="num ${Math.abs(r.devBps) > 15 ? 'dn' : ''}">${r.devBps >= 0 ? '+' : ''}${r.devBps.toFixed(1)} bp</td></tr>`).join('');
    const stale = F.sources(sym).filter(r => !(r.ageSec <= 60)).map(r => r.name);
    $('#dataBox').innerHTML = `<table><tr><th>Source</th><th class=num>Price</th><th class=num>Age</th><th class=num>vs median</th></tr>${rows || '<tr><td colspan=4 class=mu>Waiting for feeds…</td></tr>'}</table>
      <p class=small>${cs.verified ? `<b class=up>✓ ${cs.fresh.length} live sources agree</b> within ${cs.spreadBps.toFixed(1)} bp.` : `<b class=warn>Not cross-checked</b>: ${cs.fresh.length} live source(s).`}
      ${cs.outliers.length ? ` <b class=dn>Off: ${esc(cs.outliers.join(', '))}</b>.` : ''}${stale.length ? ` Stale: ${esc(stale.join(', '))}.` : ''}</p>
      <p class=small>P&amp;L price: <b>${px(q.price)}</b> · ${esc(q.basis)}${k.n ? ` · correction ${k.bps >= 0 ? '+' : ''}${k.bps.toFixed(1)} bp (spread ${k.spreadBps.toFixed(1)} bp)` : ''}</p>
      <div class=row style="margin:6px 0 0"><input id=calIn type=number step=any placeholder="Price your platform shows now" style="flex:1;min-width:150px"><button class="btn sm" id=calOk>Match Prop price</button></div>
      <p class="small mu">Prop's own price isn't public. Type the ${esc(sym)} price your prop platform shows the moment you see it; the app learns the gap (median of your last 5, kept 7 days). bp = 0.01%.</p>
      ${feedLogHtml()}`;
    $('#calOk').onclick = () => {
      const v = num($('#calIn').value), qq = pnlQuote(sym);
      if (!(v > 0) || qq.raw == null) { alert(qq.raw == null ? 'Need the live mark and USDT price first.' : 'Type the price your prop platform shows.'); return; }
      if (Math.abs(v / qq.raw - 1) > 0.01) { alert('That is more than 1% from the estimate. Check the coin and try again.'); return; }
      S.calib.push({ t: Date.now(), sym, prop: v, est: qq.raw }); S.calib = S.calib.slice(-50); save(); renderAll(true);
    };
  }
  // ---------- What did I miss? (owner's idea, Nov 2): mark a move, see what was visible before it, save it as learning data ----------
  let missPick = null;   // null = off; [] / [t0] while he is tapping candles
  const missHint = t => { for (const id of ['#missHint', '#missHintFs']) { const h = $(id); if (h) { h.hidden = !t; h.innerHTML = t || ''; } } };
  $('#fsMiss').onclick = () => $('#missBtn').onclick();
  $('#missBtn').onclick = () => {
    if (missPick) { missPick = null; missHint(''); return; }
    const sw = ![15, 60, 240].includes(T().tf);
    if (sw) { T().tf = 15; save(); lastDataKey = ''; initChart(); ensureFeeds(); renderAll(true); }
    missPick = []; missHint(`<b>Tap the candle where the move started.</b> (${sw ? 'Chart switched to 15m; ' : ''}works on 15m, 1h and 4h.) Tap 🔍 again to cancel.`);
  };
  function missClick(p) {
    if (!missPick || !p || p.time == null) return;
    missPick.push(+p.time);
    if (missPick.length === 1) { missHint('<b>Now tap the candle where the move ended.</b>'); return; }
    const [a, b] = missPick; missPick = null; missHint('Checking what was visible before the move… (a few seconds)');
    setTimeout(() => { try { runMiss(a, b); } catch (e) { console.warn(e); missHint('Could not review that move: ' + esc(e.message)); } }, 30);
  }
  function missCandles(sym) {
    const now = Date.now() / 1000, cs = {};
    for (const iv of [15, 60, 240, 1440]) cs[iv] = F.candles(sym, iv).filter(x => x.time + iv * 60 <= now);   // closed candles only
    return cs;
  }
  function runMiss(a, b) {
    const sym = T().sym, r = PDReview.review(sym, missCandles(sym), a, b, { tf: T().tf });
    missHint('');
    const ls = PDReview.lines(r).map(esc);
    if (r.error) { showModal(`<h3>What did I miss?</h3><p>${ls[0]}</p><div class=row><button class=btn data-close>Close</button></div>`); return; }
    const m = r.move, when = new Date(m.t0 * 1000).toLocaleString('en-US', { timeZone: T().tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    showModal(`<h3>What did I miss? <span class=tag>untested ideas, not signals</span></h3>
      <p class=small>Move started ${esc(when)}. ✔ = it was there before the move (only candles closed by then). ✘ = it wasn't. The history rate says how often that sign showed up <b>without</b> a move this big following.</p>
      <div class=small style="line-height:1.6">${ls.join('<br>')}</div>
      ${missCtxHtml(sym, m)}
      <textarea id=missNote rows=3 style="width:100%;margin-top:8px" placeholder="Ask or note (optional): e.g. what was the setup here that I missed?"></textarea>
      <div class=row style="margin-top:8px"><button class="btn" id=missSave>Save to my lessons</button><button class="btn" data-close>Close</button><button class="btn sm" id=missCopy title="Optional: copy this for a second opinion in your Claude app">Copy for Claude</button></div>
      <p class="small mu" id=missStat>Save keeps the review, your note and the market context with it, and it feeds the "What did I miss?" table. Everything here comes from the app's own data.</p>`);
    $('#missSave').onclick = () => {
      const { ups, ...before } = r.before;
      S.moveReviews = (S.moveReviews || []).concat([{ id: C.fnv(sym + m.tf + m.t0 + m.t1), at: Date.now(), sym, tf: m.tf, move: m, before, base: r.base, during: r.during, found: (r.found || []).map(u => ({ kind: u.kind, tf: u.tf, ready: u.ready, minsBefore: u.minsBefore, missing: u.missing })),
        ctx: ctxSnapshot(sym), ctxLagHours: MKT && MKT.made ? +((Date.parse(MKT.made) / 1000 - m.t0) / 3600).toFixed(1) : null, note: $('#missNote').value.slice(0, 500) }])
        .filter((x, i, arr) => arr.findIndex(y => y.id === x.id) === i).slice(-300);
      save(); renderMissBox(); $('#missStat').innerHTML = '<b class=up>Saved.</b>';
    };
    $('#missCopy').onclick = async () => {
      const txt = `Prop Desk "What did I miss?" review (rules-based, from closed candles only; untested ideas):\n${PDReview.lines(r).join('\n')}\nMy question / note: ${$('#missNote').value || 'What was the setup here that I missed?'}\n\nLooking at my chart screenshot too: answer my question, say what was visible before this move that I could have planned for, and what only showed up after it started. Be honest if nothing reliable was visible.`;
      $('#missStat').innerHTML = (await copyText(txt)) ? '<b class=up>Copied.</b> Paste it in your Claude app with the screenshot.' : 'Copy failed.';
    };
  }
  // Market context saved with the review. It is the latest snapshot (refreshed every 3 h), so it's labelled with how far it is from the move's start.
  function missCtxHtml(sym, m) {
    loadMarket(); const c = ctxSnapshot(sym); if (!c) return '<p class="small mu">Market context: not loaded yet (it is saved with the review when available).</p>';
    const lag = MKT && MKT.made ? (Date.parse(MKT.made) / 1000 - m.t0) / 3600 : null, bits = [];
    if (c.weather) bits.push('macro ' + c.weather); if (c.fundingPctile != null) bits.push(`funding ${ord(Math.round(c.fundingPctile * 100))} percentile (1 y)`); if (c.oi24h != null) bits.push(`open interest ${sgn(c.oi24h * 100, 1, '%')} 24 h`);
    if (c.liqRatio != null) bits.push(`liquidations ${c.liqRatio.toFixed(1)}× normal`); if (c.dvolPctile != null) bits.push(`BTC implied vol ${ord(Math.round(c.dvolPctile * 100))} percentile`); if (c.fearGreed != null) bits.push(`Fear & Greed ${c.fearGreed}`);
    return `<p class=small><b>Market context</b> (${lag == null ? 'time unknown' : Math.abs(lag) < 3 ? 'from about the move\'s start' : `snapshot ${Math.abs(lag).toFixed(0)} h ${lag > 0 ? 'after' : 'before'} the start, so approximate`}): ${esc(bits.join(' · ') || '—')}${c.labels && c.labels.length ? ' · <span class=warn>' + esc(c.labels.join('; ')) + '</span>' : ''}</p>`;
  }
  function renderMissBox() {
    const box = $('#missBox'); if (!box) return;
    const saved = S.moveReviews || [];
    if (!saved.length) { box.innerHTML = '<p class=small>When a move happens, tap <b>🔍 What did I miss?</b>, then tap the candle where it started and the one where it ended. The coach lists what was visible before it, and how often those signs showed up with no move. Save it, and this table learns from every move you mark.</p>'; return; }
    const L = PDReview.lessons(saved), rows = Object.values(L).filter(x => x.of).sort((a, b) => b.before / b.of - a.before / a.of);
    box.innerHTML = `<table><tr><th>Sign</th><th class=num>Before your moves</th><th class=num>Moves after it, in history</th></tr>${rows.map(x => `<tr><td class=small>${esc(x.label)}</td><td class=num>${x.before}/${x.of}</td><td class=num>${x.baseN ? (100 * x.baseHits / x.baseN).toFixed(1) + '%' : '—'}</td></tr>`).join('')}</table>
      <p class="small mu">${saved.length} move${saved.length > 1 ? 's' : ''} saved. A sign is only worth learning from if it shows up before your moves much more often than it does at random times. These are untested ideas: after 30+ saved moves, the strongest one can be written down and tested properly. Your picks are your biggest moves, so expect the table to flatter every sign.</p>
      <div class=row><button class="btn sm" id=missClear>Clear saved moves</button></div>`;
    $('#missClear').onclick = () => { if (confirm('Delete all saved move reviews?')) { S.moveReviews = []; save(); renderMissBox(); } };
  }
  renderMissBox();
  // Feed reliability log: which feed is live and in line with the others, measured while the app is open (kept on this device only).
  const FEEDLOG_KEY = 'kpd_feedlog';
  let feedLog; try { feedLog = JSON.parse(localStorage.getItem(FEEDLOG_KEY)) || null; } catch (e) { feedLog = null; }
  setInterval(() => {
    if (F.demo || document.visibilityState === 'hidden') return;
    try { feedLog = C.feedTally(feedLog, F.sources(T().sym), Date.now()); localStorage.setItem(FEEDLOG_KEY, JSON.stringify(feedLog)); } catch (e) { }
  }, 15000);
  function feedLogHtml() {
    const rep = C.feedReport(feedLog, Date.now(), 14);
    if (!rep.length) return '<p class="small mu">Feed reliability: measuring. Counts appear after the app has been open a while.</p>';
    const f1 = x => x == null ? '—' : x.toFixed(x >= 99.95 || x === 0 ? 0 : 1) + '%';
    return `<h4 style="margin:10px 0 4px">Feed reliability (last 14 days, while the app was open)</h4>
      <table><tr><th>Feed</th><th class=num>Live</th><th class=num>Off price</th><th class=num>Drop-outs</th></tr>${rep.map(r => `<tr><td>${esc(r.name)}</td><td class="num ${r.livePct < 95 ? 'dn' : ''}">${f1(r.livePct)}</td><td class="num ${r.offPct > 1 ? 'dn' : ''}">${f1(r.offPct)}</td><td class=num>${r.drops}</td></tr>`).join('')}</table>
      <p class="small mu">Live = had a price under 60 s old. Off price = more than 15 bp from the middle of 3+ live feeds. Drop-out = went from live to stale while the app was open. ${rep[0].hours.toFixed(1)} h measured. the exchange stays the main feed unless these numbers show it is the weak one.</p>`;
  }
  // Market open plan (owner, Nov 2): read the pre-market, prepare both sides for the 9:30 New York open, then show how it played out.
  // Same definitions as the H4/H23 test (js/core.js openPlan). Untested idea, not a signal; each day's read and outcome is saved as learning data.
  function renderOpenPlan(sym) {
    const box = $('#openBox'); if (!box) return;
    F.want(sym, [15, 1440]).catch(() => { });
    const now = Date.now() / 1000, nyDate = C.tzParts(now, C.OPEN.tz).date, news = (T().openNews || {})[nyDate] === true;
    const c15 = F.candles(sym, 15).filter(x => x.time + 900 <= now), d1 = F.candles(sym, 1440), P = C.openPlan(c15, d1, now, { orbMin: T().orbMin === 30 ? 30 : 15, news });
    if (P.status === 'weekend') { box.innerHTML = '<p class=small>Weekend: no New York open today. Crypto still trades, usually thinner. The plan returns Monday before 9:30 New York.</p>'; return; }
    if (P.status === 'nodata' || P.dAtr == null) { box.innerHTML = '<p class=mu>Loading 15m and daily candles…</p>'; return; }
    const sgn = x => (x >= 0 ? '+' : '') + x.toFixed(2), st = { pre: 'Before the open', range: 'Opening range forming', live: 'After the open', done: 'Closed for the day (16:00 New York)' }[P.status];
    const tr = t => t === 'up' ? '<b class=bull>up</b>' : t === 'down' ? '<b class=bear>down</b>' : 'mixed';
    const widthTxt = P.width == null ? 'not enough days yet' : `${P.width.toFixed(1)}× normal (median of the last ${P.widthDays} days)${P.width > 1.5 ? ' → <b>expect a bigger first 2 hours</b>: leave stop room, size down' : P.width < 0.67 ? ' → expect a quieter first 2 hours' : ''}`;
    const sideHtml = dir => {
      const s = P[dir], up = dir === 'up', word = up ? 'above' : 'below';
      if (!s.trigger) return `<div class=sc><div class=sc-h><b class="${up ? 'bull' : 'bear'}">${up ? 'IF UP' : 'IF DOWN'}</b></div><div class=small>Wait for the opening range (9:30–${P.orbMin === 30 ? '10:00' : '9:45'} New York). Then: a 15m close ${word} its ${up ? 'high' : 'low'} → enter on the next candle, stop at the other side of the range, target 2R. Overnight ${up ? 'high' : 'low'} ${s.watch != null ? px(s.watch) : '—'} is the first line to clear${s.next != null ? `, then ${px(s.next)}` : ''}.${s.withTrend ? ' With the 4h trend.' : ''}</div></div>`;
      const sizes = liveAccts().map(a => { const A = C.accountState(a, S.positions, prices(), Date.now(), { orders: S.planned });
        const z = C.sizeFor({ sym, entry: s.trigger, stop: s.stop, risk: A.nextRisk, equity: A.equity, usedMargin: A.usedMargin, symNotional: A.openBySym[sym] || 0, leverage: C.levMap(a) });
        const dc = C.directionCheck(up ? 'long' : 'short', sym, (analyses[sym] || analyze(sym)).struct, S.positions, a.id);
        return `${esc(a.label || 'Account')}: ${z && z.qty > 0 ? `size ${z.qty} (${usd(z.lossAtStop)} at the stop)` : '<span class=warn>no room</span>'}${dc.known && !dc.ok ? ` · <span class=warn>both-ways rule says no: ${esc(dc.reasons.join('; '))}</span>` : ''}`; }).join('<br>');
      return `<div class=sc><div class=sc-h><b class="${up ? 'bull' : 'bear'}">${up ? 'IF UP' : 'IF DOWN'}</b> <span>${s.withTrend ? 'with the 4h trend' : 'against or no 4h trend: smaller or skip'}</span></div>
        <div class=small>Trigger: a 15m close ${word} ${px(s.trigger)} before 12:00 New York → enter on the next candle · stop ${px(s.stop)} · 2R target ${px(s.target)}${s.next != null ? ` · next level ${px(s.next)}` : ''} · out by 16:00</div>
        <div class=small>${sizes || '<span class=mu>Add an account on the Desk to see sizes.</span>'}</div></div>`; };
    const flagTxt = { 'range wide': 'opening range wider than half a normal day: the stop is far, so the size gets small', 'big overnight move': 'already moved more than a normal day overnight: the move may be done', 'wide overnight': 'wide overnight range: bigger swings likely after the open', 'quiet overnight': 'quiet overnight', news: 'big news today (you ticked it): stand aside around the release', 'costs big': `range so tight that fees and slippage are about ${Math.round((P.costShare || 0) * 100)}% of the risk: a normal stop-out costs well over 1R` };
    const t = P.trade, after = (P.status === 'live' || P.status === 'done') ? `<p class=small><b>How it played out:</b> ${t ? (t.why === 'open' ? `broke ${tr(t.dir)} at ${fmtTime(t.t * 1000)}, entry ${px(t.entry)}, still running` : t.R == null ? esc(t.why || '') : `broke ${tr(t.dir)} at ${fmtTime(t.t * 1000)}, ${t.why === 'target' ? 'hit 2R' : t.why === 'stop' ? 'stopped out' : 'closed at 16:00'}: <b class="${t.R >= 0 ? 'up' : 'dn'}">${sgn(t.R)}R</b> after costs`) : 'no breakout close yet (entries stop at 12:00)'}${P.move2h != null ? ` · first 2 hours moved ${sgn(P.move2h)} daily ranges` : ''}</p>` : '';
    box.innerHTML = `<p class=small><b>${esc(C.base(sym))}</b> · ${esc(P.date)} · ${st}</p>
      <p class=small><b>Pre-market read:</b> ${P.drift != null ? `${sgn(P.drift)} daily ranges since midnight New York` : '—'} · 4h trend ${tr(P.trend)} · overnight ${P.onL != null ? px(P.onL) + '–' + px(P.onH) : '—'}, ${widthTxt}</p>
      <p class=small><b>Direction lean: none.</b> Tested (H23): the pre-market move predicted the open's direction one year and the opposite the next, so the plan prepares both sides. ${P.read !== 'none' ? `Today the pre-market and 4h trend both point ${tr(P.read)}: treat that as context only.` : ''}</p>
      ${sideHtml('up')}${sideHtml('down')}
      ${P.flags.length ? `<p class=small><b class=warn>${P.noTrade ? 'No-trade day' : 'Cautions'}:</b> ${P.flags.map(f => esc(flagTxt[f] || f)).join(' · ')}</p>` : '<p class="small mu">No caution flags today.</p>'}
      <label class=small><input type=checkbox id=openNews ${news ? 'checked' : ''}> Big news today (CPI, jobs, Fed): stand aside</label>
      ${after}
      <p class=small><b>Evidence:</b> <span class="tag warn">untested idea · not a signal</span> The 9:30 breakout with a ${P.orbMin}-minute range came out about breakeven after costs on Nov 2025–Nov 2026 (${P.orbMin === 30 ? '+0.008R' : '−0.015R'} a trade, H4), though breakouts at 9:30 did about +0.3R better than at random times. The overnight range did predict how big the first 2 hours get (H23). Your plan, stop and size decide.</p>`;
    $('#openNews').onchange = e => { T().openNews = Object.fromEntries(Object.entries(T().openNews || {}).filter(([k]) => k >= nyDate)); T().openNews[nyDate] = e.target.checked; save(); renderOpenPlan(sym); };
    // learning data: one record per coin per New York day (read before the open, outcome after)
    const key = sym + '|' + P.date, log = S.openLog = S.openLog || [], r3 = x => x == null ? null : +x.toFixed(3);
    let rec = log.find(x => x.key === key); const before = JSON.stringify(rec || null); if (!rec) { rec = { key, sym, date: P.date }; log.push(rec); if (log.length > 500) log.splice(0, log.length - 500); }
    if (P.status === 'pre' || P.status === 'range' || rec.drift == null) Object.assign(rec, { drift: r3(P.drift), trend: P.trend, width: r3(P.width), read: P.read, flags: P.flags.slice(), seen: P.status });
    if (P.orb && P.orb.complete) rec.orb = { high: P.orb.high, low: P.orb.low };
    if (P.status === 'live' || P.status === 'done') Object.assign(rec, { trade: t && t.R != null ? { dir: t.dir, R: r3(t.R), why: t.why } : t ? { dir: t.dir, why: t.why } : null, move2h: r3(P.move2h) });
    if (JSON.stringify(rec) !== before) save();
  }
  const biasTxt = b => `<span class="${b || 'range'}">${b === 'bull' ? 'Bullish' : b === 'bear' ? 'Bearish' : 'Range / unclear'}</span>`;
  function renderChartPanels(A) {
    const p = A.price;
    $('#biasAsOf').textContent = A.ageSec != null ? `price ${px(p)} · ${Math.round(A.ageSec)}s old` : '';
    const rows = [15, 60, 240, 1440].map(iv => {
      const s = A.struct[iv]; if (!s) return `<tr><td>${C.tfName(iv)}</td><td colspan=3 class=mu>loading…</td></tr>`;
      return `<tr><td>${C.tfName(iv)}</td><td>${biasTxt(s.bias)}</td><td class=small>${s.shape}</td><td class=small>${s.last ? `${s.last.kind} ${s.last.dir} @ ${px(s.last.level)}` : '—'}</td></tr>`;
    }).join('');
    const b4 = A.struct[240] && A.struct[240].bias, b1 = A.struct[60] && A.struct[60].bias;
    const sum = b4 && b1 ? (b4 === b1 && b4 !== 'range' ? `1h and 4h agree: <b class="${b4}">${b4 === 'bull' ? 'longs with the trend' : 'shorts with the trend'}</b>.` : 'Timeframes disagree or are ranging: trade smaller or wait.') : '';
    $('#biasBox').innerHTML = `<table class="stack"><tr><th>TF</th><th>Bias</th><th>Swings</th><th>Last break</th></tr>${rows}</table>
      <p class=small>${sum}</p><p class="small mu">Bias = last close through a confirmed swing (2 candles each side). BOS = with the trend, CHoCH = flip. Mechanical, not a prediction.</p>`;
    const lv = A.levels.slice().sort((a, b) => b.price - a.price);
    $('#levelBox').innerHTML = p == null ? '<p class=mu>Waiting for price…</p>' : `<table>${lv.map(l => `<tr><td>${esc(l.name)}</td><td class=num>${px(l.price)}</td><td class="num ${cls(l.price - p)}">${((l.price - p) / p * 100).toFixed(2)}%</td></tr>`).join('')}</table>
      ${A.orb ? `<p class=small>ORB (${T().orbAnchor === 'ny' ? '9:30 NY' : T().orbAnchor === 'exchange' ? '00:30 UTC' : '00:00 UTC'}, ${T().orbMin}m): ${px(A.orb.low)}–${px(A.orb.high)} · ${A.orb.complete ? (A.orb.breakout ? `broke <b class="${A.orb.breakout.dir === 'up' ? 'bull' : 'bear'}">${A.orb.breakout.dir}</b> at ${fmtTime(A.orb.breakout.time * 1000)}` : 'no breakout close yet') : 'still forming'}</p>` : ''}`;
    try { renderOpenPlan(T().sym); } catch (e) { const b = $('#openBox'); if (b) b.innerHTML = '<p class="small warn">Open plan error: ' + esc(e.message || String(e)) + '</p>'; }
    const fv = [];
    for (const iv of [15, 60, 240]) for (const g of (A.fvg[iv] || [])) fv.push(Object.assign({ iv }, g));
    fv.sort((a, b) => Math.abs((a.top + a.bottom) / 2 - p) - Math.abs((b.top + b.bottom) / 2 - p));
    $('#fvgBox').innerHTML = fv.length ? `<table><tr><th>TF</th><th>Side</th><th class=num>Zone</th><th>State</th></tr>${fv.slice(0, 8).map(g => `<tr><td>${C.tfName(g.iv)}</td><td class="${g.dir}">${g.dir}</td><td class=num>${px(g.bottom)}–${px(g.top)}</td><td class=small>${g.status}</td></tr>`).join('')}</table>
      <p class="small mu">FVG = 3-candle gap ≥0.15 ATR, closed candles only. Filled ones are dropped.</p>` : '<p class=mu>None open near price (or still loading).</p>';
    const ups = C.sortLive(C.scanSetups(A.sym, A, Date.now()), liveOf, fitsNow, verdictRank);
    const cb = C.rankBoard(ups, chartMem[A.sym] || {}, Date.now()); chartMem[A.sym] = cb.mem;
    $('#setupBox').innerHTML = sizeAcctPicker() + (cb.rows.length ? cb.rows.map(r => r.gone ? goneCard(r) : setupCard('chart', r.rank - 1, r.u, ` <button class="btn sm" data-weigh="${r.rank - 1}">Weigh it</button><div class=small data-weighout="${r.rank - 1}"></div>`, r)).join('')
      + '<p class="small mu">Scanned both ways, all the time; sized and checked for the account picked above. "Weigh it" checks it against your account rules and sizes it. Needs a retest and your own trigger. No backtest yet: treat as a watchlist.</p>'
      : `<p class=mu>Nothing clean: no open FVG either way within 2 ATR with 2R+ to the next swing, and no fresh liquidity sweep. No trade is a valid answer.</p>`);
    lastUps = ups;
    renderResearch(A.sym);
    renderProfile(A.sym);
    renderTraits(A.sym);
    const VR = { continuation_signs: 'continuation signs', reversal_warning: 'reversal warning', unclear: 'unclear', unknown: 'unknown (no volume)' };
    const ST = { extending: 'still extending', at_high: 'at the extreme', retracing: 'retracing', in_ote: 'IN OTE (0.618-0.786)', deep: 'past 0.786' };
    const legs = [15, 60, 240].flatMap(iv => (A.impulse && A.impulse[iv] || []).map(L => Object.assign({ iv }, L)));
    $('#fibBox').innerHTML = legs.length ? `<table><tr><th>TF</th><th>Leg</th><th class=num>Now</th><th>0.5 · 0.618 · 0.786</th></tr>${legs.map(L => `<tr><td>${C.tfName(L.iv)}</td>
      <td class=small><b class="${L.dir === 'up' ? 'bull' : 'bear'}">${L.dir}</b> ${px(L.start.price)}→${px(L.end.price)}${L.end.provisional ? '*' : ''}<div class=mu>${L.atrMult.toFixed(1)}× ATR, ${L.bars} bars, broke ${px(L.broke)}</div><div class="${L.vol.read === 'continuation_signs' ? 'up' : L.vol.read === 'reversal_warning' ? 'warn' : 'mu'}">Volume: ${esc(VR[L.vol.read])}${L.vol.leg != null ? ` (leg ${L.vol.leg.toFixed(1)}×${L.vol.pull != null ? ', pullback ' + L.vol.pull.toFixed(1) + '×' : ''}${L.vol.climax ? ', climax bar' : ''})` : ''}</div></td>
      <td class="num small ${L.status === 'in_ote' ? 'up' : L.status === 'deep' ? 'warn' : ''}">${Math.round(Math.max(0, L.retraceNow) * 100)}%<div>${esc(ST[L.status] || L.status)}</div></td>
      <td class=small>${[0.5, 0.618, 0.786].map(r => px(L.fibs.find(f => f.r === r).price)).join(' · ')}</td></tr>`).join('')}</table>
      <p class="small mu">Impulse = ≥3× ATR, mostly one-way (≥50% efficiency), ≤60 bars, broke the last swing. * = end not confirmed yet (may extend). Leg disappears if price trades back through its start. Volume (the exchange only): × = vs the median of the 20 bars before; continuation signs = heavy leg + light pullback; reversal warning = pullback as heavy as the leg, or a 2×+ bar closing against it near the turn. Untested: fib and volume reads are not backtested.</p>`
      : '<p class=mu>No clean impulse leg on 15m / 1h / 4h right now.</p>';
  }
  let lastUps = [], chartMem = {}, scanMem = {};
  // ---------- Scan all coins: the full model on every coin (FVG + sweeps, both ways, alert grade, traits, profile) ----------
  let scanAll = { at: 0, running: false, rows: [], errors: [], ranked: [] };
  async function runScanAll(manual) {
    if (scanAll.running) return; scanAll.running = true; renderScanAll();
    const rows = [], errors = [], now = () => Date.now();
    for (const sym of T().symbols) {
      try {
        await F.want(sym, [15, 60, 240, 1440]);
        for (const iv of [15, 60, 240, 1440]) if (F.candles(sym, iv).length < 50 && !F.demo) await F.reloadSeries(sym, iv);
        const A = analyses[sym] = analyze(sym);
        if (A.price == null) { errors.push(sym + ': no live price yet'); continue; }
        const h = F.candles(sym, 60).slice(0, -1), d = F.candles(sym, 1440).slice(0, -1);
        let x = null; try { x = window.PDTraits && h.length > 240 ? PDTraits.ctxAt(h, d, h.length - 1) : null; } catch (e) { }
        const sh = x && PDProfile.shardName(x.f), prof = sh && PROF[sh] ? { keys: PROF[sh], minN: PDProfile.MIN_N } : null;
        for (const u of C.scanSetups(sym, A, now())) {
          const g = C.alertGrade(u), agree = x ? PDTraits.TRAITS.filter(t => t.side(x, prof) === u.dir).map(t => t.id) : [];
          rows.push(Object.assign({}, u, { grade: g, agree }));
        }
      } catch (e) { errors.push(sym + ': ' + (e.message || e)); }
    }
    rows.sort((a, b) => (b.ready - a.ready) || (b.grade.ok - a.grade.ok) || (b.rr - a.rr));
    scanAll = { at: Date.now(), running: false, rows, errors, manual: !!manual };
    try { await pullAuto(); autoPaperRun(rows); } catch (e) { console.warn(e); }
    renderScanAll();
  }
  // Trade ideas: short-term (the 15m-4h setup scanner) or long-term (the daily trend system, H15 S2). Owner, Nov 2: generate both, each
  // graded against what the research has actually shown. Ideas only: the app never places orders; his rules and risk profile still apply.
  function longIdeas() {
    if (!window.PDTrend) return '<p class=mu>Loading…</p>';
    const tf = trendForward(), now = Date.now(), P = prices(), n = tf.trades.length;
    const cards = tf.coins.map(k => {
      if (k.loading) return `<div class=sc><b>${esc(C.base(k.sym))}</b> <span class=mu>${k.have ? `needs ${PDTrend.WARM + 2} days of daily candles, has ${k.have}` : 'loading daily candles…'}</span></div>`;
      const st = k.state, d = st.rule; if (!d) return `<div class=sc><b>${esc(C.base(k.sym))}</b> <b>Flat</b> <span class=small>· close ${px(st.close)} between the 20-day (${px(st.fast)}) and 50-day (${px(st.slow)}) rules: no long-term trade. No trade is a valid answer.</span></div>`;
      const entry = k.price != null && Math.abs(k.price / st.close - 1) <= 0.15 ? k.price : st.close, stop = entry - d * 2 * st.atr;
      const sizes = liveAccts().map(a => { const A = C.accountState(a, S.positions, P, now, { orders: S.planned });
        const z = C.sizeFor({ sym: k.sym, entry, stop, risk: A.nextRisk, equity: A.equity, usedMargin: A.usedMargin, symNotional: A.openBySym[k.sym] || 0, leverage: C.levMap(a) });
        const dc = C.directionCheck(d > 0 ? 'long' : 'short', k.sym, (analyses[k.sym] || analyze(k.sym)).struct, S.positions, a.id);
        return `${esc(a.label || 'Account')}: ${z && z.qty > 0 ? `size ${z.qty} (${usd(z.lossAtStop)} at the stop, ${esc(A.profile.name)} pace)` : '<span class=warn>no room for a new trade</span>'}${dc.known && !dc.ok ? ` · <span class=warn>your both-ways rule says no: ${esc(dc.reasons.join('; '))}</span>` : ''}`; }).join('<br>');
      const paper = k.open ? `paper position ${k.open.dir === d ? 'already open this way' : 'open the OTHER way (exits at the next close)'}${k.openR != null ? ' · ' + (k.openR >= 0 ? '+' : '') + k.openR.toFixed(2) + 'R' : ''}` : k.preOpen ? `this trend trade started ${fmtTime(k.preOpen.t * 1000, true)}, before your paper start, so the paper record joins at the next fresh signal` : 'the paper record opens it at the next daily open';
      return `<div class=sc><div class=sc-h><b class="${d > 0 ? 'bull' : 'bear'}">${d > 0 ? 'LONG' : 'SHORT'}</b> <b>${esc(C.base(k.sym))}</b> <span>Daily trend</span></div>
        <div class=small>Entry about ${px(entry)} (next daily open) · stop ${px(stop)} (2× daily ATR, never widened) · exit when a daily close goes ${d > 0 ? 'below' : 'above'} the 20-day (now ${px(st.fast)}) · no fixed target: it rides the trend</div>
        <div class=small>${sizes || '<span class=mu>Add an account on the Desk to see sizes.</span>'}</div><div class="small mu">${esc(paper)}</div></div>`; }).join('');
    return cards + `<p class=small><b>Evidence:</b> <span class="tag up">passed 10-year backtest · label 3</span> +0.069R a trade after costs, 42% winners, mostly from longs, weaker since 2021. Paper record: ${n}/30 closed trades. Worst backtest stretch −28R, so it doesn't fit a 3% evaluation drawdown unless risk per trade is tiny; fine for funded or own money if you choose. Ideas only: your plan, stop and size decide.</p>`;
  }
  function renderScanAll() {
    const box = $('#scanAllBox'); if (!box) return;
    const hz = T().ideaHorizon === 'long' ? 'long' : 'short';
    const tabs = `<div class=row style="margin-bottom:8px"><div class=seg><button data-hz=short class="${hz === 'short' ? 'on' : ''}">Short-term (15m–4h)</button><button data-hz=long class="${hz === 'long' ? 'on' : ''}">Long-term (daily)</button></div></div>`;
    const sa = scanAll; sa.rows = C.sortLive(sa.rows, liveOf, fitsNow, verdictRank);
    const sb = C.rankBoard(sa.rows, scanMem, Date.now()); scanMem = sb.mem; sa.ranked = sb.rows;
    if (hz === 'long') { box.innerHTML = tabs + longIdeas(); if (tab === 'desk') renderDeskIdeas(); return; }
    const top = sa.rows.slice(0, 12), chosen = T().alertTraits || [];
    const head = `<div class=row style="margin-bottom:6px"><button class="btn sm pri" id=scanAllGo ${sa.running ? 'disabled' : ''}>${sa.running ? 'Scanning…' : 'Scan all coins now'}</button>
      <span class="small mu">${sa.at ? 'Last scan ' + fmtTime(sa.at, true) + ' · ' + sa.rows.length + ' setups on ' + esc(T().symbols.join(', ')) + ' · ' + sa.rows.filter(r => r.ready).length + ' ready · ' + sa.rows.filter(r => r.grade.ok && r.ready).length + ' alert grade' : 'Runs when the app opens and every 5 minutes while it is open.'}</span></div>`;
    const shown = sa.ranked.filter(r => r.gone || r.rank <= 12);
    const body = shown.length ? shown.map(r => r.gone ? goneCard(r) : setupCard('scan', r.rank - 1, r.u, ` <button class="btn sm" data-saweigh="${r.rank - 1}">Weigh</button><div class=small data-saout="${r.rank - 1}"></div>`, r)).join('')
      : (sa.at ? '<p class=mu>No setups on any coin right now. No trade is a valid answer.</p>' : '');
    box.innerHTML = tabs + head + body + (sa.errors.length ? `<p class="small warn">${esc(sa.errors.join(' · '))}</p>` : '') +
      '<p class=small><b>Evidence:</b> <span class="tag warn">untested idea · no edge found</span> These FVG and sweep setups were tested 94 ways on 2016–2026 data and none beat random entries after costs. Use them as a watchlist and for paper trades; if you take one live, your plan, stop and size decide.</p><p class="small mu">Sorted: ready first, then alert grade, then best R. Same model as the 24/7 monitor.</p>';
    if (tab === 'desk') renderDeskIdeas();
  }
  $('#scanAllBox').addEventListener('click', e => {
    if (e.target.id === 'scanAllGo') { runScanAll(true); return; }
    const hzb = e.target.closest('[data-hz]'); if (hzb) { T().ideaHorizon = hzb.dataset.hz; save(); renderScanAll(); return; }
    const pb = e.target.closest('[data-sapaper]'); if (pb) { const u = scanAll.rows[+pb.dataset.sapaper]; if (u) paperAdd(u); return; }
    const wb = e.target.closest('[data-saweigh]'); if (!wb) return; const u = scanAll.rows[+wb.dataset.saweigh]; if (!u) return;
    const now = Date.now(), P = prices();
    const out = liveAccts().map(a => { const A = C.accountState(a, S.positions, P, now, { orders: S.planned }), w = C.weighIdea(u, A, S.positions.filter(p => p.acct === a.id), now, { leverage: C.levMap(a) });
      return w.ok && w.size && w.size.qty > 0 ? `<b class=up>${esc(a.label || 'Account')}: fits</b>, size ${w.size.qty} (${usd(w.size.lossAtStop)} at stop)` : `<b class=warn>${esc(a.label || 'Account')}: not now</b> (${esc(w.rules.filter(r => !r.ok).map(r => r.t).join(', ') || 'size 0')})`; });
    $(`[data-saout="${wb.dataset.saweigh}"]`).innerHTML = out.join('<br>') || '<span class=mu>Add an account on the Desk first.</span>';
  });
  setTimeout(() => runScanAll(false), 8000);
  setInterval(() => { if (document.visibilityState !== 'hidden') runScanAll(false); }, 300e3);
  // ---------- Paper trading: try setups with no money; same rules as the replay; record saved to monitor/paper.json ----------
  let paperPushTimer = null, paperMsg = '';
  function savePaper(why) {
    save(); clearTimeout(paperPushTimer);
    paperPushTimer = setTimeout(async () => {
      let r;
      try { r = await pushFile('monitor/paper.json', await buildPaperWatch(), 'paper trades: ' + why); }
      catch (e) { r = { ok: false, msg: 'secure local paper payload could not be prepared' }; }
      paperMsg = r.ok ? 'Saved to your repo ' + fmtTime(Date.now(), true) : (ghToken() ? 'Not saved to the repo yet (' + (r.msg || 'offline') + ')' : 'Kept on this phone (add the 24/7 monitor key in Settings to save it to your repo)');
      if (tab === 'coach') renderPaper();
    }, 4000);
  }
  function paperMeta(u) {
    const vd = verdictOf(u), m = { ctxAtEntry: ctxSnapshot(u.sym), verdict: vd.verdict, failedGate: vd.failedGate, label: vd.label, alertGrade: C.alertGrade(u).ok, rr: u.rr != null ? +u.rr.toFixed(2) : null, rvol: u.rvol != null ? +u.rvol.toFixed(2) : null, open: u.open || null, withTrend: u.withTrend != null ? u.withTrend : null };
    try { const h = F.candles(u.sym, 60).slice(0, -1), d = F.candles(u.sym, 1440).slice(0, -1), x = window.PDTraits && h.length > 240 ? PDTraits.ctxAt(h, d, h.length - 1) : null;
      if (x) { const sh = PDProfile.shardName(x.f), prof = PROF[sh] ? { keys: PROF[sh], minN: PDProfile.MIN_N } : null; m.traits = {}; for (const t of PDTraits.TRAITS) m.traits[t.id] = t.side(x, prof); m.profile = x.f;
        const pm = prof && PDProfile.match(prof, x.f); if (pm) m.profileMatch = { n: pm.n, upShare24: pm.upShare24, med24: pm.med24 }; } } catch (e) { }
    return m;
  }
  function paperAdd(u) {
    const px = pnlPrice(u.sym); if (px == null) { alert('No live price yet.'); return; }
    if (!okToUse(u)) return;
    // Same order rule as live (owner's rule, Nov 2): market when price is at the level, otherwise a paper limit that waits there.
    const op = C.orderPlan(u.entry, px, u.stop, u.dir, analyses[u.sym] && analyses[u.sym].atr ? analyses[u.sym].atr[60] : null);
    if (op && op.type === 'none') { alert('Price is already past this setup\'s stop. No paper trade.'); return; }
    const isLimit = op && op.type === 'limit';
    const t = isLimit ? C.paperLimit(u, Date.now(), paperMeta(u)) : C.paperOpen(u, px, Date.now(), paperMeta(u)); if (!t) { alert('Price is already past this setup\'s stop. No paper trade.'); return; }
    if (!isLimit) t.order = 'market';
    const pa = paperAcct();
    if (pa) {
      const z = C.paperSize(pa, S.paper, u, isLimit ? u.entry : px, Date.now(), prices());
      if (z.ok) { t.acct = pa.id; t.qty = z.size.qty; t.riskUsd = z.size.lossAtStop; }
      else if (!confirm('Your paper prop account says not now: ' + z.rules.filter(r => !r.ok).map(r => r.t).join(', ') + '.\n\nOpen it as an R-only paper trade (no $ P&L) anyway?')) return;
    }
    t.setupKey = u.key; t.model = C.MODEL; S.paper.push(t); markUsed(u.key, 'paper'); savePaper('open ' + u.sym + ' ' + u.dir);
    toast((isLimit ? 'Paper limit waiting: ' : 'Paper trade opened: ') + u.sym + ' ' + u.dir, 'coach', 'Open in Coach', 'coachPaperPanel');
  }
  let toastTimer = 0;
  function toast(msg, goTab, goLabel, openPanel) {
    const el = $('#toast'); if (!el) return;
    el.innerHTML = `<span>${esc(msg)}</span>` + (goTab ? `<button type="button" class="btn sm" data-toast="${esc(goTab)}"${openPanel ? ` data-toast-panel="${esc(openPanel)}"` : ''}>${esc(goLabel || 'View')}</button>` : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
  }
  const toastEl = $('#toast');
  if (toastEl) toastEl.onclick = e => { const b = e.target.closest('[data-toast]'); if (!b) return; toastEl.hidden = true; switchTab(b.dataset.toast); if (b.dataset.toastPanel) setTimeout(() => { const panel = document.getElementById(b.dataset.toastPanel); if (!panel) return; if (panel.matches('details')) panel.open = true; else if (panel.id === 'deskPositionManager') showDeskPanel(panel.id, true); const target = panel.id === 'deskPositionManager' ? document.getElementById('posPlanned') || panel : panel; target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); };
  // Monitor-opened auto paper trades (H24 amendment 1): data/auto-paper.json is written ONLY by the 24/7 monitor (Worker secret GH_WRITE_TOKEN),
  // which also closes them at their stops and targets. The app reads it with the monitor key and shows them like its own (tag `remote`);
  // it never steps them or pushes them back, so the two never write the same trade.
  async function pullAuto() {
    const tok = ghToken(); if (!tok || !/^[\w.-]+\/[\w.-]+$/.test(ghRepo())) return;
    try {
      const r = await fetch(`https://api.github.com/repos/${ghRepo()}/contents/data/auto-paper.json?ref=main`, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
      if (!r.ok) return; const f = await r.json(); if (!f || !Array.isArray(f.trades)) return;
      const old = new Map(S.paper.filter(t => t.remote).map(t => [t.id, t]));
      S.paper = S.paper.filter(t => !t.remote).concat(f.trades.map(t => { const o = old.get(t.id); return Object.assign({}, t, o ? { wentLive: o.wentLive, onChart: o.onChart } : {}, { remote: true }); }));
      S.autoPulledAt = Date.now(); save(); if (tab === 'coach') renderPaper();
    } catch (e) { }
  }
  // Auto paper trades (H24, pre-registered in docs/research/HYPOTHESES.md before collection): after each scan, every setup that passes the
  // alert grade opens as a paper trade tagged `auto`. Paper only; no alerts, sizing or setup changes come from it. On by default (owner, Nov 3).
  function autoPaperRun(rows) {
    if (T().autoPaper === false || F.demo) return;
    const now = Date.now(), day0 = Math.floor(now / 86400e3) * 86400e3, live = S.paper.filter(t => t.auto && (t.status === 'open' || t.status === 'pending')), px = {}, atr = {};
    for (const sym of T().symbols) { px[sym] = pnlPrice(sym); const A = analyses[sym]; atr[sym] = A && A.atr ? A.atr[60] : null; }
    const picks = C.autoPaperPick(rows, { px, atr, benched: benchedKeys(), used: u => !!useOf(u), openSyms: S.paper.filter(t => t.status === 'open' || t.status === 'pending').map(t => t.sym), openAuto: live.length, openedToday: S.paper.filter(t => t.auto && t.opened >= day0).length });
    for (const u of picks) autoPaperOpen(u);
  }
  function autoPaperOpen(u) {
    const p0 = pnlPrice(u.sym); if (p0 == null) return false;
    const now = Date.now(), t = C.autoPaperTrade(u, p0, analyses[u.sym] && analyses[u.sym].atr ? analyses[u.sym].atr[60] : null, now, Object.assign(paperMeta(u), { auto: true })); if (!t) return false;
    const pa = paperAcct();
    if (pa) { const z = C.paperSize(pa, S.paper, u, t.order === 'limit' ? u.entry : p0, now, prices()); if (z.ok) { t.acct = pa.id; t.qty = z.size.qty; t.riskUsd = z.size.lossAtStop; } }   // account says not now: still collected as an R-only trade
    S.paper.push(t); markUsed(u.key, 'paper'); savePaper('auto open ' + u.sym + ' ' + u.dir);
    if (tab === 'coach') renderPaper();
    return true;
  }
  function paperTick() {
    let changed = false;
    S.paper = S.paper.map(t => { if ((t.status !== 'open' && t.status !== 'pending') || t.remote) return t; const u = C.paperStep(t, F.candles(t.sym, 15), 900, pnlPrice(t.sym), Date.now()); if (u.status !== t.status) changed = true; return u; });
    if (changed) { savePaper('closed by price'); if (T().notify) for (const t of S.paper.filter(t => t.status === 'closed' && t.closed > Date.now() - 60e3)) ntSend(`Paper ${t.sym} ${t.side}: ${t.why}`, `${t.R >= 0 ? '+' : ''}${t.R.toFixed(2)}R after fees. Paper only.`, 2); }
    if (tab === 'coach') renderPaper();
  }
  setInterval(() => { try { paperTick(); } catch (e) { console.warn(e); } }, 5000);   // live price: stop/target checks every 5 s
  // ---------- Simulated prop account for paper trades (same accountState as the Desk) ----------
  const paperAcct = () => S.paperAccts.find(a => a.status === 'active') || null;
  function paperAcctState(a) { return C.accountState(a, C.paperPositions(S.paper, a.id), prices(), Date.now(), { orders: C.paperOrders(S.paper, a.id) }); }
  function newPaperAcct(plan, size, profile) {
    for (const a of S.paperAccts) if (a.status === 'active') { const st = paperAcctState(a); a.status = 'ended'; a.ended = Date.now(); a.final = { equity: st.equity, net: st.equity - a.size }; }
    S.paperAccts.push({ id: 'pa' + Date.now().toString(36), label: 'Paper ' + C.PLANS[plan].name + ' ' + usd(size), plan, size, phase: 'eval', profile, created: Date.now(), status: 'active', paper: true });
    savePaper('new paper account');
  }
  function paperAcctCard() {
    const a = paperAcct();
    const form = `<div class=row style="margin-top:6px"><select id=ppPlan>${Object.keys(C.PLANS).filter(k => k !== 'custom').map(k => `<option value=${k} ${a && a.plan === k ? 'selected' : k === 'advanced' && !a ? 'selected' : ''}>${esc(C.PLANS[k].name)}</option>`).join('')}</select>
      <select id=ppSize>${C.SIZES.map(z => `<option value=${z} ${a && a.size === z ? 'selected' : ''}>${usd(z)}</option>`).join('')}</select>
      <select id=ppProf>${C.PROFILES.map(p => `<option value=${p.id} ${(a ? a.profile : 'steady') === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <button class="btn sm" id=ppNew>${a ? 'Start over' : 'Start paper account'}</button></div>`;
    if (!a) return `<div class=card><h3>Simulated prop account</h3><p class=small>Paper trades get sized and tracked like a real evaluation: same plan rules, daily loss limit, max drawdown, profit target and fees as your Desk. Pick a plan:</p>${form}</div>`;
    const st = paperAcctState(a), status = st.breached ? '<b class=dn>BREACHED</b>' : st.reachedTarget ? '<b class=up>PASSED (target reached)</b>' : 'Evaluation running';
    const past = S.paperAccts.filter(x => x.status === 'ended').slice(-5).reverse();
    return `<div class=card><h3>${esc(a.label)} <span class=tag>simulated</span></h3><p class=small>${status} · started ${fmtTime(a.created, true)} · ${esc(C.profileById(a.profile).name)} pace</p>
      <div class=kv><div><span>Equity</span><b class="${st.equity >= a.size ? 'up' : 'dn'}">${usd(st.equity)}</b></div><div><span>P&amp;L</span><b class="${cls(st.equity - a.size)}">${pnlTxt(st.equity - a.size)}</b></div>
      <div><span>Balance</span>${usd(st.balance)}</div><div><span>Open P&amp;L (before closing fees)</span>${usd(st.upnl)}</div>
      <div><span>Room to breach (${esc(st.binding)})</span><b class="${st.room < st.profRisk * 2 ? 'dn' : ''}">${usd(st.room)}</b></div><div><span>To target</span>${usd(st.toTarget)} (${Math.round(st.progress * 100)}%)</div>
      <div><span>Daily floor</span>${usd(st.dailyFloor)}</div><div><span>Max floor</span>${usd(st.maxFloor)}</div><div><span>Next trade risk</span>${usd(st.nextRisk)}</div><div><span>Trades today</span>${st.tradesToday}</div></div>
      <div class=warns>${st.warnings.map(w => `<div class="${w.lvl === 'bad' ? 'bad' : 'warn'}">${esc(w.text)}</div>`).join('')}</div>
      ${past.length ? `<p class="small mu">Earlier paper accounts: ${past.map(x => `${esc(x.label)} ${x.final ? usd(x.final.net) : ''}`).join(' · ')}</p>` : ''}
      ${form}</div>`;
  }
  // ---------- Using a setup: paper OR live, once (owner's rule, Nov 1 2026) ----------
  // Every setup list shows "Not used yet" or how it was used. Taking it live creates a PLANNED trade (not counted anywhere)
  // until he marks it live after placing it on the platform, or a screenshot import shows it. Used setups stay used even if
  // the trade is later deleted (S.usedSetups); using one again needs a confirm.
  const keysOf = u => [u.key].concat(u.alsoKeys || []);
  // ---------- Market context (data/market/now.json from the "Market data" job, every 3 h) ----------
  // Funding, open interest, liquidations, basis (the futures feed), Hyperliquid funding (PROXY), DVOL, Fear & Greed and macro. Background,
  // NOT a signal: nothing here changes a verdict, a size or an alert until a pre-registered test earns it (MASTER-HANDOFF item 15).
  let MKT = null, mktAt = 0;
  async function loadMarket() {
    if (Date.now() - mktAt < 10 * 60e3) return; mktAt = Date.now();
    try { const r = await fetch('data/market/now.json', { cache: 'no-store' }); if (r.ok) { MKT = await r.json(); if (tab === 'coach' || tab === 'desk') renderAll(true); } } catch (e) { }
  }
  setTimeout(loadMarket, 1500);
  const ago = iso => { const h = (Date.now() - Date.parse(iso)) / 3600e3; return h < 1 ? Math.max(1, Math.round(h * 60)) + ' min ago' : h < 48 ? Math.round(h) + ' h ago' : Math.round(h / 24) + ' days ago'; };
  const sgn = (x, d, u) => x == null || !isFinite(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(d) + (u || '');
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
  const pctl = x => x == null ? '' : ` <span class=mu>(${ord(Math.round(x * 100))} percentile of the year)</span>`;
  function coinCtx(sym) { const c = MKT && MKT.coins && MKT.coins[C.base(sym).replace('XBT', 'BTC')]; return c || null; }
  // Trade snapshots (owner, Nov 2: learn from as much as possible). Every trade (planned, screenshot, manual, paper) gets a market snapshot at
  // open and at close: chart read from candles closed by that moment (C.tradeSnapshot) + market context when it was current (within 3 h).
  // Filled in by a background check, so trades from any path are covered, imported ones included (marked "filled in later").
  const snapCandles = sym => ({ 15: F.candles(sym, 15), 60: F.candles(sym, 60), 240: F.candles(sym, 240), 1440: F.candles(sym, 1440) });
  function makeSnap(sym, ms, side, late) {
    const cs = snapCandles(sym), h1 = cs[60];
    if (!h1.length) return null;                                                  // no candles loaded yet: try again later
    if (ms / 1000 < h1[0].time + 20 * 3600) return { missing: 'older than the loaded candle history', at: Math.round(ms / 1000) };
    const sn = C.tradeSnapshot(cs, Math.round(ms / 1000), side, { tz: T().tz }); if (!sn) return null;
    const fresh = MKT && MKT.made && Math.abs(Date.parse(MKT.made) - ms) <= 3 * 3600e3;
    return Object.assign(sn, { ctx: fresh ? ctxSnapshot(sym) : null, filledLater: !!late });
  }
  function ensureSnaps() {
    let changed = false; const now = Date.now(), wanted = new Set();
    const fill = (o, sym, side, openMs, closeMs) => {
      o.snap = o.snap || {};
      if (!o.snap.open && openMs) { const v = makeSnap(sym, openMs, side, now - openMs > 10 * 60e3); if (v) { o.snap.open = v; changed = true; } else wanted.add(sym); }
      if (!o.snap.close && closeMs) { const v = makeSnap(sym, closeMs, side, now - closeMs > 10 * 60e3); if (v) { o.snap.close = v; changed = true; } else wanted.add(sym); }
    };
    for (const p of S.positions) fill(p, p.sym, p.side, p.opened, p.closed ? p.closed.t : null);
    for (const t of S.paper) if (t.status !== 'pending') fill(t, t.sym, t.side, t.opened, t.status === 'closed' ? t.closed : null);
    for (const sym of wanted) F.want(sym, [15, 60, 240, 1440]).catch(() => { });
    if (changed) save();
  }
  setTimeout(() => { try { ensureSnaps(); } catch (e) { console.warn('snap', e); } }, 6000);
  setInterval(() => { try { ensureSnaps(); } catch (e) { console.warn('snap', e); } }, 30000);
  const snapLine = sn => !sn ? '' : sn.missing ? 'not available (' + sn.missing + ')' : [
    ['240', '4h'], ['60', '1h'], ['15', '15m']].map(([k, n]) => `${n} ${sn.trend[k] || '?'}`).join(' · ') + ` · ${sn.session} · vol ${sn.volRegime || '?'}` +
    (sn.nearestLevel ? ` · ${sn.nearestLevel.distAtr} ATR from ${sn.nearestLevel.name}` : '') + (sn.filledLater ? ' (filled in later)' : '');
  function ctxSnapshot(sym) {   // saved with each paper/live trade so the Scorecard can later test whether context matters
    const c = coinCtx(sym); if (!MKT) return null;
    return { at: MKT.made, fundingPctile: c && c.funding ? c.funding.pctile1y : null, fundingAnn: c && c.funding ? +c.funding.annualPct.toFixed(2) : null, oi24h: c && c.oi ? c.oi.chg24h : null,
      liqRatio: c && c.liquidations ? c.liquidations.ratio : null, labels: c ? c.labels : [], dvolPctile: MKT.vol && MKT.vol.BTC ? MKT.vol.BTC.pctile1y : null,
      fearGreed: MKT.sentiment ? MKT.sentiment.value : null, weather: MKT.weather ? MKT.weather.label : null };
  }
  function weatherLine() {
    if (!MKT || !MKT.weather) return '';
    const m = MKT.macro || {}, w = MKT.weather, bits = [];
    if (m.vix) bits.push(`VIX ${m.vix.value.toFixed(1)}`); if (m.y10) bits.push(`10y ${m.y10.value.toFixed(2)}% (${sgn(m.y10.chg4w, 2)} in 4 wk)`);
    if (m.dollar) bits.push(`dollar ${sgn(m.dollar.chg4w * 100, 1, '%')} 4 wk`); if (MKT.sentiment) bits.push(`Fear & Greed ${MKT.sentiment.value} (${MKT.sentiment.label})`);
    return `<b>Macro: ${esc(w.label)}</b>${w.against.length ? ' · against: ' + esc(w.against.join(', ')) : ''}${w.for.length ? ' · for: ' + esc(w.for.join(', ')) : ''} · ${esc(bits.join(' · '))} <span class=mu>· updated ${esc(ago(MKT.made))} · background, not a signal</span>`;
  }
  function marketCardHtml() {
    loadMarket();
    if (!MKT) {
      const inner = '<p class=mu>Loading… (data/market/now.json, refreshed every 3 hours by the Market data job)</p>';
      return C.uiView(T().view) === 'simple'
        ? `<details class="card mkt-fold" ${fold('mkt:card')}><summary>Market context <span class=tag>loading</span></summary>${inner}</details>`
        : `<div class=card><h3>Market context</h3>${inner}</div>`;
    }
    const row = (k, c) => `<tr><td><b>${esc(k)}</b>${c.labels && c.labels.length ? `<div class="small warn">${esc(c.labels.join('; '))}</div>` : ''}</td>
      <td class=num>${c.funding ? sgn(c.funding.annualPct, 1, '%') + '/yr' + pctl(c.funding.pctile1y) : '—'}</td>
      <td class=num>${c.oi ? sgn(c.oi.chg24h * 100, 1, '%') : '—'}</td>
      <td class=num>${c.liquidations && c.liquidations.ratio != null ? c.liquidations.ratio.toFixed(1) + '×' : '—'}</td>
      <td class=num>${c.basis ? sgn(c.basis.value * 1e4, 1, ' bp') : '—'}</td></tr>`;
    const m = MKT.macro || {}, mrow = (k) => m[k] ? `<tr><td>${esc(m[k].label)}</td><td class=num>${(+m[k].value).toFixed(2)}</td><td class=num>${m[k].chg4w == null ? '—' : m[k].chgKind === 'percent' ? sgn(m[k].chg4w * 100, 1, '%') : sgn(m[k].chg4w, 2)}</td><td class="small mu">${esc(m[k].at.slice(0, 10))}</td></tr>` : '';
    const v = MKT.vol || {};
    const body = `<p class=small>${weatherLine()}</p>
      <table><tr><th>Coin</th><th class=num>Funding (the exchange)</th><th class=num>Open int. 24 h</th><th class=num>Liq. 24 h vs avg</th><th class=num>Basis</th></tr>${Object.entries(MKT.coins || {}).map(([k, c]) => row(k, c)).join('')}</table>
      <p class=small>${v.BTC ? `BTC options fear gauge (DVOL) ${v.BTC.dvol.toFixed(1)} ${pctl(v.BTC.pctile1y)} · ` : ''}${Object.entries(MKT.coins || {}).filter(([, c]) => c.hlFunding).map(([k, c]) => `${esc(k)} Hyperliquid funding ${sgn(c.hlFunding.annualPct, 1, '%')}/yr`).join(' · ')} <span class=mu>(PROXY)</span></p>
      <details class=sc-w ${fold('mkt:macro')}><summary>Macro details</summary><table><tr><th>Series</th><th class=num>Latest</th><th class=num>4-week change</th><th>Date</th></tr>${['y2', 'y10', 'real10', 'dollar', 'usdjpy', 'vix', 'hy', 'spx', 'ndx', 'oil', 'netLiq'].map(mrow).join('')}</table>
        <p class="small mu">Sources: the futures feed (funding, open interest, liquidations, basis), Hyperliquid and Deribit (PROXY), alternative.me Fear & Greed, FRED (St. Louis Fed). Macro data is daily or weekly, so it can't time an entry. "Crowded long/short" = funding in the top/bottom 10% of the past year; liquidations "3×" = the last 24 h vs the 30-day daily average.</p></details>
      <p class="small mu">Updated ${esc(ago(MKT.made))}. None of this is tested as a trade rule yet (hypotheses H5, H6, H9): it never changes a verdict, a size or an alert. Every paper and live trade saves this context at entry so the Scorecard can test it later.</p>`;
    const label = MKT.weather && MKT.weather.label ? MKT.weather.label : 'background';
    return C.uiView(T().view) === 'simple'
      ? `<details class="card mkt-fold" ${fold('mkt:card')}><summary>Market context <span class=tag>${esc(label)}</span></summary>${body}</details>`
      : `<div class=card><h3>Market context <span class=tag>background, not a signal</span></h3>${body}</div>`;
  }
  // ---------- Card verdict (MASTER-HANDOFF, Nov 2 2026): built from the app's existing model, not a second rulebook ----------
  // data health = the feed checks the Desk already shows; structure = his both-ways rule (directionCheck); cost = the replay's fee
  // rule; room = fitOf/weighIdea (his profile, open risk, room); model gate = M2 (replay grade AND valid now) + his bench + the
  // Scorecard's status; evidence label from the 2-year replay and the Scorecard's paper/live counts; star = his accepted "trusted".
  const vMemo = new Map(); let vMemoT = 0;
  function replayFor(u) { const src = BT && ((BT.long && BT.long.groups) || BT.groups); return src ? src[C.setupKey(u.kind, u.tf)] || null : null; }
  let scMemo = { t: 0, rows: {} };
  function scoreRow(key) {
    if (Date.now() - scMemo.t > 5000) { const sc = C.scorecard(C.tradeRecords(S.paper, S.positions), { replay: C.replayByKey(BT), pool: POOL || {} }); scMemo = { t: Date.now(), rows: Object.fromEntries(sc.rows.map(r => [r.key, r])) }; }
    return scMemo.rows[key] || null;
  }
  function verdictOf(u) {
    const now = Date.now(); if (now - vMemoT > 2000) { vMemo.clear(); vMemoT = now; }
    if (vMemo.has(u.key)) return vMemo.get(u.key);
    const key = C.setupKey(u.kind, u.tf), lc = liveOf(u), price = pnlPrice(u.sym), A = analyses[u.sym] || analyze(u.sym), acct = sizeAcct(), fit = fitOf(u, lc.entry), row = scoreRow(key);
    const age = F.age(u.sym), issues = []; if (!F.demo) { if (age == null) issues.push('no live price'); else if (age > T().maxAge) issues.push(`price feed ${Math.round(age)} s old`); }
    try { const cs = C.consensus(F.sources(u.sym), 60, 15); if (cs.outliers && cs.outliers.length) issues.push(`${cs.outliers.join(', ')} differs from the other feeds`); } catch (e) { }
    const dc = T().dirRule === false ? { ok: true, reasons: [] } : C.directionCheck(u.dir, u.sym, A.struct, S.positions, acct ? acct.id : null);
    const v = C.cardVerdict({ dataOk: !issues.length, dataIssues: issues, eventsKnown: false, structure: dc, cost: C.costHurdle(lc.entry || u.entry, u.stop),
      room: fit ? { ok: fit.ok, why: fit.why } : null, modelOk: C.alertWorthy(u, price, A.atr && A.atr[60]), benched: scoreMark(key) === 'benched', starred: scoreMark(key) === 'trusted',
      scoreStatus: row ? row.status : 'gathering', label: C.evidenceLabel(replayFor(u), row) });
    vMemo.set(u.key, v); return v;
  }
  const verdictRank = u => verdictOf(u).verdict;
  // The numbers behind the label, from the 2-year replay (or the 120-day one): what this setup type did, and vs random entries.
  function evidenceNumbers(u) {
    const g = replayFor(u), src = BT && (BT.long || BT), V = src && src.variants && src.variants[C.alertGrade(u).ok ? 'V4' : 'V0'], r = x => x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2) + 'R';
    if (!g || !g.all || !g.all.n) return 'No replay results for this setup type.';
    return `Replay (${BT && BT.long ? '2 years' : '120 days'}, all ${C.setupLabel(C.setupKey(u.kind, u.tf))} setups): ${g.all.n} trades, ${r(g.all.avgR)} each, held-out ${r(g.heldOut.avgR)} (${g.heldOut.n}).`
      + (V && V.placebo && V.placebo.n >= 2 ? ` Versus random entries: ${r(V.placebo.diff)} (z ${V.placebo.z})${V.placebo.z != null && V.placebo.z < 2 ? ', no better than chance' : ''}.` : '');
  }
  const liveOf = u => C.liveCheck(u, pnlPrice(u.sym), analyses[u.sym] && analyses[u.sym].atr ? analyses[u.sym].atr[60] : null);
  const useOf = u => { for (const k of keysOf(u)) { const x = C.setupUse(k, S.paper, S.positions, S.planned, S.usedSetups); if (x) return Object.assign({ key: k }, x); } return null; };
  const openPaperOf = u => S.paper.find(t => t.status === 'open' && keysOf(u).includes(t.setupKey));
  function markUsed(key, how, acct) { if (key && !S.usedSetups[key]) S.usedSetups[key] = { t: Date.now(), how, acct }; }
  const acctName = id => { const a = acctById(id); return a ? a.label || C.planOf(a).name + ' ' + usd(a.size) : ''; };
  function okToUse(u) { const use = useOf(u); return !use || confirm(`This setup was already used (${use.text}). Use it again anyway?`); }
  const SETUP_LISTS = { chart: () => lastUps, coach: () => coachUps, scan: () => scanAll.rows };
  // ---------- Folds stay open through the screen's refresh (owner's report, Nov 1 2026) ----------
  // The Coach, Chart and Paper screens redraw every few seconds; each fold remembers that he opened it.
  const openFolds = new Set();
  const fold = id => `data-fold="${esc(id)}"${openFolds.has(id) ? ' open' : ''}`;
  document.addEventListener('toggle', e => { const d = e.target; if (!d || !d.dataset || !d.dataset.fold) return; if (d.open) openFolds.add(d.dataset.fold); else openFolds.delete(d.dataset.fold); }, true);
  // ---------- One setup card everywhere (owner's request, Nov 1 2026) ----------
  // Same layout on Chart, Coach and Scan all: one header line, a fixed row of price boxes (tap a box to copy that number for
  // the platform's order form), the status/buttons, and the long explanation folded under "Why".
  const cpVal = v => v == null || !isFinite(v) ? '' : String(pxIn(v));
  function priceBoxes(items) {   // items: [[label, value, display?]]
    return `<div class=sc-p>${items.map(([l, v, d]) => v == null || v === '' ? `<div class="cp off"><span>${l}</span><b>—</b></div>`
      : `<button class=cp data-copy="${esc(String(v))}" aria-label="Copy ${l} ${esc(String(v))}"><span>${l} ⧉</span><b>${d != null ? d : px(+v)}</b></button>`).join('')}</div>`;
  }
  // Setups are sized and judged for the account he's trading (owner's rule, Nov 1): pick it once; defaults to the first open one.
  const sizeAcct = () => { const L = liveAccts(); return L.find(a => a.id === T().sizeAcct) || L[0] || null; };
  function fitOf(u, entry) {
    const a = sizeAcct(); if (!a) return null;
    try { const now = Date.now(), A = C.accountState(a, S.positions, prices(), now, { orders: S.planned }), w = C.weighIdea(Object.assign({}, u, { entry: entry != null ? entry : u.entry }), A, S.positions.filter(p => p.acct === a.id), now, { leverage: C.levMap(a) });
      const qty = w.size && w.size.qty > 0 ? w.size.qty : null;
      return { acct: a, ok: !!(w.ok && qty), qty, risk: w.size ? w.size.lossAtStop : null, room: A.room, why: w.rules.filter(r => !r.ok).map(r => r.t) }; } catch (e) { return null; }
  }
  const fitsNow = u => { const lc = liveOf(u), f = fitOf(u, lc.entry); return !!(f && f.ok); };
  function setupSize(u) { const f = fitOf(u); return f && f.qty ? f.qty : null; }
  function sizeAcctPicker() { const L = liveAccts(); if (L.length < 2) return '';
    return `<label class=small style="display:block;margin:0 0 6px">Sizing for <select data-sizeacct>${L.map(a => `<option value="${a.id}" ${sizeAcct() && sizeAcct().id === a.id ? 'selected' : ''}>${esc(acctName(a.id))} · ${esc(a.phase)}</option>`).join('')}</select></label>`; }
  document.addEventListener('change', e => { const s = e.target.closest('[data-sizeacct]'); if (!s) return; T().sizeAcct = s.value; save(); renderAll(true); });
  // Simple Coach rows: direction, the check, and tap-to-copy stop and target. Same Paper / Take it live buttons.
  function compactSetup(list, i, u, extra, rk) {
    const g = C.alertGrade(u), lc = liveOf(u), rr = lc.rr, fit = fitOf(u, lc.entry), vd = verdictOf(u);
    const data = [vd.verdict, lc.status === 'valid' ? 'valid now' : lc.status === 'invalid' ? 'not valid now' : ('partly valid ' + lc.passed + '/' + lc.total),
      rr != null ? rr.toFixed(1) + 'R' : '', g.ok ? 'alert grade' : 'below grade', fit ? (fit.ok ? 'fits the account' : 'account says not now') : 'no account yet'].filter(Boolean).join(' · ');
    return `<div class="sc sc-compact"><div class=sc-h>${rk ? `<b class=rank>#${rk.rank}</b> ` : ''}<b class="${u.dir === 'long' ? 'bull' : 'bear'}">${u.dir.toUpperCase()}</b> <b>${esc(C.base(u.sym))}</b> <span>${u.kind === 'sweep' ? 'Sweep' : 'FVG'} ${esc(C.tfName(u.tf))}</span></div>
      <div class=small>${esc(data)}</div>
      ${priceBoxes([['Stop', cpVal(u.stop)], ['Target', cpVal(u.target)]])}
      <div class=sc-a>${lc.status === 'invalid' && !useOf(u) ? '<span class="small dn">Not valid now. Skip it.</span>' : setupActions(list, i, u)}${extra || ''}</div></div>`;
  }
  function setupCard(list, i, u, extra, rk) {
    if (C.uiView(T().view) === 'simple' && list === 'coach') return compactSetup(list, i, u, extra, rk);
    const g = C.alertGrade(u), lc = liveOf(u), op = { type: lc.order, entry: lc.entry }, ent = lc.entry, rr = lc.rr, fit = fitOf(u, ent), q = fit && fit.qty ? fit.qty : null;
    return `<div class=sc><div class=sc-h>${rk ? `<b class=rank>#${rk.rank}</b>${rk.move ? `<span class="${rk.move > 0 ? 'up' : 'dn'}" title="Moved ${rk.move > 0 ? 'up' : 'down'} ${Math.abs(rk.move)} in the last 10 min">${rk.move > 0 ? '↑' : '↓'}${Math.abs(rk.move)}</span>` : ''} ` : ''}<b class="${u.dir === 'long' ? 'bull' : 'bear'}">${u.dir.toUpperCase()}</b> <b>${esc(C.base(u.sym))}</b> <span>${u.kind === 'sweep' ? 'Sweep' : 'FVG'} ${esc(C.tfName(u.tf))}</span>${rr != null ? ` <span class="${rr >= 2 ? 'up' : rr >= 1 ? '' : 'dn'}" title="Reward:risk from this entry, stop and target, after fees">· ${rr.toFixed(1)}R</span>` : ''}</div>
      <div class=sc-t>${(vd => `<span class="tag ${vd.verdict === 'ELIGIBLE' ? 'up' : vd.verdict === 'NO TRADE' ? 'dn' : 'warn'}" title="${esc(vd.verdict === 'NO TRADE' ? vd.failedName + ': ' + (vd.failedWhy || '') : vd.why.join('; ') || 'passes your rules')}"><b>${vd.verdict}</b>${vd.failedName ? ' · ' + esc(vd.failedName) : ''}</span>`)(verdictOf(u))}${lc.status === 'valid' ? '<span class="tag up">✓ valid now</span>' : lc.status === 'invalid' ? '<span class="tag dn">✗ not valid now</span>' : `<span class="tag warn">partly valid ${lc.passed}/${lc.total}</span>`}<span class="tag ${g.ok ? 'up' : 'mu'}" title="From the replay on past candles">replay: ${g.ok ? 'alert grade' : 'below grade'}</span>${setupBadge(u.kind, u.tf)}</div>
      ${fit ? `<div class="small ${fit.ok ? 'up' : 'warn'}" style="margin-top:4px">${fit.ok ? `Fits ${esc(acctName(fit.acct.id))}: risks ${usd(fit.risk)} of ${usd(fit.room)} room` : `${esc(acctName(fit.acct.id))} says not now: ${esc(fit.why.join(', ') || 'size 0')}`}</div>` : '<div class="small mu" style="margin-top:4px">Add your prop account on the Desk to size setups.</div>'}
      ${priceBoxes([[op.type === 'market' ? 'Market ~' : op.type === 'none' ? 'Past stop' : 'Limit', op.type === 'none' ? '' : cpVal(ent)], ['Stop', cpVal(u.stop)], ['Target', cpVal(u.target)], ['Size', q != null ? String(q) : '', q != null ? String(+q.toPrecision(4)) : null]])}
      <div class=sc-a>${lc.status === 'invalid' && !useOf(u) ? '<span class="small dn">Not valid now: price is past the stop or under 1R after fees. Skip it.</span>' : setupActions(list, i, u)}${extra || ''} <button class="btn sm" data-copy="${esc(`${u.sym} ${u.dir} · ${op.type === 'market' ? 'market ~' : 'limit'} ${cpVal(ent)} · stop ${cpVal(u.stop)}${u.target != null ? ' · target ' + cpVal(u.target) : ''}${q != null ? ' · size ' + q : ''}`)}">Copy all</button></div>
      <details class=sc-w ${fold('why:' + u.key)}><summary>Why</summary>${(vd => `<div><b>Verdict: ${vd.verdict}</b> — ${vd.verdict === 'NO TRADE' ? esc(vd.failedName + ': ' + (vd.failedWhy || '')) : vd.verdict === 'ELIGIBLE' ? 'passes your rules (not a prediction).' : esc(vd.why.join('; '))}</div>
        <div><b>Gates:</b> ${vd.gates.map(g => `<span class="${!g.known ? 'mu' : g.ok ? 'up' : 'warn'}">${!g.known ? '?' : g.ok ? '✓' : '✗'} ${esc(g.name)}${!g.known ? ' (not checked)' : !g.ok && g.why ? ' (' + esc(g.why) + ')' : ''}</span>`).join(' · ')}</div>
        ${(c => c ? `<div><b>Context (${esc(C.base(u.sym))}):</b> funding ${c.funding ? sgn(c.funding.annualPct, 1, '%') + '/yr' + (c.funding.pctile1y != null ? ' (' + ord(Math.round(c.funding.pctile1y * 100)) + ' percentile)' : '') : '—'}, open interest 24 h ${c.oi ? sgn(c.oi.chg24h * 100, 1, '%') : '—'}${c.labels.length ? ' · ' + esc(c.labels.join('; ')) : ''} <span class=mu>(background, not a signal)</span></div>` : '')(coinCtx(u.sym))}
        <div><b>Evidence:</b> ${esc(vd.labelName)}. ${esc(vd.evidenceLine)} ${esc(evidenceNumbers(u))}</div>`)(verdictOf(u))}<div>${esc(u.text)}</div><div><b>Live check now:</b> ${lc.items.map(r => `<span class="${r.ok ? 'up' : 'warn'}">${r.ok ? '✓' : '✗'} ${esc(r.t)}</span>`).join(' · ')}</div>${!g.ok && g.why.length ? `<div class=mu>Below alert grade: ${esc(g.why.join('; '))}</div>` : ''}</details></div>`;
  }
  // A setup the scanner no longer finds: kept at the bottom, greyed, with why (as far as the price now tells) and when last seen.
  function goneCard(r) {
    const u = r.u, lc = liveOf(u), px0 = pnlPrice(u.sym), d = u.dir === 'short' ? -1 : 1;
    if (C.uiView(T().view) === 'simple') return `<div class="sc gone sc-compact"><div class=sc-h><b class="${u.dir === 'long' ? 'bull' : 'bear'}">${u.dir.toUpperCase()}</b> <b>${esc(C.base(u.sym))}</b> <span class=mu>no longer valid · last seen ${fmtTime(r.lastSeen, true)}</span></div></div>`;
    const why = px0 != null && d * (px0 - u.stop) <= 0 ? 'price went through its stop' : px0 != null && u.target != null && d * (px0 - u.target) >= 0 ? 'price already reached its target' : 'its zone was filled or the setup changed';
    const use = useOf(u);
    return `<div class="sc gone"><div class=sc-h><b class=rank>—</b> <b class="${d > 0 ? 'bull' : 'bear'}">${u.dir.toUpperCase()}</b> <b>${esc(C.base(u.sym))}</b> <span>${u.kind === 'sweep' ? 'Sweep' : 'FVG'} ${esc(C.tfName(u.tf))}</span></div>
      <div class=sc-t><span class="tag dn">✗ no longer valid</span><span class=tag>last seen ${fmtTime(r.lastSeen, true)}</span>${use ? `<span class=tag>${esc(use.text)}</span>` : ''}</div>
      <div class="small mu" style="margin-top:4px">Dropped off: ${why}. Entry was ${px(u.entry)}, stop ${px(u.stop)}${u.target != null ? ', target ' + px(u.target) : ''}. Clears after 4 h.</div></div>`;
  }
  async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch (e) { try { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e2) { return false; } } }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    const ok = await copyText(b.dataset.copy); b.classList.add(ok ? 'ok' : 'bad'); const sp = b.querySelector('span'), was = sp ? sp.textContent : b.textContent;
    if (sp) sp.textContent = ok ? 'Copied ✓' : 'Copy failed'; else b.textContent = ok ? 'Copied ✓' : 'Copy failed';
    setTimeout(() => { b.classList.remove('ok', 'bad'); if (sp) sp.textContent = was; else b.textContent = was; }, 1300);
  });

  function setupActions(list, i, u) {
    const use = useOf(u);
    const badge = use ? `<span class="tag ${use.state === 'live' ? 'up' : use.state === 'used' ? 'mu' : 'warn'}">${use.state === 'live' ? '✅ ' : use.state === 'planned' ? '⏳ ' : use.state === 'paper' ? '📝 ' : '✔ '}${esc(use.text)}${use.acct && acctName(use.acct) ? ' · ' + esc(acctName(use.acct)) : ''}</span>` : '<span class="tag up">Not used yet</span>';
    if (use && use.state === 'paper') return badge + ` <button class="btn sm pri" data-sl="${list}:${i}">Take it live</button>`;
    if (use && use.state !== 'used') return badge + (use.state === 'planned' ? ' <button class="btn sm" data-goplanned>Open it</button>' : '');
    return `${badge} <button class="btn sm" data-sp="${list}:${i}">Paper trade</button> <button class="btn sm pri" data-sl="${list}:${i}">Take it live</button>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sp],[data-sl],[data-goplanned]'); if (!b) return;
    if (b.hasAttribute('data-goplanned')) { openDeskManager(); setTimeout(() => { const el = $('#posPlanned'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 80); return; }
    const [list, i] = (b.dataset.sp || b.dataset.sl).split(':'), u = (SETUP_LISTS[list] && SETUP_LISTS[list]() || [])[+i]; if (!u) return;
    if (b.dataset.sp) paperAdd(u); else { const t = openPaperOf(u); if (t) paperToLive(t); else takeLive(u); }
  });
  const pxIn = v => v == null ? '' : +(+v).toFixed(Math.abs(v) >= 1000 ? 1 : Math.abs(v) >= 1 ? 4 : 6);   // price as the platform shows it
  function paperToLive(t) {
    if (!t.setupKey) t.setupKey = 'paper|' + t.id;
    takeLive({ sym: t.sym, dir: t.side, entry: t.plannedEntry > 0 ? t.plannedEntry : t.entry, stop: t.stop, target: t.target, kind: t.kind, tf: t.tf, text: t.text || `${t.kind} ${C.tfName(t.tf)}`, key: t.setupKey }, t);
  }
  function takeLive(u, fromPaper) {
    const accts = liveAccts(); if (!accts.length) { alert('Add your prop account on the Desk first.'); return; }
    if (!fromPaper && !okToUse(u)) return;
    const now = Date.now(), P = prices();
    const sizeIn = (a, entry, stop) => { const A = C.accountState(a, S.positions, P, now, { orders: S.planned }); return C.weighIdea(Object.assign({}, u, { entry }, stop != null && isFinite(stop) ? { stop } : {}), A, S.positions.filter(p => p.acct === a.id), now, { leverage: C.levMap(a) }); };
    const price = pnlPrice(u.sym), atr1 = (analyses[u.sym] && analyses[u.sym].atr[60]) || (analyze(u.sym).atr || {})[60];
    const op = C.orderPlan(u.entry, price, u.stop, u.dir, atr1);
    showModal(`<h3>Take it live: ${esc(u.sym)} ${u.dir.toUpperCase()}</h3>
      ${(vd => `<p class="small ${vd.verdict === 'NO TRADE' ? 'dn' : vd.verdict === 'PAPER ONLY' ? 'warn' : 'up'}"><b>Coach verdict: ${vd.verdict}</b> — ${vd.verdict === 'NO TRADE' ? esc(vd.failedName + ': ' + (vd.failedWhy || '')) : vd.verdict === 'ELIGIBLE' ? 'passes your rules.' : esc(vd.why.join('; '))}. ${esc(vd.evidenceLine)} It's your call; this only tells you where it stands.</p>`)(verdictOf(u))}
      <p class=small>${fromPaper ? `From your open paper trade (opened ${fmtTime(fromPaper.opened, true)} at ${px(fromPaper.entry)}). The paper trade keeps running for reference, but once this is live only the live trade counts on the Scorecard.<br>` : ''}${esc(u.text)}</p>
      <div class=form><label style="grid-column:1/-1">Which account<select id=tlA>${accts.map(a => { const A = C.accountState(a, S.positions, P, now, { orders: S.planned }); return `<option value="${a.id}" ${sizeAcct() && sizeAcct().id === a.id ? 'selected' : ''}>${esc(acctName(a.id))} · ${esc(a.phase)} · room ${usd(A.room)}</option>`; }).join('')}</select></label>
        <label>Order<select id=tlType><option value=market ${op && op.type === 'market' ? 'selected' : ''}>Market</option><option value=limit ${!op || op.type !== 'market' ? 'selected' : ''}>Limit</option></select></label>
        <label>Entry<input id=tlE type=number step=any value="${pxIn((op && op.entry) || u.entry)}"></label>
        <div class=small style="grid-column:1/-1">${op ? `<b class="${op.type === 'none' ? 'dn' : 'up'}">${op.type === 'none' ? 'No trade' : op.type === 'market' ? 'Market' : 'Limit'}</b>: ${esc(op.why)}.` : ''} Level ${px(u.entry)}${price != null ? ' · price now ' + px(price) : ''}.</div>
        <label>Stop<input id=tlS type=number step=any value="${pxIn(u.stop)}"></label>
        <label>Target<input id=tlT type=number step=any value="${pxIn(u.target)}"></label>
        <label>Size<input id=tlQ type=number step=any></label><div style="align-self:end"><button class="btn sm" id=tlSize type=button>↻ Size to my room</button></div>
        <label style="grid-column:1/-1">Plan (why, and what makes you get out)<input id=tlTh value="${esc(u.text)}"></label></div>
      <div id=tlOut class=small></div>
      <p class="small mu">This saves a <b>planned</b> trade. Nothing counts on the Desk yet. Market: place it, then tap <b>It's live</b>. Limit: place it, tap <b>Limit placed</b>, and it becomes an open position by itself when price reaches it. Importing the screenshot also picks it up.</p>
      <div class=row><button class="btn pri" id=tlOk>Save plan</button><button class=btn data-close>Cancel</button></div>`);
    $('#tlType').onchange = () => { $('#tlE').value = $('#tlType').value === 'market' && pnlPrice(u.sym) != null ? pxIn(pnlPrice(u.sym)) : pxIn(u.entry); upd(true); };
    ['#tlE', '#tlS', '#tlT'].forEach(id => $(id).addEventListener('input', () => upd(false))); ['#tlE', '#tlS'].forEach(id => $(id).addEventListener('change', () => upd(true)));
    $('#tlSize').onclick = () => upd(true);
    const upd = fill => { const a = acctById($('#tlA').value), w = sizeIn(a, num($('#tlE').value) || u.entry, num($('#tlS').value)); const z = w.size;
      if (fill && z && z.qty > 0) $('#tlQ').value = z.qty;
      const rrNow = C.rrOf(u.dir, num($('#tlE').value), num($('#tlS').value), num($('#tlT').value));
      const Ast = C.accountState(a, S.positions, P, now, { orders: S.planned }), stN = num($('#tlS').value);
      const sizeLine = z && z.qty > 0 ? `Sized for <b>${esc(acctName(a.id))}</b>: ${esc(C.profileById(a.profile).name)} pace risks <b>${usd(z.lossAtStop)}</b> at the stop (room left ${usd(Ast.room)}, open risk ${usd(Ast.riskToStops)}). ` : '';
      $('#tlOut').innerHTML = sizeLine + (rrNow != null ? `Reward:risk <b class="${rrNow >= 2 ? 'up' : rrNow >= 1 ? '' : 'dn'}">${rrNow.toFixed(2)}R</b> from this entry, stop and target, after fees. ` : '<span class=warn>Reward:risk unknown: needs a target on the right side.</span> ') + (z && z.qty > 0 ? `Your ${esc(C.profileById(a.profile).name)} pace: <b>${z.qty} ${esc(C.base(u.sym))}</b>, about ${usd(z.lossAtStop)} at the stop${z.levUnknown ? ' · <span class=warn>leverage unknown</span>' : ''}.` : '<b class=warn>Your account says size 0 right now.</b>')
        + (w.rules.some(r => !r.ok) ? `<div class=warn>Not passing: ${w.rules.filter(r => !r.ok).map(r => esc(r.t)).join(', ')}</div>` : '<div class=up>Every account rule passes.</div>'); };
    $('#tlA').onchange = () => upd(true); upd(true);
    $('#tlOk').onclick = () => {
      const q = num($('#tlQ').value), e0 = num($('#tlE').value), st = num($('#tlS').value), d = u.dir === 'short' ? -1 : 1;
      if (op && op.type === 'none' && !confirm('Price is already past the stop. Save the plan anyway?')) return;
      if (!(q > 0) || !(e0 > 0)) { alert('Entry and size are required.'); return; }
      if (st == null || d * (e0 - st) <= 0) { alert('Every trade needs a stop on the right side of the entry.'); return; }
      if (!$('#tlTh').value.trim()) { alert('Every trade needs a plan: write one line.'); return; }
      let tag = 'plan', tagNote;   // your both-ways rule, same as the manual form: breaking it needs a yes and is logged as a rule break
      if (T().dirRule !== false) { const dc = C.directionCheck(u.dir, u.sym, analyze(u.sym).struct, S.positions, $('#tlA').value);
        if (!dc.ok) { if (!confirm('This breaks your rule "both ways only when it makes sense":\n- ' + dc.reasons.join('\n- ') + '\n\nTake it anyway? It will be marked as a rule break.')) return; tag = 'rulebreak'; tagNote = dc.reasons.join('; '); } }
      const vd0 = verdictOf(u);
      S.planned.push({ id: uid(), acct: $('#tlA').value, sym: u.sym, side: u.dir, entry: e0, stop: st, tp1: num($('#tlT').value), qty: q, tf: u.tf, tag, tagNote, ctxAtEntry: ctxSnapshot(u.sym), verdictAtEntry: { verdict: vd0.verdict, failedGate: vd0.failedGate, label: vd0.label, model: C.MODEL },
        setup: u.kind === 'sweep' ? 'Liquidity sweep' : 'FVG', thesis: $('#tlTh').value.trim(), ref: { key: C.setupKey(u.kind, u.tf), model: C.MODEL }, setupKey: u.key, created: Date.now(), fromPaper: fromPaper ? fromPaper.id : undefined, orderType: $('#tlType').value });
      markUsed(u.key, 'planned', $('#tlA').value); save(); closeModal(); toast('Plan saved: ' + u.sym + ' ' + u.dir, 'desk', 'View in Desk', 'deskPositionManager');
    };
  }
  // Planned -> live: he placed it on the platform. Fill price and size as the platform shows them.
  function goLive(pl) {
    const live = pnlPrice(pl.sym);
    showModal(`<h3>${pl.status === 'placed' ? 'Limit filled' : 'It\'s live'}: ${esc(pl.sym)} ${pl.side.toUpperCase()}</h3>
      <div class=form><label>Fill price (from your platform)<input id=glE type=number step=any value="${pl.entry}"></label>
        <label>Size filled<input id=glQ type=number step=any value="${pl.qty}"></label>
        <label>Stop set on the platform<input id=glS type=number step=any value="${pl.stop}"></label>
        <label>Target<input id=glT type=number step=any value="${pl.tp1 != null ? pl.tp1 : ''}"></label></div>
      <p class="small mu">${live != null ? 'Price now ' + px(live) + '. ' : ''}From now the Desk, Coach and monitor count it.</p>
      <div class=row><button class="btn pri" id=glOk>It's live</button><button class=btn data-close>Cancel</button></div>`);
    $('#glOk').onclick = () => {
      const e0 = num($('#glE').value), q = num($('#glQ').value), st = num($('#glS').value), d = pl.side === 'short' ? -1 : 1;
      if (!(e0 > 0) || !(q > 0)) { alert('Fill price and size are required.'); return; }
      if (st == null || d * (e0 - st) <= 0) { alert('The stop must be on the right side of the fill.'); return; }
      S.positions.push(liveFromPlan(pl, { entry: e0, qty: q, stop: st, tp1: num($('#glT').value), opened: Date.now() }));
      S.planned = S.planned.filter(x => x.id !== pl.id); closeModal(); posFormDirty = true; saveAndSync('live'); ensureFeeds(); renderAll(true);
    };
  }
  function liveFromPlan(pl, o) {
    if (pl.fromPaper) { const t = S.paper.find(x => x.id === pl.fromPaper); if (t) { t.wentLive = true; (t.log = t.log || []).push({ t: Date.now(), what: 'taken live' }); } }
    if (pl.setupKey) S.usedSetups[pl.setupKey] = { t: Date.now(), how: 'live', acct: pl.acct };
    return { id: uid(), acct: pl.acct, sym: pl.sym, side: pl.side, qty: o.qty, entry: o.entry, stop: o.stop, origStop: o.stop, tp1: o.tp1 != null ? o.tp1 : pl.tp1, tp2: null,
      tf: pl.tf, setup: pl.setup, thesis: pl.thesis, opened: o.opened, openedUnknown: !!o.openedUnknown, partials: [], stopHist: [{ t: Date.now(), stop: o.stop, why: 'live from plan' }],
      ref: pl.ref, setupKey: pl.setupKey, tag: pl.tag || 'plan', tagNote: pl.tagNote, verdictAtEntry: pl.verdictAtEntry, ctxAtEntry: pl.ctxAtEntry || ctxSnapshot(pl.sym), source: o.source || 'plan',
      orderId: o.orderId || pl.orderId || null };   // entry order ID (owner: note the ID so later TP/SL fills match it)
  }
  function plannedHtml() {
    if (!S.planned.length) return '';
    return `<div class=card id=posPlanned><h3>Planned and working orders</h3>${S.planned.map(pl => { const a = acctById(pl.acct), lim = pl.orderType !== 'market', placed = pl.status === 'placed';
      const state = placed ? `<b class=warn>📌 Limit working since ${fmtTime(pl.placedAt, true)}</b>: becomes an open position when price reaches ${px(pl.entry)}${pl.ranAway ? `<div class=dn>Price ran to the ${pl.ranAway === 'target' ? 'target' : 'stop'} without filling: cancel this order on your platform.</div>` : ''}`
        : lim ? '<b>Not placed yet</b>: place the limit order on your platform, then tap Limit placed.' : '<b>Not placed yet</b>: place the market order on your platform, then tap It\'s live.';
      const btns = placed ? `<button class="btn sm" data-golive="${pl.id}">It filled</button><button class="btn sm" data-dropplan="${pl.id}">Order cancelled</button>`
        : lim ? `<button class="btn sm pri" data-placed="${pl.id}">📌 Limit placed</button><button class="btn sm" data-dropplan="${pl.id}">Cancel plan</button>`
        : `<button class="btn sm pri" data-golive="${pl.id}">✅ It's live</button><button class="btn sm" data-dropplan="${pl.id}">Cancel plan</button>`;
      return `<div class=sc><div class=sc-h><b class="${pl.side === 'long' ? 'bull' : 'bear'}">${pl.side.toUpperCase()}</b> <b>${esc(C.base(pl.sym))}</b> <span>${lim ? 'Limit' : 'Market'}</span>${(r => r != null ? ` <span class="${r >= 2 ? 'up' : r >= 1 ? '' : 'dn'}">· ${r.toFixed(1)}R</span>` : '')(C.rrOf(pl.side, pl.entry, pl.stop, pl.tp1))} <span class=tag>${esc(a ? a.label || C.planOf(a).name : '?')}</span> <span class=tag>${esc(C.setupLabel(pl.ref && pl.ref.key))}</span></div>
        ${priceBoxes([[lim ? 'Limit' : 'Entry ~', cpVal(pl.entry)], ['Stop', cpVal(pl.stop)], ['Target', cpVal(pl.tp1)], ['Size', String(pl.qty), String(+(+pl.qty).toPrecision(4))]])}
        <div class=small>${state}</div>
        <div class=sc-a>${btns}</div>${pl.thesis ? `<details class=sc-w ${fold('plan:' + pl.id)}><summary>Plan</summary><div>${esc(pl.thesis)}</div></details>` : ''}</div>`; }).join('')}
      <p class="small mu">Planned only: counts nothing. Working (placed): counts in your risk and margin like the exchange reserves it, but not in equity or P&amp;L until it fills. A working limit turns into an open position by itself when price reaches it (checked against the candles since you placed it, even after the app was closed). Importing a screenshot that shows the position does it too.</p></div>`;
  }
  // Working limits: fill when price reaches the limit (owner's rule, Nov 1 2026). Runs every 15 s and when the app opens.
  function plannedTick() {
    let changed = false; const now = Date.now();
    for (const pl of S.planned.filter(x => x.status === 'placed')) {
      const f = C.limitFill(pl, F.candles(pl.sym, 15), 900, pnlPrice(pl.sym), now);
      if (f.filled) {
        S.positions.push(liveFromPlan(pl, { entry: pl.entry, qty: pl.qty, stop: pl.stop, opened: f.t, source: 'limit-fill' }));
        S.planned = S.planned.filter(x => x.id !== pl.id); changed = true;
        ntSend(`${pl.sym} ${pl.side} limit filled @ ${px(pl.entry)}`, `Now an open position on ${acctName(pl.acct)}. Check your platform shows it.`, 4);
      } else if (f.ranAway && !pl.ranAway) { pl.ranAway = f.ranAway; changed = true;
        ntSend(`${pl.sym} ${pl.side}: limit not filled, price ran to the ${f.ranAway}`, `Cancel the ${px(pl.entry)} limit on your platform.`, 4); }
    }
    if (changed) { posFormDirty = true; saveAndSync('limit'); renderAll(true); }
  }
  setInterval(() => { try { plannedTick(); } catch (e) { console.warn(e); } }, 5000);   // live price: limit fills every 5 s setTimeout(() => { try { plannedTick(); } catch (e) { } }, 8000);
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-golive]'); if (g) { const pl = S.planned.find(x => x.id === g.dataset.golive); if (pl) goLive(pl); return; }
    const pd = e.target.closest('[data-placed]'); if (pd) { const pl = S.planned.find(x => x.id === pd.dataset.placed); if (pl) { pl.status = 'placed'; pl.placedAt = Date.now(); saveAndSync('order placed'); renderAll(true); } return; }
    const d = e.target.closest('[data-dropplan]'); if (d && confirm('Remove this ' + ((S.planned.find(x => x.id === d.dataset.dropplan) || {}).status === 'placed' ? 'working order (cancel it on your platform too)' : 'plan') + '? The setup stays marked as used.')) { S.planned = S.planned.filter(x => x.id !== d.dataset.dropplan); saveAndSync('order removed'); renderAll(true); }
  });

  // ---------- Scorecard: the model learns from closed trades (owner's choice, Nov 1 2026) ----------
  // Ranks each setup type by your forward results (paper + live trades tagged "followed plan") next to the replay and
  // everyone's pooled results. Status rules are fixed (C.scoreStatus); a status change is a suggestion until you accept it.
  // Accepted: "trusted" setups get a star and sort first; "benched" setups stop sending phone alerts. Size never changes.
  const POOL_URL = 'https://kraken-prop-desk.jbyerstemp.workers.dev/pool', RESULT_URL = 'https://kraken-prop-desk.jbyerstemp.workers.dev/result', RESULT_KEY = 'kpd_results';
  const INSTALL_KEY = 'kpd_install', SHARE_HOLD = 'kpd_share_hold', SAMPLE_HOLD = 'kpd_sample_hold';
  let POOL = null, poolAt = 0;
  // Anonymous per-browser id. Not in the backup (kpd_v1) and never shown in full. The server stores only a salted hash.
  function installId(reset) {
    try {
      if (reset) localStorage.removeItem(INSTALL_KEY);
      let id = localStorage.getItem(INSTALL_KEY);
      if (!/^[0-9a-f]{32}$/.test(id || '')) {
        const b = new Uint8Array(16); crypto.getRandomValues(b);
        id = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(INSTALL_KEY, id);
      }
      return id;
    } catch (e) { return ''; }
  }
  const peekInstall = () => { try { const id = localStorage.getItem(INSTALL_KEY) || ''; return /^[0-9a-f]{32}$/.test(id) ? id : ''; } catch (e) { return ''; } };
  const holdOf = key => { try { const h = JSON.parse(localStorage.getItem(key) || 'null'); if (h && h.until > Date.now()) return h; } catch (e) { } return null; };
  const setHold = (key, ms, why) => { try { localStorage.setItem(key, JSON.stringify({ until: Date.now() + ms, why: String(why || '') })); } catch (e) { } };
  const clearHold = key => { try { localStorage.removeItem(key); } catch (e) { } };
  // Nothing is uploaded until the first-run choice is saved. Both editions start with the boxes ticked.
  function shareWanted(key) { return C.shareOffered(T()[key]); }
  function shareEnabled(key) { return C.shareLive(T().shareConsent, T()[key]); }
  function setShareFlag(key, on) {
    T()[key] = !!on;
    const other = key === 'shareResults' ? 'shareLayout' : 'shareResults';
    if (T()[other] !== true && T()[other] !== false) T()[other] = true;
    T().shareConsent = (T().shareResults === true || T().shareLayout === true) ? 'yes' : 'no';
    if (on && key === 'shareResults') { installId(); clearHold(SHARE_HOLD); }
    if (on && key === 'shareLayout') clearHold(SAMPLE_HOLD);
  }
  async function loadPool() {
    if (F.demo || Date.now() - poolAt < 10 * 60e3) return; poolAt = Date.now();
    try { const r = await fetch(POOL_URL); if (r.ok) { POOL = (await r.json()).models || null; if (tab === 'coach') renderPaper(); } } catch (e) { }
  }
  const scoreMark = key => (S.scoreAccepted || {})[key];   // 'trusted' | 'benched' | undefined
  const benchedKeys = () => Object.entries(S.scoreAccepted || {}).filter(([, v]) => v === 'benched').map(([k]) => k);
  function setupBadge(kind, tf) { const m = scoreMark(C.setupKey(kind, tf)); return m === 'trusted' ? '<span class="tag up" title="Proven on your trades (you accepted it)">★ trusted</span> ' : m === 'benched' ? '<span class="tag dn" title="Benched by you: no phone alerts">benched</span> ' : ''; }
  function rememberSent(sent, id) {
    sent.push(id); try { localStorage.setItem(RESULT_KEY, JSON.stringify(sent.slice(-3000))); } catch (e) { }
  }
  async function sendResults() {
    if (F.demo || !shareEnabled('shareResults') || holdOf(SHARE_HOLD)) return;
    const inst = installId(); if (!inst) return;
    let sent; try { sent = JSON.parse(localStorage.getItem(RESULT_KEY)) || []; } catch (e) { sent = []; }
    const edition = FEEDBACK_PUBLIC ? 'public' : 'private';
    const todo = C.tradeRecords(S.paper, S.positions).filter(r => r.key !== 'unlinked').map(r => C.resultPayload(r, edition, inst)).filter(b => b && !sent.includes(b.id)).slice(0, 10);
    for (const b of todo) {
      let x, j = {};
      try { x = await fetch(RESULT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b), keepalive: true }); }
      catch (e) { return; }   // offline: try again next interval
      try { j = await x.json(); } catch (e) { j = {}; }
      if (x.status === 403) { setHold(SHARE_HOLD, 7 * 86400e3, j.why || 'origin'); return; }
      if (x.status === 429) { setHold(SHARE_HOLD, 6 * 3600e3, 'daily cap'); return; }
      if (x.status === 503 || (x.status === 400 && (j.why === 'bad shape' || j.why === 'json' || !j.why))) { setHold(SHARE_HOLD, 6 * 3600e3, j.why || 'not ready'); return; }
      if (j && j.ok) { rememberSent(sent, b.id); continue; }
      if (x.status === 400) { rememberSent(sent, b.id); continue; }   // this trade was refused; don't block the rest
      return;
    }
  }
  setTimeout(() => { try { sendResults(); } catch (e) { } }, 20000); setInterval(() => { try { sendResults(); } catch (e) { } }, 10 * 60e3);
  function scorecardHtml() {
    loadPool();
    const recs = C.tradeRecords(S.paper, S.positions), sc = C.scorecard(recs, { replay: C.replayByKey(BT), pool: POOL || {} }), pat = C.tradePatterns(recs.filter(r => r.model === sc.model));
    const r = x => x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2) + 'R', cl = x => x > 0 ? 'up' : x < 0 ? 'dn' : '';
    const cell = st => st && st.n ? `<span class="${cl(st.avg)}">${r(st.avg)}</span><div class="small mu">${st.n} · ${Math.round(st.win * 100)}% win${st.lo != null ? ` · ${r(st.lo)} to ${r(st.hi)}` : ''}</div>` : '<span class=mu>—</span>';
    const mini = (avg, n) => n ? `<b class="${cl(avg)}">${r(avg)}</b><span class=mu>${n}</span>` : '<b class=mu>—</b><span class=mu></span>';
    const stPlain = x => x.status === 'gathering' ? `gathering ${x.forward.n || 0}/${C.SCORE_RULES.minN}` : x.status;
    const label = { proven: '<b class=up>proven</b>', disproven: '<b class=dn>disproven</b>', 'below replay': '<b class=warn>below replay</b>', unclear: 'unclear', gathering: '<span class=mu>gathering</span>' };
    const suggest = row => { const want = row.status === 'proven' ? 'trusted' : (row.status === 'disproven' || row.status === 'below replay') ? 'benched' : null, have = scoreMark(row.key);
      if (want && want !== have) return `<div class=small>Suggested: <b>${want === 'trusted' ? '★ trust it' : 'bench it'}</b> <button class="btn sm" data-score="${esc(row.key)}" data-to="${want}">Accept</button></div>`;
      return have ? `<div class=small>${have === 'trusted' ? '★ trusted' : 'benched'} <button class="btn sm" data-score="${esc(row.key)}" data-to="">Undo</button></div>` : ''; };
    const rows = sc.rows.map(x => `<tr><td class=sc-name><b>${esc(x.label)}</b> <span class=mu>${esc(stPlain(x))}</span>${suggest(x)}</td>
      <td class=num>${x.replay ? `<span class="${cl(x.replay.avgR)}">${r(x.replay.avgR)}</span><div class="small mu">${x.replay.n}</div>` : '<span class=mu>—</span>'}</td>
      <td class=num>${cell(x.paper)}</td><td class=num>${cell(x.live)}</td><td class=num>${cell(x.pool)}</td></tr>`).join('');
    const phone = sc.rows.map(x => {
      const note = x.paper && x.paper.n ? `${Math.round(x.paper.win * 100)}% win${x.paper.lo != null ? ` · ${r(x.paper.lo)} to ${r(x.paper.hi)}` : ''}` : '';
      return `<div class=scr><div class=scr-n><b>${esc(x.label)}</b> <span class=mu>${esc(stPlain(x))}</span></div><div class=scr-g><div>${mini(x.replay && x.replay.avgR, x.replay && x.replay.n)}</div><div>${mini(x.paper && x.paper.avg, x.paper && x.paper.n)}</div><div>${mini(x.live && x.live.avg, x.live && x.live.n)}</div><div>${mini(x.pool && x.pool.avg, x.pool && x.pool.n)}</div></div>${note ? `<div class="scr-x mu">${note}</div>` : ''}${suggest(x)}</div>`;
    }).join('');
    const tagRows = Object.entries(pat.byTag).map(([k, st]) => `<tr><td>${esc(C.TRADE_TAGS[k].split(' (')[0])}</td><td class=num>${cell(st)}</td></tr>`).join('');
    const sesRows = Object.entries(pat.bySession).map(([k, st]) => `<tr><td>${esc(k)}</td><td class=num>${cell(st)}</td></tr>`).join('');
    return `<div class=card><h3>Scorecard <span class=tag>model ${esc(sc.model)} · learns from every closed trade</span></h3>
      <p class=small>Each setup type is judged by your closed paper trades and live trades tagged "followed plan" (in R, after fees), next to the replay on past candles and <b>everyone's</b> results (optional, anonymous, self-reported until a later check). Mistakes, rule breaks and data problems never count against a setup. The Everyone column does not change your size or alerts.</p>
      ${rows ? `<div class=sc-phone><div class=scr-h><span>Replay</span><span>Paper</span><span>Live</span><span>All</span></div>${phone}</div><table class=sc-desk><thead><tr><th>Setup</th><th class=num>Replay</th><th class=num>Your paper</th><th class=num>Your live</th><th class=num>Everyone</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class=mu>No closed trades under this model yet. Paper trade the setups, or plan live trades with "Plan it", and they show up here.</p>'}
      ${sc.unlinked ? `<p class="small warn">${sc.unlinked} closed live trade(s) aren't linked to a setup: pick one in Desk → Manage → Closed (journal).</p>` : ''}
      <details ${fold('sc:how')}><summary class=small><b>How it decides</b> (rules fixed Nov 1, 2026, before any results)</summary><p class=small>Under ${C.SCORE_RULES.minN} trades: <b>gathering</b>, too few to tell. With ${C.SCORE_RULES.minN}+: <b>proven</b> if the whole 95% range of the average R is above 0; <b>disproven</b> if it's all below 0; <b>below replay</b> if it's all below the replay's average (execution or the edge fading); otherwise <b>unclear</b>. A change is only a suggestion: you accept it. ★ trusted setups are marked and listed first; benched ones stop sending phone alerts. Nothing here ever changes your size. When the model's rules change it gets a new version (now ${esc(sc.model)}), and its record starts fresh so old and new rules never mix.</p></details>
      ${tagRows || sesRows ? `<details ${fold('sc:patterns')}><summary class=small><b>Your patterns</b></summary><table><tr><th>Live trades by tag</th><th class=num>Result</th></tr>${tagRows || '<tr><td colspan=2 class=mu>No live trades yet.</td></tr>'}</table>
        <table style="margin-top:6px"><tr><th>All trades by session (NY time)</th><th class=num>Result</th></tr>${sesRows}</table>
        <p class=small>Trades opened within 4h after a losing trade: ${cell(pat.afterLoss)}</p></details>` : ''}
      ${(L => L.length ? `<details ${fold('sc:lessons')}><summary class=small><b>Lessons from closed trades</b> (the Coach's findings + your tags)</summary><table><tr><th>What went wrong</th><th class=num>Trades</th><th class=num>Avg R</th></tr>${L.map(x => `<tr><td>${esc(x.label)}</td><td class=num>${x.n} of ${x.of}</td><td class="num ${x.avgR > 0 ? 'up' : x.avgR < 0 ? 'dn' : ''}">${x.avgR == null ? '—' : r(x.avgR)}</td></tr>`).join('')}</table><p class="small mu">Counted, never acted on by itself. When one keeps showing up (e.g. stops inside normal noise), that's the evidence to change a rule; a change gets a new model version and its own record.</p></details>` : '')(C.lessons(S.positions))}
      <details ${fold('sc:models')}><summary class=small><b>Model versions</b></summary><table>${C.MODELS.slice().reverse().map(m => `<tr><td><b>${m.id}</b></td><td class=small>${m.from ? new Date(m.from).toISOString().slice(0, 10) : '—'}</td><td class=small>${esc(m.note)}</td></tr>`).join('')}</table></details></div>`;
  }
  // Paper open R from the LIVE price (owner, Nov 2: use live price where prudent); falls back to the last saved value.
  const liveR = t => { if (t.status !== 'open') return t.openR; const p0 = pnlPrice(t.sym); return p0 != null ? C.paperR(Object.assign({ stop0: t.stop }, t), p0, Date.now()) : t.openR; };
  // Daily trend system (H15 S2, passed its pre-registered test Nov 2 2026, label 3): paper-forward record from the day he started it.
  // Pure replay of the shared rules (js/trend.js) over the exchange's closed daily candles, counting only trades ENTERED on or after the start,
  // so it can't be edited after the fact. No alerts, no sizing: those need his star after 30+ paper trades.
  const TREND_SYMS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD'];
  function trendForward() {
    if (!T().trendStart) { T().trendStart = Math.floor(Date.now() / 86400e3) * 86400; save(); }
    const now = Date.now() / 1000, out = { start: T().trendStart, coins: [], trades: [], port: { coins: [], trades: [] } };
    for (const sym of TREND_SYMS) {
      const c = F.candles(sym, 1440).filter(x => x.time + 86400 <= now);
      if (c.length < PDTrend.WARM + 2) { out.coins.push({ sym, loading: true, have: c.length }); out.port.coins.push({ sym, loading: true, have: c.length }); continue; }
      const r = PDTrend.run(c, PDTrend.S2(), sym, { from: T().trendStart }), st = PDTrend.stateNow(c), p0 = pnlPrice(sym);
      const all = r.open ? null : PDTrend.run(c, PDTrend.S2(), sym, {}).open, preOpen = all && all.t < T().trendStart ? all : null;   // the rules' trade started before his paper start
      out.trades.push(...r.trades);
      const sane = p0 != null && Math.abs(p0 / st.close - 1) <= 0.15;   // live price far from the last daily close = a feed mismatch: don't show an R
      out.coins.push({ sym, state: st, preOpen, open: r.open, openR: r.open && sane ? PDTrend.openR(r.open, p0, now) : null, priceCheck: r.open && p0 != null && !sane, price: p0 });
      // H19 trend portfolio (passed, label 3): the six daily trend rules at 1/6 size each, same paper-forward rules (only entries from the start count)
      if (c.length >= PDTrend.PORT.warm + 2) { const pf = PDTrend.portfolio(c, sym, { from: T().trendStart }), rules = PDTrend.PORT.rules.map(e => PDTrend.ENTRIES[e](1).entry(c, c.length - 1));
        out.port.trades.push(...pf.trades); out.port.coins.push({ sym, rules, open: pf.open.map(o => Object.assign({}, o, { R: sane ? PDTrend.openR(o, p0, now) : null })), priceCheck: pf.open.length && p0 != null && !sane }); }
      else out.port.coins.push({ sym, loading: true, have: c.length });
    }
    return out;
  }
  function trendPortCardHtml(tf) {
    const B = PDTrend.BACKTEST_PORT, P = tf.port, n = P.trades.length, sum = a => a.reduce((s, x) => s + x, 0), sg = (x, d) => (x >= 0 ? '+' : '') + x.toFixed(d);
    const avg = n ? sum(P.trades.map(x => x.R)) / n : null, tot = sum(P.trades.map(x => x.R * x.w)), ma = tf.trades.length, maTot = sum(tf.trades.map(x => x.R));
    const rows = P.coins.map(k => k.loading ? `<tr><td>${esc(k.sym)}</td><td colspan=2 class=mu>${k.have ? `needs ${PDTrend.PORT.warm + 2} days of daily candles, has ${k.have}${F.demo ? ' (demo makes up only 60 days)' : ''}` : 'loading daily candles…'}</td></tr>` : (() => {
      const L = k.rules.filter(x => x > 0).length, Sh = k.rules.filter(x => x < 0).length, oR = k.open.every(o => o.R != null) ? sum(k.open.map(o => o.R * o.w)) : null;
      const opens = k.open.map(o => `<span class="${o.dir > 0 ? 'up' : 'dn'}" title="${esc(PDTrend.RULE_NAMES[o.rule])}">${esc(o.rule)} ${o.dir > 0 ? 'L' : 'S'}</span>`).join(' ');
      return `<tr><td><b>${esc(C.base(k.sym))}</b></td><td class=small><b class=up>${L} long</b> · <b class=dn>${Sh} short</b> · ${6 - L - Sh} flat</td>
        <td class=small>${k.open.length ? `${opens}${oR != null ? ` · <b class="${oR >= 0 ? 'up' : 'dn'}">${sg(oR, 2)}R</b> (at 1/6 each)` : k.priceCheck ? ' · <span class=warn>price check: live price far from the daily candles</span>' : ''}` : '<span class=mu>no paper positions</span>'}</td></tr>`; })()).join('');
    return `<div class=card><h3>Trend portfolio <span class="tag up">passed backtest · label 3</span> <span class=tag>paper only</span></h3>
      <p class=small>Six daily trend rules run side by side on each coin, each at 1/6 of one trade's risk, no picking (H19): ${PDTrend.PORT.rules.map(e => `${e} ${esc(PDTrend.RULE_NAMES[e])}`).join(' · ')}. Same fills, 2× ATR stop (never widened) and costs as the trend system above; same start date, and only trades entered from then count.</p>
      <table class="stack"><tr><th>Coin</th><th>Rules now</th><th>Paper positions</th></tr>${rows}</table>
      <p class=small><b>Paper record since ${fmtTime(tf.start * 1000, true)}:</b> ${n ? `${n} closed · avg <b class="${avg >= 0 ? 'up' : 'dn'}">${sg(avg, 3)}R</b> a rule-trade · ${Math.round(100 * P.trades.filter(x => x.R > 0).length / n)}% winners · portfolio total <b>${sg(tot, 2)}R</b>` : 'no closed trades yet'} · backtest: ${sg(B.avgR, 2)}R a rule-trade over 10 years (${sg(B.heldAvgR, 3)}R since Dec 2021), ${Math.round(B.winRate * 100)}% winners. ${n < 30 ? `<span class=warn>${30 - n} more closed trades before judging it.</span>` : ''}</p>
      <p class=small><b>Side by side (paper):</b> trend system ${ma} closed, ${sg(maTot, 2)}R · portfolio ${n} closed, ${sg(tot, 2)}R. Backtest 2021–2026: portfolio return ÷ worst drawdown 1.08 vs 0.26 for the trend system alone. Judge both after 30+ closed trades each; you decide.</p>
      <p class="small mu">Worst backtest drawdown ${B.maxDrawdownR.toFixed(1)}R: to stay inside a 3% evaluation that's only about 0.19% of the account per trade (~30 months to +9%), so it's mainly a funded/own-money idea. No alerts or sizing until 30+ paper trades and your ★. Research, not financial advice.</p></div>`;
  }
  function trendCardHtml() {
    for (const sym of TREND_SYMS) F.want(sym, [1440]).catch(() => { });
    const tf = trendForward(), B = PDTrend.BACKTEST, rs = tf.trades.map(x => x.R), n = rs.length, avg = n ? rs.reduce((a, x) => a + x, 0) / n : null;
    const nextClose = new Date((Math.floor(Date.now() / 86400e3) + 1) * 86400e3), when = fmtTime(nextClose.getTime(), true);
    const rows = tf.coins.map(k => k.loading ? `<tr><td>${esc(k.sym)}</td><td colspan=2 class=mu>${k.have ? `needs ${PDTrend.WARM + 2} days of daily candles, has ${k.have}${F.demo ? ' (demo makes up only 60 days)' : ''}` : 'loading daily candles…'}</td></tr>` : `<tr><td><b>${esc(C.base(k.sym))}</b></td>
      <td class=small>${k.state.rule > 0 ? '<b class=up>Long</b>' : k.state.rule < 0 ? '<b class=dn>Short</b>' : '<b>Flat</b>'} · close ${px(k.state.close)} vs 20-day ${px(k.state.fast)} / 50-day ${px(k.state.slow)}</td>
      <td class=small>${k.open ? `<b class="${k.open.dir > 0 ? 'up' : 'dn'}">${k.open.dir > 0 ? 'Long' : 'Short'}</b> since ${fmtTime(k.open.t * 1000, true)} @ ${px(k.open.entry)} · stop ${px(k.open.stop)}${k.openR != null ? ` · <b class="${k.openR >= 0 ? 'up' : 'dn'}">${k.openR >= 0 ? '+' : ''}${k.openR.toFixed(2)}R</b>` : k.priceCheck ? ' · <span class=warn>price check: live price far from the daily candles</span>' : ''}` : '<span class=mu>no paper position</span>'}</td></tr>`).join('');
    return `<div class=card><h3>Daily trend system <span class="tag up">passed backtest · label 3</span> <span class=tag>paper only</span></h3>
      <p class=small>Rules (tested on 10 years, H15 S2): long when the daily close is above the 50-day average and the 20-day is above the 50-day; exit when the close drops below the 20-day. Short is the mirror image. Stop 2× the daily ATR at entry, never widened. Checked at each daily close (next: ${esc(when)}), filled at the next open. When price sits between the 20- and 50-day averages it exits and re-enters at the same open, as tested; each counts as a trade with full costs.</p>
      <table class="stack"><tr><th>Coin</th><th>Rule now</th><th>Paper position</th></tr>${rows}</table>
      <p class=small><b>Paper record since ${fmtTime(tf.start * 1000, true)}:</b> ${n ? `${n} closed · avg <b class="${avg >= 0 ? 'up' : 'dn'}">${avg >= 0 ? '+' : ''}${avg.toFixed(3)}R</b> · ${Math.round(100 * rs.filter(x => x > 0).length / n)}% winners · total ${rs.reduce((a, x) => a + x, 0).toFixed(2)}R` : 'no closed trades yet'} · backtest: ${B.avgR >= 0 ? '+' : ''}${B.avgR}R a trade, ${Math.round(B.winRate * 100)}% winners. ${n < 30 ? `<span class=warn>${30 - n} more closed trades before judging it.</span>` : ''}</p>
      <label class=small style="display:inline-flex;gap:4px;align-items:center"><input type=checkbox id=trendChart ${T().trendOnChart ? 'checked' : ''}> Show trend paper positions on the chart</label>
      <p class="small mu">Small edge (+0.07R a trade), mostly from longs, weaker since 2021, and drawdowns too deep for a 3% evaluation: a funded/own-money idea, not an eval tool. No alerts or sizing until 30+ paper trades and your ★. Research, not financial advice.</p></div>`;
  }
  function renderPaper() {
    const box = $('#paperBox'); if (!box) return;
    const open = S.paper.filter(t => t.status === 'open' || t.status === 'pending'), closed = S.paper.filter(t => t.status === 'closed').sort((a, b) => b.closed - a.closed), st = C.paperStats(S.paper);
    const r = x => x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2) + 'R', cls = x => x > 0 ? 'up' : x < 0 ? 'dn' : '';
    const srows = Object.entries(st).map(([k, x]) => `<tr><td>${esc(k)}</td><td class=num>${x.n}</td><td class=num>${x.win == null ? '—' : Math.round(x.win * 100) + '%'}</td><td class="num ${cls(x.avgR)}">${r(x.avgR)}</td><td class="num ${cls(x.totalR)}">${r(x.totalR)}</td></tr>`).join('');
    const simplePaper = C.uiView(T().view) === 'simple';
    let paperHtml = '';
    if (simplePaper) {
      const all = st.all;
      paperHtml = paperAcctCard()
        + `<div class=card><h3>P&amp;L</h3><div class=kv><div><span>Closed</span><b>${all ? all.n : 0}</b></div><div><span>Total R</span><b class="${cls(all && all.totalR)}">${all ? (all.totalR > 0 ? '▲ ' : all.totalR < 0 ? '▼ ' : '') + r(all.totalR) : '—'}</b></div><div><span>Average</span><b class="${cls(all && all.avgR)}">${all ? (all.avgR > 0 ? '▲ ' : all.avgR < 0 ? '▼ ' : '') + r(all.avgR) : '—'}</b></div><div><span>Winners</span>${all && all.win != null ? Math.round(all.win * 100) + '%' : '—'}</div></div><p class="small mu">R after fees and swap. Dollar P&amp;L is on the paper account.</p></div>`
        + `<div class=card><h3>Open (${open.length})</h3>${open.length ? `<div class=row style="margin:0 0 6px"><button class="btn sm" data-pall="1">Show all on chart</button><button class="btn sm" data-pall="0">Hide all</button><label class=small style="display:inline-flex;gap:4px;align-items:center"><input type=checkbox id=pStops ${T().layers.paperStops !== false ? 'checked' : ''}> Show paper stops</label></div><table class="trades"><thead><tr><th>Trade</th><th class=num>Entry</th><th class=num>Stop</th><th class=num>Target</th><th class=num>Now</th><th></th></tr></thead><tbody>${open.map(t => `<tr><td class=small data-l="Trade"><b class="${t.side === 'long' ? 'bull' : 'bear'}">${esc(t.sym)} ${t.side}</b> ${esc(t.kind)} ${esc(t.tf ? C.tfName(t.tf) : '')}${t.auto ? ` <span class=tag>auto${t.remote ? ' · monitor' : ''}</span>` : ''}${t.status === 'pending' ? ` <span class="tag warn">limit waiting @ ${px(t.entry)}</span>` : t.order === 'limit' ? ' <span class=tag>limit filled</span>' : t.order === 'market' ? ' <span class=tag>market</span>' : ''}${t.meta && t.meta.alertGrade ? ' <span class="tag up">alert grade</span>' : ''}<div class=mu>${t.status === 'pending' ? 'placed ' + fmtTime(t.placedAt, true) : fmtTime(t.opened, true)}</div><label class=small style="display:inline-flex;gap:4px;align-items:center;margin-top:2px"><input type=checkbox data-pchart="${esc(t.id)}" ${t.onChart ? 'checked' : ''}> Show on chart</label></td>
        <td class=num data-l="Entry">${px(t.entry)}</td><td class=num data-l="Stop">${px(t.stop)}</td><td class=num data-l="Target">${t.target != null ? px(t.target) : '—'}</td><td class="num ${cls(liveR(t))}" data-l="Now">${t.status === 'pending' ? `<span class=mu>waiting</span><div class=small>${(p0 => p0 != null ? px(p0) + ' now' : '')(pnlPrice(t.sym))}</div>` : r(liveR(t))}${t.status === 'pending' ? '' : t.qty ? `<div class=small>${usd(C.netIfClosed({ side: t.side, entry: t.entry, qty: t.qty, opened: t.opened, partials: [] }, pnlPrice(t.sym) || t.entry, Date.now()))} net</div>` : '<div class="small mu">R only</div>'}</td>
        <td class=acts>${(use => use && (use.state === 'planned' || use.state === 'live') ? `<span class="tag ${use.state === 'live' ? 'up' : 'warn'}">${use.state === 'live' ? '✅ Live' : '⏳ Planned'}${use.acct && acctName(use.acct) ? ' · ' + esc(acctName(use.acct)) : ''}</span> ` : `<button class="btn sm pri" data-pp="live" data-id="${esc(t.id)}">Take it live</button> `)(t.setupKey ? C.setupUse(t.setupKey, S.paper, S.positions, S.planned, S.usedSetups) : null)}<button class="btn sm" data-pp="edit" data-id="${esc(t.id)}">Edit</button> <button class="btn sm" data-pp="close" data-id="${esc(t.id)}">Close</button></td></tr>`).join('')}</tbody></table>` : '<p class=mu>None. Add one from the setups lists.</p>'}</div>`
        + `<details class="card" ${fold('paper:rest')}><summary>Scorecard, trend systems, record and closed trades</summary>`;
    }
    paperHtml += scorecardHtml() + trendCardHtml() + trendPortCardHtml(trendForward()) + `<div class=card><h3>${simplePaper ? 'How paper trades work' : 'Paper trading'} <span class=tag>no money, builds the record</span></h3>
      <p class=small>Add setups from the Market tab ("Setups to watch" or "Trade ideas"). Each one opens at the live price, then closes by itself at its stop or target, checked against the candles even while the app is closed (a candle touching both counts as the stop). Results are in R after fees and swap, the same rules as the replay test.</p>
      <label class=small style="display:flex;gap:6px;align-items:center;margin:6px 0"><input type=checkbox id=autoPaper ${T().autoPaper === false ? '' : 'checked'}> <span><b>Auto paper trades:</b> while the app is open, setups that pass the alert grade open as paper trades by themselves (max 1 per coin, 4 open, 6 a day). Tagged <span class=tag>auto</span> and counted separately. Collects data only; it never changes alerts or sizing.</span></label>
      ${simplePaper ? '' : paperAcctCard()}
      <p class="small mu">${esc(paperMsg || (ghToken() ? 'Saved to monitor/paper.json in your repo.' : 'Kept on this phone. Add the 24/7 monitor key in Settings to also save it to your repo.'))}</p></div>
      ${simplePaper ? '' : '<div class=card><h3>Open (' + open.length + ')</h3>' + (open.length ? `<div class=row style="margin:0 0 6px"><button class="btn sm" data-pall="1">Show all on chart</button><button class="btn sm" data-pall="0">Hide all</button><label class=small style="display:inline-flex;gap:4px;align-items:center"><input type=checkbox id=pStops ${T().layers.paperStops !== false ? 'checked' : ''}> Show paper stops</label></div><table class="trades"><thead><tr><th>Trade</th><th class=num>Entry</th><th class=num>Stop</th><th class=num>Target</th><th class=num>Now</th><th></th></tr></thead><tbody>${open.map(t => `<tr><td class=small data-l="Trade"><b class="${t.side === 'long' ? 'bull' : 'bear'}">${esc(t.sym)} ${t.side}</b> ${esc(t.kind)} ${esc(t.tf ? C.tfName(t.tf) : '')}${t.auto ? ` <span class=tag>auto${t.remote ? ' · monitor' : ''}</span>` : ''}${t.status === 'pending' ? ` <span class="tag warn">limit waiting @ ${px(t.entry)}</span>` : t.order === 'limit' ? ' <span class=tag>limit filled</span>' : t.order === 'market' ? ' <span class=tag>market</span>' : ''}${t.meta && t.meta.alertGrade ? ' <span class="tag up">alert grade</span>' : ''}<div class=mu>${t.status === 'pending' ? 'placed ' + fmtTime(t.placedAt, true) : fmtTime(t.opened, true)}</div><label class=small style="display:inline-flex;gap:4px;align-items:center;margin-top:2px"><input type=checkbox data-pchart="${esc(t.id)}" ${t.onChart ? 'checked' : ''}> Show on chart</label></td>
        <td class=num data-l="Entry">${px(t.entry)}</td><td class=num data-l="Stop">${px(t.stop)}</td><td class=num data-l="Target">${t.target != null ? px(t.target) : '—'}</td><td class="num ${cls(liveR(t))}" data-l="Now">${t.status === 'pending' ? `<span class=mu>waiting</span><div class=small>${(p0 => p0 != null ? px(p0) + ' now' : '')(pnlPrice(t.sym))}</div>` : r(liveR(t))}${t.status === 'pending' ? '' : t.qty ? `<div class=small>${usd(C.netIfClosed({ side: t.side, entry: t.entry, qty: t.qty, opened: t.opened, partials: [] }, pnlPrice(t.sym) || t.entry, Date.now()))} net</div>` : '<div class="small mu">R only</div>'}</td>
        <td class=acts>${(use => use && (use.state === 'planned' || use.state === 'live') ? `<span class="tag ${use.state === 'live' ? 'up' : 'warn'}">${use.state === 'live' ? '✅ Live' : '⏳ Planned'}${use.acct && acctName(use.acct) ? ' · ' + esc(acctName(use.acct)) : ''}</span> ` : `<button class="btn sm pri" data-pp="live" data-id="${esc(t.id)}">Take it live</button> `)(t.setupKey ? C.setupUse(t.setupKey, S.paper, S.positions, S.planned, S.usedSetups) : null)}<button class="btn sm" data-pp="edit" data-id="${esc(t.id)}">Edit</button> <button class="btn sm" data-pp="close" data-id="${esc(t.id)}">Close</button></td></tr>`).join('')}</tbody></table>` : '<p class=mu>None. Add one from the setups lists.</p>') + '</div>'}
      <div class=card><h3>Record</h3>${srows ? `<table><tr><th>Group</th><th class=num>n</th><th class=num>Win</th><th class=num>Avg</th><th class=num>Total</th></tr>${srows}</table><p class="small mu">Small samples mean little: 20+ trades per group before reading anything into it.</p>` : '<p class=mu>No closed paper trades yet.</p>'}</div>
      <div class=card><h3>Closed (${closed.length})</h3>${closed.length ? `<table><tr><th>Trade</th><th>Exit</th><th class=num>R</th><th class=num>Best / worst</th></tr>${closed.slice(0, 40).map(t => `<tr><td class=small><b class="${t.side === 'long' ? 'bull' : 'bear'}">${esc(t.sym)} ${t.side}</b> ${esc(t.kind)} ${esc(t.tf ? C.tfName(t.tf) : '')}<div class=mu>${fmtTime(t.opened, true)} → ${fmtTime(t.closed, true)}</div></td><td class=small>${esc(t.why)} @ ${px(t.exit)}</td><td class="num ${cls(t.R)}">${r(t.R)}${t.qty ? `<div class=small>${usd(C.paperPositions([Object.assign({}, t, { acct: 'x' })], 'x')[0].closed.realized)}</div>` : ''}</td><td class="num small">+${(t.mfe || 0).toFixed(1)} / -${(t.mae || 0).toFixed(1)}</td></tr>`).join('')}</table>` : '<p class=mu>None yet.</p>'}
        <div class=row style="margin-top:8px"><button class="btn sm" data-pp="clear">Delete all paper trades</button></div></div>` + (simplePaper ? '</details>' : '');
    box.innerHTML = paperHtml;
  }
  // Paper trades on the chart (owner, Nov 2): a tick box per open paper trade draws its entry, stop and target on the chart.
  $('#paperBox').addEventListener('change', e => {
    if (e.target.id === 'trendChart') { T().trendOnChart = e.target.checked; save(); renderAll(true); return; }
    if (e.target.id === 'autoPaper') { T().autoPaper = e.target.checked; save(); return; }
    if (e.target.id === 'pStops') { T().layers.paperStops = e.target.checked; save(); renderAll(true); return; }
    const cb = e.target.closest('[data-pchart]'); if (!cb) return;
    const t = S.paper.find(x => x.id === cb.dataset.pchart); if (!t) return;
    t.onChart = cb.checked; save(); renderAll(true);
  });
  $('#paperBox').addEventListener('click', e => {
    const all = e.target.closest('[data-pall]');
    if (all) { for (const t of S.paper.filter(x => x.status === 'open' || x.status === 'pending')) t.onChart = all.dataset.pall === '1'; save(); renderAll(true); return; }
    const sb = e.target.closest('[data-score]');
    if (sb) { S.scoreAccepted = Object.assign({}, S.scoreAccepted); if (sb.dataset.to) S.scoreAccepted[sb.dataset.score] = sb.dataset.to; else delete S.scoreAccepted[sb.dataset.score]; save(); autoPush('scorecard'); renderPaper(); return; }
    if (e.target.id === 'ppNew') { const a = paperAcct(); if (a && !confirm('End this paper account and start a new one? Its result is kept in the list.')) return; newPaperAcct($('#ppPlan').value, +$('#ppSize').value, $('#ppProf').value); renderPaper(); return; }
    const b = e.target.closest('[data-pp]'); if (!b) return;
    const t = S.paper.find(x => x.id === b.dataset.id), now = Date.now();
    if (b.dataset.pp === 'live' && t) { paperToLive(t); return; }
    if (b.dataset.pp === 'close' && t && t.status === 'pending') { Object.assign(t, { status: 'cancelled', closed: now, why: 'cancelled by you' }); t.log.push({ t: now, what: 'limit cancelled by you' }); savePaper('cancelled'); renderPaper(); return; }
    if (b.dataset.pp === 'close' && t) { const p0 = pnlPrice(t.sym); if (p0 == null) return; Object.assign(t, { status: 'closed', exit: p0, closed: now, why: 'closed by you', R: C.paperR(t, p0, now) }); t.log.push({ t: now, what: 'closed by you at ' + px(p0) }); savePaper('closed by hand'); renderPaper(); }
    if (b.dataset.pp === 'edit' && t) { const ns = prompt('Stop (paper):', t.stop); if (ns === null) return; const nt = prompt('Target (paper, blank = none):', t.target == null ? '' : t.target);
      const sv = num(ns), tv = nt === '' ? null : num(nt), d = t.side === 'short' ? -1 : 1, p0 = pnlPrice(t.sym);
      if (sv == null || (p0 != null && d * (p0 - sv) <= 0)) { alert('Stop must be ' + (d > 0 ? 'below' : 'above') + ' the price.'); return; }
      if (d * (sv - t.stop) < 0 && !confirm('This widens the paper stop. Your real rule is never widen. Record it anyway?')) return;
      t.log.push({ t: now, what: `stop ${px(t.stop)} → ${px(sv)}, target ${t.target == null ? '—' : px(t.target)} → ${tv == null ? '—' : px(tv)}` }); t.stop = sv; t.target = tv; savePaper('edited'); renderPaper(); }
    if (b.dataset.pp === 'clear' && confirm('Delete every paper trade? This cannot be undone.')) { S.paper = []; savePaper('cleared'); renderPaper(); } });
  // ---------- Track record: replay results (monitor/backtest.json, made by the "Replay test" workflow) ----------
  let BT = null, btAt = 0;
  async function loadTrack() {
    if (Date.now() - btAt < 600e3) return; btAt = Date.now();
    try { const r = await fetch('monitor/backtest-2y.json', { cache: 'no-store' }); var LONG = r.ok ? await r.json() : null; } catch (e) { LONG = null; }
    try { const r = await fetch('monitor/backtest.json', { cache: 'no-store' }); BT = r.ok ? await r.json() : null; if (BT) BT.long = LONG; } catch (e) { BT = null; }
    try { const r = await fetch('monitor/slow.json', { cache: 'no-store' }); BT && (BT.slow = r.ok ? await r.json() : null); } catch (e) { }
    renderTrack();
  }
  function renderTrack() {
    const box = $('#trackBox'); if (!box) return;
    if (!BT || !BT.groups) { box.innerHTML = '<p class=mu>No replay yet. Run it: GitHub → Actions → "Replay test" → Run workflow.</p>'; return; }
    const NAMES = [['all', 'All setups'], ['fvg', 'FVG retest'], ['fvg|15', '  FVG 15m'], ['fvg|60', '  FVG 1h'], ['fvg|240', '  FVG 4h'], ['sweep', 'Liquidity sweep'], ['sweep|15', '  Sweep 15m'], ['sweep|60', '  Sweep 1h'], ['sweep|with_trend', '  Sweep with 4h trend'], ['sweep|counter_trend', '  Sweep counter-trend'], ['sweep|at_open', '  Sweep at a market open']];
    const r = x => x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2) + 'R';
    const rows = NAMES.filter(([k]) => BT.groups[k]).map(([k, nm]) => { const g = BT.groups[k], a = g.all, h = g.heldOut || {}, thin = a.n < 20;
      return `<tr class="${thin ? 'mu' : ''}"><td>${esc(nm)}</td><td class=num>${a.n}</td><td class=num>${a.n ? Math.round(a.winRate * 100) + '%' : '—'}</td><td class="num ${a.avgR > 0 ? 'up' : a.avgR < 0 ? 'dn' : ''}">${r(a.avgR)}</td><td class=num>${a.pf == null ? '—' : a.pf}</td><td class=num>${a.worstStreak ?? '—'}</td><td class="num ${h.avgR > 0 ? 'up' : h.avgR < 0 ? 'dn' : ''}">${h.n ? r(h.avgR) + ' (' + h.n + ')' : '—'}</td></tr>`; }).join('');
    const o = BT.ote || {}, VR = { continuation_signs: 'Continuation signs', reversal_warning: 'Reversal warning', unclear: 'Unclear', unknown: 'No volume' };
    const orows = Object.keys(VR).filter(k => o[k] && o[k].n).map(k => `<tr><td>${VR[k]}</td><td class=num>${o[k].n}</td><td class=num>${Math.round(o[k].continued / o[k].n * 100)}%</td><td class=num>${Math.round(o[k].failed / o[k].n * 100)}%</td></tr>`).join('');
    const d = t => new Date(t * 1000).toLocaleDateString();
    box.innerHTML = `<table><tr><th>Setup</th><th class=num>n</th><th class=num>Win</th><th class=num>Avg</th><th class=num>PF</th><th class=num>Worst run</th><th class=num>Held-out avg (n)</th></tr>${rows}</table>
      ${BT.variants ? `<h4 style="margin:10px 0 4px">Stricter versions (written down before testing)</h4><table><tr><th>Version</th><th class=num>n</th><th class=num>Avg</th><th class=num>Held-out avg (n)</th><th class=num>PF held-out</th><th class=num title="Real result minus a random size-matched twin at a no-setup bar; z under 2 = noise">vs placebo (z)</th></tr>${Object.entries(BT.variants).map(([v, x]) => `<tr><td class=small><b>${esc(v)}</b> ${esc(x.note)}${v === 'V4' ? ' <span class="tag up">phone alerts</span>' : ''}</td><td class=num>${x.all.n}</td><td class="num ${x.all.avgR > 0 ? 'up' : 'dn'}">${r(x.all.avgR)}</td><td class="num ${x.heldOut.avgR > 0 ? 'up' : 'dn'}">${x.heldOut.n ? r(x.heldOut.avgR) + ' (' + x.heldOut.n + ')' : '—'}</td><td class=num>${x.heldOut.pf ?? '—'}</td><td class="num ${x.placebo && x.placebo.z >= 2 ? 'up' : ''}">${x.placebo && x.placebo.n >= 2 ? (x.placebo.diff >= 0 ? '+' : '') + x.placebo.diff.toFixed(2) + 'R (' + x.placebo.z + ')' : '—'}</td></tr>`).join('')}</table>
      ${BT.long && BT.long.variants ? `<p class=small><b>2-year replay</b> (${new Date(BT.long.period.from * 1000).toISOString().slice(0, 10)} → ${new Date(BT.long.period.to * 1000).toISOString().slice(0, 10)}, weekly): ${Object.entries(BT.long.variants).map(([v, x]) => `${esc(v)} ${r(x.all.avgR)} (held-out ${r(x.heldOut.avgR)}, vs placebo ${x.placebo && x.placebo.n >= 2 ? (x.placebo.diff >= 0 ? '+' : '') + x.placebo.diff.toFixed(2) + 'R z ' + x.placebo.z : '—'})`).join(' · ')}</p>` : '<p class="small mu">2-year replay: runs weekly once the 15m history is backfilled.</p>'}` : ''}
      ${BT.exits ? `<h4 style="margin:10px 0 4px">Exit versions on alert-grade entries (no time limit unless noted; swap fees included)</h4><table><tr><th>Exit</th><th class=num>n</th><th class=num>Win</th><th class=num>Avg</th><th class=num>Held-out avg</th><th class=num>Median hold</th></tr>${Object.entries(BT.exits).map(([m, x]) => `<tr><td class=small><b>${esc(m)}</b> ${esc(x.note)}</td><td class=num>${x.all.n}</td><td class=num>${x.all.n ? Math.round(x.all.winRate * 100) + '%' : '—'}</td><td class="num ${x.all.avgR > 0 ? 'up' : 'dn'}">${r(x.all.avgR)}</td><td class="num ${x.heldOut.avgR > 0 ? 'up' : 'dn'}">${x.heldOut.n ? r(x.heldOut.avgR) : '—'}</td><td class=num>${x.all.medDays != null ? (x.all.medDays * 24).toFixed(0) + 'h' : '—'}</td></tr>`).join('')}</table>` : ''}
      ${BT.slow ? `<h4 style="margin:10px 0 4px">Slow setups: 4h and daily (${d(BT.slow.from)}–${d(BT.slow.to)}, held-out from ${d(BT.slow.heldOutFrom)})</h4><table><tr><th>Setup · exit</th><th class=num>n</th><th class=num>Win</th><th class=num>Avg</th><th class=num>Held-out avg (n)</th><th class=num>Median hold</th></tr>${Object.entries(BT.slow.groups).map(([k, x]) => `<tr class="${x.all.n < 20 ? 'mu' : ''}"><td class=small>${esc(k.replace(' E1', ' · stop/target').replace(' E3', ' · half at 1R'))}</td><td class=num>${x.all.n}</td><td class=num>${x.all.n ? Math.round(x.all.winRate * 100) + '%' : '—'}</td><td class="num ${x.all.avgR > 0 ? 'up' : 'dn'}">${r(x.all.avgR)}</td><td class="num ${x.heldOut.avgR > 0 ? 'up' : 'dn'}">${x.heldOut.n ? r(x.heldOut.avgR) + ' (' + x.heldOut.n + ')' : '—'}</td><td class=num>${x.medDays != null ? (x.medDays * 24).toFixed(0) + 'h' : '—'}</td></tr>`).join('')}</table>` : ''}
      ${orows ? `<h4 style="margin:10px 0 4px">Fib OTE pullbacks by volume read</h4><table><tr><th>Volume read</th><th class=num>n</th><th class=num>Reached leg end</th><th class=num>Broke the start</th></tr>${orows}</table>` : ''}
      <p class="small mu">${esc(BT.source)}. ${d(BT.period.from)}–${d(BT.period.to)}, held-out from ${d(BT.period.heldOutFrom)}. ${esc(BT.rules)} Grey = under 20 setups, too few to judge. Past results on one venue; not a promise and not a probability for your next trade. Avg R and held-out avg matter more than win rate.</p>`;
  }
  loadTrack(); setInterval(loadTrack, 600e3);
  // ---------- Momentum & context traits: grades (monitor/traits.json) + what each says now + choose alert filters ----------
  let TR = null, trAt = 0;
  async function loadTraits() { if (Date.now() - trAt < 600e3) return; trAt = Date.now();
    try { const r = await fetch('monitor/traits.json', { cache: 'no-store' }); TR = r.ok ? await r.json() : null; } catch (e) { TR = null; } }
  function renderTraits(sym) {
    const box = $('#traitBox'); if (!box || !window.PDTraits) return; loadTraits();
    const h = F.candles(sym, 60).slice(0, -1), d = F.candles(sym, 1440).slice(0, -1);
    let x = null; try { x = h.length > 240 && d.length > 20 ? PDTraits.ctxAt(h, d, h.length - 1) : null; } catch (e) { }
    const sh = x && PDProfile.shardName(x.f), prof = sh && PROF[sh] ? { keys: PROF[sh], minN: PDProfile.MIN_N } : null;
    const on = new Set(T().alertTraits || []), byId = {}; for (const t of (TR && TR.traits) || []) byId[t.id] = t;
    const gc = g => g === 'A' || g === 'B' ? 'up' : g === 'C' ? '' : g === 'I' ? 'mu' : 'dn';
    const rows = PDTraits.TRAITS.map(t => { const g = byId[t.id], now = x ? t.side(x, prof) : null, fd = g && g.filter.V4, dd = g && g.direction;
      return `<tr><td class=small><label class=chk><input type=checkbox data-trait="${t.id}" ${on.has(t.id) ? 'checked' : ''}> <b>${t.id}</b> ${esc(t.name)}</label><div class=mu>${esc(t.rule)}</div></td>
        <td class="small ${now === 'long' ? 'bull' : now === 'short' ? 'bear' : 'mu'}">${now || 'no view'}</td>
        <td class="num ${gc(dd && dd.grade.grade)}" title="${esc(dd ? dd.grade.why : '')}">${dd ? dd.grade.grade : '—'}${dd && dd.held ? `<div class="small mu">${dd.held.hit}% right</div>` : ''}</td>
        <td class="num ${gc(fd && fd.grade.grade)}" title="${esc(fd ? fd.grade.why : '')}">${fd ? fd.grade.grade : '—'}${fd && fd.held && fd.held.n ? `<div class="small mu">${fd.held.avgR >= 0 ? '+' : ''}${fd.held.avgR}R (${fd.held.n})</div>` : ''}</td></tr>`; }).join('');
    box.innerHTML = `<table><tr><th>Trait (tick = filter my phone alerts)</th><th>Says now (${esc(sym)})</th><th class=num>Direction grade</th><th class=num>Filter grade</th></tr>${rows}</table>
      <p class="small mu">Written down before testing; graded on held-out data. Direction = was its side right 24h later (${TR ? TR.direction.hours : '?'} past hours, all coins). Filter = average R of alert-grade setups it agrees with (held-out). A/B = held up in both periods, C = small, D = periods disagree, F = worse or a coin flip, I = too few cases. ${on.size ? `<b>Phone setup alerts now need: ${esc([...on].join(' + '))} to agree.</b>` : 'No filter ticked: all alert-grade setups are sent.'} Past results on Coinbase data, not probabilities.</p>`;
  }
  $('#traitBox') && $('#traitBox').addEventListener('change', e => { const c = e.target.closest('[data-trait]'); if (!c) return;
    const set = new Set(T().alertTraits || []); c.checked ? set.add(c.dataset.trait) : set.delete(c.dataset.trait); T().alertTraits = [...set]; save(); saveAndSync('alert filters'); renderTraits(T().sym); });
  // ---------- Market profile now (js/profile.js + monitor/profile/<trend>.json from the daily workflow) ----------
  const PROF = {}; let profAt = {};
  async function renderProfile(sym) {
    const box = $('#profileBox'); if (!box || !window.PDProfile) return;
    const h = F.candles(sym, 60).slice(0, -1), d = F.candles(sym, 1440).slice(0, -1);
    let f = null; try { f = h.length > 240 && d.length > 20 ? PDProfile.featuresAt(h, d, h.length - 1) : null; } catch (e) { console.warn(e); }
    if (!f) { box.innerHTML = '<p class=mu>Waiting for 1h and daily candles.</p>'; return; }
    const sh = PDProfile.shardName(f);
    if (!PROF[sh] || Date.now() - (profAt[sh] || 0) > 3600e3) { profAt[sh] = Date.now();
      try { const r = await fetch('monitor/profile/' + sh + '.json', { cache: 'no-store' }); PROF[sh] = r.ok ? await r.json() : {}; } catch (e) { PROF[sh] = {}; } }
    const m = PDProfile.match({ keys: PROF[sh] || {}, minN: PDProfile.MIN_N }, f);
    const pc = x => (x >= 0 ? '+' : '') + x.toFixed(2) + '%';
    box.innerHTML = `<p class=small><b>Now (${esc(sym)}, last closed hour):</b> ${esc(PDProfile.describe(f))}.</p>` + (m ? `
      <div class=kv><div><span>Past matches</span><b>${m.n}</b></div><div><span>Traits matched</span>${m.traits.length} of ${PDProfile.ORDER.length}</div>
      <div><span>Higher after 24h</span><b>${Math.round(m.upShare24 * 100)}%</b></div><div><span>24h median</span><b class="${m.med24 >= 0 ? 'up' : 'dn'}">${pc(m.med24)}</b></div>
      <div><span>Middle half (24h)</span>${pc(m.p25_24)} to ${pc(m.p75_24)}</div><div><span>Typical stretch in 24h</span>${pc(m.medUp24)} / ${pc(m.medDn24)}</div>
      <div><span>4h median</span>${pc(m.med4)}</div><div><span>Held-out (${m.held ? m.held.n : 0})</span>${m.held ? Math.round(m.held.upShare24 * 100) + '% higher' : '—'}</div></div>`
      : '<p class=mu>No past group with 30+ matching hours yet (history still building, or a rare combination).</p>') +
      `<p class="small mu">Every 4th past hour of BTC, ETH, SOL and XRP on Coinbase (data/history, topped up daily), grouped by the same traits. If a full match is rare it drops the least important traits (session first). Past frequencies, not a probability for this trade and not a signal. Held-out = last 30% of the history.</p>`;
  }
  // ---------- Research read (experimental engine, js/research.js): per timeframe, never one blended score ----------
  const research = {};
  function researchFor(sym) {
    const r = research[sym];
    if (r && Date.now() - r.at < 60e3) return r;   // heavy: recompute at most once a minute per coin
    if (!window.PDResearch) return null;
    try { research[sym] = PDResearch.read(sym, iv => F.candles(sym, iv), Date.now(), /coinbase/i.test(F.source) ? 'coinbase' : 'exchange'); } catch (e) { console.warn(e); }
    return research[sym] || null;
  }
  function renderResearch(sym) {
    const box = $('#researchBox'); if (!box) return;
    const rd = researchFor(sym);
    if (!rd) { box.innerHTML = '<p class=mu>Waiting for candles.</p>'; return; }
    const lbl = s => esc(String(s || '').replace(/_/g, ' '));
    const cls = b => /^bull/.test(b) ? 'bull' : /^bear/.test(b) ? 'bear' : '';
    const rows = PDResearch.TFS.map(tf => { const s = rd.tfs[tf] || {};
      if (s.status !== 'ready') return `<tr><td>${C.tfName(tf)}</td><td colspan=4 class="small warn">${lbl(s.status)}${s.error ? ': ' + esc(s.error) : ''}${s.status === 'gap' ? ' (a candle is missing; alerts off for this timeframe)' : ''}</td></tr>`;
      const pats = s.patterns.map(p => `<span class="${cls(p.bias)}">${lbl(p.pattern)}${p.relaxed ? '*' : ''}</span>`).join(', ') || '<span class=mu>none</span>';
      const form = s.forming.length ? `<div class="small mu">forming: ${s.forming.map(f => lbl(f.pattern)).join(', ')}</div>` : '';
      const ups = s.setups.map(x => `<span class="${x.dir === 'long' ? 'bull' : 'bear'}">${x.dir} ${x.status}</span> @${px(x.level)}${x.invalidation != null ? ' · invalid ' + px(x.invalidation) : ''}`).join('<br>') || '<span class=mu>none</span>';
      return `<tr><td>${C.tfName(tf)}</td><td class="${cls(s.bias)}">${lbl(s.bias)}${s.lastChange ? `<div class="small mu">was ${lbl(s.lastChange.from)}, ${fmtTime(s.lastChange.time)}</div>` : ''}</td><td class=small>${pats}${form}</td><td class=small>${ups}</td></tr>`; }).join('');
    box.innerHTML = `<table><tr><th>TF</th><th>Structure</th><th>Patterns (last 3 bars)</th><th>Break &amp; retest</th></tr>${rows}</table>
      <p class="small mu">Engine v${esc(rd.version)} on closed ${esc(F.demo ? 'DEMO (made-up)' : /coinbase/i.test(F.source) ? 'Coinbase' : 'Exchange')} candles, updated ${fmtTime(rd.at)}. "Forming" is provisional until the candle closes. Each timeframe stands alone; nothing here is averaged into a score.
      * relaxed variant (looser gap rule). Untested: no replay results yet. Flows and liquidation maps are not in this read. Size only through "Weigh it".</p>`;
  }
  $('#setupBox').addEventListener('click', e => { const pb = e.target.closest('[data-paper]'); if (pb) { const u = lastUps[+pb.dataset.paper]; if (u) paperAdd(u); return; }
    const b = e.target.closest('[data-weigh]'); if (!b) return; const u = lastUps[+b.dataset.weigh]; if (!u) return;
    const now = Date.now(), P = prices(), accts = liveAccts();
    const out = accts.map(a => { const A = C.accountState(a, S.positions, P, now, { orders: S.planned }), w = C.weighIdea(u, A, S.positions.filter(p => p.acct === a.id), now, { leverage: C.levMap(a) }), name = esc(a.label || C.planOf(a).name);
      return w.ok && w.size && w.size.qty > 0 ? `<b class=up>${name}: fits</b>, size ${w.size.qty} (${usd(w.size.lossAtStop)} at stop)` : `<b class=warn>${name}: not now</b> (${w.rules.filter(r => !r.ok).map(r => esc(r.t)).join(', ') || 'size 0'})`; });
    $(`[data-weighout="${b.dataset.weigh}"]`).innerHTML = out.join('<br>') || '<span class=mu>Add an account on the Desk first.</span>'; });
  $('#setupBox').addEventListener('click', e => { const b = e.target.closest('[data-plan]'); if (!b) return; posDraft = JSON.parse(b.dataset.plan); openDeskManual(); });
  function switchTab(t) { document.querySelector(`#tabs button[data-tab="${t}"]`).click(); }

  // ---------- Desk ----------
  // ---------- Pass odds per risk profile (owner's request, Nov 2 2026) ----------
  // Simulated from where the account stands now, under his rules (C.passOdds). Baseline = no edge: a 2R target hit 1 time in 3, so
  // the average trade makes 0 before fees; fees 0.12R a trade (typical of the replay's setups). If he has 30+ closed trades under the
  // current model (paper + live followed-plan), his own R results are also resampled. Cached a minute per account.
  const poMemo = {};
  function passOddsHtml(a, s) {
    const key = a.id + '|' + Math.round(s.equity) + '|' + Math.round(s.maxFloor) + '|' + Math.round(s.targetBal);
    let m = poMemo[a.id];
    if (!m || m.key !== key || Date.now() - m.t > 60e3) {
      const own = C.tradeRecords(S.paper, S.positions).filter(r => r.model === C.MODEL && (r.src === 'paper' || r.tag === 'plan')).map(r => r.R);
      const base = { equity: s.equity, target: s.targetBal, maxFloor: s.maxFloor, dailyPct: s.plan.mdl, sims: 3000, seed: 11 };
      const rows = C.PROFILES.map(p => { const o = Object.assign({}, base, { riskUsd: s.start * p.riskPct / 100, maxTrades: p.maxTrades, stopAfterLosses: p.stopAfterLosses });
        return { p, none: C.passOdds(Object.assign({}, o, { rr: 2, feeR: 0.12 })), mine: own.length >= 30 ? C.passOdds(Object.assign({}, o, { outcomes: own })) : null }; });
      m = poMemo[a.id] = { key, t: Date.now(), rows, own: own.length };
    }
    const pc = x => Math.round(x * 100) + '%';
    return `<details class="sc-w desk-x" ${fold('odds:' + a.id)}><summary>Pass odds by risk profile (from here)</summary>
      <table><tr><th>Profile</th><th class=num>Pass</th><th class=num>Fail</th><th class=num>Unfinished 120 d</th><th class=num>Days (median pass)</th>${m.rows[0].mine ? '<th class=num>With your record</th>' : ''}<th class=num>Eval cost per pass</th></tr>
      ${m.rows.map(r => `<tr class="${r.p.id === s.profile.id ? 'up' : ''}"><td>${esc(r.p.name)}${r.p.id === s.profile.id ? ' (yours)' : ''}</td><td class=num>${pc(r.none.pass)}</td><td class=num>${pc(r.none.fail)}</td><td class=num>${pc(r.none.open)}</td><td class=num>${r.none.medianDays ?? '—'}</td>${r.mine ? `<td class=num>${pc(r.mine.pass)}</td>` : ''}<td class=num>${a.fee > 0 && r.none.pass > 0 ? usd(a.fee / r.none.pass) : '—'}</td></tr>`).join('')}</table>
      <p class="small mu">Simulated ${m.rows[0].none.sims.toLocaleString()} times from your equity now, with your floors and target, each profile's risk, trades a day and loss stop. <b>No edge</b>: a 2R target hit 1 time in 3, so the average trade makes nothing before fees; fees about 0.12R a trade. Any pass at these odds is luck, not skill. ${m.own >= 30 ? `"With your record" resamples your ${m.own} closed trades under model ${C.MODEL}.` : `Your own record is added once you have 30 closed trades under model ${C.MODEL} (now ${m.own}).`} "Fail" includes running out of room. Eval cost per pass = what you paid ÷ pass chance. <b>Why bigger profiles pass more here:</b> with no edge, fees take a little every trade, so fewer, bigger trades give fees fewer chances. It's still a losing game on average at every size; the only thing that truly raises the odds is an edge. Your rule stands: never raise risk to catch up.</p></details>`;
  }
  function rulesCard() {
    if (C.uiView(T().view) !== 'simple') return '';
    const t = T();
    return `<div class=card><h3>My rules</h3>
      <label class=chk><input type=checkbox id=deskDir ${t.dirRule !== false ? 'checked' : ''}> Both ways only when structure agrees (4h that way, or 1h and 15m both turned)</label>
      <label class=chk><input type=checkbox id=deskBe ${t.beAt1R ? 'checked' : ''}> Move stop to breakeven at +1R</label>
      <p class="small mu">Same switches as Settings → My rules.</p></div>`;
  }
  function renderDesk() {
    const rules = $('#deskRules'); if (rules) rules.innerHTML = rulesCard();
    const now = Date.now(), P = prices();
    const D = C.deskTotals(S.accounts, S.positions, P, now, { orders: S.planned });
    const budgetMsg = T().budget ? ` of ${usd(T().budget)}/mo budget` : '';
    const monthCost = S.accounts.filter(a => new Date(a.created).getMonth() === new Date().getMonth() && new Date(a.created).getFullYear() === new Date().getFullYear())
      .reduce((s, a) => s + D.states[a.id].cost, 0);
    $('#deskTotals').innerHTML = [
      ['Open accounts', D.active], ['Capital in play', `${usd(D.capital)}${D.overCap ? ' ⚠' : ''}`, D.overCap ? 'Over the firm\'s $200k combined cap' : `cap ${usd(D.cap)}`],
      ['Live P&L (open)', `<span class="${cls(D.upnl)}">${pnlTxt(D.upnl)}</span>`], ['Risk if all stops fill', isFinite(D.riskToStops) ? usd(D.riskToStops) : '<span class=dn>Unlimited</span>', isFinite(D.riskToStops) ? '' : 'a position has no stop'],
      ['Spent on evals', usd(D.cost), `this month ${usd(monthCost)}${budgetMsg}`], ['Payouts received', usd(D.paid)],
      ['Program net', `<span class="${cls(D.net)}">${pnlTxt(D.net)}</span>`, 'payouts − all fees']
    ].map(x => `<div class="stat${['Spent on evals', 'Payouts received', 'Program net'].includes(x[0]) ? ' desk-x' : ''}"><div class=k>${x[0]}</div><div class=v>${x[1]}</div>${x[2] ? `<div class="k">${x[2]}</div>` : ''}</div>`).join('') + (MKT ? `<div class="small desk-x" style="grid-column:1/-1;margin-top:4px">${weatherLine()}</div>` : (loadMarket(), ''));
    if (!S.accounts.length) $('#deskList').innerHTML = '<div class=card><p>No accounts yet. Add your prop evaluation or funded account. Rules default to the official plan values (Advanced: 9% target, 3% daily, 3% max).</p></div>';
    else {
      const order = { eval: 0, funded: 0, passed: 1, breached: 2, closed: 3 };
      $('#deskList').innerHTML = S.accounts.slice().sort((a, b) => order[a.phase] - order[b.phase]).map(a => acctCard(a, D.states[a.id])).join('');
    }
    renderDeskPositions(); renderDeskIdeas();
    const manualPanel = $('#deskManualPanel'), managerPanel = $('#deskPositionManager');
    if (manualPanel && !manualPanel.hidden && posFormDirty) { renderPosForm(); posFormDirty = false; }
    if (managerPanel && !managerPanel.hidden) renderPositions();
  }
  function renderDeskPositions() {
    const box = $('#deskOpenPositions'); if (!box) return;
    const now = Date.now(), open = S.positions.filter(p => !p.closed);
    if (!open.length) { box.innerHTML = '<p class="small mu">No personal open positions logged. Import a screenshot or use Add manually.</p>'; return; }
    box.innerHTML = open.map(p => {
      const price = pnlPrice(p.sym), net = price != null ? C.netIfClosed(p, price, now) : null, a = acctById(p.acct);
      const account = a ? (a.label || C.planOf(a).name) : 'Account not found';
      return `<div class="desk-preview-row desk-position-row">
        <div class="desk-preview-head"><div class="desk-preview-title"><b class="${p.side === 'long' ? 'bull' : 'bear'}">${esc(p.sym)} ${esc(String(p.side || '').toUpperCase())}</b><span class=tag>${C.openQty(p)} @ ${px(p.entry)}</span><span class="small mu">${esc(account)}</span></div>
          <div class="desk-preview-result ${net == null ? 'mu' : cls(net)}"><span class="small mu">Net if closed now</span> ${net == null ? '—' : pnlTxt(net)}</div></div>
        <div class=desk-preview-values><span>Price ${px(price)}</span><span>Stop ${px(p.stop)}</span><span>TP1 ${px(p.tp1)} / TP2 ${px(p.tp2)}</span><span>${esc(p.setup || 'Unspecified')} · ${esc(C.tfName(p.tf))}</span></div>
      </div>`;
    }).join('');
  }
  function renderDeskIdeas() {
    const box = $('#deskIdeas'); if (!box) return;
    const meta = $('#deskIdeasMeta');
    if (!scanAll.at) {
      meta.textContent = scanAll.running ? 'Scanning the Market…' : 'Waiting for the first short-term Market scan';
      box.innerHTML = `<p class="small mu">${scanAll.running ? 'The top ideas will appear when the scan finishes.' : 'The Market scanner runs automatically while the app is open. No current scan is being shown yet.'}</p>`;
      return;
    }
    const rows = (scanAll.ranked || []).filter(r => !r.gone).sort((a, b) => a.rank - b.rank).slice(0, 5);
    meta.textContent = `${scanAll.running ? 'Refreshing · ' : ''}Last scan ${fmtTime(scanAll.at, true)} · ${scanAll.rows.length} short-term setups`;
    if (!rows.length) {
      box.innerHTML = `<p class="small mu">No short-term setups on the latest scan. No trade is a valid answer.</p>${scanAll.errors.length ? `<p class="small warn">${esc(scanAll.errors.slice(0, 3).join(' · '))}</p>` : ''}`;
      return;
    }
    box.innerHTML = rows.map(r => {
      const u = r.u, lc = liveOf(u), vd = verdictOf(u), grade = C.alertGrade(u);
      const vClass = vd.verdict === 'ELIGIBLE' ? 'up' : vd.verdict === 'NO TRADE' ? 'dn' : 'warn';
      const lClass = lc.status === 'valid' ? 'up' : lc.status === 'invalid' ? 'dn' : 'warn';
      const lText = lc.status === 'valid' ? 'Valid now' : lc.status === 'invalid' ? 'Not valid now' : `Partly valid ${lc.passed}/${lc.total}`;
      const entry = lc.order === 'none' ? 'Past stop' : `${lc.order === 'market' ? 'Entry ~' : 'Limit'} ${lc.entry != null ? px(lc.entry) : '—'}`;
      return `<div class="desk-preview-row desk-idea-row"><div class="desk-preview-head"><div class="desk-preview-title"><span class=rank>#${r.rank}</span><b class="${u.dir === 'long' ? 'bull' : 'bear'}">${esc(u.dir.toUpperCase())}</b><b>${esc(C.base(u.sym))}</b><span class="small mu">${u.kind === 'sweep' ? 'Sweep' : 'FVG'} · ${esc(C.tfName(u.tf))}</span></div><span class="tag ${vClass}">${esc(vd.verdict)}</span></div>
        <div class=desk-preview-values><span>${entry}</span><span>Stop ${px(u.stop)}</span><span>Target ${px(u.target)}</span><span>R:R ${lc.rr != null ? lc.rr.toFixed(1) + 'R' : '—'}</span><span class="tag ${lClass}">${lText}</span><span class="tag ${grade.ok ? 'up' : 'mu'}">${grade.ok ? 'Alert grade' : 'Below grade'}</span></div></div>`;
    }).join('');
  }
  function acctCard(a, s) {
    const live = a.phase === 'eval' || a.phase === 'funded';
    const ddUsed = (x, floor, startV) => Math.max(0, Math.min(1, 1 - (x - floor) / (startV - floor)));
    const dU = ddUsed(s.equity, s.dailyFloor, s.dayStart), mU = ddUsed(s.equity, s.maxFloor, s.start);
    const barC = u => (u > 0.66 ? 'bar dang' : u > 0.33 ? 'bar risk' : 'bar');
    const prof = C.PROFILES.map(p => `<button data-prof="${p.id}" data-acct="${a.id}" class="${p.id === s.profile.id ? 'on' : ''}" title="${esc(p.note)}">${p.name} ${p.riskPct}%</button>`).join('');
    const wins = s.winsToPass ? [1.5, 2, 3].map(r => `${s.winsToPass(r)} at ${r}R`).join(', ') : '';
    const kvr = (label, value, extra = '') => `<div class="desk-kv-row${extra ? ' ' + extra : ''}"><span class="desk-kv-label">${label}</span><div class="desk-kv-value">${value}</div></div>`;
    return `<div class=card>
      <div class=acct-head><div><b>${esc(a.label || (s.plan.name + ' ' + usd(a.size)))}</b> <span class=tag>${a.phase}</span> <span class="tag">${s.plan.name}: target ${pct(s.plan.target, 0)}, daily ${pct(s.plan.mdl, 0)}, max ${pct(s.plan.mdd, 0)} static</span></div>
      <div class=row style="margin:0"><button class="btn sm" data-act="reconcile" data-id="${a.id}">Match platform balance</button><button class="btn sm" data-act="edit" data-id="${a.id}">Edit</button><button class="btn sm" data-act="resetday" data-id="${a.id}">Reset my day</button></div></div>
      ${live ? `<div class=kv>
        ${kvr(`Equity (live, ${esc(pnlQuote(a.sym || T().sym).basis)})`, `<b>${usd(s.equity)}</b>${s.priceComplete ? '' : ' <span class="dn small">price missing: valued at stop</span>'}`)}
        ${kvr('Balance (closed)', usd(s.balance))}
        ${a.platformEq ? kvr(`Platform equity (imported ${esc(fmtTime(a.platformEq.t, true))})`, `${usd(a.platformEq.v)}${Date.now() - a.platformEq.t < 15 * 60e3 ? ` <span class="small ${Math.abs(s.equity - a.platformEq.v) > a.size * 0.001 ? 'warn' : 'mu'}">app ${s.equity - a.platformEq.v >= 0 ? '+' : ''}${usd(s.equity - a.platformEq.v)}</span>` : ' <span class="small mu">older than 15 min</span>'}`) : ''}
        ${kvr('Open P&L', `<b class="${cls(s.upnl)}">${pnlTxt(s.upnl)}</b> <span class=small>fees ${usd(-s.feesOpen)}</span>`)}
        ${kvr(`Room to breach (${esc(s.binding)} limit)`, `<b class="${s.room < s.profRisk * 2 ? 'dn' : ''}">${usd(s.room)}</b> (${pct(s.roomPct)})`)}
        ${a.phase === 'eval' ? kvr(`To target ${usd(s.targetBal)}`, `${usd(s.toTarget)} · ${pct(Math.max(0, s.progress), 0)} done (on equity)`) : kvr('Payout available (est.)', usd(s.payoutAvail))}
        ${kvr('If every stop fills', s.riskKnown ? `<b class="${s.stopsBreach ? 'dn' : ''}">${usd(s.equityIfStopped)}</b>${s.stopsBreach ? ' BREACH' : ''}` : '<b class=dn>Unknown: a position has no stop</b>')}
        ${kvr('Exposure / margin used', `${usd(s.notional)} · ${s.leverage.toFixed(2)}x · margin ${usd(s.usedMargin)} of ${usd(s.equity)}`, 'desk-x')}
        ${kvr('Today', `${s.tradesToday} trades · ${s.winsToday} wins · ${s.lossesToday} losses${s.unknownToday ? ` (${s.unknownToday} result unknown)` : ''}`)}
      </div>
      <div class=small>Daily floor ${usd(s.dailyFloor)} (3% of ${usd(s.dayStart)} at 00:30 UTC) · used ${pct(dU, 0)}</div><div class="${barC(dU)}"><i style="width:${dU * 100}%"></i></div>
      <div class=small>Max floor ${usd(s.maxFloor)} (static${a.ddLimit ? ', from platform' : ''}) · used ${pct(mU, 0)}</div><div class="${barC(mU)}"><i style="width:${mU * 100}%"></i></div>
      ${a.phase === 'eval' ? `<div class=small>Target progress</div><div class=bar><i style="width:${Math.max(0, Math.min(1, s.progress)) * 100}%"></i></div>` : ''}
      <div style="margin-top:8px"><div class=small>Risk profile (per trade, % of start)</div><div class=profiles>${prof}</div>
      <p class=small>${esc(s.profile.note)} Per trade <b>${usd(s.profRisk)}</b> · next trade may risk <b>${usd(s.nextRisk)}</b> · about <b>${s.lossesToBreach}</b> losses of room${wins ? ` · wins to pass: ${wins}` : ''} · max ${s.profile.maxTrades} trades/day, stop after ${s.profile.stopAfterLosses} losses.</p></div>
      ${a.phase === 'eval' ? passOddsHtml(a, s) : ''}
      ${(w => w.length ? `<p class=small>Orders: ${w.map(pl => `${esc(pl.sym)} ${pl.side} ${pl.orderType !== 'market' ? 'limit @ ' + px(pl.entry) : 'market'} ${pl.status === 'placed' ? '<b>working</b> (counts in risk and margin, not equity)' : 'planned only (counts nothing)'}`).join(' · ')}</p>` : '')(S.planned.filter(pl => pl.acct === a.id))}
      ${(m => m.length ? `<div class=warns>${m.map(x => `<div class=warn>Missing: ${esc(x.text)}. Add it on Desk with Import or Add manually.</div>`).join('')}</div>` : '')(C.missingInfo(a, [T().sym]).filter(x => !S.positions.some(p => p.acct === a.id && !p.closed && p.sym === x.sym)))}
      ${s.warnings.length ? `<div class=warns>${s.warnings.map(w => `<div class="${w.lvl}">${esc(w.text)}</div>`).join('')}</div>` : ''}` : `<p class=small>Final balance ${usd(s.balance)}.</p>`}
      <p class="small mu desk-x">Cost ${usd(s.cost)} · payouts ${usd(s.paid)} · net ${usd(s.net)} ·
        <a href="#" data-act="cost" data-id="${a.id}">+ cost</a> · <a href="#" data-act="payout" data-id="${a.id}">+ payout</a></p>
    </div>`;
  }
  $('#deskRules').addEventListener('change', e => {
    if (e.target.id === 'deskDir') T().dirRule = e.target.checked;
    else if (e.target.id === 'deskBe') T().beAt1R = e.target.checked;
    else return;
    save(); renderAll(true);
  });
  $('#deskList').addEventListener('click', e => {
    const p = e.target.closest('[data-prof]');
    if (p) { const a = acctById(p.dataset.acct); a.profile = p.dataset.prof; save(); renderDesk(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return; e.preventDefault();
    const a = acctById(b.dataset.id);
    if (b.dataset.act === 'edit') acctForm(a);
    if (b.dataset.act === 'resetday') {
      const st = C.accountState(a, S.positions, prices(), Date.now(), { orders: S.planned });
      showModal(`<h3>Reset my day</h3><p class=small>Clears the app's count of today's trades (${st.tradesToday}) and losses (${st.lossesToday}) so its warnings stop blocking you. <b>Your platform's real loss limits don't change</b>; the app keeps enforcing them.</p>
        <p class=small><b class=dn>This counts as a rule break</b> unless you check the box.</p>
        <div class=form><label class=chk><input type=checkbox id=rkAcc> Accidental trade or technical reason (not a rule break)</label>
        <label class=wide>What happened?<input id=rkNote placeholder="optional"></label></div>
        <div class=row style="margin-top:10px"><button class="btn pri" id=rkOk>Reset</button><button class=btn data-close>Cancel</button></div>`);
      $('#rkOk').onclick = () => { const kind = $('#rkAcc').checked ? 'mistake' : 'rulebreak';
        a.dayResetAt = Date.now(); (a.dayLog = a.dayLog || []).push({ t: a.dayResetAt, kind, note: $('#rkNote').value, trades: st.tradesToday, losses: st.lossesToday });
        saveAndSync('day reset'); closeModal(); renderAll(true); };
    }
    if (b.dataset.act === 'reconcile') {
      showModal(`<h3>Match your platform's numbers</h3><p class=small>Type what your prop platform's Portfolio widget shows. Use this when the app drifts (fees, slippage, a trade you didn't log).</p>
        <div class=form><label>Balance now<input id=rcBal type=number step=any></label><label>Max Daily Loss limit shown (optional)<input id=rcMdl type=number step=any></label></div>
        <div class=row style="margin-top:10px"><button class="btn pri" id=rcOk>Save</button><button class=btn data-close>Cancel</button></div>`);
      $('#rcOk').onclick = () => {
        const bal = num($('#rcBal').value), mdl = num($('#rcMdl').value);
        if (bal != null) a.anchor = { t: Date.now(), bal };
        if (mdl != null) a.dayStartOverride = { reset: C.lastReset(Date.now(), a.resetMin), bal: mdl / (1 - C.planOf(a).mdl) };
        save(); closeModal(); renderDesk();
      };
    }
    if (b.dataset.act === 'cost' || b.dataset.act === 'payout') {
      const isC = b.dataset.act === 'cost';
      showModal(`<h3>${isC ? 'Add a cost (reset, re-buy, add-on)' : 'Log a payout received'}</h3><div class=form><label>Amount $<input id=amt type=number step=any></label><label class=wide>Note<input id=amtN></label></div>
        <div class=row style="margin-top:10px"><button class="btn pri" id=amtOk>Save</button><button class=btn data-close>Cancel</button></div>`);
      $('#amtOk').onclick = () => { const v = num($('#amt').value); if (v == null) return; (a[isC ? 'extraCosts' : 'payouts'] = a[isC ? 'extraCosts' : 'payouts'] || []).push({ t: Date.now(), amt: v, note: $('#amtN').value }); save(); closeModal(); renderDesk(); };
    }
  });
  $('#addAcct').onclick = () => acctForm(null);
  const deskPanelButtons = { deskManualPanel: 'deskManualToggle', deskPositionManager: 'deskPositionsMore' };
  function showDeskPanel(panelId, open) {
    const panel = $('#' + panelId), button = $('#' + deskPanelButtons[panelId]); if (!panel || !button) return;
    for (const [otherId, otherButtonId] of Object.entries(deskPanelButtons)) if (otherId !== panelId) {
      const other = $('#' + otherId), otherButton = $('#' + otherButtonId);
      if (other) other.hidden = true;
      if (otherButton) otherButton.setAttribute('aria-expanded', 'false');
    }
    panel.hidden = !open; button.setAttribute('aria-expanded', String(open));
    if (open) {
      if (panelId === 'deskManualPanel' && posFormDirty) { renderPosForm(); posFormDirty = false; }
      if (panelId === 'deskPositionManager') renderPositions();
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  function toggleDeskPanel(panelId) { const panel = $('#' + panelId); if (panel) showDeskPanel(panelId, panel.hidden); }
  function openDeskManual() { switchTab('desk'); showDeskPanel('deskManualPanel', true); }
  function openDeskManager() { switchTab('desk'); showDeskPanel('deskPositionManager', true); }
  $('#deskImportToggle').onclick = () => { $('#impFiles').click(); };
  $('#deskManualToggle').onclick = () => toggleDeskPanel('deskManualPanel');
  $('#deskPositionsMore').onclick = () => toggleDeskPanel('deskPositionManager');
  $('#deskIdeasMore').onclick = () => { switchTab('market'); setTimeout(() => { const el = $('#scanAllBox'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); };
  function acctForm(a) {
    const isNew = !a;
    a = a || { id: uid(), plan: 'advanced', size: 5000, fee: 20, addon90: false, phase: 'eval', profile: 'steady', created: Date.now(), label: '' };
    const planOpts = Object.keys(C.PLANS).map(k => `<option value="${k}" ${k === a.plan ? 'selected' : ''}>${k === 'custom' ? 'Other firm (custom rules)' : 'the prop platform · ' + C.PLANS[k].name}</option>`).join('');
    const sizeOpts = C.SIZES.map(z => `<option ${z === a.size ? 'selected' : ''} value="${z}">${usd(z)}</option>`).join('');
    const pl = C.planOf(a);
    showModal(`<h3>${isNew ? 'Add' : 'Edit'} prop account</h3>
      <div class=form>
        <label>Firm / plan<select id=afPlan>${planOpts}</select></label>
        <label>Size<select id=afSize>${sizeOpts}</select></label>
        <label>Fee paid $<input id=afFee type=number step=any value="${a.fee}"></label>
        <label class=chk><input type=checkbox id=afAdd ${a.addon90 ? 'checked' : ''}> 90/10 add-on (+20%)</label>
        <label>Phase<select id=afPhase>${['eval', 'funded', 'passed', 'breached', 'closed'].map(p => `<option ${p === a.phase ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label>Label<input id=afLabel value="${esc(a.label)}" placeholder="e.g. Advanced 5k #2"></label>
        <label>Target %<input id=afT type=number step=any value="${(pl.target * 100).toFixed(2)}"></label>
        <label>Daily loss %<input id=afL type=number step=any value="${(pl.mdl * 100).toFixed(2)}"></label>
        <label>Max drawdown % (static)<input id=afD type=number step=any value="${(pl.mdd * 100).toFixed(2)}"></label>
        <label>Daily reset (UTC, HH:MM)<input id=afReset value="${a.resetMin != null ? String(Math.floor(a.resetMin / 60)).padStart(2, '0') + ':' + String(a.resetMin % 60).padStart(2, '0') : '00:30'}" placeholder="00:30"></label>
        <div class=small id=afLevNote style="grid-column:1/-1">Leverage: ${a.plan === 'custom' ? 'read from your screenshots (import the order screen that shows it)' : 'matches the venue (the prop platform: BTC 10x, ETH/SOL/XRP 5x, HYPE/WLD 3x)'}${a.leverage && Object.keys(a.leverage).length ? '; from your screenshots: ' + Object.entries(a.leverage).map(([k, v]) => esc(k) + ' ' + v + 'x').join(', ') : ''}.</div>
        <label>Started<input id=afDate type=datetime-local value="${new Date(a.created - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"></label>
      </div>
      <p class="small mu">Presets fill in the firm's published rules (the prop platform checked Nov 1, 2026). For another firm pick "Other firm" and type its target and loss limits from its rules page.</p>
      ${T().budget ? `<p class="small warn">Monthly eval budget: ${usd(T().budget)}. Only money left after bills, your cushion and your weekly buy.</p>` : ''}
      <div class=row style="margin-top:10px"><button class="btn pri" id=afOk>Save</button><button class=btn data-close>Cancel</button>${isNew ? '' : '<button class="btn bad" id=afDel>Delete</button>'}</div>`);
    const initialRules = { target: $('#afT').value, mdl: $('#afL').value, mdd: $('#afD').value };
    const autoFee = () => { const pk = $('#afPlan').value, z = +$('#afSize').value; const base = C.PLANS[pk].price[z]; if (base != null) $('#afFee').value = +(base * ($('#afAdd').checked ? 1 + C.ADDON_90 : 1)).toFixed(2); };
    $('#afPlan').onchange = () => { autoFee(); const P = C.PLANS[$('#afPlan').value]; $('#afT').value = (P.target * 100).toFixed(2); $('#afL').value = (P.mdl * 100).toFixed(2); $('#afD').value = (P.mdd * 100).toFixed(2); $('#afLevNote').firstChild.textContent = 'Leverage: ' + ($('#afPlan').value === 'custom' ? 'read from your screenshots (import the order screen that shows it)' : 'matches the venue (the prop platform: BTC 10x, ETH/SOL/XRP 5x, HYPE/WLD 3x)'); }; $('#afSize').onchange = autoFee; $('#afAdd').onchange = autoFee;
    $('#afOk').onclick = () => {
      const next = { plan: $('#afPlan').value, size: +$('#afSize').value, fee: num($('#afFee').value) || 0, addon90: $('#afAdd').checked,
        phase: $('#afPhase').value, label: $('#afLabel').value.trim() };
      const P = C.PLANS[next.plan];
      const tg = C.parseRulePct($('#afT').value, 0.5, 50), ml = C.parseRulePct($('#afL').value, 0.5, 20), md = C.parseRulePct($('#afD').value, 0.5, 20);
      const bad = [['Target', tg], ['Daily loss', ml], ['Max drawdown', md]].filter(x => x[1].error);
      if (bad.length) { alert(bad.map(x => `${x[0]} ${x[1].error}. Leave it blank to use the plan default.`).join('\n')); return; }
      const keep = (r, d) => (r.value == null || Math.abs(r.value - d) < 1e-9 ? undefined : r.value);
      // The form rounds for display; do not change a more precise saved rule merely by editing the label or size.
      const rule = (key, id, parsed, def) => next.plan === a.plan && $(id).value === initialRules[key] ? a[key] : keep(parsed, def);
      next.target = rule('target', '#afT', tg, P.target); next.mdl = rule('mdl', '#afL', ml, P.mdl); next.mdd = rule('mdd', '#afD', md, P.mdd);
      const rm = C.parseResetUtc($('#afReset').value || '00:30'); if (rm == null) { alert('Daily reset must be HH:MM in UTC, like 00:30 or 22:00.'); return; }
      next.resetMin = rm === 30 ? undefined : rm;
      const d = Date.parse($('#afDate').value); if (!isNaN(d)) next.created = d;
      const identityChanged = next.plan !== a.plan || next.size !== +a.size || next.phase !== a.phase;
      const nextRules = C.planOf(next), oldRules = C.planOf(a);
      const clearFloor = a.ddLimit > 0 && (identityChanged || Math.abs(nextRules.mdd - oldRules.mdd) > 1e-9);
      const clearTarget = a.targetEq > 0 && (identityChanged || Math.abs(nextRules.target - oldRules.target) > 1e-9);
      if (clearFloor || clearTarget) {
        const changes = [];
        if (clearFloor) changes.push(`Imported drawdown limit ${usd(a.ddLimit)} will be removed; the selected rules give ${usd(next.size * (1 - nextRules.mdd))}.`);
        if (clearTarget) changes.push(`Imported target equity ${usd(a.targetEq)} will be removed; the selected rules give ${usd(next.size * (1 + nextRules.target))}.`);
        if (!confirm(changes.join('\n') + '\n\nCheck the account and these rules against the platform before saving. Re-import current limits after saving. Continue?')) return;
      }
      Object.assign(a, next);
      if (clearFloor) delete a.ddLimit;
      if (clearTarget) delete a.targetEq;
      if (isNew) S.accounts.push(a);
      const cap = liveAccts().reduce((s, x) => s + x.size, 0);
      save(); closeModal(); renderAll(true);
      if (cap > C.CAPITAL_CAP) alert(`Heads up: ${usd(cap)} across open accounts is over the firm's $200,000 combined limit.`);
    };
    if (!isNew) $('#afDel').onclick = () => { if (confirm('Delete this account and its logged positions?')) { S.accounts = S.accounts.filter(x => x.id !== a.id); S.positions = S.positions.filter(p => p.acct !== a.id); save(); closeModal(); renderAll(true); } };
  }

  // ---------- Positions ----------
  let posDraft = null, posFormDirty = true, journalAll = false;
  function renderPosForm() {
    const accts = liveAccts();
    if (!accts.length) { $('#posFormCard').innerHTML = '<p>Add a prop account on the Desk first.</p>'; return; }
    const d = posDraft || {};
    const symOpts = T().symbols.map(s => `<option ${s === (d.sym || T().sym) ? 'selected' : ''}>${esc(s)}</option>`).join('');
    $('#posFormCard').innerHTML = `<h3>Log a position by hand</h3>
      <div class=form>
        <label>Account<select id=pfA>${accts.map(a => `<option value="${a.id}">${esc(a.label || C.planOf(a).name + ' ' + usd(a.size))}</option>`).join('')}</select></label>
        <label>Symbol<select id=pfS>${symOpts}</select></label>
        <label>Side<select id=pfSide><option ${d.side === 'long' ? 'selected' : ''}>long</option><option ${d.side === 'short' ? 'selected' : ''}>short</option></select></label>
        <label>Entry<input id=pfE type=number step=any value="${d.entry != null ? d.entry : ''}"></label>
        <label>Stop<input id=pfStop type=number step=any value="${d.stop != null ? d.stop : ''}"></label>
        <label>Qty (coins)<input id=pfQ type=number step=any value="${d.qty != null ? d.qty : ''}"></label>
        <label>TP1<input id=pfT1 type=number step=any value="${d.tp1 != null ? d.tp1 : ''}"></label>
        <label>TP2<input id=pfT2 type=number step=any></label>
        <label>Entry timeframe<select id=pfTf>${[5, 15, 60, 240].map(t => `<option value="${t}" ${String(t) === String(d.tf || 15) ? 'selected' : ''}>${C.tfName(t)}</option>`).join('')}</select></label>
        <label>Setup<select id=pfSet>${['ORB', 'FVG', 'Structure', 'Liquidity sweep', 'Other'].map(x => `<option ${x === d.setup ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>Opened<input id=pfOpen type=datetime-local value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"></label>
        <label class=wide>Thesis / invalidation (why in, what proves you wrong)<textarea id=pfTh></textarea></label>
      </div>
      <div id=pfSize class=small style="margin:8px 0"></div>
      <div class=row><button class=btn id=pfCalc>Size it to my profile</button><button class="btn pri" id=pfSave>Log position</button></div>`;
    const calc = fill => {
      const a = acctById($('#pfA').value), s = C.accountState(a, S.positions, prices(), Date.now(), { orders: S.planned });
      const entry = num($('#pfE').value) || pnlPrice($('#pfS').value), stop = num($('#pfStop').value);
      if (!entry || stop == null) { $('#pfSize').innerHTML = '<span class=warn>Need entry and stop to size.</span>'; return; }
      const side = $('#pfSide').value;
      if ((side === 'long' && stop >= entry) || (side === 'short' && stop <= entry)) { $('#pfSize').innerHTML = '<span class=dn>Stop is on the wrong side of entry.</span>'; return; }
      if (!s.riskKnown) { $('#pfSize').innerHTML = '<span class=dn>An open position on this account has no stop. Log its stop first: risk is unlimited, so the app sizes nothing.</span>'; return; }
      const z = C.sizeFor({ sym: $('#pfS').value, entry, stop, risk: s.nextRisk, equity: s.equity, usedMargin: s.usedMargin, symNotional: s.openBySym[$('#pfS').value] || 0, leverage: C.levMap(a) });
      if (z.error) { $('#pfSize').innerHTML = `<span class=dn>${esc(z.error)}</span>`; return; }
      if (fill) $('#pfQ').value = z.qty;
      const q = num($('#pfQ').value) || z.qty, loss = q * (Math.abs(entry - stop) + (entry + stop) * C.FEES.commission);
      $('#pfSize').innerHTML = `${s.profile.name}: may risk ${usd(s.nextRisk)} → <b>${z.qty} ${esc(C.base($('#pfS').value))}</b> (${usd(z.notional)}, ${z.leverage.toFixed(2)}x${z.levUnknown ? ' · <b class=warn>leverage unknown: screenshot your platform\'s order screen for this coin so the margin limit is known</b>' : ` of ${z.levCap}x cap`}${z.capped ? `, <span class=warn>capped by ${z.capped === 'margin' ? 'margin left (' + usd(z.freeMargin) + ' free)' : 'the market\'s max position'}, real risk lower</span>` : ''}). Fees ≈ ${usd(z.fees)}.
        At qty ${q}: loss at stop ≈ <b class="${loss > s.nextRisk * 1.05 ? 'dn' : ''}">${usd(loss)}</b>${loss > s.room ? ' <b class=dn>— breaches the account</b>' : ''}. Stops are not guaranteed fills; slippage adds to this.`;
    };
    $('#pfCalc').onclick = () => calc(true);
    ['#pfQ', '#pfE', '#pfStop'].forEach(id => $(id).addEventListener('input', () => calc(false)));
    $('#pfSave').onclick = () => {
      const p = { id: uid(), acct: $('#pfA').value, sym: $('#pfS').value, side: $('#pfSide').value, entry: num($('#pfE').value), stop: num($('#pfStop').value),
        qty: num($('#pfQ').value), tp1: num($('#pfT1').value), tp2: num($('#pfT2').value), tf: +$('#pfTf').value, setup: $('#pfSet').value,
        thesis: $('#pfTh').value.trim(), opened: Date.parse($('#pfOpen').value) || Date.now(), partials: [], stopHist: [] };
      if (posDraft && posDraft.ref && C.setupKey(p.setup, p.tf) === posDraft.ref.key) p.ref = posDraft.ref;   // came from a model setup, unchanged
      if (!p.entry || !p.qty) { alert('Entry and quantity are required.'); return; }
      if (p.stop == null && !confirm('No stop logged. Your rules say every trade needs one. Log anyway?')) return;
      if (!p.thesis && !confirm('No thesis written. Every trade needs a plan. Log anyway?')) return;
      if (T().dirRule !== false) { const dc = C.directionCheck(p.side, p.sym, analyze(p.sym).struct, S.positions, p.acct);
        if (!dc.ok) { if (!confirm('This breaks your rule "both ways only when it makes sense":\n- ' + dc.reasons.join('\n- ') + '\n\nLog it anyway? It will be marked as a rule break.')) return; p.tag = 'rulebreak'; p.tagNote = dc.reasons.join('; '); } }
      p.origStop = p.stop; p.stopHist.push({ t: Date.now(), stop: p.stop });
      S.positions.push(p); posDraft = null; posFormDirty = true; saveAndSync('new'); ensureFeeds(); renderAll(true);
    };
  }
  // Order history + "what happened" for a closed trade (owner's request, Nov 1 2026): facts from his log and the candles.
  // The Coach reviews every closed trade by itself and saves the findings (p.review) for the Scorecard's Lessons; it finishes the
  // review once the candles 24 h after a stop-out are in. His own note and tags (p.lesson) are optional.
  function coachReview(p) {
    const rv = C.tradeReview(p, F.candles(p.sym, 15), F.candles(p.sym, 60), Date.now());
    rv.verdict = C.coachVerdict(rv, p);
    if (!p.review || !p.review.complete) {
      const nr = { flags: rv.flags, verdict: rv.verdict, exit: rv.exit, stopAtr: rv.stopAtr, mfeR: rv.mfeR, maeR: rv.maeR, complete: rv.complete, at: Date.now() };
      if (!p.review || JSON.stringify([p.review.flags, p.review.verdict, p.review.complete]) !== JSON.stringify([nr.flags, nr.verdict, nr.complete])) { p.review = nr; reviewsChanged = true; }
    }
    return rv;
  }
  let reviewsChanged = false;
  function reviewAllClosed() { for (const p of S.positions.filter(p => p.closed && (!p.review || !p.review.complete))) { try { coachReview(p); } catch (e) { } } if (reviewsChanged) { reviewsChanged = false; save(); } }
  setTimeout(reviewAllClosed, 10000); setInterval(reviewAllClosed, 5 * 60e3);
  function historyFold(p) {
    const rv = coachReview(p);
    const ico = { open: '▶', stop: '⛔', widened: '⚠', target: '🎯', partial: '½', close: '■' };
    const plan = C.rrOf(p.side, p.entry, p.origStop != null ? p.origStop : p.stop, p.tp1 != null ? p.tp1 : p.tp2), got = C.liveR(p), le = p.lesson || {};
    return `<details class=sc-w ${fold('hist:' + p.id)}><summary>History &amp; what happened</summary>
      <div class=small><div class="${rv.flags.some(f => f !== 'stop_did_job') ? 'warn' : 'up'}" style="margin:4px 0"><b>${esc(rv.verdict)}</b></div>
      ${p.thesis ? `<div><b>Plan:</b> ${esc(p.thesis)}</div>` : '<div class=warn>No plan was written for this trade.</div>'}
      <div><b>Planned</b> ${plan != null ? plan.toFixed(2) + 'R' : '—'} · <b>got</b> ${got != null ? (got >= 0 ? '+' : '') + got.toFixed(2) + 'R' : '—'}${p.closed && p.opened && !p.openedUnknown ? ` · held ${((p.closed.t - p.opened) / 3600e3).toFixed(1)} h` : ''}</div>
      <table class=hist>${rv.events.map(e => `<tr class="${e.kind === 'widened' ? 'dn' : ''}"><td class=mu>${fmtTime(e.t, true)}</td><td>${ico[e.kind] || '·'} ${esc(e.text)}</td></tr>`).join('')}</table>
      <div class=warns>${rv.lines.map(l => `<div class="${l.lvl === 'bad' ? 'bad' : l.lvl === 'warn' ? 'warn' : ''}">${esc(l.t)}</div>`).join('')}</div>
      <div style="margin-top:6px"><b>Your side (optional):</b> ${Object.entries(C.LESSON_TAGS).map(([k, l]) => `<label class=chk style="display:inline-flex;margin-right:8px"><input type=checkbox data-ltag="${p.id}" value="${k}" ${(le.tags || []).includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
        <input data-lnote="${p.id}" value="${esc(le.text || '')}" placeholder="What would you do differently?" style="width:100%;margin-top:4px"></div>
      <div class=mu>Saved with the trade; the Scorecard's Lessons add these up across trades.</div></div></details>`;
  }
  document.addEventListener('change', e => {
    const t = e.target.closest('[data-ltag]'), n = e.target.closest('[data-lnote]'); if (!t && !n) return;
    const p = S.positions.find(x => x.id === (t ? t.dataset.ltag : n.dataset.lnote)); if (!p) return;
    p.lesson = p.lesson || { tags: [], text: '' };
    if (t) p.lesson.tags = t.checked ? [...new Set(p.lesson.tags.concat(t.value))] : p.lesson.tags.filter(x => x !== t.value); else p.lesson.text = n.value.trim();
    save();
  });
  function renderPositions() {
    const now = Date.now();
    const open = S.positions.filter(p => !p.closed);
    $('#posOpen').innerHTML = plannedHtml() + (open.length ? open.map(p => {
      const price = pnlPrice(p.sym), a = acctById(p.acct);
      const net = price != null ? C.netIfClosed(p, price, now) : null, r = price != null ? C.rMultiple(p, price) : null;
      const h = lastHealth[p.id];
      return `<div class=card><div class=acct-head><div><b>${esc(p.sym)} ${p.side.toUpperCase()}</b> ${C.openQty(p)} @ ${px(p.entry)} <span class=tag>${esc(a ? a.label || C.planOf(a).name + ' ' + usd(a.size) : '?')}</span> <span class=tag>${esc(p.setup)} · ${C.tfName(p.tf)}</span></div>
        <div>${h ? `<span class="score s${h.score || 0}">${h.score || '–'}/5</span>` : ''}</div></div>
        <div class=kv><div><span>Price</span>${px(price)}</div><div><span>Net P&L if closed now</span><b class="${cls(net)}">${pnlTxt(net)}</b></div><div><span>R now</span>${r == null ? '—' : r.toFixed(2) + 'R'}</div><div><span>Planned R:R (after fees)</span>${(x => x == null ? '—' : x.toFixed(2) + 'R')(C.rrOf(p.side, p.entry, p.origStop != null ? p.origStop : p.stop, p.tp1 != null ? p.tp1 : p.tp2))}</div>
        <div><span>Stop</span>${px(p.stop)}${p.origStop != null && p.stop !== p.origStop ? ` <span class=small>(was ${px(p.origStop)})</span>` : ''}</div><div><span>TP1 / TP2</span>${px(p.tp1)} / ${px(p.tp2)}</div><div><span>Opened</span>${fmtTime(p.opened, true)}</div></div>
        ${p.thesis ? `<p class=small>Thesis: ${esc(p.thesis)}</p>` : ''}
        <div class=row><button class="btn sm" data-pa="stop" data-id="${p.id}">Update stop/targets</button><button class="btn sm" data-pa="partial" data-id="${p.id}">Partial close</button><button class="btn sm" data-pa="close" data-id="${p.id}">Close</button><button class="btn sm" data-pa="del" data-id="${p.id}">Delete</button></div></div>`;
    }).join('') : '<p class=mu>No open positions logged.</p>');
    const closedAll = S.positions.filter(p => p.closed).sort((a, b) => b.closed.t - a.closed.t);
    const simplePos = C.uiView(T().view) === 'simple';
    const closed = closedAll.slice(0, simplePos && !journalAll ? 10 : (simplePos ? closedAll.length : 50));
    const wk = Date.now() - 7 * 864e5, recent = S.positions.filter(p => p.closed && p.closed.t > wk);
    const resets = S.accounts.flatMap(a => (a.dayLog || []).filter(d => d.t > wk));
    const cnt = k => recent.filter(p => (p.tag || 'plan') === k).length;
    const oc = k => recent.filter(p => C.tradeOutcome(p) === k).length;
    const stats = `<p class=small>Last 7 days: <b class=up>${oc('win')}</b> wins · <b class=dn>${oc('loss')}</b> losses · ${oc('even')} breakeven${oc('unknown') ? ` · <b class=warn>${oc('unknown')} result unknown</b>` : ''} (win = net after fees above $0)<br><b class=up>${cnt('plan')}</b> followed plan · <b class=warn>${cnt('mistake')}</b> mistakes · <b class=dn>${cnt('rulebreak')}</b> rule breaks · ${cnt('data')} data problems · day resets: ${resets.filter(d => d.kind === 'mistake').length} accident/technical, <b class=dn>${resets.filter(d => d.kind === 'rulebreak').length}</b> rule break</p>`;
    const advancedJournal = stats + (closed.length ? `<table><tr><th>Closed</th><th>Trade</th><th class=num>Net</th><th>Setup · tag</th></tr>${closed.map(p => {
      const tot = C.realizedOfPos(p), known = !p.closed.synced || p.closed.resultKnown;
      return `<tr><td class=small>${fmtTime(p.closed.t, true)}</td><td>${esc(p.sym)} ${p.side} ${p.qty} @ ${px(p.entry)}${p.closed.price ? ' → ' + px(p.closed.price) : ''}<div class=small>${esc(p.closed.note || '')}${p.closed.ledgerSeq ? ` · ledger row #${p.closed.ledgerSeq}${p.closed.ledgerAmt != null ? ' (' + usd(p.closed.ledgerAmt) + ' on the platform)' : ''}` : ''}${p.closed.exitAt ? ' · ' + ({ tp1: 'at take-profit', tp2: 'at TP2', stop: 'at stop', other: 'other price' })[p.closed.exitAt] : ''}${p.snap && p.snap.open ? `<div class=mu>At entry: ${esc(snapLine(p.snap.open))}</div>` : ''}${p.snap && p.snap.close ? `<div class=mu>At close: ${esc(snapLine(p.snap.close))}</div>` : ''}${p.widened ? ' <span class=warn>stop widened</span>' : ''}${p.tagNote ? ' <span class=dn>' + esc(p.tagNote) + '</span>' : ''}</div></td>
        <td class="num ${cls(tot)}">${(o => o === 'unknown' ? `— <div><button class="btn sm" data-edit="${p.id}">Enter result</button></div>` : `${usd(tot)}<div class=small><b class="${o === 'win' ? 'up' : o === 'loss' ? 'dn' : ''}">${o === 'win' ? 'Win' : o === 'loss' ? 'Loss' : 'Breakeven'}</b>${(r => r == null ? '' : ' · ' + (r >= 0 ? '+' : '') + r.toFixed(2) + 'R')(C.liveR(p))}</div><button class="btn sm" data-edit="${p.id}">Edit</button>`)(C.tradeOutcome(p))}</td><td><select data-setup="${p.id}" aria-label="Setup">${C.SETUP_CHOICES.map(([k, l]) => `<option value="${k}" ${k === (p.ref && p.ref.key ? p.ref.key : C.setupKey(p.setup, p.tf)) ? 'selected' : ''}>${l}</option>`).join('')}</select><select data-tag="${p.id}" aria-label="Tag">${Object.keys(C.TRADE_TAGS).map(k => `<option value="${k}" ${k === (p.tag || 'plan') ? 'selected' : ''}>${C.TRADE_TAGS[k].split(' (')[0]}</option>`).join('')}</select></td></tr>
        <tr><td colspan=4 style="padding-top:0">${historyFold(p)}</td></tr>`;
    }).join('')}</table>` : '<p class=mu>Nothing closed yet.</p>');
    if (simplePos) {
      const stamp = ms => ({ date: new Intl.DateTimeFormat('en-US', { timeZone: T().tz, month: 'short', day: 'numeric' }).format(new Date(ms)), time: new Intl.DateTimeFormat('en-US', { timeZone: T().tz, hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) });
      const rows = closed.map(p => {
        const tot = C.realizedOfPos(p), rNow = C.liveR(p), o = C.tradeOutcome(p), w = stamp(p.closed.t);
        const rTxt = rNow == null ? '—' : (rNow >= 0 ? '+' : '') + rNow.toFixed(2) + 'R';
        return `<details class=jrow ${fold('j:' + p.id)}><summary class=jsum><span>${esc(w.date)}</span><span>${esc(w.time)}</span><span class="${cls(rNow)}">${rNow > 0 ? '▲ ' : rNow < 0 ? '▼ ' : ''}${esc(rTxt)}</span><span class="${o === 'unknown' ? '' : cls(tot)}">${o === 'unknown' ? '—' : pnlTxt(tot)}</span><span>${esc(C.base(p.sym))}</span><span class="${p.side === 'long' ? 'bull' : 'bear'}">${esc(p.side)}</span></summary>
          <div class=jdetail><div class=small>${esc(p.sym)} ${esc(p.side)} ${esc(String(p.qty))} @ ${px(p.entry)}${p.closed.price ? ' → ' + px(p.closed.price) : ''}</div>
          <div class=small>${esc(p.closed.note || '')}${p.tagNote ? ' <span class=dn>' + esc(p.tagNote) + '</span>' : ''}${p.widened ? ' <span class=warn>stop widened</span>' : ''}</div>
          <div class=row><button class="btn sm" data-edit="${p.id}">${o === 'unknown' ? 'Enter result' : 'Edit'}</button>
          <select data-setup="${p.id}" aria-label="Setup">${C.SETUP_CHOICES.map(([k, l]) => `<option value="${k}" ${k === (p.ref && p.ref.key ? p.ref.key : C.setupKey(p.setup, p.tf)) ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <select data-tag="${p.id}" aria-label="Tag">${Object.keys(C.TRADE_TAGS).map(k => `<option value="${k}" ${k === (p.tag || 'plan') ? 'selected' : ''}>${C.TRADE_TAGS[k].split(' (')[0]}</option>`).join('')}</select></div>
          ${historyFold(p)}</div></details>`;
      }).join('');
      const more = closedAll.length > 10 ? `<p><button type=button class="btn sm" id=journalAll>${journalAll ? 'Show last 10' : 'Full journal (' + closedAll.length + ')'}</button></p>` : '';
      $('#posClosed').innerHTML = stats + (closed.length ? `<div class=jhead><span></span><span>Date</span><span>Time</span><span>R</span><span>P&amp;L</span><span>Coin</span><span>Side</span></div>${rows}${more}` : '<p class=mu>Nothing closed yet.</p>');
    } else $('#posClosed').innerHTML = advancedJournal;
    const dl = S.accounts.flatMap(a => (a.dayLog || []).map(d => Object.assign({ acct: a.label || C.planOf(a).name }, d))).sort((x, y) => y.t - x.t).slice(0, 10);
    const dlTable = dl.map(d => `<tr><td class=small>${fmtTime(d.t, true)}</td><td>${esc(d.acct)}</td><td class="${d.kind === 'rulebreak' ? 'dn' : 'warn'}">${d.kind === 'rulebreak' ? 'Rule break' : 'Accident / technical'}</td><td class=small>${d.trades} trades, ${d.losses} losses${d.note ? ' · ' + esc(d.note) : ''}</td></tr>`).join('');
    if (dl.length) $('#posClosed').innerHTML += simplePos ? `<details class=card ${fold('dayresets')}><summary>Day resets (${dl.length})</summary><table>${dlTable}</table></details>` : `<h3 style="margin-top:12px">Day resets</h3><table>${dlTable}</table>`;
  }
  $('#posClosed').addEventListener('click', e => {
    if (e.target.closest('#journalAll')) { journalAll = !journalAll; renderPositions(); return; }
    const b = e.target.closest('[data-edit]'); if (!b) return; const p = S.positions.find(x => x.id === b.dataset.edit); if (!p || !p.closed) return;
    editClosed(p);
  });
  $('#posClosed').addEventListener('change', e => { const ss = e.target.closest('[data-setup]');
    if (ss) { const p = S.positions.find(x => x.id === ss.dataset.setup); if (p) { p.ref = { key: ss.value, model: (p.ref && p.ref.model) || C.modelAt(p.opened), byHand: true }; save(); renderPositions(); } return; }
    const sel = e.target.closest('[data-tag]'); if (!sel) return; const p = S.positions.find(x => x.id === sel.dataset.tag); if (p) { p.tag = sel.value; save(); renderPositions(); } });
  $('#posOpen').addEventListener('click', e => {
    const b = e.target.closest('[data-pa]'); if (!b) return;
    const p = S.positions.find(x => x.id === b.dataset.id); if (!p) return;
    const pa = b.dataset.pa, price = F.price(p.sym);
    if (pa === 'del') { if (confirm('Delete this position record? (Use Close if it was a real trade.)')) { S.positions = S.positions.filter(x => x !== p); saveAndSync('delete'); renderAll(true); } return; }
    if (pa === 'stop') {
      showModal(`<h3>Update ${esc(p.sym)} ${p.side}</h3><div class=form><label>Stop<input id=usS type=number step=any value="${p.stop != null ? p.stop : ''}"></label><label>TP1<input id=usT1 type=number step=any value="${p.tp1 != null ? p.tp1 : ''}"></label><label>TP2<input id=usT2 type=number step=any value="${p.tp2 != null ? p.tp2 : ''}"></label><label class=wide>Why (for the journal)<input id=usWhy></label></div>
        <p id=usWarn class=small></p><div class=row><button class="btn pri" id=usOk>Save</button><button class=btn data-close>Cancel</button></div>`);
      const chk = () => { const ns = num($('#usS').value); const wid = ns != null && p.stop != null && (p.side === 'long' ? ns < p.stop : ns > p.stop);
        $('#usWarn').innerHTML = wid ? '<span class=dn>This moves the stop farther away (more risk). Your rules say never widen a stop to avoid a loss. Saving marks it in the journal.</span>' : ''; return wid; };
      $('#usS').addEventListener('input', chk);
      $('#usOk').onclick = () => {
        const ns = num($('#usS').value), wid = chk();
        if (wid && !confirm('Widen the stop anyway? This is a rule break and will be recorded.')) return;
        if (wid) p.widened = true;
        if (ns !== p.stop) p.stopHist.push({ t: Date.now(), stop: ns, why: $('#usWhy').value });
        const nt = num($('#usT1').value); if (nt !== p.tp1) (p.tpHist = p.tpHist || []).push({ t: Date.now(), tp: nt, why: $('#usWhy').value });
        p.stop = ns; p.tp1 = nt; p.tp2 = num($('#usT2').value); saveAndSync('stop'); closeModal(); renderAll(true);
      };
      return;
    }
    const isP = pa === 'partial';
    // Owner, Nov 2: don't make him type the exit: ask where it closed (planned target, stop, or a different price).
    // A partial on the prop platform is always a manual close (no partial TP orders): offer his partial level and the market price instead.
    const clChoices = (isP ? [p.partialAt != null && { v: 'partial', label: 'At my partial level', px: p.partialAt }, price != null && { v: 'market', label: 'At market now', px: +price.toFixed(6) }]
      : [p.tp1 != null && { v: 'tp1', label: 'At my take-profit', px: p.tp1 }, p.tp2 != null && { v: 'tp2', label: 'At TP2', px: p.tp2 }, p.stop != null && { v: 'stop', label: 'At my stop', px: p.stop }]).filter(Boolean);
    showModal(`<h3>${isP ? 'Partial close' : 'Close'} ${esc(p.sym)} ${p.side}</h3><div class=form>
      ${isP ? `<div class=wide><b>How much did you close?</b><div class=row style="margin:4px 0">${[25, 50, 75].map(f => `<button type=button class="btn sm" data-clq="${+(C.openQty(p) * f / 100).toFixed(8)}">${f}% (${+(C.openQty(p) * f / 100).toFixed(6)})</button>`).join('')}</div></div><label>Qty closed<input id=clQ type=number step=any placeholder="max ${C.openQty(p)}"></label>` : ''}
      ${clChoices.length ? `<div class=wide><b>Where did it close?</b><div class=row id=clWhere style="margin:4px 0">${clChoices.map(c => `<label class="btn sm"><input type=radio name=clW value="${c.v}" data-px="${c.px}"> ${esc(c.label)} ${px(c.px)}</label>`).join('')}<label class="btn sm"><input type=radio name=clW value=other> Different price</label></div><p class="small mu" id=clWhy></p></div>` : ''}
      <label id=clPL ${clChoices.length ? 'style="display:none"' : ''}>Exit price<input id=clP type=number step=any value="${clChoices.length ? '' : price != null ? +price.toFixed(6) : ''}"></label>
      <label>Realized $ from your platform (optional, overrides estimate)<input id=clR type=number step=any></label>
      <label>Closed at<input id=clT type=datetime-local value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"></label>
      <label>How did it go?<select id=clTag>${Object.keys(C.TRADE_TAGS).map(k => `<option value="${k}" ${k === (p.tag || 'plan') ? 'selected' : ''}>${C.TRADE_TAGS[k]}</option>`).join('')}</select></label>
      <label class=wide>Note<input id=clN></label></div>
      <p class=small id=clEst></p><div class=row><button class="btn pri" id=clOk>Save</button><button class=btn data-close>Cancel</button></div>`);
    const est = () => { const q = isP ? num($('#clQ').value) : C.openQty(p), xp = num($('#clP').value); if (!q || !xp) return null; const v = C.realizedFor(p, q, xp, Date.parse($('#clT').value) || Date.now()); $('#clEst').textContent = `Estimated net after fees: ${usd(v)}`; return v; };
    document.querySelectorAll('#clP,#clT' + (isP ? ',#clQ' : '')).forEach(x => x.addEventListener('input', est)); est();
    document.querySelectorAll('[data-clq]').forEach(b => b.addEventListener('click', () => { $('#clQ').value = b.dataset.clq; est(); }));
    document.querySelectorAll('input[name=clW]').forEach(r => r.addEventListener('change', () => {
      const other = r.value === 'other'; $('#clPL').style.display = '';
      $('#clP').value = other ? (price != null ? +price.toFixed(6) : '') : r.dataset.px;
      $('#clWhy').textContent = r.value === 'stop' ? 'A stop can fill a little worse than its price. If your platform shows a different fill, pick "Different price" or type the realized $ below.' : other ? 'Live price filled in: change it to your actual exit.' : '';
      est();
    }));
    $('#clOk').onclick = () => {
      const q = isP ? num($('#clQ').value) : C.openQty(p), xp = num($('#clP').value), t = Date.parse($('#clT').value) || Date.now();
      const where = (document.querySelector('input[name=clW]:checked') || {}).value || null;
      if (clChoices.length && !where) { alert(isP ? 'Pick the price: your partial level, market now, or a different price.' : 'Pick where it closed: your take-profit, your stop, or a different price.'); return; }
      if (!q || !xp || q > C.openQty(p) + 1e-12) { alert('Check quantity and exit price.'); return; }
      const rv = num($('#clR').value), v = rv != null ? rv : C.realizedFor(p, q, xp, t);
      if (isP) { p.partials.push({ t, qty: q, price: xp, realized: v, exitAt: where }); if (C.openQty(p) <= 1e-12) p.closed = { t, price: xp, realized: 0, note: $('#clN').value, exitAt: where }; }
      else p.closed = { t, price: xp, realized: v, note: $('#clN').value, exitAt: where };
      p.tag = $('#clTag').value;
      saveAndSync('close'); closeModal(); renderAll(true);
    };
  });

  // ---------- Import from the prop platform (screenshots or text) ----------
  let activeOcr = null, importSeq = 0, lastImport = null, lastSyncSummary = null, importShots = null;
  function loadScript(src) { return new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('could not load ' + src)); document.head.appendChild(el); }); }
  function disposeOcrWorker(session, worker) {
    if (!worker || session.disposed.has(worker) || session.nativeStopped) return;
    session.disposed.add(worker);
    try { if (typeof worker.terminate === 'function') Promise.resolve(worker.terminate()).catch(() => {}); } catch (_) { /* best-effort cleanup */ }
  }
  function stopOcr(session, reason) {
    if (!session || session.controller.signal.aborted) return;
    session.reason = reason || new Error('Import cancelled.');
    session.controller.abort();
    if (session.worker) disposeOcrWorker(session, session.worker);
    else if (session.nativeWorker && !session.nativeStopped) {
      session.nativeStopped = true;
      try { session.nativeWorker.terminate(); } catch (_) { /* best-effort cleanup */ }
    }
    if (activeOcr === session) activeOcr = null;
  }
  // The pinned Tesseract factory creates its native Worker synchronously, but exposes the wrapper only after initialization.
  // Capture that native handle only during the factory call so a stalled initialization can be cancelled too.
  function createOcrWorker(session) {
    const NativeWorker = window.Worker;
    function TrackedWorker(...args) { const worker = new NativeWorker(...args); session.nativeWorker = worker; return worker; }
    Object.setPrototypeOf(TrackedWorker, NativeWorker); TrackedWorker.prototype = NativeWorker.prototype;
    window.Worker = TrackedWorker;
    try { return Tesseract.createWorker('eng', 1, { workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract/', langPath: 'vendor/tesseract/lang', gzip: true, workerBlobURL: false }); }
    finally { window.Worker = NativeWorker; }
  }
  function ocrDeadline(session, promise, ms, label) {
    return new Promise((resolve, reject) => {
      const signal = session.controller.signal;
      if (signal.aborted) { reject(session.reason); return; }
      const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(session.reason); };
      const timer = setTimeout(() => stopOcr(session, new Error(label + ' took too long. Try fewer or clearer screenshots.')), ms);
      signal.addEventListener('abort', cancel, { once: true });
      Promise.resolve(promise).then(value => { clearTimeout(timer); signal.removeEventListener('abort', cancel); resolve(value); }, error => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(error); });
    });
  }
  async function ocr(file, session, pageMode) {
    if (!session.init) session.init = (async () => {
      if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
      if (session.controller.signal.aborted) throw session.reason;
      const worker = await createOcrWorker(session);
      if (session.controller.signal.aborted) { disposeOcrWorker(session, worker); throw session.reason; }
      session.worker = worker;
      return worker;
    })();
    const worker = await ocrDeadline(session, session.init, 90000, 'Starting the screenshot reader');
    if (typeof worker.setParameters === 'function') await ocrDeadline(session, worker.setParameters({ tessedit_pageseg_mode: String(pageMode == null ? 3 : pageMode) }), 10000, 'Preparing the screenshot reader');
    const result = await ocrDeadline(session, worker.recognize(file), 60000, 'Reading a screenshot');
    return result.data.text;
  }
  function clearImportShots() { (importShots || []).forEach(s => { if (s.url) URL.revokeObjectURL(s.url); }); importShots = null; }
  // Local-only, bounded crop readings. Keep the original image and its OCR unchanged.
  function enhanceStopImage(file, session, region) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      const abort = () => { done(); reject(session.reason); };
      const done = () => { img.onload = img.onerror = null; session.controller.signal.removeEventListener('abort', abort); URL.revokeObjectURL(url); };
      session.controller.signal.addEventListener('abort', abort, { once: true });
      img.onerror = () => { done(); reject(new Error('image could not be decoded')); };
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h || w * h > 20000000) throw new Error('image is too large to process safely');
          const tall = h > w * 1.2;
          const top = region === 'overview' ? (tall ? Math.floor(h * 0.035) : 0) : (tall ? Math.floor(h * 0.30) : 0);
          const ch = region === 'overview' ? (tall ? Math.floor(h * 0.16) : h) : (tall ? h - top : h);
          const scale = Math.min(2, Math.sqrt(4000000 / (w * ch)));
          const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.floor(w * scale)); canvas.height = Math.max(1, Math.floor(ch * scale));
          const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error('image processing unavailable');
          ctx.drawImage(img, 0, top, w, ch, 0, 0, canvas.width, canvas.height);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), a = pixels.data;
          for (let i = 0; i < a.length; i += 4) {
            const redMark = region === 'overview' && a[i] > 210 && a[i + 1] < 55 && a[i + 2] < 55;
            const grey = redMark ? 0 : 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
            const v = 255 - Math.max(0, Math.min(255, (grey - 128) * 1.5 + 128));
            a[i] = a[i + 1] = a[i + 2] = v;
          }
          ctx.putImageData(pixels, 0, 0); done();
          canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('image processing failed')); }, 'image/png');
        } catch (e) { done(); reject(e); }
      };
      img.src = url;
    });
  }
  function openImportPanel() { const panel = $('#importCard'); panel.hidden = false; panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  async function importFiles(files) {
    const run = ++importSeq, st = $('#impStatus'); const texts = [], shots = []; let oldest = Infinity;
    stopOcr(activeOcr);
    const session = { controller: new AbortController(), disposed: new Set(), worker: null, init: null, reason: null };
    activeOcr = session;
    clearImportShots();
    lastImport = null; $('#impPreview').innerHTML = ''; $('#impText').hidden = true; openImportPanel();
    try {
      for (let i = 0; i < files.length; i++) {
        st.textContent = `Reading screenshot ${i + 1} of ${files.length}… (first time downloads the reader, ~7 MB)`;
        const text = await ocr(files[i], session); if (run !== importSeq) return;
        const shot = { text, enhanced: '', overview: '', enhancementFailed: false, url: null, manualDetail: null };
        const sheet = C.stopSheetFields(text);
        if (sheet.looks || sheet.order) {
          st.textContent = `Checking stop/target details in screenshot ${i + 1} of ${files.length}…`;
          let image = null;
          try { image = await ocrDeadline(session, enhanceStopImage(files[i], session), 20000, 'Preparing a screenshot'); }
          catch (e) { if (session.controller.signal.aborted) throw e; shot.enhancementFailed = true; }
          if (run !== importSeq) return;
          if (image) { shot.enhanced = await ocr(image, session, 6); if (run !== importSeq) return; }
        }
        const originalParsed = C.parsePropScreen(text);
        if (originalParsed.account.equity == null && /\b(?:Advanced|Intermediate|Starter|Lite)[ \t]+(?:Eval|Funded)\b|\bTotal[ \t]+equity\b|\bAccount[ \t]+equity\b/i.test(text)) {
          let image = null;
          try { image = await ocrDeadline(session, enhanceStopImage(files[i], session, 'overview'), 20000, 'Preparing an account-overview crop'); }
          catch (e) { if (session.controller.signal.aborted) throw e; }
          if (run !== importSeq) return;
          if (image) { shot.overview = await ocr(image, session, 6); if (run !== importSeq) return; }
        }
        texts.push(text); shots.push(shot); if (files[i].lastModified > 0) oldest = Math.min(oldest, files[i].lastModified);
      }
    } catch (e) { if (run === importSeq) st.innerHTML = `<span class=dn>Couldn't read the screenshot: ${esc(e.message)}</span>`; return; }
    finally { stopOcr(session); }
    if (run !== importSeq) return;
    try {
      importShots = shots;
      shots.forEach((shot, i) => { shot.url = URL.createObjectURL(files[i]); });
      showImport(texts.join('\n\u001e\n'), Number.isFinite(oldest) ? oldest : null);
    } catch (_) { clearImportShots(); lastImport = null; $('#impPreview').innerHTML = ''; st.textContent = 'Could not prepare screenshot review. Try again or enter the details manually.'; }
  }
  $('#impFiles').onchange = e => { if (e.target.files.length) importFiles([...e.target.files]); e.target.value = ''; };
  $('#impPasteBtn').onclick = () => { importSeq++; stopOcr(activeOcr); clearImportShots(); lastImport = null; $('#impPreview').innerHTML = ''; $('#impStatus').textContent = ''; const t = $('#impText'); openImportPanel(); t.hidden = false; t.focus(); };
  $('#impClose').onclick = () => { importSeq++; stopOcr(activeOcr); clearImportShots(); lastImport = null; $('#impPreview').innerHTML = ''; $('#impStatus').textContent = ''; $('#impText').value = ''; $('#impText').hidden = true; $('#importCard').hidden = true; };
  $('#impText').addEventListener('input', e => { importSeq++; stopOcr(activeOcr); clearImportShots(); lastImport = null; $('#impPreview').innerHTML = ''; if (e.target.value.trim().length > 20) showImport(e.target.value, null); else $('#impStatus').textContent = ''; });
  document.addEventListener('paste', e => {
    if (tab !== 'desk') return;
    const f = [...(e.clipboardData && e.clipboardData.files || [])].filter(x => /^image\//.test(x.type));
    if (f.length) { e.preventDefault(); importFiles(f); }
  });
  // Automatic OCR-text sharing is paused: generic redaction cannot guarantee removal of names and identifiers.
  const SAMPLE_KEY = 'kpd_samples'; // retained only so Erase all removes legacy local data
  // An identified screenshot is guessed only from an exact account match, never from another account's previous choice.
  function impAcctGuess(A) {
    const elig = S.accounts.filter(a => a.phase === 'eval' || a.phase === 'funded');
    return A.label ? elig.find(x => x.label === A.label) || null : acctById(T().lastImpAcct) || (elig.length === 1 ? elig[0] : null);
  }
  const importStateSignature = () => JSON.stringify({ accounts: S.accounts, positions: S.positions, planned: S.planned });
  function hasAccountNumbers(account, text) {
    if (['equity', 'balance', 'upnl', 'target', 'dailyLimit', 'drawdownLimit'].some(k => Number.isFinite(account[k]))) return true;
    // These two legacy fields use a looser parser: don't let a malformed prefix certify an image.
    return [['usedMargin', 'Used'], ['availMargin', 'Available']].some(([key, label]) => Number.isFinite(account[key]) &&
      new RegExp('^[ \\t]*' + label + '[ \\t]+margin[ \\t]+(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d+(?:[ \\t]+(?:USD|USDT|USDC))?[ \\t]*$', 'im').test(text || ''));
  }
  function manualAccountShotCandidates(shots) {
    return (shots || []).map((shot, index) => ({ shot, index, parsed: C.parsePropScreen(shot.text), sheet: C.stopSheetFields(shot.text) }))
      .filter(x => !x.sheet.order && !x.parsed.historyEvidence && !x.parsed.ledgerEvidence && (x.parsed.account.plan || hasAccountNumbers(x.parsed.account, x.shot.text) || /\b(?:Balance|Equity)\b/i.test(x.shot.text)));
  }
  function addStopImageReviews(r, shots) {
    r.ocrReviews = []; r.ocrIssues = [];
    if (!shots || !shots.length) return;
    // Rebuild detail evidence per image so a permissive legacy parse cannot survive beside a stricter retry.
    r.details = []; r.orders = [];
    (shots || []).forEach((shot, index) => {
      const fields = C.stopSheetFields(shot.text), original = C.parsePropScreen(shot.text), directEquity = C.directOverviewEquity(shot.overview);
      const equityNote = directEquity ? ` · direct screenshot equity: ${directEquity.raw} USD (review only; not used to sync)` : '';
      if ((original.numericIssues || []).length) {
        r.ocrIssues.push(`Screenshot ${index + 1}: ${[...new Set(original.numericIssues)].join(' ')} Retake it, or select the other screenshots again without it.`);
      }
      if (fields.order || original.orders.length) {
        const orderRead = C.recoverOrderSheet(shot.text, shot.enhanced);
        if (orderRead.status === 'recovered') r.orders.push(orderRead.order);
        const orderStatusNote = orderRead.status !== 'recovered' ? ' Some order details could not be verified across the original and focused reading.'
          : !orderRead.order.status ? ' Fill status is not visible, so this will not be counted as an open position.' : '';
        r.ocrIssues.push(`Screenshot ${index + 1}: this is an order screenshot, not an open-position list. Order-sheet sync is temporarily paused; use a current positions screenshot instead.${orderStatusNote}`);
        r.ocrReviews.push({ index, summary: (orderRead.status === 'recovered' ? 'Order details reviewed; sync paused' : 'Order screenshot; details unclear; sync paused') + equityNote, url: shot.url, kind: 'general', directEquity });
        return;
      }
      if (shot.manualDetail && fields.looks) {
        const m = shot.manualDetail;
        const matches = r.positionCoverage === 'complete' ? r.positions.filter(q => q.side === m.side && q.sym === m.sym && q.qty === m.qty && C.samePx(q.entry, m.entry)) : [];
        const q = matches.length === 1 ? matches[0] : null;
        const validLevels = q && Number.isFinite(m.sl) && m.sl > 0 && Number.isFinite(m.tp) && m.tp > 0 &&
          (q.side === 'long' ? m.sl < q.entry && m.tp > q.entry : m.sl > q.entry && m.tp < q.entry) && C.manualStopMatches(shot.text, shot.enhanced, m);
        if (!validLevels) {
          r.ocrIssues.push(`Screenshot ${index + 1}: manually entered stop/target values conflict with readable screenshot evidence or no longer match exactly one position in the complete list. Review the position list and detail screenshot again.`);
          r.ocrReviews.push({ index, summary: 'Manual stop/target entry does not match the current list', url: shot.url, kind: 'general', directEquity });
          return;
        }
        const d = { side: q.side, sym: q.sym, base: C.base(q.sym), qty: q.qty, entry: q.entry, sl: m.sl, tp: m.tp, manual: true };
        r.details.push(d);
        if (original.unreadableDetails) r.unreadableDetails = Math.max(0, r.unreadableDetails - 1);
        r.ocrReviews.push({ index, detail: d, shown: { sl: String(d.sl), tp: String(d.tp), entry: String(d.entry) }, url: shot.url, manual: true, directEquity });
        return;
      }
      if (!fields.looks) {
        r.details.push(...original.details);
        // An account heading alone identifies no content and cannot certify the rest of an image was read.
        const manualAccountOnly = !!shot.manualAccount && !fields.order && !original.historyEvidence && !original.positions.length && !original.flat && !original.details.length && !original.fills.length && !original.closedRows.length && !original.ledger.length && !original.orders.length;
        const recognized = original.positions.length || original.flat || original.details.length || original.fills.length || original.closedRows.length || original.ledger.length || original.orders.length || hasAccountNumbers(original.account, shot.text) || Object.keys(original.leverage || {}).length || manualAccountOnly;
        if (!recognized) r.ocrIssues.push(`Screenshot ${index + 1} could not be read. Retake it or select the other screenshots again without it.`);
        const summary = original.positionCoverage === 'complete' ? (original.flat ? 'Empty positions list read' : `${original.positions.length} open position(s) read`)
          : original.details.length ? 'Position details read' : original.orders.length ? 'Order details read' : original.fills.length || original.closedRows.length || original.ledger.length ? 'Trade or ledger details read'
          : recognized ? 'Account information read; no position details read' : 'No reliable information read';
        r.ocrReviews.push({ index, summary: summary + equityNote, url: shot.url, kind: 'general', directEquity });
        return;
      }
      const result = C.recoverStopSheet(shot.text, shot.enhanced), before = original.details;
      if (result.status === 'order') {
        r.ocrIssues.push(`Screenshot ${index + 1}: this is an order screenshot, not an open-position list. Order-sheet sync is temporarily paused; use a current positions screenshot instead.`);
        r.ocrReviews.push({ index, summary: 'Order screenshot; sync paused' + equityNote, url: shot.url, kind: 'general', directEquity });
        return;
      }
      if (result.status === 'recovered' && before.length <= 1) {
        const d = result.detail, old = before[0];
        if (old && (old.side !== d.side || old.sym !== d.sym || old.qty !== d.qty || ['sl', 'tp', 'entry'].some(k => old[k] != null && (fields[k].value !== old[k] || d[k] !== old[k])))) {
          r.ocrIssues.push(`Screenshot ${index + 1}: the stop/target readings disagree. Retake it or enter the values manually.`);
        } else {
          r.details.push(Object.assign({}, old || {}, d, { price: old ? old.price : null, openedMs: old ? old.openedMs : null, openFee: old ? old.openFee : null, orderId: old ? old.orderId : null }));
          if (original.unreadableDetails) r.unreadableDetails = Math.max(0, r.unreadableDetails - 1);
          r.ocrReviews.push({ index, detail: d, shown: result.shown, url: shot.url, enhanced: !!shot.enhanced, directEquity });
        }
      } else {
        const manualRequest = result.status === 'unreadable' && r.positionCoverage === 'complete' && r.positions.length > 0;
        if (!manualRequest) r.ocrIssues.push(`Screenshot ${index + 1}: its stop/target cannot be identified reliably. Retake it or enter details manually after a complete positions list is readable.`);
        r.ocrReviews.push({ index, summary: 'Stop/target details cannot be identified reliably', url: shot.url, kind: 'general', directEquity, manualRequest });
      }
    });
    const manualAccounts = (shots || []).map((shot, index) => ({ shot, index })).filter(x => x.shot.manualAccount);
    if (manualAccounts.length > 1) r.ocrIssues.push('Manually entered account values came from more than one screenshot. Keep one current screenshot per account snapshot.');
    else if (manualAccounts.length === 1) {
      const { shot, index } = manualAccounts[0], m = shot.manualAccount;
      const same = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(0.005, Math.abs(a) * 1e-9);
      const conflicts = r.orderEvidence || r.historyEvidence || r.ledgerEvidence || r.accountConflict || (r.numericIssues || []).length || !C.manualAccountMatches(shot.text, shot.overview, m) ||
        m.balance != null && r.balance != null && !same(m.balance, r.balance) ||
        m.equity != null && r.account.equity != null && !same(m.equity, r.account.equity);
      if (conflicts) r.ocrIssues.push(`Screenshot ${index + 1}: manual account values conflict with readable account evidence or cannot be checked safely. Review the original; order/history/Ledger and ambiguous OCR cannot be overridden.`);
      else {
        if (m.balance != null && r.balance == null && r.account.balance == null) { r.balance = m.balance; r.account.balance = m.balance; r.account.balanceFrom = 'manual-screenshot'; r.account.balanceManualRaw = m.balanceRaw; }
        if (m.equity != null && r.account.equity == null) { r.account.equity = m.equity; r.account.equitySource = 'manual-screenshot'; r.account.equityManualRaw = m.equityRaw; }
        const review = r.ocrReviews.find(v => v.index === index);
        if (review) { review.manualAccount = true; review.summary = `${review.summary ? review.summary + ' · ' : ''}missing account values entered manually from this screenshot (not OCR)`; }
      }
    }
    if (!r.unreadableDetails) r.warnings = r.warnings.filter(w => !w.startsWith('Some stop/target screenshots could not be linked'));
  }
  function manualPrice(raw) {
    const m = /^\s*\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*(?:USD)?\s*$/i.exec(String(raw || ''));
    const v = m ? Number(m[1].replace(/,/g, '')) : null;
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  function askMissingStopDetails(index) {
    const imp = lastImport, shot = importShots && importShots[index];
    if (!imp || !shot || !imp.r.ocrReviews.some(v => v.index === index && v.manualRequest)) return;
    const sequence = importSeq, shots = importShots;
    if (imp.r.positionCoverage !== 'complete' || !imp.r.positions.length) { alert('A complete current positions list is required before these details can be matched.'); return; }
    const opts = imp.r.positions.map((q, i) => `<option value="${i}">${esc(q.side)} ${q.qty} ${esc(C.base(q.sym))} @ ${px(q.entry)}</option>`).join('');
    showModal(`<h3>Enter the missing stop and target</h3><p class=small>Choose the exact matching position from the complete list, then copy both labeled prices from this screenshot. These values are manual—not OCR—and are not inferred. Order and History screenshots cannot be imported here.</p>
      <div class=form><label>Position from the readable list<select id=missingDetailPosition>${opts}</select></label>
      <label>Stop loss price (USD)<input id=missingDetailStop type=text inputmode=decimal autocomplete=off placeholder="e.g. 45,600.00 USD"></label>
      <label>Take-profit price (USD)<input id=missingDetailTarget type=text inputmode=decimal autocomplete=off placeholder="e.g. 55,000.00 USD"></label></div>
      <label class=chk><input id=missingDetailSource type=checkbox> I copied both labeled values from this position-detail screenshot.</label>
      <div class=row><button class="btn pri" id=missingDetailSave>Use these manual values</button><button class=btn data-close>Cancel</button></div>`);
    $('#missingDetailSave').onclick = () => {
      if (lastImport !== imp || importSeq !== sequence || importShots !== shots || importStateSignature() !== imp.signature) { closeModal(); alert('The import or Desk changed. Reopen the current screenshot review; nothing was saved.'); return; }
      const q = imp.r.positions[Number($('#missingDetailPosition').value)], sl = manualPrice($('#missingDetailStop').value), tp = manualPrice($('#missingDetailTarget').value);
      if (!q || !sl || !tp || !$('#missingDetailSource').checked) { alert('Choose a position, enter both positive USD prices, and confirm they came from this screenshot.'); return; }
      if (q.side === 'long' ? !(sl < q.entry && tp > q.entry) : !(sl > q.entry && tp < q.entry)) { alert('Those prices do not fit the position side and entry. Check the screenshot; nothing was changed.'); return; }
      shot.manualDetail = { side: q.side, sym: q.sym, qty: q.qty, entry: q.entry, sl, tp };
      const { text, shotTime, choice } = imp; closeModal(); showImport(text, shotTime, choice);
    };
  }
  function askMissingAccountValues() {
    const imp = lastImport, shots = importShots || [];
    if (!imp || imp.r.orderEvidence || imp.r.historyEvidence || imp.r.ledgerEvidence || imp.r.accountConflict || (imp.r.numericIssues || []).length) return;
    const sequence = importSeq;
    const missing = [];
    if (imp.r.balance == null && imp.r.account.balance == null) missing.push(['balance', 'Balance']);
    if (imp.r.account.equity == null) missing.push(['equity', 'Equity']);
    if (!missing.length) return;
    const candidates = manualAccountShotCandidates(shots);
    if (!candidates.length) { alert('No non-order account screenshot is available for manual values. Select the account overview again.'); return; }
    const opts = candidates.map(x => `<option value="${x.index}">Screenshot ${x.index + 1}</option>`).join('');
    const fields = missing.map(([key, label]) => `<label>${label} (USD)<input id="manualAccount${key}" type=text inputmode=decimal autocomplete=off placeholder="e.g. 5,043.21 USD"></label>`).join('');
    showModal(`<h3>Enter missing account values</h3><p class=small>Choose one non-order account screenshot and copy the missing values directly from it. USD only; do not use the Balance + UP&amp;L estimate. These values are manual, not OCR, and cannot replace ambiguous or conflicting readings.</p>
      <div class=form><label>Source screenshot<select id=manualAccountImage>${opts}</select>${fields}</div>
      <label class=chk><input id=manualAccountSource type=checkbox> I copied every value above from this same account screenshot.</label>
      <div class=row><button class="btn pri" id=manualAccountSave>Use these manual values</button><button class=btn data-close>Cancel</button></div>`);
    $('#manualAccountSave').onclick = () => {
      if (lastImport !== imp || importSeq !== sequence || importShots !== shots || importStateSignature() !== imp.signature) { closeModal(); alert('The import or Desk changed. Reopen the current screenshot review; nothing was saved.'); return; }
      const index = Number($('#manualAccountImage').value), shot = shots[index], values = Object.fromEntries(missing.map(([key]) => { const raw = $('#manualAccount' + key).value.trim(); return [key, manualPrice(raw) == null ? null : { value: manualPrice(raw), raw }]; }));
      if (!shot || !$('#manualAccountSource').checked || missing.some(([key]) => !values[key])) { alert('Choose the source screenshot, enter every missing positive USD value, and confirm they came from that one image.'); return; }
      shot.manualAccount = shot.manualAccount || {};
      for (const [key] of missing) { shot.manualAccount[key] = values[key].value; shot.manualAccount[key + 'Raw'] = values[key].raw; }
      const { text, shotTime, choice } = imp; closeModal(); showImport(text, shotTime, choice);
    };
  }
  function importSizeMismatch(acct, account) {
    if (!acct || !(acct.size > 0)) return false;
    const rules = C.planOf(acct), evidence = account.limitEvidence || {}, drawdown = evidence.drawdown || [], target = evidence.target || [];
    // A single limit may be a legitimate custom absolute rule, so never infer a size from it alone.
    // With both kinds present, any unique supported-size conflict requires manual verification,
    // even if the other value is custom or anomalous and both match saved absolute overrides.
    const customRulesKnown = acct.plan !== 'custom' || (Number.isFinite(acct.target) && acct.target >= 0.005 && acct.target <= 0.5 && Number.isFinite(acct.mdd) && acct.mdd >= 0.005 && acct.mdd <= 0.2);
    if (acct.phase === 'eval' && C.PLANS[acct.plan] && customRulesKnown && drawdown.length && target.length) {
      const infer = (v, factor) => {
        const matches = C.SIZES.filter(size => Number.isFinite(v) && Math.abs(v - size * factor) < 0.5);
        return matches.length === 1 ? matches[0] : null;
      };
      const inferred = drawdown.map(v => infer(v, 1 - rules.mdd)).concat(target.map(v => infer(v, 1 + rules.target)));
      if (inferred.some(size => size != null && size !== +acct.size)) return true;
    }
    const floor = acct.ddLimit > 0 ? acct.ddLimit : Number.isFinite(rules.mdd) ? acct.size * (1 - rules.mdd) : null;
    const goal = acct.targetEq > 0 ? acct.targetEq : Number.isFinite(rules.target) ? acct.size * (1 + rules.target) : null;
    return drawdown.some(v => !Number.isFinite(v) || !Number.isFinite(floor) || Math.abs(v - floor) >= 0.5) ||
      (acct.phase === 'eval' && target.some(v => !Number.isFinite(v) || !Number.isFinite(goal) || Math.abs(v - goal) >= 0.5));
  }
  function importReviewIssues(acct, r, isNew) {
    const issues = [], open = acct ? S.positions.filter(p => p.acct === acct.id && !p.closed) : [];
    // A positive estimate never supplies money or approves sync. Contradictory
    // readings from one screenshot must still block preview AND apply.
    for (const [index, shot] of (importShots || []).entries()) {
      const estimate = C.overviewEquityEstimate(shot.text), direct = estimate && estimate.directEquity;
      if (direct && (direct.status === 'conflict' || direct.hasConflict)) issues.push(`Screenshot ${index + 1}: displayed Balance + UP&L conflicts with direct Equity. Retake it; estimated values cannot resolve this conflict.`);
      if (!C.overviewCropMatches(shot.text, shot.overview)) issues.push(`Screenshot ${index + 1}: the focused equity reading conflicts with or cannot be checked against this screenshot's account values. Retake it before syncing.`);
    }
    const completeList = r.positionCoverage === 'complete';
    if (r.positionEvidenceConflict || r.positionCoverage === 'incomplete') issues.push('The screenshot position list is incomplete or conflicts with other position evidence. Do not sync until a current full list is readable.');
    const size = isNew && r.account.plan ? C.sizeFromLimits(r.account.plan, r.account.drawdownLimit, r.account.target) : null;
    const sizeAccount = isNew && size ? { plan: r.account.plan, phase: r.account.phase || 'eval', size } : acct;
    if (importSizeMismatch(sizeAccount, r.account)) issues.push('The screenshot account size or limits do not match the selected account, or their match cannot be verified. Verify the account size and custom limits manually on the platform before syncing.');
    issues.push(...(r.numericIssues || []));
    if (r.orderEvidence || (r.orders || []).length) issues.push('Order-sheet sync is temporarily paused for safety. Import the current positions list without order sheets instead.');
    if (r.historyEvidence || r.fills.length || (r.closedRows || []).length) issues.push('Trades history and closed-position result sync are temporarily paused for safety. Use a current positions list without history rows.');
    if (r.ledgerEvidence || (r.ledger || []).length || r.account.balanceFrom === 'ledger') issues.push('Ledger sync is temporarily paused until source timestamps and event identities can be verified. Use current account and position screenshots without Ledger.');
    if (r.unreadableDetails) issues.push('A stop/target screenshot could not be identified. Retake it or enter its values manually before syncing.');
    issues.push(...(r.ocrIssues || []));
    if (r.balance == null && (r.fills.length || r.details.length || (r.closedRows || []).length)) issues.push('A current balance is needed before updating position details or trade history. Include a clear full positions screenshot with equity or a direct balance.');
    let projected = open.map(p => ({ p, side: p.side, sym: p.sym, qty: C.openQty(p), entry: p.entry, stop: p.stop }));
    if (completeList) {
      const plan = C.planSync(open, r.positions, r.closedRows);
      if (r.balance == null && (plan.add.length || plan.partial.length || plan.close.length)) issues.push('A current balance is needed before adding, resizing, or closing app positions. Include a clear full positions screenshot with equity or a direct balance.');
      if (plan.add.some(q => plan.close.some(x => x.pos.sym === q.sym && x.pos.side === q.side && C.samePx(x.pos.entry, q.entry)))) issues.push('A position size increased; update it manually before importing this list.');
      if (r.positions.some(q => open.filter(p => p.sym === q.sym && p.side === q.side && C.samePx(p.entry, q.entry)).length > 1)) issues.push('Multiple saved positions match one screenshot row; resolve the duplicates before syncing.');
      if (open.some(p => r.positions.filter(q => p.sym === q.sym && p.side === q.side && C.samePx(p.entry, q.entry) && C.openQty(p) + 1e-9 >= q.qty).length > 1)) issues.push('Multiple screenshot rows match the same saved position. Resolve the ambiguity before syncing.');
      if (acct && C.ambiguousPlannedMatches(S.planned.filter(x => x.acct === acct.id), plan.add)) issues.push('Screenshot positions have ambiguous planned-trade matches. Resolve the plans manually before syncing.');
      const detailedStop = q => r.details.some(d => d.sl > 0 && d.side === q.side && d.sym === q.sym && Math.abs(d.qty - q.qty) < 1e-9 && (d.entry == null || C.samePx(d.entry, q.entry)) && r.positions.filter(p => p.side === d.side && p.sym === d.sym && Math.abs(p.qty - d.qty) < 1e-9 && (d.entry == null || C.samePx(d.entry, p.entry))).length === 1);
      const detailedTarget = q => r.details.some(d => d.tp > 0 && d.side === q.side && d.sym === q.sym && Math.abs(d.qty - q.qty) < 1e-9 && (d.entry == null || C.samePx(d.entry, q.entry)) && r.positions.filter(p => p.side === d.side && p.sym === d.sym && Math.abs(p.qty - d.qty) < 1e-9 && (d.entry == null || C.samePx(d.entry, p.entry))).length === 1);
      if (r.positions.some(q => q.slEvidence === false && detailedStop(q))) issues.push('The position list and detail screen disagree about whether a stop exists. Verify the current position before syncing.');
      if (r.positions.some(q => q.tpEvidence === false && detailedTarget(q))) issues.push('The position list and detail screen disagree about whether a take-profit exists. Verify the current position before syncing.');
      if (plan.keep.concat(plan.partial).some(k => !k.snap.hasSL && !detailedStop(k.snap) && (k.pos.stop != null || k.pos.platformSL === true))) issues.push('A saved stop could not be confirmed in the current screenshot. Check it on the platform before syncing.');
      if (acct && plan.add.some(q => { const pl = C.matchPlanned(S.planned.filter(x => x.acct === acct.id), q); return pl && pl.stop != null && !q.hasSL && !detailedStop(q); })) issues.push('A planned stop could not be confirmed in the screenshot. Check it on the platform before syncing.');
      projected = plan.keep.concat(plan.partial).map(k => ({ p: k.pos, side: k.snap.side, sym: k.snap.sym, qty: k.snap.qty, entry: k.snap.entry, stop: k.pos.stop }))
        .concat(plan.add.map(q => { const pl = acct && C.matchPlanned(S.planned.filter(x => x.acct === acct.id), q); return { p: null, side: q.side, sym: q.sym, qty: q.qty, entry: q.entry, stop: pl ? pl.stop : null }; }));
    }
    const detailValues = new Map();
    if (acct || isNew) for (const d of r.details) {
      const candidates = projected.filter(p => p.side === d.side && p.sym === d.sym && Math.abs(p.qty - d.qty) < 1e-9 && (d.entry == null || C.samePx(p.entry, d.entry)));
      if (candidates.length !== 1) { issues.push('A position detail sheet does not uniquely match the selected account. Check its coin, side, size and entry.'); continue; }
      const p = candidates[0];
      if (d.sl != null && (!(d.sl > 0) || !Number.isFinite(d.sl)) || d.tp != null && (!(d.tp > 0) || !Number.isFinite(d.tp))) issues.push('A stop or target price could not be read as a valid positive number.');
      const seen = detailValues.get(p) || { stops: new Set(), targets: new Set(), openTimes: new Set() };
      if (d.sl != null) seen.stops.add(d.sl); if (d.tp != null) seen.targets.add(d.tp); if (d.openedMs != null) seen.openTimes.add(d.openedMs);
      detailValues.set(p, seen);
      if (seen.stops.size > 1 || seen.targets.size > 1) issues.push('Position detail screenshots show conflicting stop or target prices. Use one current value.');
      if (seen.openTimes.size > 1) issues.push('Position detail screenshots show conflicting Open times for the same position. Verify its timestamp before syncing.');
      if (d.sl != null && p.stop != null && (p.side === 'short' ? d.sl > p.stop : d.sl < p.stop)) issues.push('A screenshot shows a stop farther away than the saved stop. Check the platform stop before syncing.');
    }
    return [...new Set(issues)];
  }
  function showImport(text, shotTime, selected) {
    const r = C.parsePropScreen(text, Date.now());
    addStopImageReviews(r, importShots);
    const A = r.account, st = $('#impStatus');
    if (!r.positions.length && !r.flat && !r.details.length && !r.fills.length && !hasAccountNumbers(A, text) && !(r.ledger || []).length && !(r.closedRows || []).length && !Object.keys(r.leverage || {}).length && !(r.orders || []).length && !r.ocrReviews.length) { lastImport = null; clearImportShots(); st.innerHTML = r.unreadableDetails ? '<span class=dn>Could not link the stop/target screenshot to a position. Its prices were not imported; check them manually.</span>' : '<span class=dn>Nothing recognisable. Use your prop platform\'s account screen and its positions list.</span>'; $('#impPreview').innerHTML = ''; return; }
    st.textContent = '';
    const incomplete = r.positionCoverage === 'incomplete' || r.positionCoverage === 'unknown';
    const size = A.plan ? C.sizeFromLimits(A.plan, A.drawdownLimit, A.target) : null;
    const eligible = S.accounts.filter(a => a.phase === 'eval' || a.phase === 'funded'), g0 = impAcctGuess(A), canCreate = !!(A.plan && size);
    let choice = selected !== undefined ? selected : g0 ? g0.id : canCreate && A.label ? 'new' : '';
    if (choice !== 'new' && !eligible.some(a => a.id === choice) || choice === 'new' && !canCreate) choice = '';
    const selectedAcct = eligible.find(a => a.id === choice) || null;
    const accountId = text => /\b(?:Advanced|Intermediate|Starter|Lite)[ \t]*(?:Eval|Funded)\w*[ \t]*#?[ \t]*(\d+)(?![\d,.])/i.exec(text || '');
    const pickedId = selectedAcct && accountId(selectedAcct.label), screenshotId = accountId(A.label);
    const accountMismatch = !!(selectedAcct && (A.plan && selectedAcct.plan && A.plan !== selectedAcct.plan || A.phase && selectedAcct.phase && A.phase !== selectedAcct.phase || pickedId && screenshotId && pickedId[1] !== screenshotId[1]));
    const reviewIssues = importReviewIssues(selectedAcct, r, choice === 'new');
    const blocked = incomplete || r.accountConflict || accountMismatch || !choice || reviewIssues.length > 0;
    const opts = `<option value="" ${!choice ? 'selected' : ''}>Choose an account</option>` + eligible.map(a => `<option value="${esc(a.id)}" ${a.id === choice ? 'selected' : ''}>${esc(a.label || C.planOf(a).name + ' ' + usd(a.size))}</option>`).join('');
    const newOpt = canCreate ? `<option value="new" ${choice === 'new' ? 'selected' : ''}>+ New: ${esc(A.label || A.plan)} (${usd(size)})</option>` : '';
    lastImport = { r, shotTime, text, choice, blocked, signature: importStateSignature() };
    // This is display-only: never add it to the parsed import or use it to authorize a sync.
    let equityEstimate = null;
    if (importShots && importShots.length === 1 && typeof C.overviewEquityEstimate === 'function') {
      try { equityEstimate = C.overviewEquityEstimate(importShots[0].text); } catch (_) { /* advisory unavailable */ }
    }
    const manualAccountMissing = [];
    if (r.balance == null && A.balance == null) manualAccountMissing.push('balance');
    if (A.equity == null) manualAccountMissing.push('equity');
    const showManualAccountAction = manualAccountMissing.length > 0 && !(r.numericIssues || []).length && !r.accountConflict && !r.orderEvidence && !r.historyEvidence && !r.ledgerEvidence && manualAccountShotCandidates(importShots).length > 0;
    const equityConflict = equityEstimate && (equityEstimate.directEquity === 'conflict' || (equityEstimate.directEquity && (equityEstimate.directEquity.status === 'conflict' || equityEstimate.directEquity.hasConflict)));
    const equityUnknown = equityEstimate && equityEstimate.directEquity && equityEstimate.directEquity.status === 'unknown';
    const ageMin = shotTime != null ? (Date.now() - shotTime) / 60000 : null;
    const retainedStops = selectedAcct ? S.positions.filter(p => p.acct === selectedAcct.id && !p.closed && p.stop != null).map(p => `${esc(p.side)} ${esc(C.base(p.sym))} @ ${px(p.entry)}: ${px(p.stop)}`) : [];
    if (selectedAcct && r.positionCoverage === 'complete') for (const q of C.planSync(S.positions.filter(p => p.acct === selectedAcct.id && !p.closed), r.positions, r.closedRows).add) { const pl = C.matchPlanned(S.planned.filter(x => x.acct === selectedAcct.id), q); if (pl && pl.stop != null) retainedStops.push(`${esc(q.side)} ${esc(C.base(q.sym))} @ ${px(q.entry)}: ${px(pl.stop)} (planned)`); }
    $('#impPreview').innerHTML = `<div class=kv>
        <div><span>Account</span>${esc(A.label || '—')}</div><div><span>Equity</span>${A.equity != null ? A.equitySource === 'manual-screenshot' ? esc(A.equityManualRaw || usd(A.equity)) : usd(A.equity) : '—'}${A.equitySource === 'manual-screenshot' ? ' <span class=mu>(entered manually from screenshot)</span>' : ''}</div>
        <div><span>Daily loss limit</span>${A.dailyLimit != null ? usd(A.dailyLimit) : '—'}</div><div><span>Drawdown limit</span>${A.drawdownLimit != null ? usd(A.drawdownLimit) : '—'}</div>
        <div><span>Target equity</span>${A.target != null ? usd(A.target) : '—'}</div>
        <div><span>Open P&amp;L (sum)</span>${r.upnlSum != null ? usd(r.upnlSum) : '— (not on screen)'}</div>${A.upnl != null ? `<div><span>Open P&amp;L (read directly)</span>${usd(A.upnl)}</div>` : ''}<div><span>Balance${A.balanceFrom === 'manual-screenshot' ? ' (entered manually from screenshot)' : A.balanceFrom === 'ledger' ? ' (Ledger, newest row)' : A.balanceFrom === 'same-list' ? ' (equity − P&amp;L, same screenshot)' : A.balance != null ? ' (read directly)' : ' (equity − open P&amp;L)'}</span>${r.balance != null ? A.balanceFrom === 'manual-screenshot' ? esc(A.balanceManualRaw || usd(r.balance)) : usd(r.balance) : '—'}</div>${A.usedMargin != null ? `<div><span>Used margin</span>${usd(A.usedMargin)}</div>` : ''}${A.availMargin != null ? `<div><span>Available margin</span>${usd(A.availMargin)}</div>` : ''}</div>
      ${equityEstimate ? `<div class="small" data-equity-advisory><b>Estimated equity from displayed Balance + UP&amp;L</b><br>Balance ${esc(equityEstimate.balanceRaw)} USD + UP&amp;L ${esc(equityEstimate.pnlRaw)} USD = ${esc(equityEstimate.estimateRaw)} USD${equityConflict ? '<br><b class=warn>Warning: displayed direct equity conflicts with this estimate. Check the screenshot; neither is verified.</b>' : equityUnknown ? '<br><b class=warn>Warning: a direct equity reading is unclear. Check the screenshot; this estimate is not verified.</b>' : ''}<br><span class=mu>On-device review only. Displayed Balance or UP&amp;L may be rounded, so this estimate is approximate. It is not automatically saved, used for syncing, or used to replace any account value.</span></div>` : ''}
      ${showManualAccountAction ? `<p class=small><button class="btn sm" type=button id=manualAccountOpen>Enter missing Balance/Equity</button><br><span class=mu>Only missing values from one selected non-order account screenshot can be entered. Ambiguous readings cannot be overridden.</span></p>` : ''}
      ${r.positions.length ? `<table><tr><th>Side</th><th class=num>Qty</th><th class=num>Entry</th><th class=num>P&amp;L</th><th>Stop</th></tr>${r.positions.map(p => `<tr><td class="${p.side === 'short' ? 'dn' : 'up'}">${esc(p.side)} ${esc(p.base)}</td><td class=num>${p.qty}</td><td class=num>${px(p.entry)}</td><td class="num ${cls(p.upnl)}">${p.upnl != null ? usd(p.upnl) : '—'}</td><td>${p.hasSL ? 'SL on platform' : p.slEvidence === false ? '<b class=dn>No SL shown</b>' : '<span class=warn>SL not read</span>'}${p.hasTP ? ' · TP' : ''}</td></tr>`).join('')}</table>` : ''}
      ${(() => { const ac = selectedAcct; if (!ac || incomplete || !(r.positions.length || r.flat)) return '';
        const P = C.planSync(S.positions.filter(p => p.acct === ac.id && !p.closed), r.positions, r.closedRows);
        const li = []; P.add.forEach(q => li.push(`<b class=up>+ New</b> ${esc(q.side)} ${q.qty} ${esc(C.base(q.sym))} @ ${px(q.entry)}${C.matchPlanned(S.planned.filter(x => x.acct === ac.id), q) ? ' <b>= your planned setup: becomes live</b>' : ''}`)); P.partial.forEach(k => li.push(`<b class=warn>~ Partly closed</b> ${esc(k.pos.side)} ${k.closedQty} of ${C.openQty(k.pos)} ${esc(C.base(k.pos.sym))} @ ${px(k.pos.entry)}`));
        P.close.forEach(c => li.push(`<b class=dn>− Closed in app</b> ${esc(c.pos.side)} ${C.openQty(c.pos)} ${esc(C.base(c.pos.sym))} @ ${px(c.pos.entry)}${c.row ? ` · result <span class="${cls(c.row.realized)}">${usd(c.row.realized)}</span>` : ' · result not read'}`));
        return `<p class=small><b>Changes:</b> ${li.length ? '' : 'none to positions'}${P.keep.length ? ` · ${P.keep.length} unchanged` : ''}</p>${li.length ? '<div class=small>' + li.join('<br>') + '</div>' : ''}`; })()}
      ${retainedStops.length ? `<p class=small><b>Saved and planned stops to verify on your platform:</b><br>${retainedStops.join('<br>')}</p>` : ''}
      ${(() => { const ac = selectedAcct; if (!ac) return ''; const K = correctionPlan(ac, r); if (!K.length) return '';
        return `<p class=small><b>Corrections to closed trades</b> (your screenshot wins over the log; old values kept):<br>${K.map(c => `<b class=warn>✎ Fixes</b> ${esc(c.pos.side)} ${c.pos.qty} ${esc(C.base(c.pos.sym))} @ ${px(c.pos.entry)} closed ${fmtTime(c.pos.closed.t, true)}: exit ${c.from.price != null ? px(c.from.price) : '—'} → <b>${px(c.price)}</b>, result ${c.from.realized != null ? usd(c.from.realized) : '—'} → <b>${usd(c.realized != null ? c.realized : C.realizedFor(c.pos, c.pos.qty, c.price, c.t))}</b> · from ${esc(c.by)}`).join('<br>')}</p>`; })()}
      ${(r.orders || []).length ? `<p class=small><b>Orders read</b> (not positions):<br>${r.orders.map(o => `${o.type === 'limit' ? 'Limit' : o.type === 'market' ? 'Market' : esc(o.type)} ${o.side === 'long' ? 'buy' : 'sell'} ${o.qty} ${esc(o.base)} @ ${px(o.price)} · <b class="${o.status === 'filled' ? 'up' : o.status === 'cancelled' ? 'mu' : 'warn'}">${o.status === 'working' ? 'working, ' + (o.filledPct || 0) + '% filled' : o.status === 'partial' ? o.filledPct + '% filled' : o.status || 'status not on screen'}</b>${o.tp != null ? ' · TP ' + px(o.tp) : ''}${o.sl != null ? ' · SL ' + px(o.sl) : ' · <b class=dn>no SL read</b>'}${o.openedMs ? ' · placed ' + fmtTime(o.openedMs, true) : ''}`).join('<br>')}</p>` : ''}
      ${r.leverage && Object.keys(r.leverage).length ? `<p class=small><b>Leverage read:</b> ${Object.entries(r.leverage).map(([k, v]) => esc(k) + ' ' + v + 'x').join(', ')} (saved to the account)</p>` : ''}
      ${r.ledger && r.ledger.length ? `<p class=small><b>Ledger read:</b> ${r.ledger.length} row(s)${r.ledgerOk ? ', every running balance adds up' : ''} · swap fees ${usd(r.ledgerSum.swap)} · trades and commissions ${usd(r.ledgerSum.trade)}</p>` : ''}
      ${r.fills.length ? `<p class=small><b>Trades read:</b> ${r.fills.length} fill(s) · ${r.fills.filter(f => f.action === 'open' && f.t != null).length} opening today${r.fills.some(f => f.t == null) ? ' (older dated rows kept for history)' : ''}</p>` : ''}
      ${r.details.length ? `<table><tr><th>Position details read</th><th class=num>Size</th><th class=num>Stop</th><th class=num>Target</th><th>Opened</th></tr>${r.details.map(d => `<tr><td class="${d.side === 'short' ? 'dn' : 'up'}">${esc(d.side)} ${esc(d.base)}${d.entry ? ' @ ' + px(d.entry) : ''}</td><td class=num>${d.qty}</td><td class=num>${d.sl != null ? px(d.sl) : '—'}</td><td class=num>${d.tp != null ? px(d.tp) : '—'}</td><td class=small>${d.openedMs ? fmtTime(d.openedMs, true) : '—'}</td></tr>`).join('')}</table>` : ''}
      ${r.ocrReviews.map(v => `<div class="small" style="margin:10px 0"><b>Screenshot ${v.index + 1}: ${v.detail ? `${esc(v.detail.side)} ${v.detail.qty} ${esc(v.detail.base)}` : esc(v.summary)}</b>${v.detail ? `<br>Stop: <b>${v.shown.sl != null ? esc(v.shown.sl) : 'not read'}</b> · Target: <b>${v.shown.tp != null ? esc(v.shown.tp) : 'not read'}</b>${v.shown.entry != null ? ' · Entry: ' + esc(v.shown.entry) : ''}<br><span class=mu>${v.manual ? 'Entered manually from this screenshot; not OCR.' : v.enhanced ? 'Checked with an enhanced on-device reading.' : 'Read from the original image.'} Compare every digit and the position with your platform.</span>` : '<br><span class=mu>Check the original. If a position, stop, target or other important detail was missed, do not sync; retake or enter it manually.</span>'}${v.manualRequest ? `<br><button class="btn sm" type=button data-manual-shot="${v.index}">Enter missing stop and target</button><br><span class=mu>Manual entry is available only because this batch includes a complete readable positions list. Your input still must match the selected position and pass the existing safety checks.</span>` : ''}${v.url ? `<details><summary>View original screenshot ${v.index + 1}</summary><img src="${esc(v.url)}" alt="Original screenshot ${v.index + 1} for comparison" style="display:block;max-width:100%;height:auto"></details>` : ''}<label class="chk"><input type=checkbox data-imp-shot-confirm="${v.index}"> I compared this screenshot with the platform and the preview, and no important details were missed.</label></div>`).join('')}
      ${!r.positions.length && !r.flat ? '<p class=small>No position list in these screenshots: your open positions stay as they are' + (r.details.length ? '; details are added to the matching ones.' : '.') + '</p>' : ''}
      ${incomplete ? '<p class="small warn"><b>Not ready to sync:</b> the open-position list could not be verified as complete. Include a clear screenshot showing the positions count and every open position. Nothing will be changed until the full list can be reviewed.</p>' : ''}
      ${r.accountConflict ? '<p class="small warn"><b>Not ready to sync:</b> these screenshots appear to name different accounts. Import one account at a time.</p>' : ''}
      ${accountMismatch ? '<p class="small warn"><b>Not ready to sync:</b> the selected account does not match the account named in the screenshot.</p>' : ''}
      ${reviewIssues.map(issue => `<p class="small warn"><b>Not ready to sync:</b> ${esc(issue)}</p>`).join('')}
      ${r.warnings.map(w => `<p class="small warn">${esc(w)}</p>`).join('')}
      ${text.includes('\u001e') && r.balance == null ? '<p class="small mu">Balance is not inferred from different screenshots; an existing balance stays unchanged unless a direct balance is read.</p>' : ''}
      ${ageMin > 10 ? `<p class="small warn">The oldest file timestamp is approximately ${Math.round(ageMin)} min old. Verify that the position list and account figures are still current.</p>` : ''}
      <p class="small mu">File timestamps may not be the capture time. Check that every screenshot shows the current account and positions.</p>
      <label class="chk small"><input type=checkbox id=impConfirm> I checked that the account, balances, open positions, stop and target prices above match the platform right now.</label>
      <div class=row style="margin-top:8px"><select id=impAcct aria-label="Account for screenshot import">${opts}${newOpt}</select><button class="btn pri" id=impGo disabled>Looks right: sync</button></div>
      <p class="small mu">Sync updates this account's app records and marks missing positions as closed in the app. It never opens, closes, or changes a trade on the exchange.</p>`;
    $('#impAcct').onchange = e => showImport(text, shotTime, e.target.value);
    const updateImportReady = () => { const checks = [...$('#impPreview').querySelectorAll('[data-imp-shot-confirm]')]; $('#impGo').disabled = blocked || !$('#impConfirm').checked || checks.length !== r.ocrReviews.length || checks.some(c => !c.checked); };
    $('#impConfirm').onchange = updateImportReady;
    $('#impPreview').querySelectorAll('[data-imp-shot-confirm]').forEach(c => { c.onchange = updateImportReady; });
    $('#impPreview').querySelectorAll('[data-manual-shot]').forEach(b => { b.onclick = () => askMissingStopDetails(Number(b.dataset.manualShot)); });
    const accountManualButton = $('#manualAccountOpen'); if (accountManualButton) accountManualButton.onclick = () => askMissingAccountValues();
    $('#impGo').onclick = () => applyImport();
  }
  const appliedOrderIds = acct => S.positions.filter(p => p.acct === acct.id).flatMap(p => (p.partials || []).map(x => x.orderId).concat(p.closed ? [p.closed.orderId] : [])).filter(Boolean);
  function orderFillPlan(acct, r) { return C.planOrderFills(S.positions.filter(p => p.acct === acct.id && !p.closed), r.orders || [], appliedOrderIds(acct)); }
  function correctionPlan(acct, r) { return C.planCorrections(S.positions.filter(p => p.acct === acct.id && p.closed), r.closedRows || [], r.orders || [], appliedOrderIds(acct), Date.now()); }
  // Owner, Nov 2: verified screenshots win over the log. The old values are kept in closed.was so nothing is lost.
  function fixClosed(p, price, realized, why, extra) {
    p.closed.was = (p.closed.was || []).concat({ t: Date.now(), price: p.closed.price, realized: p.closed.realized, exitAt: p.closed.exitAt || null, note: p.closed.note || '' }).slice(-10);
    Object.assign(p.closed, { price, realized, resultKnown: true, note: (p.closed.note || '').replace(/ · (corrected|edited).*$/, '') + ' · ' + why }, extra || {});
  }
  // Edit a closed trade (owner, Nov 2): where it closed (target / TP2 / stop / other price) or the platform's net $; old values kept.
  function editClosed(p) {
    const part = (p.partials || []).reduce((a, x) => a + (x.realized || 0), 0), q = Math.max(0, p.qty - (p.partials || []).reduce((a, x) => a + x.qty, 0));
    const ch = [p.tp1 != null && { v: 'tp1', label: 'At my take-profit', px: p.tp1 }, p.tp2 != null && { v: 'tp2', label: 'At TP2', px: p.tp2 }, p.stop != null && { v: 'stop', label: 'At my stop', px: p.stop }].filter(Boolean);
    showModal(`<h3>Fix closed trade: ${esc(p.sym)} ${p.side} ${p.qty} @ ${px(p.entry)}</h3>
      <p class=small>Saved now: exit ${p.closed.price != null ? px(p.closed.price) : '—'}, net ${p.closed.resultKnown === false ? 'unknown' : usd(C.realizedOfPos(p))}. Your platform is the truth: fix it here.</p>
      ${ch.length ? `<div><b>Where did it close?</b><div class=row style="margin:4px 0">${ch.map(c => `<label class="btn sm"><input type=radio name=edW value="${c.v}" data-px="${c.px}"> ${esc(c.label)} ${px(c.px)}</label>`).join('')}<label class="btn sm"><input type=radio name=edW value=other> Different price</label></div></div>` : ''}
      <div class=form><label id=edPL ${ch.length ? 'style="display:none"' : ''}>Exit price<input id=edP type=number step=any value="${p.closed.price != null ? p.closed.price : ''}"></label>
      <label>Net $ from your platform (optional, overrides the estimate)<input id=edR type=number step=any placeholder="e.g. 41.53 or -25.75"></label>
      <label>How did it go?<select id=edTag>${Object.keys(C.TRADE_TAGS).map(k => `<option value="${k}" ${k === (p.tag || 'plan') ? 'selected' : ''}>${C.TRADE_TAGS[k]}</option>`).join('')}</select></label></div>
      <p class=small id=edEst></p><div class=row><button class="btn pri" id=edOk>Save fix</button><button class=btn data-close>Cancel</button></div>`);
    const est = () => { const xp = num($('#edP').value), rv = num($('#edR').value); const v = rv != null ? rv : xp && q ? part + C.realizedFor(p, q, xp, p.closed.t) : null;
      $('#edEst').textContent = v != null ? `New net for the trade: ${usd(v)} (${v > 0 ? 'win' : v < 0 ? 'loss' : 'breakeven'})` : ''; return v; };
    document.querySelectorAll('input[name=edW]').forEach(r => r.addEventListener('change', () => { $('#edPL').style.display = ''; $('#edP').value = r.value === 'other' ? (p.closed.price != null ? p.closed.price : '') : r.dataset.px; est(); }));
    document.querySelectorAll('#edP,#edR').forEach(x => x.addEventListener('input', est)); est();
    $('#edOk').onclick = () => {
      const where = (document.querySelector('input[name=edW]:checked') || {}).value || null, xp = num($('#edP').value), rv = num($('#edR').value);
      if (xp == null && rv == null) { alert('Pick where it closed or type the net $ from your platform.'); return; }
      const total = rv != null ? rv : part + C.realizedFor(p, q, xp, p.closed.t);
      p.partials = (p.partials || []).map(x => x.resultKnown === false ? Object.assign({}, x, { realized: 0, resultKnown: true }) : x);
      fixClosed(p, xp != null ? xp : p.closed.price, total - (p.partials || []).reduce((a, x) => a + (x.realized || 0), 0), 'edited by you' + (rv != null ? ' (net from your platform)' : ''), { exitAt: where || p.closed.exitAt || null });
      p.tag = $('#edTag').value; save(); closeModal(); renderPositions(); renderAll(true);
    };
  }
  function applyOrderFills(acct, r, shotTime) {
    const plan = orderFillPlan(acct, r);
    // Ledger: merge the rows read with the ones saved, in the order they happened (numbered), so closes can be linked to their row.
    if ((r.ledger || []).length && r.ledgerOk !== false) acct.ledger = C.ledgerTimeline(r.ledger, acct.ledger).slice(-500);
    const usedSeq = new Set(S.positions.filter(p => p.acct === acct.id).flatMap(p => (p.partials || []).map(x => x.ledgerSeq).concat(p.closed ? [p.closed.ledgerSeq] : [])).filter(x => x != null));
    for (const a of plan.actions) {
      const p = a.pos, t = a.t || shotTime - 1, gross = (p.side === 'long' ? 1 : -1) * (a.price - p.entry) * a.qty, realized = C.realizedFor(p, a.qty, a.price, t);
      const lg = C.linkLedger({ t }, gross, acct.ledger, usedSeq); if (lg) usedSeq.add(lg.seq);
      const rec = { t, qty: a.qty, price: a.price, realized, orderId: a.order.orderId || null, orderType: a.order.type, matchedBy: a.by, priceKnown: a.priceKnown, timeUnknown: !a.t,
        ledgerSeq: lg ? lg.seq : null, ledgerAmt: lg ? lg.amt : null, source: 'screen-order' };
      if (a.order.type === 'take-profit' && a.order.orderId) p.tpOrderId = a.order.orderId; if (a.order.type === 'stop' && a.order.orderId) p.slOrderId = a.order.orderId;
      const note = `${a.order.type === 'stop' ? 'Stop' : 'Take-profit'} filled on platform${rec.orderId ? ' (order ' + rec.orderId + ')' : ''}`;
      if (a.full && !(p.partials || []).length) p.closed = Object.assign({ note }, rec);
      else { p.partials = (p.partials || []).concat(rec); if (C.openQty(p) <= 1e-12) p.closed = { t, price: a.price, realized: 0, note, orderId: rec.orderId, source: 'screen-order' }; }
    }
    // Trades already closed in the app: the platform's Closed list and filled TP/SL orders correct them.
    for (const c of correctionPlan(acct, r)) {
      const p = c.pos, realized = c.realized != null ? c.realized : C.realizedFor(p, p.qty, c.price, c.t);
      fixClosed(p, c.price, realized, `corrected from your ${c.kind === 'closedList' ? "platform's Closed list" : (c.orderType === 'stop' ? 'stop' : 'take-profit') + ' order screenshot (' + c.by + ')'}`,
        c.kind === 'order' ? { orderId: c.orderId, t: c.t, source: 'screen-order', exitAt: c.orderType === 'stop' ? 'stop' : 'tp1' } : { source: 'screen-closed' });
      if (c.kind === 'order' && c.orderId) p[c.orderType === 'stop' ? 'slOrderId' : 'tpOrderId'] = c.orderId;
      plan.corrected = (plan.corrected || 0) + 1;
    }
    return plan;
  }
  function applyImport() {
    if (!lastImport || lastImport.blocked || !$('#impConfirm').checked) { alert('This import is not ready to sync. Check the warnings, selected account and current-data confirmation.'); return; }
    if (lastImport.r.orderEvidence || (lastImport.r.orders || []).length) { alert('Order-sheet sync is paused. Import a current position list without order screenshots.'); return; }
    if (lastImport.r.historyEvidence || lastImport.r.fills.length || (lastImport.r.closedRows || []).length) { alert('Trade-history and closed-position result sync are paused.'); return; }
    if (lastImport.r.ledgerEvidence || (lastImport.r.ledger || []).length || lastImport.r.account.balanceFrom === 'ledger') { alert('Ledger sync is paused until source timestamps can be verified.'); return; }
    if (lastImport.r.positionEvidenceConflict || lastImport.r.positionCoverage === 'incomplete') { alert('This screenshot batch does not prove a complete current position list. Retake it before syncing.'); return; }
    const shotChecks = [...$('#impPreview').querySelectorAll('[data-imp-shot-confirm]')];
    if (shotChecks.length !== (lastImport.r.ocrReviews || []).length || shotChecks.some(c => !c.checked)) { alert('Compare and confirm each screenshot before syncing.'); return; }
    if ($('#impAcct').value !== lastImport.choice || importStateSignature() !== lastImport.signature) {
      const { text, shotTime } = lastImport; showImport(text, shotTime, $('#impAcct').value);
      alert('Your Desk changed since this preview. Review the refreshed import before syncing.'); return;
    }
    const { r, shotTime } = lastImport, A = r.account, now = Date.now();
    let acct;
    const sel = $('#impAcct').value;
    if (importReviewIssues(sel === 'new' ? null : acctById(sel), r, sel === 'new').length) { alert('This import is not ready to sync. Check its warnings before continuing.'); return; }
    if (sel === 'new') {
      const size = C.sizeFromLimits(A.plan, A.drawdownLimit, A.target);
      acct = { id: uid(), plan: A.plan, size, fee: (C.PLANS[A.plan].price || {})[size] || 0, addon90: false, phase: A.phase || 'eval', profile: 'steady', created: now, label: A.label || '' };
      S.accounts.push(acct);
    } else acct = acctById(sel);
    if (!acct) { alert('Pick an account.'); return; }
    T().lastImpAcct = acct.id;
    // Snapshot sync: the platform's numbers are the truth as of NOW (balance = equity - open P&L doesn't move with price).
    const t = now;
    const before = C.accountState(acct, S.positions, prices(), now, { orders: S.planned });
    if (r.balance != null) acct.anchor = Object.assign({ t, bal: r.balance }, A.balanceFrom === 'manual-screenshot' ? { source: 'manual-screenshot' } : {});
    if (A.dailyLimit != null) acct.dayStartOverride = { reset: C.lastReset(t, acct.resetMin), bal: A.dailyLimit / (1 - C.planOf(acct).mdl) };
    if (A.drawdownLimit > 0) acct.ddLimit = A.drawdownLimit;
    if (A.target > 0 && acct.phase === 'eval') acct.targetEq = A.target;
    if (A.equity > 0) acct.platformEq = Object.assign({ t, v: A.equity, appBefore: before.equity }, A.equitySource === 'manual-screenshot' ? { source: 'manual-screenshot' } : {});
    if (r.leverage && Object.keys(r.leverage).length) acct.leverage = Object.assign({}, acct.leverage, r.leverage);   // leverage as the venue shows it
    // Use the data given (owner's choice, Nov 1): when the screenshot shows the position list (or a flat account),
    // the app's open positions become exactly that list. A match (side + coin + entry) keeps his notes/stop/TP and
    // takes the platform's size; anything not on screen is closed (result from the Closed list when shown, otherwise
    // it's already in the imported balance). Everything is dated at the sync so nothing counts twice.
    // Take-profit / stop fills (owner, Nov 2): a filled TP/SL order closes its position at the fill price, matched by order ID first.
    // Done before the position-list sync so a position closed here isn't closed again there. Same plan the preview showed.
    const fillN2 = applyOrderFills(acct, r, lastImport.shotTime || now);
    const open = S.positions.filter(p => p.acct === acct.id && !p.closed);
    const reconcile = r.positions.length > 0 || r.flat;
    let plan = { keep: [], add: [], close: [], partial: [] };
    if (reconcile) {
      // Same plan the preview showed (C.planSync), so what he approved is exactly what is applied.
      plan = C.planSync(open, r.positions, r.closedRows);
      for (const k of plan.keep) { k.pos.platformSL = k.snap.slEvidence != null ? k.snap.slEvidence : null; k.pos.platformTP = k.snap.tpEvidence != null ? k.snap.tpEvidence : null; }
      // Partly closed on the platform: keep the history, add the closed part (its result is already in the imported balance).
      for (const k of plan.partial) { const p = k.pos; p.partials = (p.partials || []).concat({ t: t - 1, qty: k.closedQty, price: null, realized: 0, resultKnown: false, synced: true }); p.platformSL = k.snap.slEvidence != null ? k.snap.slEvidence : null; p.platformTP = k.snap.tpEvidence != null ? k.snap.tpEvidence : null; }
      for (const q of plan.add) {
        const pl = C.matchPlanned(S.planned.filter(x => x.acct === acct.id), q);
        if (pl) { const p = liveFromPlan(pl, { entry: q.entry, qty: q.qty, stop: pl.stop, opened: t - 2, openedUnknown: true, source: 'screen-import' }); p.platformSL = q.slEvidence != null ? q.slEvidence : null; p.platformTP = q.tpEvidence != null ? q.tpEvidence : null; S.positions.push(p); S.planned = S.planned.filter(x => x.id !== pl.id); continue; }
        S.positions.push({ id: uid(), acct: acct.id, sym: q.sym, side: q.side, qty: q.qty, entry: q.entry, stop: null, origStop: null, tp1: null, tp2: null,
          tf: 15, setup: 'Imported', thesis: '', opened: t - 2, openedUnknown: true, partials: [], stopHist: [], platformSL: q.slEvidence != null ? q.slEvidence : null, platformTP: q.tpEvidence != null ? q.tpEvidence : null, source: 'screen-import' });
      }
      for (const { pos: p, row } of plan.close)
        p.closed = { t: t - 1, price: row ? row.exit : null, realized: row ? row.realized : 0, resultKnown: !!row,
          note: row ? 'Closed on platform (result from its Closed list)' : 'Closed on platform (result in balance)', synced: true };
    }
    // Orders (owner's rule, Nov 1): an order is not a position. Working limit -> his matching plan becomes a working order (or a new
    // working order is tracked); filled -> the matching plan becomes an open position (unless the position list is on screen, which
    // does that itself); cancelled -> the matching plan is removed. Stop/TP orders belong to positions and are skipped here.
    const ordN = { placed: 0, added: 0, filled: 0, cancelled: 0 };
    for (const o of (r.orders || [])) {
      if ((o.type === 'stop' || o.type === 'take-profit') && o.orderId && o.status !== 'filled') {   // note a working TP/SL order's ID on its position
        const lvl = p => o.type === 'stop' ? p.stop : p.tp1;
        const c = S.positions.filter(p => p.acct === acct.id && !p.closed && p.sym === o.sym && p.side !== o.side && (p.orderId && p.orderId === o.parentId || (lvl(p) != null && C.samePx(lvl(p), o.price))));
        if (c.length === 1) c[0][o.type === 'stop' ? 'slOrderId' : 'tpOrderId'] = o.orderId;
      }
      if (o.type !== 'limit' && o.type !== 'market') continue;
      const mine = S.planned.filter(x => x.acct === acct.id);
      const pl = (o.orderId && mine.find(x => x.orderId === o.orderId)) || C.matchPlanned(mine, { sym: o.sym, side: o.side, qty: o.qty, entry: o.price });
      if (o.status === 'working' || o.status === 'partial' || o.status == null) {
        if (pl) { Object.assign(pl, { status: 'placed', placedAt: pl.placedAt || o.openedMs || t, entry: o.price, qty: o.qty, orderType: o.type, orderId: o.orderId || pl.orderId });
          if (o.sl != null) pl.stop = o.sl; if (o.tp != null) pl.tp1 = o.tp; ordN.placed++; }
        else { S.planned.push({ id: uid(), acct: acct.id, sym: o.sym, side: o.side, entry: o.price, stop: o.sl, tp1: o.tp, qty: o.qty, tf: 15, setup: 'Imported', thesis: '',
          ref: { key: 'unlinked', model: C.MODEL }, created: t, status: 'placed', placedAt: o.openedMs || t, orderType: o.type, orderId: o.orderId, source: 'screen-import' }); ordN.added++; }
      } else if (o.status === 'filled' && pl && !reconcile) {
        S.positions.push(liveFromPlan(pl, { entry: o.price, qty: o.qty, stop: o.sl != null ? o.sl : pl.stop, tp1: o.tp, opened: o.openedMs || t - 2, source: 'screen-import', orderId: o.orderId }));
        S.planned = S.planned.filter(x => x.id !== pl.id); ordN.filled++;
      } else if (o.status === 'cancelled' && pl) { S.planned = S.planned.filter(x => x.id !== pl.id); ordN.cancelled++; }
    }
    // Trades tab: keep the platform's fills (deduped) for the trade count and real open times.
    let fillN = 0, storyN = 0;
    if (r.fills.length) {
      const key = f => [f.side, f.sym, f.action, f.qty, f.price, f.t || f.day].join('|');
      const have = new Set((acct.fills || []).map(key));
      acct.fills = (acct.fills || []).concat(r.fills.filter(f => !have.has(key(f)) && (fillN++, true))).sort((x, y) => (y.t || y.day || 0) - (x.t || x.day || 0)).slice(0, 300);
      for (const p of S.positions.filter(p => p.acct === acct.id && !p.closed && p.openedUnknown)) {
        const h = C.fillHistory(p, acct.fills); if (h) { p.opened = Math.min(h.opened, t - 2); p.openedUnknown = false; storyN++; }
      }
    }
    lastSyncSummary = { orderFills: fillN2.actions.length, fills: fillN, story: storyN, keep: plan.keep.length, add: plan.add.length, partial: plan.partial.length, close: plan.close.length, diff: A.equity > 0 ? before.equity - A.equity : null };
    // Position detail sheets: stop/target, real open time. Match by side + coin + size (+ entry when shown).
    let setN = 0; const unmatched = [];
    for (const d of r.details) {
      let cands = S.positions.filter(p => p.acct === acct.id && !p.closed && p.side === d.side && p.sym === d.sym && Math.abs(C.openQty(p) - d.qty) < 1e-9);
      if (d.entry != null) cands = cands.filter(p => C.samePx(p.entry, d.entry));
      if (cands.length !== 1) { unmatched.push(`${d.side} ${d.base}: detail did not match exactly one position`); continue; }
      const p = cands[0];
      if (d.orderId && !p.orderId) p.orderId = d.orderId;
      if (d.sl != null && d.sl !== p.stop) {
        const wider = p.stop != null && (p.side === 'short' ? d.sl > p.stop : d.sl < p.stop);
        if (wider) { unmatched.push(`${d.base}: screenshot stop is farther away; check the platform`); continue; }
        (p.stopHist = p.stopHist || []).push({ t, stop: d.sl, why: d.manual ? 'entered manually from platform screenshot' : 'from platform (import)' });
        p.stop = d.sl; if (p.origStop == null) p.origStop = d.sl;
      }
      if (d.tp != null && d.tp !== p.tp1) { (p.tpHist = p.tpHist || []).push({ t, tp: d.tp, why: d.manual ? 'entered manually from platform screenshot' : 'from platform (import)' }); p.tp1 = d.tp; }
      if (d.sl != null) p.platformSL = true; if (d.tp != null) p.platformTP = true;
      if (d.openedMs && d.openedMs <= now) { p.opened = d.openedMs; p.openedUnknown = false; }
      setN++;
    }
    // The screenshot also shows Prop's real price: use it to calibrate only if the screenshot is under 2 min old
    // (it's compared with the live estimate now; an older shot would bake price drift into the calibration).
    const withPx = r.positions.find(q => q.price > 0) || r.details.find(q => q.price > 0);
    if (withPx && now - shotTime < 2 * 60000) { const qq = pnlQuote(withPx.sym); if (qq.raw && Math.abs(withPx.price / qq.raw - 1) < 0.01) S.calib.push({ t, sym: withPx.sym, prop: withPx.price, est: qq.raw }); }
    save(); ensureFeeds(); clearImportShots(); lastImport = null; $('#impPreview').innerHTML = ''; $('#impText').value = ''; $('#impText').hidden = true;
    const L = lastSyncSummary; $('#impStatus').innerHTML = `<b class=up>Synced ${esc(acct.label || 'account')}</b>: ${reconcile ? [L.add && L.add + ' new', L.partial && L.partial + ' size updated', L.close && L.close + ' closed', L.keep && L.keep + ' unchanged'].filter(Boolean).join(', ') || 'no positions' : 'positions unchanged'}${ordN.placed ? ` · ${ordN.placed} plan(s) now working orders` : ''}${ordN.added ? ` · ${ordN.added} working order(s) added` : ''}${ordN.filled ? ` · ${ordN.filled} order(s) filled → open` : ''}${ordN.cancelled ? ` · ${ordN.cancelled} cancelled order(s) removed` : ''}${L.fills ? ` · ${L.fills} new fill(s)` : ''}${L.story ? ` · ${L.story} open time(s) from fills` : ''}${L.diff != null ? ` · app was ${L.diff >= 0 ? '+' : ''}${usd(L.diff)} different from the screenshot before sync (live prices can move)` : ''}${setN ? `, ${setN} position detail(s)` : ''}.` + (unmatched.length ? ` <span class=warn>Not matched: ${esc(unmatched.join('; '))}</span>` : '');
    posFormDirty = true; autoPush('import'); toast('Synced. The coach can score it.', 'coach', 'View in Coach');
  }

  // ---------- Coach ----------
  const lastHealth = {};
  const notified = {};
  function coachCtx(p) {
    const A = analyses[p.sym] || (analyses[p.sym] = analyze(p.sym));
    const a = acctById(p.acct);
    const st = a ? C.accountState(a, S.positions, prices(), Date.now(), { orders: S.planned }) : null;
    const ec = F.candles(p.sym, p.tf);
    return { price: A.price, ageSec: A.ageSec, maxAge: T().maxAge, struct: A.struct, fvg: { 15: A.fvg[15], 60: A.fvg[60] }, levels: A.levels,
      atr: A.atr, acct: st, rules: { beAt1R: T().beAt1R }, entryStruct: ec.length > 10 ? C.structure(ec) : null, now: Date.now() };
  }
  function coachFor(p) { return C.health(p, coachCtx(p)); }
  let analyses = {};
  // ---------- Phone alerts via ntfy (free; works while the app is open) ----------
  const NT_KEY = 'kpd_ntfy', MEM_KEY = 'kpd_alertmem';
  const ntTopic = () => { try { return localStorage.getItem(NT_KEY) || ''; } catch (e) { return ''; } };
  async function ntSend(title, body, prio) {
    const t = ntTopic(); if (!t) return false;
    try { const r = await fetch('https://ntfy.sh/' + encodeURIComponent(t), { method: 'POST', body, headers: { Title: title.replace(/[^\x20-\x7E]/g, '').trim() || 'Prop Desk', Priority: String(prio || 3) } }); return r.ok; } catch (e) { return false; }
  }
  // Same rules as the 24/7 monitor (shared C.alertGate): alert when a condition starts or gets worse, 2h cooldown,
  // most urgent first, at most 4 per check; anything over the cap or not accepted by ntfy is sent on the next check.
  let alertBusy = false;
  async function alertCheck() {
    if (!ntTopic() || F.demo || alertBusy) return;
    alertBusy = true;
    try {
      let prev; try { prev = JSON.parse(localStorage.getItem(MEM_KEY)) || {}; } catch (e) { prev = {}; }
      const now = Date.now(), G = C.alertGate(prev, now), fire = G.fire;
      const P = prices();
      { const os = T().sym, oc = F.candles(os, 15), od = F.candles(os, 1440), x = oc && oc.length > 200 ? C.openAlert(oc, od, now / 1000, os) : null; if (x) fire(x.key, x.lvl, x.title, x.body, x.prio); }
      for (const a of liveAccts()) {
        const A = C.accountState(a, S.positions, P, now, { orders: S.planned }), name = a.label || C.planOf(a).name;
        if (A.breached) fire(a.id + '|breach', 3, `${name}: at the breach line`, `Equity ~${usd(A.equity)} vs floor ${usd(A.floor)}. Check your platform now.`, 5);
        else if (A.room < A.profRisk) fire(a.id + '|room', 2, `${name}: room below one trade`, `Room ${usd(A.room)}. No new trades today.`, 4);
        if (!A.riskKnown && A.open) fire(a.id + '|nostop', 2, `${name}: a position has no stop`, 'Risk is unlimited until it has one.', 4);
        else if (A.stopsBreach) fire(a.id + '|stopsbreach', 2, `${name}: stops sit past the breach line`, `If every stop fills, equity lands near ${usd(A.equityIfStopped)}; floor ${usd(A.floor)}.`, 4);
        if (A.reachedTarget) fire(a.id + '|target', 1, `${name}: equity at the profit target`, 'Check your platform (the exchange auto-closes at the target).', 4);
        for (const x of [C.resetAlert(A, name, now), C.lossAlert(A, name)]) if (x) fire(a.id + '|' + x.key, x.lvl, x.title, x.body, x.prio);
        for (const p of S.positions.filter(p => p.acct === a.id && !p.closed)) {
          const px = P[p.sym];
          if (px == null) { fire(p.sym + '|noprice', 2, `${p.sym}: app can't see the price`, `Live data for ${p.sym} isn't loading, so stop and target checks are paused. Check your platform yourself.`, 4); continue; }
          const d = p.side === 'short' ? -1 : 1, tag = `${p.sym} ${p.side} ${p.qty}`;
          if (p.stop != null) { const to = d * (px - p.stop), a1 = (analyses[p.sym] && analyses[p.sym].atr[60]) || px * 0.004;
            if (to <= 0) fire(p.id + '|stophit', 3, `${tag}: price through the stop`, `Price ${px.toFixed(1)}, stop ${p.stop}. Re-import to sync.`, 4);
            else if (to < a1 * 0.3) fire(p.id + '|stopnear', 2, `${tag}: close to the stop`, `Price ${px.toFixed(1)}, stop ${p.stop}. Hold or exit per plan; don't widen it.`, 3); }
          const tgt = p.tp1 != null ? p.tp1 : p.tp2; if (tgt != null && d * (px - tgt) >= 0) fire(p.id + '|tp', 1, `${tag}: target reached`, `Price ${px.toFixed(1)} at target ${tgt}.`, 3);
          if (p.partialAt != null && d * (px - p.partialAt) >= 0) fire(p.id + '|partial|' + p.partialAt, 1, `${tag}: at your partial level`, `Price ${px.toFixed(1)} reached ${p.partialAt}. If your plan banks a partial here, close part by hand on your platform (the prop platform has no partial TP orders).`, 3);
          { const sm = C.stopMove(p, px, analyses[p.sym] && analyses[p.sym].atr[60]);
            if (sm) fire(p.id + '|stopmove|' + sm.kind, 1, `${tag}: up ${sm.r.toFixed(1)}R, tighten the stop?`, `Moving the stop to ${C.fmtPx(sm.to)} (${sm.why}) only tightens it and sits 1+ hourly ATR from price. Your plan decides; never widen.`, 3); }
          const h = lastHealth[p.id]; if (h && h.score != null && h.score <= 2) fire(p.id + '|health', 3 - h.score, `${tag}: health ${h.score}/5`, h.proposal, 4);
        }
      }
      // Setups both ways, no account involved; you weigh them by ticking one.
      const A2 = analyses[T().sym] || analyze(T().sym);
      for (const e of C.scanSetups(T().sym, A2, now))
        if (C.alertWorthy(e, pnlPrice(e.sym), A2.atr && A2.atr[60]) && !benchedKeys().includes(C.setupKey(e.kind, e.tf))) fire('entry|' + e.key, 1, `${T().sym} ${e.dir} setup: market rules pass`, `${e.text} Tick it to weigh it against your account. Untested idea, not a signal.`, 4);
      const q = C.alertQueue(G.fired), undelivered = q.slice(4);
      for (const o of q.slice(0, 4)) if (!(await ntSend(o.title, o.body, o.prio))) undelivered.push(o);
      C.alertSettle(G.state, prev, undelivered);
      try { localStorage.setItem(MEM_KEY, JSON.stringify(G.state)); } catch (e) { }
    } finally { alertBusy = false; }
  }
  setInterval(() => { alertCheck().catch(e => console.warn(e)); }, 60000);

  function runCoach() {
    analyses = {};
    for (const p of S.positions.filter(p => !p.closed)) {
      const h = coachFor(p); lastHealth[p.id] = h;
      if (T().notify && h.score != null && h.score <= 2 && !notified[p.id + h.score]) {
        notified[p.id + h.score] = 1;
        try { if (window.Notification && Notification.permission === 'granted') new Notification(`${p.sym} ${p.side}: health ${h.score}/5`, { body: h.proposal }); } catch (e) { }
      }
    }
  }
  let coachWhy = {};
  function renderCoach() {
    const open = S.positions.filter(p => !p.closed);
    const P = prices(), now = Date.now();
    const acctHtml = liveAccts().map(a => { const s = C.accountState(a, S.positions, P, now, { orders: S.planned });
      return `<div class=small><b>${esc(a.label || C.planOf(a).name + ' ' + usd(a.size))}</b>: room ${usd(s.room)} (${s.binding}), open risk ${s.riskKnown ? usd(s.riskToStops) : 'UNLIMITED (no stop)'}, ${s.profile.name} next ${usd(s.nextRisk)}. ${s.warnings.map(w => `<span class="${w.lvl === 'bad' ? 'dn' : 'warn'}">${esc(w.text)}</span>`).join(' ')}</div>`; }).join('');
    const cards = open.map(p => {
      const h = lastHealth[p.id] || coachFor(p);
      const notes = window.PDResearch ? PDResearch.coachNotes(p, researchFor(p.sym)) : [];
      const cx = coachCtx(p), plan = cx.ageSec != null && cx.ageSec <= T().maxAge ? C.levelPlan(p, cx) : [];
      const TY = { stop: 'Move stop to', tp: 'Take profit at', partial: 'Close part by hand at' };   // the prop platform has no partial TP orders (owner, Nov 2)
      return `<div class=card><div class=acct-head><b>${esc(p.sym)} ${p.side.toUpperCase()} · ${C.tfName(p.tf)} ${esc(p.setup)}</b><span class="score s${h.score || 0}">${h.score || '–'}/5 ${h.label}</span></div>
        <p><b>Proposal:</b> ${esc(h.proposal)}</p>${T().dirRule !== false ? (() => { const dc = C.directionCheck(p.side, p.sym, (analyses[p.sym] || analyze(p.sym)).struct, S.positions.filter(x => x.id !== p.id), p.acct); return dc.ok || !dc.known ? '' : `<p class=small><b class=dn>Against your both-ways rule now:</b> ${esc(dc.reasons.join('; '))}</p>`; })() : ''}<div class=items>${h.items.map(i => `<div class="${i.k}"><b>${i.k}</b>${esc(i.t)}</div>`).join('')}</div>
        ${plan.length ? `<h4 style="margin:10px 0 4px">Suggested levels</h4><table><tr><th>Action</th><th class=num>Price</th><th class=num>R</th><th>Why</th><th></th></tr>${plan.map((x, i) => `<tr><td class=small><b class="${x.type === 'stop' ? 'warn' : 'up'}">${TY[x.type]}</b>${x.rule ? '<div class=tag>your rule</div>' : ''}</td><td class=num>${px(x.price)}</td><td class=num>${x.r == null ? '—' : (x.r >= 0 ? '+' : '') + x.r.toFixed(2) + 'R'}</td><td class=small>${esc(x.why)}</td><td>${x.type !== 'partial' ? `<button class="btn sm" data-setlvl="${esc(p.id)}" data-type="${x.type}" data-px="${x.price}">I set it</button>` : p.partialAt != null && C.samePx(p.partialAt, x.price) ? `<span class="tag up">alert set</span>` : `<button class="btn sm" data-partalert="${esc(p.id)}" data-px="${x.price}">Alert me there</button>`}</td></tr>`).join('')}</table>
          ${plan.some(x => x.type === 'partial') ? `<p class=small>The platform can't hold a partial take-profit order: your TP order closes the whole position. To bank part early, close part by hand when price gets there. "Alert me there" sends a phone alert at that price.${p.partialAt != null ? ` Alert set at ${px(p.partialAt)} <button class="btn sm" data-partalert="${esc(p.id)}" data-px="">Remove</button>` : ''}</p>` : ''}
          <p class="small mu">Set it on your prop platform first, then tap "I set it" so the app matches. Stops shown only tighten, stay at least 1 ATR from price, and are options unless marked "your rule". Not a signal; your plan decides.</p>` : ''}
        ${notes.length ? `<div class=items>${notes.map(t => `<div class=warn><b>research</b>${esc(t)}</div>`).join('')}</div><p class="small mu">Research notes (experimental): what the engine sees against this trade. They don't change the score and never mean widen the stop.</p>` : ''}</div>`;
    }).join('');
    const sym = T().sym, A = analyses[sym] || analyze(sym);
    const ups = C.scanSetups(sym, A, now);
    coachUps = C.sortLive(ups, liveOf, fitsNow, verdictRank); loadTrack();
    const board = C.rankBoard(coachUps, coachMem[sym] || {}, now); coachMem[sym] = board.mem;
    const reviews = liveAccts().map(a => {
      const R = C.accountReview(a, S.positions, P, now, { orders: S.planned }), st = R.state;
      const syms = [...new Set(S.positions.filter(p => p.acct === a.id && !p.closed && p.stop == null && p.platformSL).map(p => p.sym + '|' + p.side))];
      return `<div class=card><h3>Account review: ${esc(a.label || C.planOf(a).name + ' ' + usd(a.size))} <span class="tag">${esc(pnlQuote(T().sym).basis)}</span></h3>
        <div class=kv><div><span>Equity</span><b>${usd(st.equity)}</b></div><div><span>Room (${st.binding} limit)</span><b class="${st.room < st.profRisk * 2 ? 'dn' : ''}">${usd(st.room)}</b></div>
        <div><span>If every stop fills</span>${st.riskKnown ? usd(-st.riskToStops) : '<b class=dn>unknown</b>'}</div><div><span>Next reset</span>${fmtTime(st.nextReset)}</div></div>
        <div class=warns>${R.lines.map(l => `<div class="${l.lvl === 'bad' ? 'bad' : l.lvl === 'warn' ? 'warn' : ''}">${esc(l.t)}</div>`).join('')}</div>
        ${syms.map(k => { const [sy, sd] = k.split('|'); return `<div class=row style="margin-top:6px"><span class=small>Same stop/target for all ${esc(sy)} ${esc(sd)}s:</span><input type=number step=any placeholder="Stop" data-bulk=stop data-k="${esc(k)}" data-a="${a.id}" style="width:110px"><input type=number step=any placeholder="Target" data-bulk=tp data-k="${esc(k)}" data-a="${a.id}" style="width:110px"><button class="btn sm" data-bulkgo="${esc(k)}" data-a="${a.id}">Set</button></div>`; }).join('')}
        <p class="small mu">Same math as a manual review, from the app's price (${esc(pnlQuote(T().sym).basis)}). Re-import a screenshot to re-sync.</p></div>`;
    }).join('');
    if (C.uiView(T().view) === 'simple') {
      coachWhy = {};
      const TY = { stop: 'Move stop to', tp: 'Take profit at', partial: 'Close part by hand at' };
      const simpleCards = open.map(p => {
        const h = lastHealth[p.id] || coachFor(p);
        const notes = window.PDResearch ? PDResearch.coachNotes(p, researchFor(p.sym)) : [];
        const cx = coachCtx(p), plan = cx.ageSec != null && cx.ageSec <= T().maxAge ? C.levelPlan(p, cx) : [];
        const dc = T().dirRule === false ? { ok: true, known: true, reasons: [] } : C.directionCheck(p.side, p.sym, (analyses[p.sym] || analyze(p.sym)).struct, S.positions.filter(x => x.id !== p.id), p.acct);
        const acts = plan.map(x => {
          const btn = x.type !== 'partial'
            ? `<button class="btn sm" data-setlvl="${esc(p.id)}" data-type="${x.type}" data-px="${x.price}">I set it</button>`
            : (p.partialAt != null && C.samePx(p.partialAt, x.price) ? `<span class="tag up">alert set</span> <button class="btn sm" data-partalert="${esc(p.id)}" data-px="">Remove</button>` : `<button class="btn sm pri" data-partalert="${esc(p.id)}" data-px="${x.price}">Alert</button>`);
          return `<div class=srow><span><b>${esc(TY[x.type])}</b> ${px(x.price)}${x.r == null ? '' : ' · ' + (x.r >= 0 ? '+' : '') + x.r.toFixed(2) + 'R'}</span>${btn}</div>`;
        }).join('');
        coachWhy[p.id] = `<h3>${esc(p.sym)} ${esc(p.side.toUpperCase())}</h3><p><b>Suggested:</b> ${esc(h.proposal)}</p><p class=small>Score ${h.score || '–'}/5 ${esc(h.label || '')}. A checklist, not a probability.</p>${dc.ok || !dc.known ? '' : `<p class=dn><b>Against your both-ways rule:</b> ${esc(dc.reasons.join('; '))}</p>`}<div class=items>${h.items.map(i => `<div class="${i.k}"><b>${esc(i.k)}</b>${esc(i.t)}</div>`).join('')}</div>${plan.map(x => `<p class=small><b>${esc(TY[x.type])} ${px(x.price)}</b> — ${esc(x.why)}</p>`).join('')}${notes.map(t => `<p class=warn>${esc(t)}</p>`).join('')}<p class="small mu">Stops only tighten. Set the change on your platform first, then tap "I set it". Partial alerts use "Alert". Not a signal.</p><button class="btn" data-close>Close</button>`;
        return `<div class=card><div class=acct-head><b>${esc(p.sym)} ${esc(p.side.toUpperCase())}</b><button type=button class="btn sm qmark" data-why="${esc(p.id)}" title="Why this suggestion">?</button></div>
          <p><b>Suggested:</b> ${esc(h.proposal)}</p>
          ${dc.ok || !dc.known ? '' : '<p class="small dn">Against your both-ways rule. Tap ? for why.</p>'}
          ${acts || '<p class="small mu">No level change suggested.</p>'}</div>`;
      }).join('');
      const simpleReviews = liveAccts().map(a => {
        const R = C.accountReview(a, S.positions, P, now, { orders: S.planned }), st = R.state;
        const syms = [...new Set(S.positions.filter(p => p.acct === a.id && !p.closed && p.stop == null && p.platformSL).map(p => p.sym + '|' + p.side))];
        const bad = R.lines.filter(l => l.lvl === 'bad'), rest = R.lines.filter(l => l.lvl !== 'bad');
        return `<div class=card><h3>Account review <span class=small>${esc(a.label || C.planOf(a).name + ' ' + usd(a.size))}</span></h3>
          <div class=kv><div><span>Equity</span><b>${usd(st.equity)}</b></div><div><span>Room (${esc(st.binding)})</span><b class="${st.room < st.profRisk * 2 ? 'dn' : ''}">${usd(st.room)}</b></div>
          <div><span>If stops fill</span>${st.riskKnown ? usd(-st.riskToStops) : '<b class=dn>unknown</b>'}</div><div><span>Next reset</span>${fmtTime(st.nextReset)}</div></div>
          ${bad.length ? `<div class=warns>${bad.map(l => `<div class=bad>${esc(l.t)}</div>`).join('')}</div>` : ''}
          <details ${fold('rev:' + a.id)}><summary>Explanations</summary>
            <div class=warns>${rest.map(l => `<div class="${l.lvl === 'warn' ? 'warn' : ''}">${esc(l.t)}</div>`).join('') || '<p class=mu>Nothing else to flag.</p>'}</div>
            ${syms.map(k => { const [sy, sd] = k.split('|'); return `<div class=row style="margin-top:6px"><span class=small>Same stop/target for all ${esc(sy)} ${esc(sd)}s:</span><input type=number step=any placeholder="Stop" data-bulk=stop data-k="${esc(k)}" data-a="${a.id}" style="width:110px"><input type=number step=any placeholder="Target" data-bulk=tp data-k="${esc(k)}" data-a="${a.id}" style="width:110px"><button class="btn sm" data-bulkgo="${esc(k)}" data-a="${a.id}">Set</button></div>`; }).join('')}
            <p class="small mu">Same math as a manual review, from the app's price (${esc(pnlQuote(T().sym).basis)}).</p>
          </details></div>`;
      }).join('');
      $('#coachBox').innerHTML = `<div class=pair><div class=pair-main>${simpleReviews || '<div class=card><h3>Account review</h3><p class=mu>No open accounts.</p></div>'}</div><div class=card><h3>Account risk</h3>${acctHtml || '<p class=mu>No open accounts.</p>'}</div></div>
        ${simpleCards || '<div class=card><p class=mu>No open positions. Log one on Desk and the coach will score it here.</p></div>'}
        ${marketCardHtml()}`;
      return;
    }
    $('#coachBox').innerHTML = reviews + `<div class=card><h3>Account risk</h3>${acctHtml || '<p class=mu>No open accounts.</p>'}</div>
      ${cards || '<div class=card><p class=mu>No open positions. Log one on Desk and the coach will score it here.</p></div>'}
      ${marketCardHtml()}

      <p class="small mu">Score 1–5 is a rule checklist (stop, breach line, 1h/4h structure, entry-TF break, levels before target, your BE rule), not a win probability. It never suggests widening a stop. Updates every few seconds while this page is open; it does not watch when the app is closed.</p>`;
  }
  var coachUps = [], coachMem = {};
  $('#coachBox').addEventListener('click', e => {
    const whyB = e.target.closest('[data-why]'); if (whyB && coachWhy[whyB.dataset.why]) { showModal(coachWhy[whyB.dataset.why]); return; }
    const cp = e.target.closest('[data-cpaper]'); if (cp) { const u = coachUps[+cp.dataset.cpaper]; if (u) paperAdd(u); return; }
    const pa2 = e.target.closest('[data-partalert]');
    if (pa2) { const p = S.positions.find(x => x.id === pa2.dataset.partalert); if (!p) return; p.partialAt = pa2.dataset.px === '' ? null : +pa2.dataset.px; saveAndSync('partial alert'); renderAll(true); return; }
    const sb = e.target.closest('[data-setlvl]');
    if (sb) {
      const p = S.positions.find(x => x.id === sb.dataset.setlvl), v = +sb.dataset.px; if (!p || !isFinite(v)) return;
      const d = p.side === 'short' ? -1 : 1, now = pnlPrice(p.sym);
      if (sb.dataset.type === 'stop') {
        if (p.stop != null && d * (v - p.stop) <= 0) { alert('That would widen the stop. Not allowed.'); return; }
        if (now != null && d * (now - v) <= 0) { alert('Stop must be ' + (d > 0 ? 'below' : 'above') + ' the current price.'); return; }
        p.stop = v; if (p.origStop == null) p.origStop = v; (p.stopHist = p.stopHist || []).push({ t: Date.now(), stop: v, why: 'coach suggestion, set on platform' });
      } else { if (p.tp1 != null && now != null && d * (now - p.tp1) >= 0) p.tp2 = v; else { (p.tpHist = p.tpHist || []).push({ t: Date.now(), tp: v, why: 'coach suggestion, set on platform' }); p.tp1 = v; } }
      saveAndSync('levels'); renderAll(true); return;
    }
    const b = e.target.closest('[data-bulkgo]'); if (!b) return;
    const k = b.dataset.bulkgo, aid = b.dataset.a, [sym, side] = k.split('|');
    const val = w => num(($(`[data-bulk=${w}][data-k="${k}"][data-a="${aid}"]`) || {}).value);
    const stop = val('stop'), tp = val('tp');
    const ps = S.positions.filter(p => p.acct === aid && !p.closed && p.sym === sym && p.side === side);
    const px0 = pnlPrice(sym) || ps[0].entry;
    if (stop == null || (side === 'short' ? stop <= px0 : stop >= px0)) { alert('Stop must be ' + (side === 'short' ? 'above' : 'below') + ' the current price.'); return; }
    if (tp != null && (side === 'short' ? tp >= px0 : tp <= px0)) { alert('Target must be on the profit side of the current price.'); return; }
    for (const p of ps) { p.stop = stop; if (p.origStop == null) p.origStop = stop; p.stopHist.push({ t: Date.now(), stop, why: 'bulk set (same as platform)' }); if (tp != null) p.tp1 = tp; }
    saveAndSync('stops'); renderAll(true);
  });
  // Monitor hand-off. Build the watch file (positions, stops, limits; no keys).
  const WATCH_SALT_KEY = 'kpd_watch_salt';
  function monitorSalt() {
    let salt = localStorage.getItem(WATCH_SALT_KEY);
    if (!/^[a-f0-9]{64}$/i.test(salt || '')) {
      const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); salt = [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(WATCH_SALT_KEY, salt);
    }
    return salt;
  }
  async function monitorAlias(kind, rawId) {
    if (!['account', 'position', 'paper-account', 'paper-trade'].includes(kind) || !['string', 'number'].includes(typeof rawId) || String(rawId).length > 128) throw new Error('invalid local join key');
    if (!crypto.subtle || typeof TextEncoder === 'undefined') throw new Error('secure local hashing unavailable');
    const bytes = new TextEncoder().encode(monitorSalt() + '|' + kind + '|' + String(rawId));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return 'pd_' + [...digest].slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  async function buildWatch() {
    // Backup values are user-controlled. Hash join keys locally and recursively allowlist model/risk fields.
    const sourceAccounts = liveAccts(), accountIds = new Map();
    for (const a of sourceAccounts) accountIds.set(String(a.id), await monitorAlias('account', a.id));
    const accts = sourceAccounts.map(a => Object.assign({}, a, { id: accountIds.get(String(a.id)) }));
    const pos = await Promise.all(S.positions.filter(p => !p.closed && accountIds.has(String(p.acct))).map(async p =>
      Object.assign({}, p, { id: await monitorAlias('position', p.id), acct: accountIds.get(String(p.acct)) })));
    const orders = await Promise.all(S.planned.filter(x => x.status === 'placed' && accountIds.has(String(x.acct))).map(async x =>
      Object.assign({}, x, { acct: accountIds.get(String(x.acct)) })));
    return C.modelWatchProjection({ v: 1, updated: Date.now(), symbols: T().symbols,
      rules: { beAt1R: !!T().beAt1R, traits: (T().alertTraits || []).slice(), benched: benchedKeys() },
      calib: S.calib.slice(-10), accounts: accts, positions: pos, orders });
  }
  async function buildPaperWatch() {
    const sourceAccounts = S.paperAccts.filter(a => a && a.status === 'active'), accountIds = new Map();
    for (const a of sourceAccounts) accountIds.set(String(a.id), await monitorAlias('paper-account', a.id));
    const accounts = sourceAccounts.map(a => ({ id: accountIds.get(String(a.id)), plan: a.plan, size: a.size, phase: a.phase, profile: a.profile, status: 'active' }));
    const trades = await Promise.all(S.paper.filter(t => t && !t.remote).map(async t => ({
      id: await monitorAlias('paper-trade', t.id), acct: accountIds.get(String(t.acct)), sym: t.sym, side: t.side, status: t.status,
      entry: t.entry, stop: t.stop, stop0: t.stop0, target: t.target, opened: t.opened, placedAt: t.placedAt,
      closed: t.closed, exit: t.exit, qty: t.qty, setupKey: t.setupKey
    })));
    return C.modelPaperProjection({ updated: Date.now(), accounts, trades });
  }
  // Auto-send: GitHub fine-grained token (this repo only, Contents read/write), kept in its own key so backups never include it.
  const GH_KEY = 'kpd_gh';
  const GH_REPO_KEY = 'kpd_gh_repo';
  const ghRepo = () => { try { const v = (localStorage.getItem(GH_REPO_KEY) || '').trim(); return /^[\w.-]+\/[\w.-]+$/.test(v) ? v : ''; } catch (e) { return ''; } };
  const ghFile = () => `https://api.github.com/repos/${ghRepo()}/contents/monitor/watch.json`;
  const ghToken = () => { try { return localStorage.getItem(GH_KEY) || ''; } catch (e) { return ''; } };
  async function pushFile(file, obj, msg) {
    const tok = ghToken(); if (!tok || !/^[\w.-]+\/[\w.-]+$/.test(ghRepo())) return { ok: false };
    const url = `https://api.github.com/repos/${ghRepo()}/contents/${file}`, H = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 1))));
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const g = await fetch(url + '?ref=main', { headers: H, cache: 'no-store' }); const sha = g.ok ? (await g.json()).sha : undefined;
        const r = await fetch(url, { method: 'PUT', headers: H, body: JSON.stringify({ message: msg, content: b64, sha, branch: 'main' }) });
        if (r.ok) return { ok: true }; if (r.status !== 409 && r.status !== 422) return { ok: false, msg: 'GitHub error ' + r.status }; } catch (e) { return { ok: false }; }
    }
    return { ok: false };
  }
  async function pushWatch(reason) {
    const tok = ghToken(); if (!tok) return { ok: false, msg: 'no key' };
    if (!/^[\w.-]+\/[\w.-]+$/.test(ghRepo())) return { ok: false, msg: 'set your monitor repo (owner/name) in Settings' };
    const H = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
    let body; try { body = JSON.stringify(await buildWatch(), null, 1); }
    catch (e) { return { ok: false, msg: 'secure local model payload could not be prepared' }; }
    const b64 = btoa(unescape(encodeURIComponent(body)));
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const g = await fetch(ghFile() + '?ref=main', { headers: H, cache: 'no-store' });
        const sha = g.ok ? (await g.json()).sha : undefined;
        const r = await fetch(ghFile(), { method: 'PUT', headers: H, body: JSON.stringify({ message: 'monitor: positions update' + (reason ? ' (' + reason + ')' : ''), content: b64, sha, branch: 'main' }) });
        if (r.ok) { S.lastPush = Date.now(); save(); return { ok: true }; }
        if (r.status === 401 || r.status === 403) return { ok: false, msg: 'GitHub refused the key (expired or wrong permissions)' };
        if (r.status !== 409 && r.status !== 422) return { ok: false, msg: 'GitHub error ' + r.status };
      } catch (e) { return { ok: false, msg: 'offline or blocked' }; }
    }
    return { ok: false, msg: 'GitHub conflict, try again' };
  }
  let pushTimer = null;
  function autoPush(reason) {
    if (!ghToken()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => { const r = await pushWatch(reason); const el = $('#monStatus'); if (el) el.innerHTML = r.ok ? `<b class=up>Monitor updated ${fmtTime(Date.now())}</b>` : `<span class=dn>Monitor not updated: ${esc(r.msg)}</span>`; }, 1500);
  }
  $('#sendMon').onclick = async () => {
    if (ghToken()) { $('#monStatus').textContent = 'Sending…'; const r = await pushWatch('manual'); $('#monStatus').innerHTML = r.ok ? `<b class=up>Monitor updated ${fmtTime(Date.now())}</b>` : `<span class=dn>${esc(r.msg)}</span>`; return; }
    let txt; try { txt = JSON.stringify(await buildWatch(), null, 1); } catch (e) { $('#monStatus').textContent = 'Could not create a secure monitor model payload on this device.'; return; }
    try { await navigator.clipboard.writeText(txt); $('#monStatus').innerHTML = '<b class=up>Copied.</b> On GitHub: select all, paste, then "Commit changes". (Add a GitHub key in Settings to make this automatic.)'; }
    catch (e) { showModal(`<h3>Copy this</h3><textarea style="min-height:300px">${esc(txt)}</textarea><button class=btn data-close>Close</button>`); }
    if (ghRepo()) window.open(`https://github.com/${ghRepo()}/edit/main/monitor/watch.json`, '_blank'); else alert('Set your monitor repo (owner/name) in Settings first.');
  };
  $('#notifyChk').checked = !!T().notify;
  $('#notifyChk').onchange = async e => { T().notify = e.target.checked; save(); if (e.target.checked && window.Notification && Notification.permission !== 'granted') { try { await Notification.requestPermission(); } catch (x) { } } };
  $('#copyClaude').onclick = async () => {
    const now = Date.now(), P = prices();
    const lines = [`MODE: REVIEW · as of ${new Date(now).toISOString()} · data: ${F.source}${F.demo ? ' (DEMO, not real)' : ''} · P&L price basis: ${pnlQuote(T().sym).basis}`];
    for (const a of liveAccts()) { const s = C.accountState(a, S.positions, P, now, { orders: S.planned });
      lines.push(`ACCOUNT ${a.label || C.planOf(a).name + ' ' + a.size} (${a.phase}): start ${a.size}, balance ${s.balance.toFixed(2)}, equity ${s.equity.toFixed(2)}, daily floor ${s.dailyFloor.toFixed(2)}, max floor ${s.maxFloor.toFixed(2)}, room ${s.room.toFixed(2)}, target ${s.targetBal.toFixed(2)}, profile ${s.profile.name} (${s.profile.riskPct}%/trade), open risk to stops ${s.riskKnown ? s.riskToStops.toFixed(2) : 'UNLIMITED (position without stop)'}.`); }
    for (const p of S.positions.filter(p => !p.closed)) { const h = lastHealth[p.id] || coachFor(p), A = analyses[p.sym] || analyze(p.sym);
      lines.push(`POSITION ${p.sym} ${p.side} qty ${C.openQty(p)} entry ${p.entry} stop ${p.stop} (orig ${p.origStop}) tp1 ${p.tp1} tp2 ${p.tp2} tf ${C.tfName(p.tf)} setup ${p.setup}; price ${A.price} (${Math.round(A.ageSec || 0)}s old); health ${h.score}/5; thesis: ${p.thesis || 'none written'}`);
      lines.push(`  structure: ${[15, 60, 240, 1440].map(iv => `${C.tfName(iv)} ${A.struct[iv] ? A.struct[iv].bias : '?'}`).join(', ')}; levels: ${A.levels.map(l => `${l.name} ${px(l.price)}`).join(', ')}`);
      for (const i of h.items) lines.push(`  ${i.k}: ${i.t}`); }
    lines.push('Account rules: daily loss limit from balance at the daily reset (00:30 UTC), static max drawdown from start, fees and unrealized P&L count. Please review per my rules; no widening stops.');
    const txt = lines.join('\n');
    try { await navigator.clipboard.writeText(txt); $('#copyClaude').textContent = 'Copied ✓'; } catch (e) { showModal(`<h3>Copy this</h3><textarea style="min-height:300px">${esc(txt)}</textarea><button class=btn data-close>Close</button>`); }
    setTimeout(() => $('#copyClaude').textContent = 'Copy snapshot for Claude', 2000);
  };

  // ---------- Settings ----------
  function renderSettings() {
    const t = T();
    $('#setBox').innerHTML = `<div class=card><h3>Display & levels</h3><div class=form>
      <label>Your time zone<input id=stTz value="${esc(t.tz)}"></label>
      <label>ORB anchor<select id=stOrb><option value=ny ${t.orbAnchor === 'ny' ? 'selected' : ''}>9:30 New York (stock open)</option><option value=utc ${t.orbAnchor === 'utc' ? 'selected' : ''}>00:00 UTC (daily candle)</option><option value=exchange ${t.orbAnchor === 'exchange' ? 'selected' : ''}>00:30 UTC (the prop platform daily reset)</option></select></label>
      <label>ORB length (min)<select id=stOrbM>${[5, 15, 30, 60].map(m => `<option ${m === t.orbMin ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>Symbols (e.g. BTC/USD, comma separated)<input id=stSyms value="${esc(t.symbols.join(', '))}"></label>
      <label>Stale after (sec)<input id=stAge type=number value="${t.maxAge}"></label>
      <label>P&L price<select id=stBasis><option value=usdt ${t.priceBasis === 'usdt' ? 'selected' : ''}>Prop estimate: the futures feed mark in USDT (default)</option><option value=mark ${t.priceBasis === 'mark' ? 'selected' : ''}>the futures feed mark (USD)</option><option value=spot ${t.priceBasis === 'spot' ? 'selected' : ''}>the spot feed last</option></select></label></div>
      <p class="small mu">The platform values positions at a mark price from its own liquidity providers. The app's perp mark is a stand-in; compare it with your platform once and keep the closer one.</p></div>
      <div class=card><h3>My rules</h3><div class=form>
      <label class=chk><input type=checkbox id=stDir ${t.dirRule !== false ? 'checked' : ''}> Trade both ways only when it makes sense (4h trend that way, or 1h + 15m both turned; never long and short on one coin)</label>
      <label class=chk><input type=checkbox id=stBe ${t.beAt1R ? 'checked' : ''}> Move stop to breakeven at +1R (coach enforces it)</label>
      <label>Monthly eval budget $ (after bills, cushion, weekly buy)<input id=stBud type=number step=any value="${t.budget || ''}"></label></div>
      <p class="small mu">Profiles (per trade, % of starting balance): ${C.PROFILES.map(p => `${p.name} ${p.riskPct}% · max ${p.maxTrades} trades · stop after ${p.stopAfterLosses} losses`).join(' | ')}.</p></div>
      <div class=card><h3>Theme</h3><div class=swatches>${THEMES.map(th => {
        const c = th.id === 'classic' ? '#5b9cff' : th.id === 'vault' ? '#ffc200' : th.id === 'wasteland' ? '#e8a33a' : th.id === 'wastday' ? '#8a5a3a' : (th.id === 'custom' && hexOk(t.accent) ? t.accent : `hsl(${th.id === 'custom' ? t.hue : th.hue},${th.sat != null ? th.sat : 100}%,62%)`);
        return `<button data-theme="${th.id}" class="${t.theme === th.id ? 'on' : ''}" style="color:${esc(c)}">${esc(th.name)}</button>`; }).join('')}</div>
      <p class="small mu" style="margin:10px 0 4px">Color presets. One tap sets the slider's color. Vault and Wasteland keep their own panels and use this color for the trim.</p>
      <div class=presets>${Th.PRESETS.map(p => `<button type=button data-preset="${p.id}" class="${hexOk(t.accent) && t.accent.toLowerCase() === p.hex ? 'on' : ''}" style="color:${p.hex}">${esc(p.name)}</button>`).join('')}</div>
      <label class=small style="display:block;margin-top:10px">Color <b id=stHex>${esc(accentNow(THEMES.find(x => x.id === t.theme) || THEMES[1]))}</b> (slide through every hue)<input type=range id=stHue min=0 max=359 value="${+t.hue || 0}"></label>
      ${(function () { const id = THEMES.find(x => x.id === t.theme) || THEMES[1]; if (id.id === 'classic') return ''; const a = accentNow(id), bg = id.id === 'vault' ? Th.VAULT.bg : id.id === 'wastday' ? Th.WASTE_DAY.bg : id.id === 'wasteland' ? Th.WASTE.bg : Th.pipFromAccent(a).bg; const ratio = Th.contrast(a, bg); return ratio < 4.5 ? `<p class="small warn">This color is hard to read on the background (${ratio.toFixed(1)}:1). Pick a brighter preset.</p>` : ''; })()}
      <div class=row style="margin:8px 0 0"><label class=chk><input type=checkbox id=stScan ${t.scan ? 'checked' : ''}> Scanlines</label><label class=chk><input type=checkbox id=stGlow ${t.glow !== false ? 'checked' : ''}> Glow on headings</label><label class=chk><input type=checkbox id=stFlicker ${t.flicker ? 'checked' : ''}> Flicker</label><label class=chk><input type=checkbox id=stGrain ${t.grain ? 'checked' : ''}> Grain</label><label class=chk><input type=checkbox id=stSweep ${t.sweep ? 'checked' : ''}> Sweep</label></div>
      <p class="small mu">Flicker, grain and sweep are off until you turn them on. Flicker and the sweep stay off when the phone asks for less motion. Grain does not move. Gains show ▲ in green and losses show ▼ in red, in every theme.</p>
      <label class=small style="display:block;margin-top:10px">Text brightness <b id=stBoostV>${+t.textBoost || 0}%</b><input type=range id=stBoost min=0 max=100 step=5 value="${+t.textBoost || 0}" style="width:100%" ${t.textWhite ? 'disabled' : ''}></label>
      <div class="small mu">Brightens text toward white and darkens the cards behind it. Green/red for gains and losses and red/yellow warnings never change.</div>
      <label class=chk style="margin-top:6px"><input type=checkbox id=stWhite ${t.textWhite ? 'checked' : ''}> All text white</label>
      <label class=small style="display:block;margin-top:10px">Chart colors<select id=stChart><option value=tv ${t.chartStyle !== 'theme' ? 'selected' : ''}>TradingView (green/red candles)</option><option value=theme ${t.chartStyle === 'theme' ? 'selected' : ''}>Match theme (Fallout look)</option></select></label>
      <p class="small mu">Gains and bull read green, losses and bear read red, stops and danger stay red, cautions yellow, in every theme.</p></div>
      <div class=card><h3>Phone alerts</h3>
        <p class=small>Free alerts to your phone through the <b>ntfy</b> app. Only when something changes (stop close, target hit, room low, a setup where every rule passes). No account needed.</p>
        <ol class=small style="padding-left:18px;margin:6px 0">
          <li>Install ntfy: <a href="https://apps.apple.com/app/ntfy/id1625396347" target=_blank rel=noopener>iPhone</a> · <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target=_blank rel=noopener>Android</a></li>
          <li>${ntTopic() ? 'Your private channel: <b class=mono>' + esc(ntTopic()) + '</b>' : '<button class="btn sm pri" id=ntMake>Create my private channel</button>'}</li>
          ${ntTopic() ? `<li><button class="btn sm" id=ntCopy>Copy channel name</button> then in ntfy tap <b>+</b>, paste it, and tap <b>Subscribe</b>.</li>
          <li><button class="btn sm pri" id=ntTest>Send test alert</button> <span id=ntStat></span></li>` : ''}
        </ol>
        ${ntTopic() ? '<p class="small mu">Alerts are sent while Prop Desk is open (iPhone pauses web apps in the background). For 24/7 alerts, see the <a href="MONITOR-SETUP.md" target=_blank>24/7 setup guide</a>. Keep the channel name private: anyone with it can read your alerts. <a href="#" id=ntOff>Turn off / new channel</a></p>' : '<p class="small mu">Want alerts even when the app is closed? See the <a href="MONITOR-SETUP.md" target=_blank>24/7 setup guide</a>.</p>'}
      </div>
      <div class=card><h3>24/7 monitor key</h3><p class=small>Paste a GitHub fine-grained key for <b>your monitor repo only</b>${ghRepo() ? ' (' + esc(ghRepo()) + ')' : ''}, permission <b>Contents: Read and write</b>. Then every import and trade change updates the monitor by itself. Screenshots and OCR stay on this device; the private monitor receives only structured trading/model fields with salted opaque account/position keys, not your account labels, personal notes or screenshots. The key and repository destination stay on this phone and outside backups. Re-enter the repo once after this update if it was previously configured.</p>
      <label class=small style="display:block;margin-bottom:6px">Monitor repo (owner/name)<input id=ghRepo value="${esc(ghRepo())}" placeholder="you/your-monitor-repo" style="width:100%"></label><div class=row><input id=ghTok type=password placeholder="${ghToken() ? 'Key saved (paste to replace)' : 'github_pat_…'}" style="flex:1;min-width:180px"><button class="btn sm" id=ghSave>Save &amp; test</button>${ghToken() ? '<button class="btn sm bad" id=ghDel>Remove</button>' : ''}</div><p class=small id=ghStat>${S.lastPush ? 'Last update ' + fmtTime(S.lastPush, true) : ''}</p></div>
      <div class=card><h3>Shared learning pool</h3>
      <p class=small>Optional and separate from the private monitor sync above. Shared learning never receives account labels, account IDs, sizes, balances, notes, screenshots or OCR text. Nothing here places a trade or changes your size, alerts, or trust and bench marks.</p>
      <label class=chk><input type=checkbox id=stShareRes ${shareWanted('shareResults') ? 'checked' : ''}> Add my closed trades to the shared pool</label>
      <p class="small mu">Each closed trade sends the setup type, model version, result in R, and the tag. The source is hand paper, automatic paper, or live. Paper trades also send the coin, timeframe, long or short, entry, stop, target, and the open and close times rounded to the hour, so they can be checked later on public candles. Live trades send no prices and no times. Never the size, dollars, balance, account, or notes. This browser has a random id; the server keeps only a salted hash of it. Only "followed plan" trades are counted.</p>
      <label class=chk><input type=checkbox id=stShare disabled> Screenshot layout sharing is temporarily paused</label>
      <p class="small mu">For privacy, no OCR text or screenshot layout is sent while this feature is paused. Screenshots are read on this device.</p>
      <p class=small>Anonymous id: <b class=mono>${peekInstall() ? esc(peekInstall().slice(0, 8)) + '…' : 'created when trade sharing is on'}</b> <button class="btn sm" id=stNewId type=button>Reset anonymous id</button></p>
      ${(h => h ? `<p class="small warn">Trade sharing is paused (${esc(h.why)}) until ${esc(new Date(h.until).toISOString().slice(0, 16).replace('T', ' '))} UTC. <button class="btn sm" id=stRetry type=button>Try again</button></p>` : '')(holdOf(SHARE_HOLD))}
      </div>
      <div class=card><h3>Backup</h3><p class=small>Everything lives in this browser only. Export a backup now and then.</p>
      <div class=row><button class=btn id=stExp>Export backup</button><label class="btn">Import<input type=file id=stImp accept=application/json hidden></label><button class="btn bad" id=stClr>Erase all</button></div></div>
      <div class=card><h3>Data</h3><p class=small>Chart: the spot feed candles (public WebSocket v2 + REST). P&amp;L: the futures feed perp mark (public WebSocket), falling back to spot when the mark is stale. Backup: Coinbase public candles (different venue, labeled). Free, no keys, nothing to install. the prop platform fills are simulated on the exchange's side and can differ from the public feed.</p>
      <p class=small>Rules last checked Nov 1, 2026 against the exchange's support centre. Errors: ${esc(F.errors.slice(-3).join(' · ') || 'none')}</p></div>`;
    const bind = (id, fn) => $(id).addEventListener('change', e => { fn(e.target); save(); renderAll(true); });
    bind('#stTz', el => { try { new Intl.DateTimeFormat('en-US', { timeZone: el.value }); T().tz = el.value; } catch (e) { alert('Unknown time zone. Example: America/Chicago'); } });
    bind('#stOrb', el => { T().orbAnchor = el.value; }); bind('#stOrbM', el => { T().orbMin = +el.value; });
    bind('#stSyms', el => { const v = el.value.split(',').map(x => x.trim().toUpperCase()).filter(x => /^[A-Z0-9]+\/[A-Z]+$/.test(x)); if (v.length) { T().symbols = v; if (!v.includes(T().sym)) T().sym = v[0]; ensureFeeds(); initChart(); } });
    bind('#stAge', el => { T().maxAge = Math.max(10, +el.value || 90); });
    bind('#stBasis', el => { T().priceBasis = ['usdt', 'mark', 'spot'].includes(el.value) ? el.value : 'usdt'; });
    bind('#stBe', el => { T().beAt1R = el.checked; }); bind('#stShare', el => { setShareFlag('shareLayout', el.checked); }); bind('#stShareRes', el => { setShareFlag('shareResults', el.checked); }); bind('#stDir', el => { T().dirRule = el.checked; }); bind('#stBud', el => { T().budget = num(el.value) || 0; });
    $('#stNewId').onclick = () => { if (!confirm('Reset the anonymous id? This browser will count as a new contributor. Trades already in the pool stay there.')) return; installId(true); renderSettings(); };
    if ($('#stRetry')) $('#stRetry').onclick = () => { clearHold(SHARE_HOLD); sendResults(); renderSettings(); };
    if ($('#stRetryLay')) $('#stRetryLay').onclick = () => { clearHold(SAMPLE_HOLD); renderSettings(); };
    $('#ghRepo').onchange = e => { const v = e.target.value.trim(); if (/^[\w.-]+\/[\w.-]+$/.test(v)) { try { localStorage.setItem(GH_REPO_KEY, v); } catch (x) { alert('Could not store the monitor destination on this device.'); } } else alert('Use owner/repo, like you/prop-desk.'); };
    $('#ghSave').onclick = async () => { const v = $('#ghTok').value.trim(); if (!/^(github_pat_|ghp_)\w+/.test(v)) { alert('That doesn\'t look like a GitHub key.'); return; }
      try { localStorage.setItem(GH_KEY, v); } catch (e) { } $('#ghStat').textContent = 'Testing…'; const r = await pushWatch('key test');
      $('#ghStat').innerHTML = r.ok ? '<b class=up>Works. The monitor now updates automatically.</b>' : `<span class=dn>${esc(r.msg)}</span>`; if (!r.ok) { try { localStorage.removeItem(GH_KEY); } catch (e) { } } };
    if ($('#ghDel')) $('#ghDel').onclick = () => { try { localStorage.removeItem(GH_KEY); } catch (e) { } renderSettings(); };
    document.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
      T().theme = b.dataset.theme;
      if (b.dataset.theme === 'vault' && !hexOk(T().accent)) T().accent = '#ffc200';
      if ((b.dataset.theme === 'wasteland' || b.dataset.theme === 'wastday') && !hexOk(T().accent)) T().accent = '#e8a33a';
      if (b.dataset.theme !== 'custom' && b.dataset.theme !== 'vault' && b.dataset.theme !== 'wasteland' && b.dataset.theme !== 'wastday') T().accent = '';
      save(); applyTheme(); renderSettings();
    });
    document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
      const p = Th.PRESETS.find(x => x.id === b.dataset.preset); if (!p) return;
      T().accent = p.hex; T().hue = Th.hueOf(p.hex);
      if (T().theme !== 'vault' && T().theme !== 'wasteland' && T().theme !== 'wastday') T().theme = 'custom';
      save(); applyTheme(); renderSettings();
    });
    $('#stHue').oninput = e => {
      T().hue = +e.target.value;
      if (T().theme === 'vault' || T().theme === 'wasteland' || T().theme === 'wastday') T().accent = Th.hslToHex(+e.target.value, 100, 62);
      else { T().accent = ''; T().theme = 'custom'; }
      save(); applyTheme();
      const lab = $('#stHex'); if (lab) lab.textContent = accentNow(THEMES.find(x => x.id === T().theme) || THEMES[1]);
      document.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === T().theme));
      document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('on'));
    };
    $('#stChart').onchange = e => { T().chartStyle = e.target.value; save(); applyTheme(); };
    $('#stBoost').oninput = e => { T().textBoost = +e.target.value; $('#stBoostV').textContent = e.target.value + '%'; save(); applyTheme(); };
    $('#stWhite').onchange = e => { T().textWhite = e.target.checked; $('#stBoost').disabled = e.target.checked; save(); applyTheme(); };
    $('#stScan').onchange = e => { T().scan = e.target.checked; save(); applyTheme(); };
    $('#stGlow').onchange = e => { T().glow = e.target.checked; save(); applyTheme(); };
    $('#stFlicker').onchange = e => { T().flicker = e.target.checked; save(); applyTheme(); };
    $('#stGrain').onchange = e => { T().grain = e.target.checked; save(); applyTheme(); };
    $('#stSweep').onchange = e => { T().sweep = e.target.checked; save(); applyTheme(); };
    if ($('#ntMake')) $('#ntMake').onclick = () => { const b = new Uint8Array(12); crypto.getRandomValues(b); const t = 'pd-' + [...b].map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join('');
      try { localStorage.setItem(NT_KEY, t); } catch (e) { } renderSettings(); };
    if ($('#ntCopy')) $('#ntCopy').onclick = async () => { try { await navigator.clipboard.writeText(ntTopic()); $('#ntCopy').textContent = 'Copied ✓'; } catch (e) { prompt('Copy this channel name', ntTopic()); } };
    if ($('#ntTest')) $('#ntTest').onclick = async () => { $('#ntStat').textContent = 'Sending…'; const ok = await ntSend('Prop Desk test', 'Alerts are working. You\'ll only hear from me when something changes.', 3);
      $('#ntStat').innerHTML = ok ? '<b class=up>Sent. Check ntfy.</b>' : '<b class=dn>Couldn\'t send. Check your connection.</b>'; };
    if ($('#ntOff')) $('#ntOff').onclick = e => { e.preventDefault(); if (confirm('Stop alerts and forget this channel? You can make a new one.')) { try { localStorage.removeItem(NT_KEY); localStorage.removeItem(MEM_KEY); } catch (x) { } renderSettings(); } };
    $('#stExp').onclick = () => { const backup = JSON.parse(JSON.stringify(S)); C.scrubMonitorConfig(backup); const b = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `prop-desk-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); };
    $('#stImp').onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(j.accounts) || !Array.isArray(j.positions)) throw 0; if (confirm('Replace current data with this backup?')) { S = Object.assign({}, DEF, j); S.settings = Object.assign({}, DEF.settings, j.settings || {}); C.scrubMonitorConfig(S); save(); location.reload(); } } catch (x) { alert('Not a Prop Desk backup file.'); } };
    $('#stClr').onclick = () => { if (confirm('Erase all accounts, positions and settings on this device?')) { localStorage.removeItem(KEY); localStorage.removeItem(INSTALL_KEY); localStorage.removeItem(RESULT_KEY); localStorage.removeItem(SAMPLE_KEY); localStorage.removeItem(SHARE_HOLD); localStorage.removeItem(SAMPLE_HOLD); location.reload(); } };
  }

  // ---------- Loop ----------
  async function ensureFeeds() {
    await F.want(T().sym, [...new Set(F.INTERVALS.concat([T().tf]))]); F.wantMark(T().sym); F.wantRefs(T().sym); F.want('USDT/USD', []);
    for (const s of new Set(S.positions.filter(p => !p.closed).map(p => p.sym))) { F.wantMark(s); F.wantRefs(s); await F.want(s, [5, 15, 60, 240, 1440]); }
  }
  let lastFull = 0;
  function renderAll(full) {
    renderHeader();
    const now = Date.now();
    if (!full && now - lastFull < 3000) { if (tab === 'chart') renderChart(false); return; }
    lastFull = now;
    runCoach();
    if (tab === 'chart') renderChart(true);
    if (tab === 'desk') renderDesk();
    if (tab === 'coach') { renderCoach(); renderPaper(); }
    if (tab === 'set' && full) renderSettings();
    refreshSub();
  }
  // Don't redraw a form while the user is typing in it.
  const typing = () => { const el = document.activeElement; return !$('#modal').hidden || (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName) && tab !== 'chart'); };
  F.on(() => { if (!typing()) renderAll(false); });
  setInterval(() => { if (!typing()) renderAll(false); }, 3000);

  function askShare() {
    if (T().shareConsent === 'yes' || T().shareConsent === 'no') return;
    const res = shareWanted('shareResults');
    showModal(`<div data-consent><h3>Share anonymous results?</h3>
      <p class=small>Nothing is sent until you save this choice. Untick anything you don't want to share. You can change it any time in Settings. It does not change your trade size, alerts, or trust and bench marks.</p>
      <label class=chk style="align-items:flex-start"><input type=checkbox id=cRes ${res ? 'checked' : ''} style="margin-top:3px"> <span><b>Closed trades.</b> Setup type, model version, result in R, tag, and whether it was a hand paper trade, an automatic paper trade, or live. Paper trades also send the coin, timeframe, long or short, entry, stop, target, and open/close times rounded to the hour (so they can be checked on public candles). Live trades send no prices. Never size, dollars, balance, account, or notes. A random id for this browser is included; the server stores only a salted hash.</span></label>
      <label class=chk style="align-items:flex-start"><input type=checkbox id=cLay disabled style="margin-top:3px"> <span><b>Screenshot layouts.</b> Temporarily paused for privacy; no OCR text or layout is sent.</span></label>
      <div class=row style="margin-top:10px"><button class="btn pri" id=cSave type=button>Save my choice</button></div></div>`);
    $('#cSave').onclick = () => { setShareFlag('shareResults', $('#cRes').checked); setShareFlag('shareLayout', $('#cLay').checked); save(); closeModal(); };
  }
  const demo = /[?&]demo\b/.test(location.search);
  PAL = themeColors(); Object.assign(PAL, { chartBg: '#000000', chartTx: PAL.tx, chartGrid: PAL.card, chartLine: PAL.line });
  F.start({ demo });
  initChart();
  applyTheme();
  ensureFeeds().then(() => { renderAll(true); setTimeout(applyTheme, 300); });
  renderAll(true);
  askShare();
  window.__app = { S, analyze, C };
})();
