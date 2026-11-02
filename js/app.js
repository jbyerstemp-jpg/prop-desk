/* Prop Desk app: Chart, Desk, Positions, Coach, Settings. All data stays in this browser (localStorage).
   Read-only: nothing here places orders or talks to any account. */
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
    budget: 0, notify: false, maxAge: 90, priceBasis: 'usdt', v: 3, theme: 'green', hue: 135, scan: true, glow: true, chartStyle: 'tv' } };
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
  const savedV = (S.settings && S.settings.v) || 0;
  S = Object.assign({ calib: [], paper: [] }, DEF, S); if (!Array.isArray(S.calib)) S.calib = []; if (!Array.isArray(S.paper)) S.paper = []; if (!Array.isArray(S.paperAccts)) S.paperAccts = []; if (!Array.isArray(S.planned)) S.planned = []; if (!S.usedSetups || typeof S.usedSetups !== 'object') S.usedSetups = {}; S.settings = Object.assign({}, DEF.settings, S.settings || {});
  S.settings.layers = Object.assign({}, DEF.settings.layers, S.settings.layers || {});
  if (savedV < 2) { S.settings.priceBasis = 'usdt'; S.settings.v = 2; }
  // v3: no personal defaults in the shared app. Existing installs keep the monitor repo they were using.
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };
  const saveAndSync = r => { save(); if (typeof autoPush === 'function') autoPush(r); };
  const T = () => S.settings;

  // ---------- Themes (Pip-Boy style: one phosphor color on black, or Classic) ----------
  const THEMES = [
    { id: 'classic', name: 'Classic' }, { id: 'green', name: 'Pip-Boy', hue: 135 }, { id: 'amber', name: 'Amber', hue: 38 },
    { id: 'blue', name: 'Blue', hue: 195 }, { id: 'white', name: 'White', hue: 0, sat: 0 }, { id: 'pink', name: 'Pink', hue: 320 }, { id: 'custom', name: 'Custom' }];
  let PAL = {};
  function themeColors() {
    const t = THEMES.find(x => x.id === T().theme) || THEMES[1];
    if (t.id === 'classic') return { mode: 'classic', bg: '#000000', card: '#0b0d10', line: '#1e2630', tx: '#d6dde6', mu: '#8696a8', acc: '#5b9cff', up: '#26a69a', dn: '#ef5350',
      upFill: 'rgba(38,166,154,.16)', dnFill: 'rgba(239,83,80,.16)', day: '#8fa3bf', week: '#b18cff', open: '#6e7f94', vwap: '#e3b341', session: '#4d6a8a', orb: '#f778ba', entry: '#5b9cff', tp: '#3fb950', hollow: false, glow: 'none' };
    const h = t.id === 'custom' ? (+T().hue || 0) : t.hue, sat = t.sat != null ? t.sat : 100;
    const c = (l, a) => {   // HSL -> rgba (the chart library only reads rgb/hex)
      const S_ = sat / 100, L = l / 100, k = n => (n + h / 30) % 12, A_ = S_ * Math.min(L, 1 - L);
      const f = n => Math.round(255 * (L - A_ * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
      if (a == null || a === 1) return '#' + [f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join('');
      return `rgba(${f(0)},${f(8)},${f(4)},${a})`; };
    return { mode: 'pip', bg: '#000000', card: c(4), line: c(22), tx: c(62), mu: c(40), acc: c(62), up: c(62), dn: c(62),
      upFill: c(55, .14), dnFill: c(55, .07), day: c(70), week: c(80), open: c(45), vwap: c(85), session: c(35), orb: c(75), entry: c(70), tp: c(62), hollow: true,
      glow: T().glow === false ? 'none' : `0 0 6px ${c(55, .55)}` };
  }
  function applyTheme() {
    PAL = themeColors();
    if (T().chartStyle !== 'theme') Object.assign(PAL, { up: '#26a69a', dn: '#ef5350', upFill: 'rgba(38,166,154,.16)', dnFill: 'rgba(239,83,80,.16)', day: '#8fa3bf', week: '#b18cff',
      open: '#6e7f94', vwap: '#e3b341', session: '#4d6a8a', orb: '#f778ba', entry: '#5b9cff', tp: '#3fb950', hollow: false, chartBg: '#000000', chartTx: '#c9d1d9', chartGrid: '#11161d', chartLine: '#1e2630' });
    else Object.assign(PAL, { chartBg: PAL.bg, chartTx: PAL.tx, chartGrid: PAL.card, chartLine: PAL.line });
    const r = document.documentElement, st = r.style;
    r.dataset.mode = PAL.mode; r.dataset.scan = PAL.mode === 'pip' && T().scan ? 'on' : 'off';
    // Gains/losses and bull/bear always read green/red, whatever the theme (owner's rule).
    for (const [k, v] of [['--bg', PAL.bg], ['--card', PAL.card], ['--line', PAL.line], ['--tx', PAL.tx], ['--mu', PAL.mu], ['--acc', PAL.acc], ['--up', '#2ebd85'], ['--dn', '#f6465d'], ['--glow', PAL.glow]]) st.setProperty(k, v);
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = '#000000';
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
  // P&L price: Kraken Prop values positions at a MARK price (Kraken: Available Markets). We use the
  // Kraken Futures perp mark when fresh; else Kraken spot, labeled. Stale = unknown (never a number).
  function pnlQuote(sym) {
    const mx = T().maxAge;
    const b = T().priceBasis, markOk = F.mark(sym) != null && F.markAge(sym) <= mx;
    if (b === 'usdt' && markOk && F.price('USDT/USD') != null && F.age('USDT/USD') <= 600) {
      const est = C.propEstimate(F.mark(sym), F.price('USDT/USD'));
      if (est != null) { const k = C.calibration(S.calib, sym, Date.now());
        return { price: est * (1 + k.bps / 1e4), raw: est, age: F.markAge(sym), basis: k.n ? `Prop estimate (calibrated ×${k.n})` : 'Prop estimate (uncalibrated)' }; }
    }
    if ((b === 'mark' || b === 'usdt') && markOk) return { price: F.mark(sym), age: F.markAge(sym), basis: b === 'usdt' ? 'perp mark (USDT price missing)' : 'perp mark' };
    if (F.price(sym) != null && F.age(sym) <= mx) return { price: F.price(sym), age: F.age(sym), basis: b === 'spot' ? 'Kraken spot' : 'Kraken spot (mark unavailable)' };
    return { price: null, age: F.age(sym), basis: 'none (stale or missing)' };
  }
  const pnlPrice = sym => pnlQuote(sym).price;
  const prices = () => { const o = {}; for (const s of allSyms()) { const p = pnlPrice(s); if (p != null) o[s] = p; } return o; };
  const allSyms = () => [...new Set(T().symbols.concat(S.positions.filter(p => !p.closed).map(p => p.sym)))];
  const liveAccts = () => S.accounts.filter(a => a.phase === 'eval' || a.phase === 'funded');
  function showModal(html) { $('#modalCard').innerHTML = html; $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modalCard').innerHTML = ''; }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.dataset.close != null) closeModal(); });
  const pct = (x, dp) => (x == null || !isFinite(x) ? '—' : (x * 100).toFixed(dp == null ? 2 : dp) + '%');
  const cls = x => (x > 0 ? 'up' : x < 0 ? 'dn' : '');

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
    const b = $('#banner');
    const csH = C.consensus(F.sources(sym), 60, 15);
    const note = F.note || (csH.outliers.length ? `Price check: ${csH.outliers.join(', ')} differs from the other feeds by more than 0.15%. Numbers may be off.` : '');
    if (note) { b.hidden = false; b.textContent = note; b.className = 'banner' + (F.demo ? ' demo' : ''); } else b.hidden = true;
  }
  $('#refreshBtn').onclick = async () => { $('#refreshBtn').textContent = '↻ …'; await F.refresh(); await ensureFeeds(); $('#refreshBtn').textContent = '↻ Refresh'; renderAll(true); };

  // ---------- Tabs ----------
  let tab = 'chart';
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    tab = b.dataset.tab; posFormDirty = true;
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.id === 'tab-' + tab));
    renderAll(true);
  });

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
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });

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
  const TFS = [5, 15, 60, 240, 1440];
  const LAYERS = { levels: 'Day/week levels', vwap: 'VWAP', sessions: 'Sessions', orb: 'Opening range', fvg: 'Fair value gaps', marks: 'BOS / CHoCH marks', fib: 'Impulse legs + fib retracements',
    pos: 'My trades and orders (entry/stop/target)', ema9: 'EMA 9', ema21: 'EMA 21', ema50: 'EMA 50', ema200: 'EMA 200', volume: 'Volume' };
  const LAYER_DEF = { fib: true, levels: true, vwap: true, sessions: true, orb: true, fvg: true, marks: true, pos: true, ema9: false, ema21: false, ema50: false, ema200: false, volume: false };
  const CTYPES = { candles: 'Candles', hollow: 'Hollow candles', heikin: 'Heikin Ashi', bars: 'Bars (OHLC)', line: 'Line', area: 'Area' };
  const EMA_COL = { ema9: '#f0b90b', ema21: '#2962ff', ema50: '#e040fb', ema200: '#ff9800' };
  let extra = {}, curType = null;
  let chart, series, priceLines = [], lastDataKey = '';
  function initChart() {
    $('#symSel').innerHTML = T().symbols.map(s => `<option ${s === T().sym ? 'selected' : ''}>${esc(s)}</option>`).join('');
    $('#tfSeg').innerHTML = TFS.map(tf => `<button data-tf="${tf}" class="${tf === T().tf ? 'on' : ''}">${C.tfName(tf)}</button>`).join('');
    for (const k in LAYER_DEF) if (T().layers[k] === undefined) T().layers[k] = LAYER_DEF[k];
    $('#layerSeg').innerHTML = `<select id=ctypeSel aria-label="Chart type">${Object.keys(CTYPES).map(k => `<option value="${k}" ${k === (T().ctype || 'candles') ? 'selected' : ''}>${CTYPES[k]}</option>`).join('')}</select>
      <button class="btn sm" id=indBtn>Indicators (${Object.keys(LAYERS).filter(k => T().layers[k]).length})</button>`;
    if (chart) return;
    const el = $('#chart');
    const tzFmt = t => new Intl.DateTimeFormat('en-US', { timeZone: T().tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t * 1000));
    chart = LightweightCharts.createChart(el, {
      autoSize: true,
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
    chart.timeScale().subscribeVisibleTimeRangeChange(drawOverlay);
    new ResizeObserver(() => drawOverlay()).observe(el);
  }
  $('#symSel').onchange = e => { T().sym = e.target.value; save(); lastDataKey = ''; ensureFeeds(); renderAll(true); };
  $('#tfSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; T().tf = +b.dataset.tf; save(); lastDataKey = ''; initChart(); renderAll(true); };
  $('#layerSeg').onchange = e => { if (e.target.id === 'ctypeSel') { T().ctype = e.target.value; save(); lastDataKey = ''; renderChart(true); } };
  $('#layerSeg').onclick = e => { if (e.target.id !== 'indBtn') return;
    showModal(`<h3>Indicators</h3><div class=form>${Object.keys(LAYERS).map(k => `<label class=chk><input type=checkbox data-lay="${k}" ${T().layers[k] ? 'checked' : ''}> ${esc(LAYERS[k])}</label>`).join('')}</div><div class=row style="margin-top:10px"><button class="btn pri" data-close>Done</button></div>`);
    document.querySelectorAll('[data-lay]').forEach(x => x.onchange = () => { T().layers[x.dataset.lay] = x.checked; save(); initChart(); lastDataKey = ''; renderChart(true); }); };

  // Full screen: real fullscreen where supported, CSS fill on iPhone.
  const wrap = $('#chartWrap');
  function enterFs() {
    wrap.classList.add('fs');
    const r = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
    if (r) { try { const p = r.call(wrap); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { }); } catch (e) { }
    setTimeout(drawOverlay, 300);
  }
  function exitFs() {
    wrap.classList.remove('fs');
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => { });
    setTimeout(drawOverlay, 300);
  }
  $('#fsBtn').onclick = enterFs; $('#fsExit').onclick = exitFs;
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) wrap.classList.remove('fs'); setTimeout(drawOverlay, 200); });
  document.addEventListener('keydown', e => { if (e.key === 'f' && tab === 'chart' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) wrap.classList.contains('fs') ? exitFs() : enterFs(); });

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
    const L = T().layers;
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
    if (!full) return;
    const ca = F.candleAge(sym, tf);
    if (ca != null && ca > 120 && !F.demo && (!renderChart.lastReload || Date.now() - renderChart.lastReload > 60000)) { renderChart.lastReload = Date.now(); F.reloadSeries(sym, tf); }
    const A = curA = analyze(sym);
    // price lines
    priceLines.forEach(l => series.removePriceLine(l)); priceLines = [];
    const L = T().layers;
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
      pl(p.entry, `${p.side} entry`, PAL.entry, 0, 2);
      if (p.stop != null) pl(p.stop, 'stop', '#ff4d4d', 0, 2);   // stops stay red in every theme
      if (p.tp1 != null) pl(p.tp1, 'TP1', PAL.tp, 0, 1);
      if (p.tp2 != null) pl(p.tp2, 'TP2', PAL.tp, 1, 1);
    }
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
    if (T().layers.fvg && curA.fvg[tf]) for (const f of curA.fvg[tf]) box(f.time, f.top, f.bottom, f.dir === 'bull' ? PAL.upFill : PAL.dnFill);
    if (T().layers.sessions) for (const k of ['asia', 'london', 'nyam', 'nypm']) {
      const s = curA.sessions[k]; if (!s) continue;
      const x0 = x(s.from), x1 = x(s.to), y1 = y(s.high), y2 = y(s.low); if (y1 == null || !x1) continue;
      g.strokeStyle = PAL.session; g.setLineDash([3, 3]); g.strokeRect(x0, y1, Math.max(2, x1 - x0), y2 - y1); g.setLineDash([]);
      g.fillStyle = PAL.mu; g.font = '10px ' + (PAL.mode === 'pip' ? 'monospace' : 'sans-serif'); g.fillText(s.name, x0 + 2, y1 - 3);
    }
    if (T().layers.orb && curA.orb) { const o = curA.orb; box(o.from, o.high, o.low, PAL.upFill, PAL.orb); }
    // Impulse legs on this timeframe: the leg, its fib lines from the leg's end to the right edge, OTE (0.618-0.786) shaded.
    if (T().layers.fib && curA.impulse && curA.impulse[tf]) for (const L of curA.impulse[tf]) {
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
      <p class="small mu">Prop's own price isn't public. Type the ${esc(sym)} price your prop platform shows the moment you see it; the app learns the gap (median of your last 5, kept 7 days). bp = 0.01%.</p>`;
    $('#calOk').onclick = () => {
      const v = num($('#calIn').value), qq = pnlQuote(sym);
      if (!(v > 0) || qq.raw == null) { alert(qq.raw == null ? 'Need the live mark and USDT price first.' : 'Type the price your prop platform shows.'); return; }
      if (Math.abs(v / qq.raw - 1) > 0.01) { alert('That is more than 1% from the estimate. Check the coin and try again.'); return; }
      S.calib.push({ t: Date.now(), sym, prop: v, est: qq.raw }); S.calib = S.calib.slice(-50); save(); renderAll(true);
    };
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
    $('#biasBox').innerHTML = `<table><tr><th>TF</th><th>Bias</th><th>Swings</th><th>Last break</th></tr>${rows}</table>
      <p class=small>${sum}</p><p class="small mu">Bias = last close through a confirmed swing (2 candles each side). BOS = with the trend, CHoCH = flip. Mechanical, not a prediction.</p>`;
    const lv = A.levels.slice().sort((a, b) => b.price - a.price);
    $('#levelBox').innerHTML = p == null ? '<p class=mu>Waiting for price…</p>' : `<table>${lv.map(l => `<tr><td>${esc(l.name)}</td><td class=num>${px(l.price)}</td><td class="num ${cls(l.price - p)}">${((l.price - p) / p * 100).toFixed(2)}%</td></tr>`).join('')}</table>
      ${A.orb ? `<p class=small>ORB (${T().orbAnchor === 'ny' ? '9:30 NY' : T().orbAnchor === 'kraken' ? '00:30 UTC' : '00:00 UTC'}, ${T().orbMin}m): ${px(A.orb.low)}–${px(A.orb.high)} · ${A.orb.complete ? (A.orb.breakout ? `broke <b class="${A.orb.breakout.dir === 'up' ? 'bull' : 'bear'}">${A.orb.breakout.dir}</b> at ${fmtTime(A.orb.breakout.time * 1000)}` : 'no breakout close yet') : 'still forming'}</p>` : ''}`;
    const fv = [];
    for (const iv of [15, 60, 240]) for (const g of (A.fvg[iv] || [])) fv.push(Object.assign({ iv }, g));
    fv.sort((a, b) => Math.abs((a.top + a.bottom) / 2 - p) - Math.abs((b.top + b.bottom) / 2 - p));
    $('#fvgBox').innerHTML = fv.length ? `<table><tr><th>TF</th><th>Side</th><th class=num>Zone</th><th>State</th></tr>${fv.slice(0, 8).map(g => `<tr><td>${C.tfName(g.iv)}</td><td class="${g.dir}">${g.dir}</td><td class=num>${px(g.bottom)}–${px(g.top)}</td><td class=small>${g.status}</td></tr>`).join('')}</table>
      <p class="small mu">FVG = 3-candle gap ≥0.15 ATR, closed candles only. Filled ones are dropped.</p>` : '<p class=mu>None open near price (or still loading).</p>';
    const ups = C.sortLive(C.scanSetups(A.sym, A, Date.now()), liveOf, fitsNow);
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
      <p class="small mu">Impulse = ≥3× ATR, mostly one-way (≥50% efficiency), ≤60 bars, broke the last swing. * = end not confirmed yet (may extend). Leg disappears if price trades back through its start. Volume (Kraken only): × = vs the median of the 20 bars before; continuation signs = heavy leg + light pullback; reversal warning = pullback as heavy as the leg, or a 2×+ bar closing against it near the turn. Untested: fib and volume reads are not backtested.</p>`
      : '<p class=mu>No clean impulse leg on 15m / 1h / 4h right now.</p>';
  }
  let lastUps = [], chartMem = {}, scanMem = {};
  // ---------- Scan all coins: the full model on every coin (FVG + sweeps, both ways, alert grade, traits, profile) ----------
  let scanAll = { at: 0, running: false, rows: [], errors: [] };
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
    renderScanAll();
  }
  function renderScanAll() {
    const box = $('#scanAllBox'); if (!box) return;
    const sa = scanAll; sa.rows = C.sortLive(sa.rows, liveOf, fitsNow); const top = sa.rows.slice(0, 12), chosen = T().alertTraits || [];
    const head = `<div class=row style="margin-bottom:6px"><button class="btn sm pri" id=scanAllGo ${sa.running ? 'disabled' : ''}>${sa.running ? 'Scanning…' : 'Scan all coins now'}</button>
      <span class="small mu">${sa.at ? 'Last scan ' + fmtTime(sa.at, true) + ' · ' + sa.rows.length + ' setups on ' + esc(T().symbols.join(', ')) + ' · ' + sa.rows.filter(r => r.ready).length + ' ready · ' + sa.rows.filter(r => r.grade.ok && r.ready).length + ' alert grade' : 'Runs when the app opens and every 5 minutes while it is open.'}</span></div>`;
    const sb = C.rankBoard(sa.rows, scanMem, Date.now()); scanMem = sb.mem;
    const shown = sb.rows.filter(r => r.gone || r.rank <= 12);
    const body = shown.length ? shown.map(r => r.gone ? goneCard(r) : setupCard('scan', r.rank - 1, r.u, ` <button class="btn sm" data-saweigh="${r.rank - 1}">Weigh</button><div class=small data-saout="${r.rank - 1}"></div>`, r)).join('')
      : (sa.at ? '<p class=mu>No setups on any coin right now. No trade is a valid answer.</p>' : '');
    box.innerHTML = head + body + (sa.errors.length ? `<p class="small warn">${esc(sa.errors.join(' · '))}</p>` : '') +
      '<p class="small mu">Sorted: ready first, then alert grade, then best R. Same model as the 24/7 monitor and the replay test, which found no proven edge yet: use these as a watchlist and for paper trades.</p>';
  }
  $('#scanAllBox').addEventListener('click', e => {
    if (e.target.id === 'scanAllGo') { runScanAll(true); return; }
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
  function savePaper(why) { save(); clearTimeout(paperPushTimer); paperPushTimer = setTimeout(async () => { const r = await pushFile('monitor/paper.json', { v: 2, updated: Date.now(), accounts: S.paperAccts, trades: S.paper }, 'paper trades: ' + why); paperMsg = r.ok ? 'Saved to your repo ' + fmtTime(Date.now(), true) : (ghToken() ? 'Not saved to the repo yet (' + (r.msg || 'offline') + ')' : 'Kept on this phone (add the 24/7 monitor key in Settings to save it to your repo)'); if (tab === 'paper') renderPaper(); }, 4000); }
  function paperMeta(u) {
    const m = { alertGrade: C.alertGrade(u).ok, rr: u.rr != null ? +u.rr.toFixed(2) : null, rvol: u.rvol != null ? +u.rvol.toFixed(2) : null, open: u.open || null, withTrend: u.withTrend != null ? u.withTrend : null };
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
    t.setupKey = u.key; t.model = C.MODEL; S.paper.push(t); markUsed(u.key, 'paper'); savePaper('open ' + u.sym + ' ' + u.dir); switchTab('paper');
  }
  function paperTick() {
    let changed = false;
    S.paper = S.paper.map(t => { if (t.status !== 'open' && t.status !== 'pending') return t; const u = C.paperStep(t, F.candles(t.sym, 15), 900, pnlPrice(t.sym), Date.now()); if (u.status !== t.status) changed = true; return u; });
    if (changed) { savePaper('closed by price'); if (T().notify) for (const t of S.paper.filter(t => t.status === 'closed' && t.closed > Date.now() - 60e3)) ntSend(`Paper ${t.sym} ${t.side}: ${t.why}`, `${t.R >= 0 ? '+' : ''}${t.R.toFixed(2)}R after fees. Paper only.`, 2); }
    if (tab === 'paper') renderPaper();
  }
  setInterval(() => { try { paperTick(); } catch (e) { console.warn(e); } }, 15000);
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
      <div class=kv><div><span>Equity</span><b class="${st.equity >= a.size ? 'up' : 'dn'}">${usd(st.equity)}</b></div><div><span>P&amp;L</span><b class="${st.equity >= a.size ? 'up' : 'dn'}">${usd(st.equity - a.size)}</b></div>
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
  function setupCard(list, i, u, extra, rk) {
    const g = C.alertGrade(u), lc = liveOf(u), op = { type: lc.order, entry: lc.entry }, ent = lc.entry, rr = lc.rr, fit = fitOf(u, ent), q = fit && fit.qty ? fit.qty : null;
    return `<div class=sc><div class=sc-h>${rk ? `<b class=rank>#${rk.rank}</b>${rk.move ? `<span class="${rk.move > 0 ? 'up' : 'dn'}" title="Moved ${rk.move > 0 ? 'up' : 'down'} ${Math.abs(rk.move)} in the last 10 min">${rk.move > 0 ? '↑' : '↓'}${Math.abs(rk.move)}</span>` : ''} ` : ''}<b class="${u.dir === 'long' ? 'bull' : 'bear'}">${u.dir.toUpperCase()}</b> <b>${esc(C.base(u.sym))}</b> <span>${u.kind === 'sweep' ? 'Sweep' : 'FVG'} ${esc(C.tfName(u.tf))}</span>${rr != null ? ` <span class="${rr >= 2 ? 'up' : rr >= 1 ? '' : 'dn'}" title="Reward:risk from this entry, stop and target, after fees">· ${rr.toFixed(1)}R</span>` : ''}</div>
      <div class=sc-t>${lc.status === 'valid' ? '<span class="tag up">✓ valid now</span>' : lc.status === 'invalid' ? '<span class="tag dn">✗ not valid now</span>' : `<span class="tag warn">partly valid ${lc.passed}/${lc.total}</span>`}<span class="tag ${g.ok ? 'up' : 'mu'}" title="From the replay on past candles">replay: ${g.ok ? 'alert grade' : 'below grade'}</span>${setupBadge(u.kind, u.tf)}</div>
      ${fit ? `<div class="small ${fit.ok ? 'up' : 'warn'}" style="margin-top:4px">${fit.ok ? `Fits ${esc(acctName(fit.acct.id))}: risks ${usd(fit.risk)} of ${usd(fit.room)} room` : `${esc(acctName(fit.acct.id))} says not now: ${esc(fit.why.join(', ') || 'size 0')}`}</div>` : '<div class="small mu" style="margin-top:4px">Add your prop account on the Desk to size setups.</div>'}
      ${priceBoxes([[op.type === 'market' ? 'Market ~' : op.type === 'none' ? 'Past stop' : 'Limit', op.type === 'none' ? '' : cpVal(ent)], ['Stop', cpVal(u.stop)], ['Target', cpVal(u.target)], ['Size', q != null ? String(q) : '', q != null ? String(+q.toPrecision(4)) : null]])}
      <div class=sc-a>${lc.status === 'invalid' && !useOf(u) ? '<span class="small dn">Not valid now: price is past the stop or under 1R after fees. Skip it.</span>' : setupActions(list, i, u)}${extra || ''} <button class="btn sm" data-copy="${esc(`${u.sym} ${u.dir} · ${op.type === 'market' ? 'market ~' : 'limit'} ${cpVal(ent)} · stop ${cpVal(u.stop)}${u.target != null ? ' · target ' + cpVal(u.target) : ''}${q != null ? ' · size ' + q : ''}`)}">Copy all</button></div>
      <details class=sc-w ${fold('why:' + u.key)}><summary>Why</summary><div>${esc(u.text)}</div><div><b>Live check now:</b> ${lc.items.map(r => `<span class="${r.ok ? 'up' : 'warn'}">${r.ok ? '✓' : '✗'} ${esc(r.t)}</span>`).join(' · ')}</div>${!g.ok && g.why.length ? `<div class=mu>Below alert grade: ${esc(g.why.join('; '))}</div>` : ''}</details></div>`;
  }
  // A setup the scanner no longer finds: kept at the bottom, greyed, with why (as far as the price now tells) and when last seen.
  function goneCard(r) {
    const u = r.u, lc = liveOf(u), px0 = pnlPrice(u.sym), d = u.dir === 'short' ? -1 : 1;
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
    if (b.hasAttribute('data-goplanned')) { switchTab('pos'); setTimeout(() => { const el = $('#posPlanned'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 50); return; }
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
      S.planned.push({ id: uid(), acct: $('#tlA').value, sym: u.sym, side: u.dir, entry: e0, stop: st, tp1: num($('#tlT').value), qty: q, tf: u.tf,
        setup: u.kind === 'sweep' ? 'Liquidity sweep' : 'FVG', thesis: $('#tlTh').value.trim(), ref: { key: C.setupKey(u.kind, u.tf), model: C.MODEL }, setupKey: u.key, created: Date.now(), fromPaper: fromPaper ? fromPaper.id : undefined, orderType: $('#tlType').value });
      markUsed(u.key, 'planned', $('#tlA').value); save(); closeModal(); switchTab('pos');
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
      ref: pl.ref, setupKey: pl.setupKey, tag: 'plan', source: o.source || 'plan' };
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
      <p class="small mu">Planned only: counts nothing. Working (placed): counts in your risk and margin like Kraken reserves it, but not in equity or P&amp;L until it fills. A working limit turns into an open position by itself when price reaches it (checked against the candles since you placed it, even after the app was closed). Importing a screenshot that shows the position does it too.</p></div>`;
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
  setInterval(() => { try { plannedTick(); } catch (e) { console.warn(e); } }, 15000); setTimeout(() => { try { plannedTick(); } catch (e) { } }, 8000);
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
  let POOL = null, poolAt = 0;
  async function loadPool() {
    if (F.demo || Date.now() - poolAt < 10 * 60e3) return; poolAt = Date.now();
    try { const r = await fetch(POOL_URL); if (r.ok) { POOL = (await r.json()).models || null; if (tab === 'paper') renderPaper(); } } catch (e) { }
  }
  const scoreMark = key => (S.scoreAccepted || {})[key];   // 'trusted' | 'benched' | undefined
  const benchedKeys = () => Object.entries(S.scoreAccepted || {}).filter(([, v]) => v === 'benched').map(([k]) => k);
  function setupBadge(kind, tf) { const m = scoreMark(C.setupKey(kind, tf)); return m === 'trusted' ? '<span class="tag up" title="Proven on your trades (you accepted it)">★ trusted</span> ' : m === 'benched' ? '<span class="tag dn" title="Benched by you: no phone alerts">benched</span> ' : ''; }
  function sendResults() {
    if (F.demo || T().shareResults === false) return;
    let sent; try { sent = JSON.parse(localStorage.getItem(RESULT_KEY)) || []; } catch (e) { sent = []; }
    const todo = C.tradeRecords(S.paper, S.positions).filter(r => r.key !== 'unlinked').map(r => C.resultPayload(r, FEEDBACK_PUBLIC ? 'public' : 'private')).filter(b => !sent.includes(b.id)).slice(0, 10);
    for (const b of todo) fetch(RESULT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b), keepalive: true })
      .then(x => x.json()).then(j => { if (j && j.ok) { sent.push(b.id); try { localStorage.setItem(RESULT_KEY, JSON.stringify(sent.slice(-3000))); } catch (e) { } } }).catch(() => { });
  }
  setTimeout(() => { try { sendResults(); } catch (e) { } }, 20000); setInterval(() => { try { sendResults(); } catch (e) { } }, 10 * 60e3);
  function scorecardHtml() {
    loadPool();
    const recs = C.tradeRecords(S.paper, S.positions), sc = C.scorecard(recs, { replay: C.replayByKey(BT), pool: POOL || {} }), pat = C.tradePatterns(recs.filter(r => r.model === sc.model));
    const r = x => x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2) + 'R', cl = x => x > 0 ? 'up' : x < 0 ? 'dn' : '';
    const cell = st => st && st.n ? `<span class="${cl(st.avg)}">${r(st.avg)}</span><div class="small mu">${st.n} · ${Math.round(st.win * 100)}% win${st.lo != null ? ` · ${r(st.lo)} to ${r(st.hi)}` : ''}</div>` : '<span class=mu>—</span>';
    const label = { proven: '<b class=up>proven</b>', disproven: '<b class=dn>disproven</b>', 'below replay': '<b class=warn>below replay</b>', unclear: 'unclear', gathering: '<span class=mu>gathering</span>' };
    const suggest = row => { const want = row.status === 'proven' ? 'trusted' : (row.status === 'disproven' || row.status === 'below replay') ? 'benched' : null, have = scoreMark(row.key);
      if (want && want !== have) return `<div class=small>Suggested: <b>${want === 'trusted' ? '★ trust it' : 'bench it'}</b> <button class="btn sm" data-score="${esc(row.key)}" data-to="${want}">Accept</button></div>`;
      return have ? `<div class=small>${have === 'trusted' ? '★ trusted' : 'benched'} <button class="btn sm" data-score="${esc(row.key)}" data-to="">Undo</button></div>` : ''; };
    const rows = sc.rows.map(x => `<tr><td><b>${esc(x.label)}</b><div class=small>${label[x.status]}${x.status === 'gathering' ? ` (${x.forward.n || 0}/${C.SCORE_RULES.minN})` : ''}</div>${suggest(x)}</td>
      <td class=num>${x.replay ? `<span class="${cl(x.replay.avgR)}">${r(x.replay.avgR)}</span><div class="small mu">${x.replay.n}</div>` : '<span class=mu>—</span>'}</td>
      <td class=num>${cell(x.paper)}</td><td class=num>${cell(x.live)}</td><td class=num>${cell(x.pool)}</td></tr>`).join('');
    const tagRows = Object.entries(pat.byTag).map(([k, st]) => `<tr><td>${esc(C.TRADE_TAGS[k].split(' (')[0])}</td><td class=num>${cell(st)}</td></tr>`).join('');
    const sesRows = Object.entries(pat.bySession).map(([k, st]) => `<tr><td>${esc(k)}</td><td class=num>${cell(st)}</td></tr>`).join('');
    return `<div class=card><h3>Scorecard <span class=tag>model ${esc(sc.model)} · learns from every closed trade</span></h3>
      <p class=small>Each setup type is judged by your closed paper trades and live trades tagged "followed plan" (in R, after fees), next to the replay on past candles and <b>everyone's</b> results (both apps, self-reported). Mistakes, rule breaks and data problems never count against a setup.</p>
      ${rows ? `<table><tr><th>Setup</th><th class=num>Replay</th><th class=num>Your paper</th><th class=num>Your live</th><th class=num>Everyone</th></tr>${rows}</table>` : '<p class=mu>No closed trades under this model yet. Paper trade the setups, or plan live trades with "Plan it", and they show up here.</p>'}
      ${sc.unlinked ? `<p class="small warn">${sc.unlinked} closed live trade(s) aren't linked to a setup: pick one in Positions → Closed (journal).</p>` : ''}
      <details ${fold('sc:how')}><summary class=small><b>How it decides</b> (rules fixed Nov 1, 2026, before any results)</summary><p class=small>Under ${C.SCORE_RULES.minN} trades: <b>gathering</b>, too few to tell. With ${C.SCORE_RULES.minN}+: <b>proven</b> if the whole 95% range of the average R is above 0; <b>disproven</b> if it's all below 0; <b>below replay</b> if it's all below the replay's average (execution or the edge fading); otherwise <b>unclear</b>. A change is only a suggestion: you accept it. ★ trusted setups are marked and listed first; benched ones stop sending phone alerts. Nothing here ever changes your size. When the model's rules change it gets a new version (now ${esc(sc.model)}), and its record starts fresh so old and new rules never mix.</p></details>
      ${tagRows || sesRows ? `<details ${fold('sc:patterns')}><summary class=small><b>Your patterns</b></summary><table><tr><th>Live trades by tag</th><th class=num>Result</th></tr>${tagRows || '<tr><td colspan=2 class=mu>No live trades yet.</td></tr>'}</table>
        <table style="margin-top:6px"><tr><th>All trades by session (NY time)</th><th class=num>Result</th></tr>${sesRows}</table>
        <p class=small>Trades opened within 4h after a losing trade: ${cell(pat.afterLoss)}</p></details>` : ''}
      ${(L => L.length ? `<details ${fold('sc:lessons')}><summary class=small><b>Lessons from closed trades</b> (the Coach's findings + your tags)</summary><table><tr><th>What went wrong</th><th class=num>Trades</th><th class=num>Avg R</th></tr>${L.map(x => `<tr><td>${esc(x.label)}</td><td class=num>${x.n} of ${x.of}</td><td class="num ${x.avgR > 0 ? 'up' : x.avgR < 0 ? 'dn' : ''}">${x.avgR == null ? '—' : r(x.avgR)}</td></tr>`).join('')}</table><p class="small mu">Counted, never acted on by itself. When one keeps showing up (e.g. stops inside normal noise), that's the evidence to change a rule; a change gets a new model version and its own record.</p></details>` : '')(C.lessons(S.positions))}
      <details ${fold('sc:models')}><summary class=small><b>Model versions</b></summary><table>${C.MODELS.slice().reverse().map(m => `<tr><td><b>${m.id}</b></td><td class=small>${m.from ? new Date(m.from).toISOString().slice(0, 10) : '—'}</td><td class=small>${esc(m.note)}</td></tr>`).join('')}</table></details></div>`;
  }
  function renderPaper() {
    const box = $('#paperBox'); if (!box) return;
    const open = S.paper.filter(t => t.status === 'open' || t.status === 'pending'), closed = S.paper.filter(t => t.status === 'closed').sort((a, b) => b.closed - a.closed), st = C.paperStats(S.paper);
    const r = x => x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2) + 'R', cls = x => x > 0 ? 'up' : x < 0 ? 'dn' : '';
    const srows = Object.entries(st).map(([k, x]) => `<tr><td>${esc(k)}</td><td class=num>${x.n}</td><td class=num>${x.win == null ? '—' : Math.round(x.win * 100) + '%'}</td><td class="num ${cls(x.avgR)}">${r(x.avgR)}</td><td class="num ${cls(x.totalR)}">${r(x.totalR)}</td></tr>`).join('');
    box.innerHTML = scorecardHtml() + `<div class=card><h3>Paper trading <span class=tag>no money, builds the record</span></h3>
      <p class=small>Add setups from the Chart tab ("Setups to watch") or the Coach ("Other setups"). Each one opens at the live price, then closes by itself at its stop or target, checked against the candles even while the app is closed (a candle touching both counts as the stop). Results are in R after fees and swap, the same rules as the replay test.</p>
      ${paperAcctCard()}
      <p class="small mu">${esc(paperMsg || (ghToken() ? 'Saved to monitor/paper.json in your repo.' : 'Kept on this phone. Add the 24/7 monitor key in Settings to also save it to your repo.'))}</p></div>
      <div class=card><h3>Open (${open.length})</h3>${open.length ? `<table><tr><th>Trade</th><th class=num>Entry</th><th class=num>Stop</th><th class=num>Target</th><th class=num>Now</th><th></th></tr>${open.map(t => `<tr><td class=small><b class="${t.side === 'long' ? 'bull' : 'bear'}">${esc(t.sym)} ${t.side}</b> ${esc(t.kind)} ${esc(t.tf ? C.tfName(t.tf) : '')}${t.status === 'pending' ? ` <span class="tag warn">limit waiting @ ${px(t.entry)}</span>` : t.order === 'limit' ? ' <span class=tag>limit filled</span>' : t.order === 'market' ? ' <span class=tag>market</span>' : ''}${t.meta && t.meta.alertGrade ? ' <span class="tag up">alert grade</span>' : ''}<div class=mu>${t.status === 'pending' ? 'placed ' + fmtTime(t.placedAt, true) : fmtTime(t.opened, true)}</div></td>
        <td class=num>${px(t.entry)}</td><td class=num>${px(t.stop)}</td><td class=num>${t.target != null ? px(t.target) : '—'}</td><td class="num ${cls(t.openR)}">${t.status === 'pending' ? `<span class=mu>waiting</span><div class=small>${(p0 => p0 != null ? px(p0) + ' now' : '')(pnlPrice(t.sym))}</div>` : r(t.openR)}${t.status === 'pending' ? '' : t.qty ? `<div class=small>${usd(C.netIfClosed({ side: t.side, entry: t.entry, qty: t.qty, opened: t.opened, partials: [] }, pnlPrice(t.sym) || t.entry, Date.now()))} net</div>` : '<div class="small mu">R only</div>'}</td>
        <td>${(use => use && (use.state === 'planned' || use.state === 'live') ? `<span class="tag ${use.state === 'live' ? 'up' : 'warn'}">${use.state === 'live' ? '✅ Live' : '⏳ Planned'}${use.acct && acctName(use.acct) ? ' · ' + esc(acctName(use.acct)) : ''}</span> ` : `<button class="btn sm pri" data-pp="live" data-id="${esc(t.id)}">Take it live</button> `)(t.setupKey ? C.setupUse(t.setupKey, S.paper, S.positions, S.planned, S.usedSetups) : null)}<button class="btn sm" data-pp="edit" data-id="${esc(t.id)}">Edit</button> <button class="btn sm" data-pp="close" data-id="${esc(t.id)}">Close</button></td></tr>`).join('')}</table>` : '<p class=mu>None. Add one from the setups lists.</p>'}</div>
      <div class=card><h3>Record</h3>${srows ? `<table><tr><th>Group</th><th class=num>n</th><th class=num>Win</th><th class=num>Avg</th><th class=num>Total</th></tr>${srows}</table><p class="small mu">Small samples mean little: 20+ trades per group before reading anything into it.</p>` : '<p class=mu>No closed paper trades yet.</p>'}</div>
      <div class=card><h3>Closed (${closed.length})</h3>${closed.length ? `<table><tr><th>Trade</th><th>Exit</th><th class=num>R</th><th class=num>Best / worst</th></tr>${closed.slice(0, 40).map(t => `<tr><td class=small><b class="${t.side === 'long' ? 'bull' : 'bear'}">${esc(t.sym)} ${t.side}</b> ${esc(t.kind)} ${esc(t.tf ? C.tfName(t.tf) : '')}<div class=mu>${fmtTime(t.opened, true)} → ${fmtTime(t.closed, true)}</div></td><td class=small>${esc(t.why)} @ ${px(t.exit)}</td><td class="num ${cls(t.R)}">${r(t.R)}${t.qty ? `<div class=small>${usd(C.paperPositions([Object.assign({}, t, { acct: 'x' })], 'x')[0].closed.realized)}</div>` : ''}</td><td class="num small">+${(t.mfe || 0).toFixed(1)} / -${(t.mae || 0).toFixed(1)}</td></tr>`).join('')}</table>` : '<p class=mu>None yet.</p>'}
        <div class=row style="margin-top:8px"><button class="btn sm" data-pp="clear">Delete all paper trades</button></div></div>`;
  }
  $('#paperBox').addEventListener('click', e => {
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
    try { research[sym] = PDResearch.read(sym, iv => F.candles(sym, iv), Date.now(), /coinbase/i.test(F.source) ? 'coinbase' : 'kraken'); } catch (e) { console.warn(e); }
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
      <p class="small mu">Engine v${esc(rd.version)} on closed ${esc(F.demo ? 'DEMO (made-up)' : /coinbase/i.test(F.source) ? 'Coinbase' : 'Kraken')} candles, updated ${fmtTime(rd.at)}. "Forming" is provisional until the candle closes. Each timeframe stands alone; nothing here is averaged into a score.
      * relaxed variant (looser gap rule). Untested: no replay results yet. Flows and liquidation maps are not in this read. Size only through "Weigh it".</p>`;
  }
  $('#setupBox').addEventListener('click', e => { const pb = e.target.closest('[data-paper]'); if (pb) { const u = lastUps[+pb.dataset.paper]; if (u) paperAdd(u); return; }
    const b = e.target.closest('[data-weigh]'); if (!b) return; const u = lastUps[+b.dataset.weigh]; if (!u) return;
    const now = Date.now(), P = prices(), accts = liveAccts();
    const out = accts.map(a => { const A = C.accountState(a, S.positions, P, now, { orders: S.planned }), w = C.weighIdea(u, A, S.positions.filter(p => p.acct === a.id), now, { leverage: C.levMap(a) }), name = esc(a.label || C.planOf(a).name);
      return w.ok && w.size && w.size.qty > 0 ? `<b class=up>${name}: fits</b>, size ${w.size.qty} (${usd(w.size.lossAtStop)} at stop)` : `<b class=warn>${name}: not now</b> (${w.rules.filter(r => !r.ok).map(r => esc(r.t)).join(', ') || 'size 0'})`; });
    $(`[data-weighout="${b.dataset.weigh}"]`).innerHTML = out.join('<br>') || '<span class=mu>Add an account on the Desk first.</span>'; });
  $('#setupBox').addEventListener('click', e => { const b = e.target.closest('[data-plan]'); if (!b) return; posDraft = JSON.parse(b.dataset.plan); $('#manualBox').open = true; switchTab('pos'); });
  function switchTab(t) { document.querySelector(`#tabs button[data-tab="${t}"]`).click(); }

  // ---------- Desk ----------
  function renderDesk() {
    const now = Date.now(), P = prices();
    const D = C.deskTotals(S.accounts, S.positions, P, now, { orders: S.planned });
    const budgetMsg = T().budget ? ` of ${usd(T().budget)}/mo budget` : '';
    const monthCost = S.accounts.filter(a => new Date(a.created).getMonth() === new Date().getMonth() && new Date(a.created).getFullYear() === new Date().getFullYear())
      .reduce((s, a) => s + D.states[a.id].cost, 0);
    $('#deskTotals').innerHTML = [
      ['Open accounts', D.active], ['Capital in play', `${usd(D.capital)}${D.overCap ? ' ⚠' : ''}`, D.overCap ? 'Over the firm\'s $200k combined cap' : `cap ${usd(D.cap)}`],
      ['Live P&L (open)', `<span class="${cls(D.upnl)}">${usd(D.upnl)}</span>`], ['Risk if all stops fill', isFinite(D.riskToStops) ? usd(D.riskToStops) : '<span class=dn>Unlimited</span>', isFinite(D.riskToStops) ? '' : 'a position has no stop'],
      ['Spent on evals', usd(D.cost), `this month ${usd(monthCost)}${budgetMsg}`], ['Payouts received', usd(D.paid)],
      ['Program net', `<span class="${cls(D.net)}">${usd(D.net)}</span>`, 'payouts − all fees']
    ].map(x => `<div class=stat><div class=k>${x[0]}</div><div class=v>${x[1]}</div>${x[2] ? `<div class="k">${x[2]}</div>` : ''}</div>`).join('');
    if (!S.accounts.length) { $('#deskList').innerHTML = '<div class=card><p>No accounts yet. Add your prop evaluation or funded account. Rules default to the official plan values (Advanced: 9% target, 3% daily, 3% max).</p></div>'; return; }
    const order = { eval: 0, funded: 0, passed: 1, breached: 2, closed: 3 };
    $('#deskList').innerHTML = S.accounts.slice().sort((a, b) => order[a.phase] - order[b.phase]).map(a => acctCard(a, D.states[a.id])).join('');
  }
  function acctCard(a, s) {
    const live = a.phase === 'eval' || a.phase === 'funded';
    const ddUsed = (x, floor, startV) => Math.max(0, Math.min(1, 1 - (x - floor) / (startV - floor)));
    const dU = ddUsed(s.equity, s.dailyFloor, s.dayStart), mU = ddUsed(s.equity, s.maxFloor, s.start);
    const barC = u => (u > 0.66 ? 'bar dang' : u > 0.33 ? 'bar risk' : 'bar');
    const prof = C.PROFILES.map(p => `<button data-prof="${p.id}" data-acct="${a.id}" class="${p.id === s.profile.id ? 'on' : ''}" title="${esc(p.note)}">${p.name} ${p.riskPct}%</button>`).join('');
    const wins = s.winsToPass ? [1.5, 2, 3].map(r => `${s.winsToPass(r)} at ${r}R`).join(', ') : '';
    return `<div class=card>
      <div class=acct-head><div><b>${esc(a.label || (s.plan.name + ' ' + usd(a.size)))}</b> <span class=tag>${a.phase}</span> <span class="tag">${s.plan.name}: target ${pct(s.plan.target, 0)}, daily ${pct(s.plan.mdl, 0)}, max ${pct(s.plan.mdd, 0)} static</span></div>
      <div class=row style="margin:0"><button class="btn sm" data-act="reconcile" data-id="${a.id}">Match platform balance</button><button class="btn sm" data-act="edit" data-id="${a.id}">Edit</button><button class="btn sm" data-act="resetday" data-id="${a.id}">Reset my day</button></div></div>
      ${live ? `<div class=kv>
        <div><span>Equity (live, ${esc(pnlQuote(a.sym || T().sym).basis)})</span><b>${usd(s.equity)}</b>${s.priceComplete ? '' : ' <span class=dn small>price missing: valued at stop</span>'}</div>
        <div><span>Balance (closed)</span>${usd(s.balance)}</div>
        ${a.platformEq ? `<div><span>Platform equity (imported ${esc(fmtTime(a.platformEq.t, true))})</span>${usd(a.platformEq.v)}${Date.now() - a.platformEq.t < 15 * 60e3 ? ` <span class="small ${Math.abs(s.equity - a.platformEq.v) > a.size * 0.001 ? 'warn' : 'mu'}">app ${s.equity - a.platformEq.v >= 0 ? '+' : ''}${usd(s.equity - a.platformEq.v)}</span>` : ' <span class="small mu">older than 15 min</span>'}</div>` : ''}
        <div><span>Open P&L</span><b class="${cls(s.upnl)}">${usd(s.upnl)}</b> <span class=small>fees ${usd(-s.feesOpen)}</span></div>
        <div><span>Room to breach (${s.binding} limit)</span><b class="${s.room < s.profRisk * 2 ? 'dn' : ''}">${usd(s.room)}</b> (${pct(s.roomPct)})</div>
        ${a.phase === 'eval' ? `<div><span>To target ${usd(s.targetBal)}</span>${usd(s.toTarget)} · ${pct(Math.max(0, s.progress), 0)} done (on equity)</div>` : `<div><span>Payout available (est.)</span>${usd(s.payoutAvail)}</div>`}
        <div><span>If every stop fills</span>${s.riskKnown ? `<b class="${s.stopsBreach ? 'dn' : ''}">${usd(s.equityIfStopped)}</b>${s.stopsBreach ? ' BREACH' : ''}` : '<b class=dn>Unknown: a position has no stop</b>'}</div>
        <div><span>Exposure / margin used</span>${usd(s.notional)} · ${s.leverage.toFixed(2)}x · margin ${usd(s.usedMargin)} of ${usd(s.equity)}</div>
        <div><span>Today</span>${s.tradesToday} trades · ${s.winsToday} wins · ${s.lossesToday} losses${s.unknownToday ? ` (${s.unknownToday} result unknown)` : ''}</div>
      </div>
      <div class=small>Daily floor ${usd(s.dailyFloor)} (3% of ${usd(s.dayStart)} at 00:30 UTC) · used ${pct(dU, 0)}</div><div class="${barC(dU)}"><i style="width:${dU * 100}%"></i></div>
      <div class=small>Max floor ${usd(s.maxFloor)} (static${a.ddLimit ? ', from platform' : ''}) · used ${pct(mU, 0)}</div><div class="${barC(mU)}"><i style="width:${mU * 100}%"></i></div>
      ${a.phase === 'eval' ? `<div class=small>Target progress</div><div class=bar><i style="width:${Math.max(0, Math.min(1, s.progress)) * 100}%"></i></div>` : ''}
      <div style="margin-top:8px"><div class=small>Risk profile (per trade, % of start)</div><div class=profiles>${prof}</div>
      <p class=small>${esc(s.profile.note)} Per trade <b>${usd(s.profRisk)}</b> · next trade may risk <b>${usd(s.nextRisk)}</b> · about <b>${s.lossesToBreach}</b> losses of room${wins ? ` · wins to pass: ${wins}` : ''} · max ${s.profile.maxTrades} trades/day, stop after ${s.profile.stopAfterLosses} losses.</p></div>
      ${(w => w.length ? `<p class=small>Orders: ${w.map(pl => `${esc(pl.sym)} ${pl.side} ${pl.orderType !== 'market' ? 'limit @ ' + px(pl.entry) : 'market'} ${pl.status === 'placed' ? '<b>working</b> (counts in risk and margin, not equity)' : 'planned only (counts nothing)'}`).join(' · ')}</p>` : '')(S.planned.filter(pl => pl.acct === a.id))}
      ${(m => m.length ? `<div class=warns>${m.map(x => `<div class=warn>Missing: ${esc(x.text)}. Import it in Positions → 📷 Import screenshots.</div>`).join('')}</div>` : '')(C.missingInfo(a, [T().sym]).filter(x => !S.positions.some(p => p.acct === a.id && !p.closed && p.sym === x.sym)))}
      ${s.warnings.length ? `<div class=warns>${s.warnings.map(w => `<div class="${w.lvl}">${esc(w.text)}</div>`).join('')}</div>` : ''}` : `<p class=small>Final balance ${usd(s.balance)}.</p>`}
      <p class="small mu">Cost ${usd(s.cost)} · payouts ${usd(s.paid)} · net ${usd(s.net)} ·
        <a href="#" data-act="cost" data-id="${a.id}">+ cost</a> · <a href="#" data-act="payout" data-id="${a.id}">+ payout</a></p>
    </div>`;
  }
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
  function acctForm(a) {
    const isNew = !a;
    a = a || { id: uid(), plan: 'advanced', size: 5000, fee: 20, addon90: false, phase: 'eval', profile: 'steady', created: Date.now(), label: '' };
    const planOpts = Object.keys(C.PLANS).map(k => `<option value="${k}" ${k === a.plan ? 'selected' : ''}>${k === 'custom' ? 'Other firm (custom rules)' : 'Kraken Prop · ' + C.PLANS[k].name}</option>`).join('');
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
        <div class=small id=afLevNote style="grid-column:1/-1">Leverage: ${a.plan === 'custom' ? 'read from your screenshots (import the order screen that shows it)' : 'matches the venue (Kraken Prop: BTC 10x, ETH/SOL/XRP 5x, HYPE/WLD 3x)'}${a.leverage && Object.keys(a.leverage).length ? '; from your screenshots: ' + Object.entries(a.leverage).map(([k, v]) => esc(k) + ' ' + v + 'x').join(', ') : ''}.</div>
        <label>Started<input id=afDate type=datetime-local value="${new Date(a.created - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"></label>
      </div>
      <p class="small mu">Presets fill in the firm's published rules (Kraken Prop checked Nov 1, 2026). For another firm pick "Other firm" and type its target and loss limits from its rules page.</p>
      ${T().budget ? `<p class="small warn">Monthly eval budget: ${usd(T().budget)}. Only money left after bills, your cushion and your weekly buy.</p>` : ''}
      <div class=row style="margin-top:10px"><button class="btn pri" id=afOk>Save</button><button class=btn data-close>Cancel</button>${isNew ? '' : '<button class="btn bad" id=afDel>Delete</button>'}</div>`);
    const autoFee = () => { const pk = $('#afPlan').value, z = +$('#afSize').value; const base = C.PLANS[pk].price[z]; if (base != null) $('#afFee').value = +(base * ($('#afAdd').checked ? 1 + C.ADDON_90 : 1)).toFixed(2);
      const P = C.PLANS[pk]; $('#afT').value = (P.target * 100).toFixed(2); $('#afL').value = (P.mdl * 100).toFixed(2); $('#afD').value = (P.mdd * 100).toFixed(2); };
    $('#afPlan').onchange = () => { autoFee(); $('#afLevNote').firstChild.textContent = 'Leverage: ' + ($('#afPlan').value === 'custom' ? 'read from your screenshots (import the order screen that shows it)' : 'matches the venue (Kraken Prop: BTC 10x, ETH/SOL/XRP 5x, HYPE/WLD 3x)'); }; $('#afSize').onchange = autoFee; $('#afAdd').onchange = autoFee;
    $('#afOk').onclick = () => {
      a.plan = $('#afPlan').value; a.size = +$('#afSize').value; a.fee = num($('#afFee').value) || 0; a.addon90 = $('#afAdd').checked;
      a.phase = $('#afPhase').value; a.label = $('#afLabel').value.trim();
      const P = C.PLANS[a.plan];
      const tg = C.parseRulePct($('#afT').value, 0.5, 50), ml = C.parseRulePct($('#afL').value, 0.5, 20), md = C.parseRulePct($('#afD').value, 0.5, 20);
      const bad = [['Target', tg], ['Daily loss', ml], ['Max drawdown', md]].filter(x => x[1].error);
      if (bad.length) { alert(bad.map(x => `${x[0]} ${x[1].error}. Leave it blank to use the plan default.`).join('\n')); return; }
      const keep = (r, d) => (r.value == null || Math.abs(r.value - d) < 1e-9 ? undefined : r.value);
      a.target = keep(tg, P.target); a.mdl = keep(ml, P.mdl); a.mdd = keep(md, P.mdd);
      const rm = C.parseResetUtc($('#afReset').value || '00:30'); if (rm == null) { alert('Daily reset must be HH:MM in UTC, like 00:30 or 22:00.'); return; }
      a.resetMin = rm === 30 ? undefined : rm;
      const d = Date.parse($('#afDate').value); if (!isNaN(d)) a.created = d;
      if (isNew) S.accounts.push(a);
      const cap = liveAccts().reduce((s, x) => s + x.size, 0);
      save(); closeModal(); renderAll(true);
      if (cap > C.CAPITAL_CAP) alert(`Heads up: ${usd(cap)} across open accounts is over the firm's $200,000 combined limit.`);
    };
    if (!isNew) $('#afDel').onclick = () => { if (confirm('Delete this account and its logged positions?')) { S.accounts = S.accounts.filter(x => x.id !== a.id); S.positions = S.positions.filter(p => p.acct !== a.id); save(); closeModal(); renderAll(true); } };
  }

  // ---------- Positions ----------
  let posDraft = null, posFormDirty = true;
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
        <div class=kv><div><span>Price</span>${px(price)}</div><div><span>Net P&L if closed now</span><b class="${cls(net)}">${usd(net)}</b></div><div><span>R now</span>${r == null ? '—' : r.toFixed(2) + 'R'}</div><div><span>Planned R:R (after fees)</span>${(x => x == null ? '—' : x.toFixed(2) + 'R')(C.rrOf(p.side, p.entry, p.origStop != null ? p.origStop : p.stop, p.tp1 != null ? p.tp1 : p.tp2))}</div>
        <div><span>Stop</span>${px(p.stop)}${p.origStop != null && p.stop !== p.origStop ? ` <span class=small>(was ${px(p.origStop)})</span>` : ''}</div><div><span>TP1 / TP2</span>${px(p.tp1)} / ${px(p.tp2)}</div><div><span>Opened</span>${fmtTime(p.opened, true)}</div></div>
        ${p.thesis ? `<p class=small>Thesis: ${esc(p.thesis)}</p>` : ''}
        <div class=row><button class="btn sm" data-pa="stop" data-id="${p.id}">Update stop/targets</button><button class="btn sm" data-pa="partial" data-id="${p.id}">Partial close</button><button class="btn sm" data-pa="close" data-id="${p.id}">Close</button><button class="btn sm" data-pa="del" data-id="${p.id}">Delete</button></div></div>`;
    }).join('') : '<p class=mu>No open positions logged.</p>');
    const closed = S.positions.filter(p => p.closed).sort((a, b) => b.closed.t - a.closed.t).slice(0, 50);
    const wk = Date.now() - 7 * 864e5, recent = S.positions.filter(p => p.closed && p.closed.t > wk);
    const resets = S.accounts.flatMap(a => (a.dayLog || []).filter(d => d.t > wk));
    const cnt = k => recent.filter(p => (p.tag || 'plan') === k).length;
    const oc = k => recent.filter(p => C.tradeOutcome(p) === k).length;
    const stats = `<p class=small>Last 7 days: <b class=up>${oc('win')}</b> wins · <b class=dn>${oc('loss')}</b> losses · ${oc('even')} breakeven${oc('unknown') ? ` · <b class=warn>${oc('unknown')} result unknown</b>` : ''} (win = net after fees above $0)<br><b class=up>${cnt('plan')}</b> followed plan · <b class=warn>${cnt('mistake')}</b> mistakes · <b class=dn>${cnt('rulebreak')}</b> rule breaks · ${cnt('data')} data problems · day resets: ${resets.filter(d => d.kind === 'mistake').length} accident/technical, <b class=dn>${resets.filter(d => d.kind === 'rulebreak').length}</b> rule break</p>`;
    $('#posClosed').innerHTML = stats + (closed.length ? `<table><tr><th>Closed</th><th>Trade</th><th class=num>Net</th><th>Setup · tag</th></tr>${closed.map(p => {
      const tot = C.realizedOfPos(p), known = !p.closed.synced || p.closed.resultKnown;
      return `<tr><td class=small>${fmtTime(p.closed.t, true)}</td><td>${esc(p.sym)} ${p.side} ${p.qty} @ ${px(p.entry)}${p.closed.price ? ' → ' + px(p.closed.price) : ''}<div class=small>${esc(p.closed.note || '')}${p.widened ? ' <span class=warn>stop widened</span>' : ''}${p.tagNote ? ' <span class=dn>' + esc(p.tagNote) + '</span>' : ''}</div></td>
        <td class="num ${cls(tot)}">${(o => o === 'unknown' ? `— <div><button class="btn sm" data-res="${p.id}">Enter result</button></div>` : `${usd(tot)}<div class=small><b class="${o === 'win' ? 'up' : o === 'loss' ? 'dn' : ''}">${o === 'win' ? 'Win' : o === 'loss' ? 'Loss' : 'Breakeven'}</b>${(r => r == null ? '' : ' · ' + (r >= 0 ? '+' : '') + r.toFixed(2) + 'R')(C.liveR(p))}</div>`)(C.tradeOutcome(p))}</td><td><select data-setup="${p.id}" aria-label="Setup">${C.SETUP_CHOICES.map(([k, l]) => `<option value="${k}" ${k === (p.ref && p.ref.key ? p.ref.key : C.setupKey(p.setup, p.tf)) ? 'selected' : ''}>${l}</option>`).join('')}</select><select data-tag="${p.id}" aria-label="Tag">${Object.keys(C.TRADE_TAGS).map(k => `<option value="${k}" ${k === (p.tag || 'plan') ? 'selected' : ''}>${C.TRADE_TAGS[k].split(' (')[0]}</option>`).join('')}</select></td></tr>
        <tr><td colspan=4 style="padding-top:0">${historyFold(p)}</td></tr>`;
    }).join('')}</table>` : '<p class=mu>Nothing closed yet.</p>');
    const dl = S.accounts.flatMap(a => (a.dayLog || []).map(d => Object.assign({ acct: a.label || C.planOf(a).name }, d))).sort((x, y) => y.t - x.t).slice(0, 10);
    if (dl.length) $('#posClosed').innerHTML += `<h3 style="margin-top:12px">Day resets</h3><table>${dl.map(d => `<tr><td class=small>${fmtTime(d.t, true)}</td><td>${esc(d.acct)}</td><td class="${d.kind === 'rulebreak' ? 'dn' : 'warn'}">${d.kind === 'rulebreak' ? 'Rule break' : 'Accident / technical'}</td><td class=small>${d.trades} trades, ${d.losses} losses${d.note ? ' · ' + esc(d.note) : ''}</td></tr>`).join('')}</table>`;
  }
  $('#posClosed').addEventListener('click', e => {
    const b = e.target.closest('[data-res]'); if (!b) return; const p = S.positions.find(x => x.id === b.dataset.res); if (!p) return;
    const v = prompt(`Net result of this trade after fees, in $ (from your platform's Closed list or History). Use a minus sign for a loss, e.g. -25.75:`, '');
    if (v == null) return; const n = num(v); if (n == null || !isFinite(n)) { alert('Type a number, e.g. -25.75 or 40.10'); return; }
    // Its result is already inside the imported balance (closed before the sync), so this only records it for wins/losses and R.
    const part = (p.partials || []).reduce((a, x) => a + (x.realized || 0), 0);
    p.partials = (p.partials || []).map(x => x.resultKnown === false ? Object.assign({}, x, { realized: 0, resultKnown: true }) : x);
    p.closed = Object.assign({}, p.closed, { realized: n - part, resultKnown: true, note: (p.closed.note || '') + ' · result entered by you' });
    save(); renderPositions(); renderAll(true);
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
    showModal(`<h3>${isP ? 'Partial close' : 'Close'} ${esc(p.sym)} ${p.side}</h3><div class=form>
      ${isP ? `<label>Qty closed<input id=clQ type=number step=any placeholder="max ${C.openQty(p)}"></label>` : ''}
      <label>Exit price<input id=clP type=number step=any value="${price != null ? +price.toFixed(6) : ''}"></label>
      <label>Realized $ from your platform (optional, overrides estimate)<input id=clR type=number step=any></label>
      <label>Closed at<input id=clT type=datetime-local value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"></label>
      <label>How did it go?<select id=clTag>${Object.keys(C.TRADE_TAGS).map(k => `<option value="${k}" ${k === (p.tag || 'plan') ? 'selected' : ''}>${C.TRADE_TAGS[k]}</option>`).join('')}</select></label>
      <label class=wide>Note<input id=clN></label></div>
      <p class=small id=clEst></p><div class=row><button class="btn pri" id=clOk>Save</button><button class=btn data-close>Cancel</button></div>`);
    const est = () => { const q = isP ? num($('#clQ').value) : C.openQty(p), xp = num($('#clP').value); if (!q || !xp) return null; const v = C.realizedFor(p, q, xp, Date.parse($('#clT').value) || Date.now()); $('#clEst').textContent = `Estimated net after fees: ${usd(v)}`; return v; };
    document.querySelectorAll('#clP,#clT' + (isP ? ',#clQ' : '')).forEach(x => x.addEventListener('input', est)); est();
    $('#clOk').onclick = () => {
      const q = isP ? num($('#clQ').value) : C.openQty(p), xp = num($('#clP').value), t = Date.parse($('#clT').value) || Date.now();
      if (!q || !xp || q > C.openQty(p) + 1e-12) { alert('Check quantity and exit price.'); return; }
      const rv = num($('#clR').value), v = rv != null ? rv : C.realizedFor(p, q, xp, t);
      if (isP) { p.partials.push({ t, qty: q, price: xp, realized: v }); if (C.openQty(p) <= 1e-12) p.closed = { t, price: xp, realized: 0, note: $('#clN').value }; }
      else p.closed = { t, price: xp, realized: v, note: $('#clN').value };
      p.tag = $('#clTag').value;
      saveAndSync('close'); closeModal(); renderAll(true);
    };
  });

  // ---------- Import from Kraken Prop (screenshots or text) ----------
  let ocrWorker = null, lastImport = null, lastSyncSummary = null;
  function loadScript(src) { return new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('could not load ' + src)); document.head.appendChild(el); }); }
  async function ocr(file) {
    if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
    if (!ocrWorker) ocrWorker = await Tesseract.createWorker('eng', 1, { workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract/', langPath: 'vendor/tesseract/lang', gzip: true });
    const r = await ocrWorker.recognize(file);
    return r.data.text;
  }
  async function importFiles(files) {
    const st = $('#impStatus'); const texts = []; let newest = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        st.textContent = `Reading screenshot ${i + 1} of ${files.length}… (first time downloads the reader, ~7 MB)`;
        texts.push(await ocr(files[i])); newest = Math.max(newest, files[i].lastModified || 0);
      }
    } catch (e) { st.innerHTML = `<span class=dn>Couldn't read the screenshot: ${esc(e.message)}</span>`; return; }
    showImport(texts.join('\n'), newest || Date.now());
    autoSample(lastImport && lastImport.r, texts.join('\n'));
  }
  $('#impFiles').onchange = e => { if (e.target.files.length) importFiles([...e.target.files]); e.target.value = ''; };
  $('#impPasteBtn').onclick = () => { const t = $('#impText'); t.hidden = false; t.focus(); };
  $('#impText').addEventListener('input', e => { if (e.target.value.trim().length > 20) showImport(e.target.value, Date.now()); });
  document.addEventListener('paste', e => {
    if (tab !== 'pos') return;
    const f = [...(e.clipboardData && e.clipboardData.files || [])].filter(x => /^image\//.test(x.type));
    if (f.length) { e.preventDefault(); importFiles(f); }
  });
  // Automatic reader samples (owner's choice, Nov 1 2026): when the reader misses something on a screenshot, send the
  // screen's layout (every digit 9, identifiers removed; never the picture) so the reader can be fixed. Off switch in
  // Settings. Each layout is sent once per device. Fire and forget: a failure never affects the import.
  const SAMPLE_URL = 'https://kraken-prop-desk.jbyerstemp.workers.dev/sample', SAMPLE_KEY = 'kpd_samples';
  function autoSample(r, text) {
    if (!r || F.demo || T().shareLayout === false) return;
    const smp = C.sampleFor(r, text, FEEDBACK_PUBLIC ? 'public' : 'private'); if (!smp) return;
    let seen; try { seen = JSON.parse(localStorage.getItem(SAMPLE_KEY)) || []; } catch (e) { seen = []; }
    const id = C.fnv(smp.layout); if (seen.includes(id)) return;
    fetch(SAMPLE_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(smp), keepalive: true })
      .then(x => { if (x.ok) { seen.push(id); try { localStorage.setItem(SAMPLE_KEY, JSON.stringify(seen.slice(-200))); } catch (e) { } } }).catch(() => { });
  }
  function showImport(text, shotTime) {
    const r = C.parseKrakenProp(text, Date.now()); lastImport = { r, shotTime, text };
    const A = r.account, st = $('#impStatus');
    if (!r.positions.length && !r.details.length && !r.fills.length && A.equity == null && A.balance == null && !(r.ledger || []).length && !Object.keys(r.leverage || {}).length && !(r.orders || []).length) { st.innerHTML = '<span class=dn>Nothing recognisable. Use your prop platform\'s account screen and its positions list.</span>'; $('#impPreview').innerHTML = ''; return; }
    st.textContent = '';
    const size = A.plan ? C.sizeFromLimits(A.plan, A.drawdownLimit, A.target) : null;
    const opts = S.accounts.filter(a => a.phase === 'eval' || a.phase === 'funded').map(a => `<option value="${a.id}" ${A.label && a.label === A.label ? 'selected' : ''}>${esc(a.label || C.planOf(a).name + ' ' + usd(a.size))}</option>`).join('');
    const newOpt = A.plan && size ? `<option value="new" ${!S.accounts.some(a => a.label === A.label) ? 'selected' : ''}>+ New: ${esc(A.label || A.plan)} (${usd(size)})</option>` : '';
    const ageMin = (Date.now() - shotTime) / 60000;
    $('#impPreview').innerHTML = `<div class=kv>
        <div><span>Account</span>${esc(A.label || '—')}</div><div><span>Equity</span>${A.equity != null ? usd(A.equity) : '—'}</div>
        <div><span>Daily loss limit</span>${A.dailyLimit != null ? usd(A.dailyLimit) : '—'}</div><div><span>Drawdown limit</span>${A.drawdownLimit != null ? usd(A.drawdownLimit) : '—'}</div>
        <div><span>Open P&amp;L (sum)</span>${r.upnlSum != null ? usd(r.upnlSum) : '— (not on screen)'}</div><div><span>Balance${A.balanceFrom === 'ledger' ? ' (Ledger, newest row)' : A.balance != null ? ' (read directly)' : ' (equity − open P&amp;L)'}</span>${r.balance != null ? usd(r.balance) : '—'}</div>${A.usedMargin != null ? `<div><span>Used margin</span>${usd(A.usedMargin)}</div>` : ''}</div>
      ${r.positions.length ? `<table><tr><th>Side</th><th class=num>Qty</th><th class=num>Entry</th><th class=num>P&amp;L</th><th>Stop</th></tr>${r.positions.map(p => `<tr><td class="${p.side === 'short' ? 'dn' : 'up'}">${esc(p.side)} ${esc(p.base)}</td><td class=num>${p.qty}</td><td class=num>${px(p.entry)}</td><td class="num ${cls(p.upnl)}">${p.upnl != null ? usd(p.upnl) : '—'}</td><td>${p.hasSL ? 'SL on platform' : '<b class=dn>NO SL</b>'}${p.hasTP ? ' · TP' : ''}</td></tr>`).join('')}</table>` : ''}
      ${(() => { const ac = acctById(($('#impAcct') || {}).value) || S.accounts.find(x => x.label && x.label === A.label); if (!ac || !(r.positions.length || r.flat)) return '';
        const P = C.planSync(S.positions.filter(p => p.acct === ac.id && !p.closed), r.positions, r.closedRows);
        const li = []; P.add.forEach(q => li.push(`<b class=up>+ New</b> ${esc(q.side)} ${q.qty} @ ${px(q.entry)}${C.matchPlanned(S.planned.filter(x => x.acct === ac.id), q) ? ' <b>= your planned setup: becomes live</b>' : ''}`)); P.partial.forEach(k => li.push(`<b class=warn>~ Partly closed</b> ${esc(k.pos.side)} ${k.closedQty} of ${C.openQty(k.pos)} @ ${px(k.pos.entry)}`));
        P.close.forEach(c => li.push(`<b class=dn>− Closed</b> ${esc(c.pos.side)} ${c.pos.qty} @ ${px(c.pos.entry)}${c.row ? ` · result <span class="${cls(c.row.realized)}">${usd(c.row.realized)}</span>` : ' · result counted in balance'}`));
        return `<p class=small><b>Changes:</b> ${li.length ? '' : 'none to positions'}${P.keep.length ? ` · ${P.keep.length} unchanged` : ''}</p>${li.length ? '<div class=small>' + li.join('<br>') + '</div>' : ''}`; })()}
      ${(r.orders || []).length ? `<p class=small><b>Orders read</b> (not positions):<br>${r.orders.map(o => `${o.type === 'limit' ? 'Limit' : o.type === 'market' ? 'Market' : esc(o.type)} ${o.side === 'long' ? 'buy' : 'sell'} ${o.qty} ${esc(o.base)} @ ${px(o.price)} · <b class="${o.status === 'filled' ? 'up' : o.status === 'cancelled' ? 'mu' : 'warn'}">${o.status === 'working' ? 'working, ' + (o.filledPct || 0) + '% filled' : o.status === 'partial' ? o.filledPct + '% filled' : o.status || 'status not on screen'}</b>${o.tp != null ? ' · TP ' + px(o.tp) : ''}${o.sl != null ? ' · SL ' + px(o.sl) : ' · <b class=dn>no SL read</b>'}${o.openedMs ? ' · placed ' + fmtTime(o.openedMs, true) : ''}`).join('<br>')}</p>` : ''}
      ${r.leverage && Object.keys(r.leverage).length ? `<p class=small><b>Leverage read:</b> ${Object.entries(r.leverage).map(([k, v]) => esc(k) + ' ' + v + 'x').join(', ')} (saved to the account)</p>` : ''}
      ${r.ledger && r.ledger.length ? `<p class=small><b>Ledger read:</b> ${r.ledger.length} row(s)${r.ledgerOk ? ', every running balance adds up' : ''} · swap fees ${usd(r.ledgerSum.swap)} · trades and commissions ${usd(r.ledgerSum.trade)}</p>` : ''}
      ${r.fills.length ? `<p class=small><b>Trades read:</b> ${r.fills.length} fill(s) · ${r.fills.filter(f => f.action === 'open' && f.t != null).length} opening today${r.fills.some(f => f.t == null) ? ' (older dated rows kept for history)' : ''}</p>` : ''}
      ${r.details.length ? `<table><tr><th>Position details read</th><th class=num>Size</th><th class=num>Stop</th><th class=num>Target</th><th>Opened</th></tr>${r.details.map(d => `<tr><td class="${d.side === 'short' ? 'dn' : 'up'}">${esc(d.side)} ${esc(d.base)}${d.entry ? ' @ ' + px(d.entry) : ''}</td><td class=num>${d.qty}</td><td class=num>${d.sl != null ? px(d.sl) : '—'}</td><td class=num>${d.tp != null ? px(d.tp) : '—'}</td><td class=small>${d.openedMs ? fmtTime(d.openedMs, true) : '—'}</td></tr>`).join('')}</table>` : ''}
      ${!r.positions.length && !r.flat ? '<p class=small>No position list in these screenshots: your open positions stay as they are' + (r.details.length ? '; details are added to the matching ones.' : '.') + '</p>' : ''}
      ${r.warnings.map(w => `<p class="small warn">${esc(w)}</p>`).join('')}
      ${ageMin > 10 ? `<p class="small warn">These screenshots are ${Math.round(ageMin)} min old. Prices may have moved; the balance is still right if no trade closed since.</p>` : ''}
      <div class=row style="margin-top:8px"><select id=impAcct>${opts}${newOpt}</select><button class="btn pri" id=impGo>Looks right: sync</button></div>
      <p class="small mu">Sync sets this account's equity, balance, daily loss limit, drawdown limit and target to your platform's, replaces its open positions with these (keeping your notes on ones that match), and marks missing ones as closed on your platform.</p>`;
    $('#impGo').onclick = () => applyImport();
  }
  function applyImport() {
    const { r, shotTime } = lastImport, A = r.account, now = Date.now();
    let acct;
    const sel = $('#impAcct').value;
    if (sel === 'new') {
      const size = C.sizeFromLimits(A.plan, A.drawdownLimit, A.target);
      acct = { id: uid(), plan: A.plan, size, fee: (C.PLANS[A.plan].price || {})[size] || 0, addon90: false, phase: A.phase || 'eval', profile: 'steady', created: now, label: A.label || '' };
      S.accounts.push(acct);
    } else acct = acctById(sel);
    if (!acct) { alert('Pick an account.'); return; }
    // Snapshot sync: the platform's numbers are the truth as of NOW (balance = equity - open P&L doesn't move with price).
    const t = now;
    const before = C.accountState(acct, S.positions, prices(), now, { orders: S.planned });
    if (r.balance != null) acct.anchor = { t, bal: r.balance };
    if (A.dailyLimit != null) acct.dayStartOverride = { reset: C.lastReset(t, acct.resetMin), bal: A.dailyLimit / (1 - C.planOf(acct).mdl) };
    if (A.drawdownLimit > 0) acct.ddLimit = A.drawdownLimit;
    if (A.target > 0 && acct.phase === 'eval') acct.targetEq = A.target;
    if (A.equity > 0) acct.platformEq = { t, v: A.equity, appBefore: before.equity };
    if (r.leverage && Object.keys(r.leverage).length) acct.leverage = Object.assign({}, acct.leverage, r.leverage);   // leverage as the venue shows it
    // Use the data given (owner's choice, Nov 1): when the screenshot shows the position list (or a flat account),
    // the app's open positions become exactly that list. A match (side + coin + entry) keeps his notes/stop/TP and
    // takes the platform's size; anything not on screen is closed (result from the Closed list when shown, otherwise
    // it's already in the imported balance). Everything is dated at the sync so nothing counts twice.
    const open = S.positions.filter(p => p.acct === acct.id && !p.closed);
    const reconcile = r.positions.length > 0 || r.flat;
    let plan = { keep: [], add: [], close: [], partial: [] };
    if (reconcile) {
      // Same plan the preview showed (C.planSync), so what he approved is exactly what is applied.
      plan = C.planSync(open, r.positions, r.closedRows);
      for (const k of plan.keep) { k.pos.krakenSL = k.snap.hasSL; k.pos.krakenTP = k.snap.hasTP; }
      // Partly closed on the platform: keep the history, add the closed part (its result is already in the imported balance).
      for (const k of plan.partial) { const p = k.pos; p.partials = (p.partials || []).concat({ t: t - 1, qty: k.closedQty, price: null, realized: 0, resultKnown: false, synced: true }); p.krakenSL = k.snap.hasSL; p.krakenTP = k.snap.hasTP; }
      for (const q of plan.add) {
        const pl = C.matchPlanned(S.planned.filter(x => x.acct === acct.id), q);
        if (pl) { S.positions.push(liveFromPlan(pl, { entry: q.entry, qty: q.qty, stop: pl.stop, opened: t - 2, openedUnknown: true, source: 'kraken-import' })); S.planned = S.planned.filter(x => x.id !== pl.id); continue; }
        S.positions.push({ id: uid(), acct: acct.id, sym: q.sym, side: q.side, qty: q.qty, entry: q.entry, stop: null, origStop: null, tp1: null, tp2: null,
          tf: 15, setup: 'Imported', thesis: '', opened: t - 2, openedUnknown: true, partials: [], stopHist: [], krakenSL: q.hasSL, krakenTP: q.hasTP, source: 'kraken-import' });
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
      if (o.type !== 'limit' && o.type !== 'market') continue;
      const mine = S.planned.filter(x => x.acct === acct.id);
      const pl = (o.orderId && mine.find(x => x.orderId === o.orderId)) || C.matchPlanned(mine, { sym: o.sym, side: o.side, qty: o.qty, entry: o.price });
      if (o.status === 'working' || o.status === 'partial' || o.status == null) {
        if (pl) { Object.assign(pl, { status: 'placed', placedAt: pl.placedAt || o.openedMs || t, entry: o.price, qty: o.qty, orderType: o.type, orderId: o.orderId || pl.orderId });
          if (o.sl != null) pl.stop = o.sl; if (o.tp != null) pl.tp1 = o.tp; ordN.placed++; }
        else { S.planned.push({ id: uid(), acct: acct.id, sym: o.sym, side: o.side, entry: o.price, stop: o.sl, tp1: o.tp, qty: o.qty, tf: 15, setup: 'Imported', thesis: '',
          ref: { key: 'unlinked', model: C.MODEL }, created: t, status: 'placed', placedAt: o.openedMs || t, orderType: o.type, orderId: o.orderId, source: 'kraken-import' }); ordN.added++; }
      } else if (o.status === 'filled' && pl && !reconcile) {
        S.positions.push(liveFromPlan(pl, { entry: o.price, qty: o.qty, stop: o.sl != null ? o.sl : pl.stop, tp1: o.tp, opened: o.openedMs || t - 2, source: 'kraken-import' }));
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
    lastSyncSummary = { fills: fillN, story: storyN, keep: plan.keep.length, add: plan.add.length, partial: plan.partial.length, close: plan.close.length, diff: A.equity > 0 ? before.equity - A.equity : null };
    // Position detail sheets: stop/target, real open time. Match by side + coin + size (+ entry when shown).
    let setN = 0; const unmatched = [];
    for (const d of r.details) {
      let cands = S.positions.filter(p => p.acct === acct.id && !p.closed && p.side === d.side && p.sym === d.sym && Math.abs(C.openQty(p) - d.qty) < 1e-9);
      if (d.entry != null && cands.some(p => C.samePx(p.entry, d.entry))) cands = cands.filter(p => C.samePx(p.entry, d.entry));
      const p = cands.find(x => x.stop == null) || cands[0];
      if (!p) { unmatched.push(`${d.side} ${d.qty} ${d.base}`); continue; }
      if (cands.length > 1) unmatched.push(`${d.qty} ${d.base}: ${cands.length} positions share this size, applied to one; check them`);
      if (d.sl != null && d.sl !== p.stop) {
        const wider = p.stop != null && (p.side === 'short' ? d.sl > p.stop : d.sl < p.stop);
        if (wider) p.widened = true;
        p.stopHist.push({ t, stop: d.sl, why: wider ? 'moved farther on platform (import)' : 'from platform (import)' });
        p.stop = d.sl; if (p.origStop == null) p.origStop = d.sl;
      }
      if (d.tp != null && d.tp !== p.tp1) { (p.tpHist = p.tpHist || []).push({ t, tp: d.tp, why: 'from platform (import)' }); p.tp1 = d.tp; }
      if (d.sl != null) p.krakenSL = true; if (d.tp != null) p.krakenTP = true;
      if (d.openedMs && d.openedMs <= now) { p.opened = d.openedMs; p.openedUnknown = false; }
      setN++;
    }
    // The screenshot also shows Prop's real price: use it to calibrate only if the screenshot is under 2 min old
    // (it's compared with the live estimate now; an older shot would bake price drift into the calibration).
    const withPx = r.positions.find(q => q.price > 0) || r.details.find(q => q.price > 0);
    if (withPx && now - shotTime < 2 * 60000) { const qq = pnlQuote(withPx.sym); if (qq.raw && Math.abs(withPx.price / qq.raw - 1) < 0.01) S.calib.push({ t, sym: withPx.sym, prop: withPx.price, est: qq.raw }); }
    save(); ensureFeeds(); lastImport = null; $('#impPreview').innerHTML = ''; $('#impText').value = ''; $('#impText').hidden = true;
    const L = lastSyncSummary; $('#impStatus').innerHTML = `<b class=up>Synced ${esc(acct.label || 'account')}</b>: ${reconcile ? [L.add && L.add + ' new', L.partial && L.partial + ' size updated', L.close && L.close + ' closed', L.keep && L.keep + ' unchanged'].filter(Boolean).join(', ') || 'no positions' : 'positions unchanged'}${ordN.placed ? ` · ${ordN.placed} plan(s) now working orders` : ''}${ordN.added ? ` · ${ordN.added} working order(s) added` : ''}${ordN.filled ? ` · ${ordN.filled} order(s) filled → open` : ''}${ordN.cancelled ? ` · ${ordN.cancelled} cancelled order(s) removed` : ''}${L.fills ? ` · ${L.fills} new fill(s)` : ''}${L.story ? ` · ${L.story} open time(s) from fills` : ''}${L.diff != null ? ` · app was ${L.diff >= 0 ? '+' : ''}${usd(L.diff)} off, now matched` : ''}${setN ? `, ${setN} position detail(s)` : ''}.` + (unmatched.length ? ` <span class=warn>Not matched: ${esc(unmatched.join('; '))}</span>` : '');
    posFormDirty = true; autoPush('import'); switchTab('coach');
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
      for (const a of liveAccts()) {
        const A = C.accountState(a, S.positions, P, now, { orders: S.planned }), name = a.label || C.planOf(a).name;
        if (A.breached) fire(a.id + '|breach', 3, `${name}: at the breach line`, `Equity ~${usd(A.equity)} vs floor ${usd(A.floor)}. Check your platform now.`, 5);
        else if (A.room < A.profRisk) fire(a.id + '|room', 2, `${name}: room below one trade`, `Room ${usd(A.room)}. No new trades today.`, 4);
        if (!A.riskKnown && A.open) fire(a.id + '|nostop', 2, `${name}: a position has no stop`, 'Risk is unlimited until it has one.', 4);
        else if (A.stopsBreach) fire(a.id + '|stopsbreach', 2, `${name}: stops sit past the breach line`, `If every stop fills, equity lands near ${usd(A.equityIfStopped)}; floor ${usd(A.floor)}.`, 4);
        if (A.reachedTarget) fire(a.id + '|target', 1, `${name}: equity at the profit target`, 'Check your platform (Kraken auto-closes at the target).', 4);
        for (const p of S.positions.filter(p => p.acct === a.id && !p.closed)) {
          const px = P[p.sym];
          if (px == null) { fire(p.sym + '|noprice', 2, `${p.sym}: app can't see the price`, `Live data for ${p.sym} isn't loading, so stop and target checks are paused. Check your platform yourself.`, 4); continue; }
          const d = p.side === 'short' ? -1 : 1, tag = `${p.sym} ${p.side} ${p.qty}`;
          if (p.stop != null) { const to = d * (px - p.stop), a1 = (analyses[p.sym] && analyses[p.sym].atr[60]) || px * 0.004;
            if (to <= 0) fire(p.id + '|stophit', 3, `${tag}: price through the stop`, `Price ${px.toFixed(1)}, stop ${p.stop}. Re-import to sync.`, 4);
            else if (to < a1 * 0.3) fire(p.id + '|stopnear', 2, `${tag}: close to the stop`, `Price ${px.toFixed(1)}, stop ${p.stop}. Hold or exit per plan; don't widen it.`, 3); }
          const tgt = p.tp1 != null ? p.tp1 : p.tp2; if (tgt != null && d * (px - tgt) >= 0) fire(p.id + '|tp', 1, `${tag}: target reached`, `Price ${px.toFixed(1)} at target ${tgt}.`, 3);
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
  function renderCoach() {
    const open = S.positions.filter(p => !p.closed);
    const P = prices(), now = Date.now();
    const acctHtml = liveAccts().map(a => { const s = C.accountState(a, S.positions, P, now, { orders: S.planned });
      return `<div class=small><b>${esc(a.label || C.planOf(a).name + ' ' + usd(a.size))}</b>: room ${usd(s.room)} (${s.binding}), open risk ${s.riskKnown ? usd(s.riskToStops) : 'UNLIMITED (no stop)'}, ${s.profile.name} next ${usd(s.nextRisk)}. ${s.warnings.map(w => `<span class="${w.lvl === 'bad' ? 'dn' : 'warn'}">${esc(w.text)}</span>`).join(' ')}</div>`; }).join('');
    const cards = open.map(p => {
      const h = lastHealth[p.id] || coachFor(p);
      const notes = window.PDResearch ? PDResearch.coachNotes(p, researchFor(p.sym)) : [];
      const cx = coachCtx(p), plan = cx.ageSec != null && cx.ageSec <= T().maxAge ? C.levelPlan(p, cx) : [];
      const TY = { stop: 'Move stop to', tp: 'Take profit at', partial: 'Take a partial at' };
      return `<div class=card><div class=acct-head><b>${esc(p.sym)} ${p.side.toUpperCase()} · ${C.tfName(p.tf)} ${esc(p.setup)}</b><span class="score s${h.score || 0}">${h.score || '–'}/5 ${h.label}</span></div>
        <p><b>Proposal:</b> ${esc(h.proposal)}</p>${T().dirRule !== false ? (() => { const dc = C.directionCheck(p.side, p.sym, (analyses[p.sym] || analyze(p.sym)).struct, S.positions.filter(x => x.id !== p.id), p.acct); return dc.ok || !dc.known ? '' : `<p class=small><b class=dn>Against your both-ways rule now:</b> ${esc(dc.reasons.join('; '))}</p>`; })() : ''}<div class=items>${h.items.map(i => `<div class="${i.k}"><b>${i.k}</b>${esc(i.t)}</div>`).join('')}</div>
        ${plan.length ? `<h4 style="margin:10px 0 4px">Suggested levels</h4><table><tr><th>Action</th><th class=num>Price</th><th class=num>R</th><th>Why</th><th></th></tr>${plan.map((x, i) => `<tr><td class=small><b class="${x.type === 'stop' ? 'warn' : 'up'}">${TY[x.type]}</b>${x.rule ? '<div class=tag>your rule</div>' : ''}</td><td class=num>${px(x.price)}</td><td class=num>${x.r == null ? '—' : (x.r >= 0 ? '+' : '') + x.r.toFixed(2) + 'R'}</td><td class=small>${esc(x.why)}</td><td>${x.type !== 'partial' ? `<button class="btn sm" data-setlvl="${esc(p.id)}" data-type="${x.type}" data-px="${x.price}">I set it</button>` : ''}</td></tr>`).join('')}</table>
          <p class="small mu">Set it on your prop platform first, then tap "I set it" so the app matches. Stops shown only tighten, stay at least 1 ATR from price, and are options unless marked "your rule". Not a signal; your plan decides.</p>` : ''}
        ${notes.length ? `<div class=items>${notes.map(t => `<div class=warn><b>research</b>${esc(t)}</div>`).join('')}</div><p class="small mu">Research notes (experimental): what the engine sees against this trade. They don't change the score and never mean widen the stop.</p>` : ''}</div>`;
    }).join('');
    const sym = T().sym, A = analyses[sym] || analyze(sym);
    const ups = C.scanSetups(sym, A, now);
    coachUps = C.sortLive(ups, liveOf, fitsNow);
    const board = C.rankBoard(coachUps, coachMem[sym] || {}, now); coachMem[sym] = board.mem;
    const reviews = liveAccts().map(a => {
      const R = C.accountReview(a, S.positions, P, now, { orders: S.planned }), st = R.state;
      const syms = [...new Set(S.positions.filter(p => p.acct === a.id && !p.closed && p.stop == null && p.krakenSL).map(p => p.sym + '|' + p.side))];
      return `<div class=card><h3>Account review: ${esc(a.label || C.planOf(a).name + ' ' + usd(a.size))} <span class="tag">${esc(pnlQuote(T().sym).basis)}</span></h3>
        <div class=kv><div><span>Equity</span><b>${usd(st.equity)}</b></div><div><span>Room (${st.binding} limit)</span><b class="${st.room < st.profRisk * 2 ? 'dn' : ''}">${usd(st.room)}</b></div>
        <div><span>If every stop fills</span>${st.riskKnown ? usd(-st.riskToStops) : '<b class=dn>unknown</b>'}</div><div><span>Next reset</span>${fmtTime(st.nextReset)}</div></div>
        <div class=warns>${R.lines.map(l => `<div class="${l.lvl === 'bad' ? 'bad' : l.lvl === 'warn' ? 'warn' : ''}">${esc(l.t)}</div>`).join('')}</div>
        ${syms.map(k => { const [sy, sd] = k.split('|'); return `<div class=row style="margin-top:6px"><span class=small>Same stop/target for all ${esc(sy)} ${esc(sd)}s:</span><input type=number step=any placeholder="Stop" data-bulk=stop data-k="${esc(k)}" data-a="${a.id}" style="width:110px"><input type=number step=any placeholder="Target" data-bulk=tp data-k="${esc(k)}" data-a="${a.id}" style="width:110px"><button class="btn sm" data-bulkgo="${esc(k)}" data-a="${a.id}">Set</button></div>`; }).join('')}
        <p class="small mu">Same math as a manual review, from the app's price (${esc(pnlQuote(T().sym).basis)}). Re-import a screenshot to re-sync.</p></div>`;
    }).join('');
    $('#coachBox').innerHTML = reviews + `<div class=card><h3>Account risk</h3>${acctHtml || '<p class=mu>No open accounts.</p>'}</div>
      ${cards || '<div class=card><p class=mu>No open positions. Log one on the Positions tab and the coach will score it here.</p></div>'}
      <div class=card><h3>Other setups on ${esc(sym)} <span class=tag>ranked · most valid first</span></h3>${sizeAcctPicker()}${board.rows.length ? board.rows.map(r => r.gone ? goneCard(r) : setupCard('coach', r.rank - 1, r.u, '', r)).join('') + '<p class="small mu">Ranked by the live check, re-ranked every few seconds: valid in the market now first, then what your account can take, then most checks passing, then best reward:risk from the price now; the replay grade breaks ties. ↑/↓ shows a move in the last 10 min. Setups the scanner no longer finds stay at the bottom for 4 h. Replay results say these have no proven edge yet; paper trading them builds your own record without risk.</p>' : '<p class=mu>Nothing clean right now. No trade is fine.</p>'}</div>
      <p class="small mu">Score 1–5 is a rule checklist (stop, breach line, 1h/4h structure, entry-TF break, levels before target, your BE rule), not a win probability. It never suggests widening a stop. Updates every few seconds while this page is open; it does not watch when the app is closed.</p>`;
  }
  var coachUps = [], coachMem = {};
  $('#coachBox').addEventListener('click', e => {
    const cp = e.target.closest('[data-cpaper]'); if (cp) { const u = coachUps[+cp.dataset.cpaper]; if (u) paperAdd(u); return; }
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
  function buildWatch() {
    const keep = ['id', 'label', 'plan', 'size', 'phase', 'profile', 'leverage', 'resetMin', 'target', 'mdl', 'mdd', 'ddLimit', 'targetEq', 'dayResetAt', 'fills', 'anchor', 'dayStartOverride', 'created'];
    const accts = liveAccts().map(a => Object.fromEntries(keep.filter(k => a[k] !== undefined).map(k => [k, a[k]])));
    const pos = S.positions.filter(p => !p.closed && accts.some(a => a.id === p.acct)).map(p => ({ id: p.id, acct: p.acct, sym: p.sym, side: p.side, qty: p.qty, entry: p.entry,
      stop: p.stop, origStop: p.origStop, tp1: p.tp1, tp2: p.tp2, tf: p.tf, opened: p.opened, openedUnknown: !!p.openedUnknown, krakenSL: !!p.krakenSL, partials: p.partials || [] }));
    return { v: 1, updated: Date.now(), symbols: T().symbols, rules: { beAt1R: !!T().beAt1R, traits: (T().alertTraits || []).slice(), benched: benchedKeys() }, calib: S.calib.slice(-10), accounts: accts, positions: pos, orders: S.planned.filter(x => x.status === 'placed').map(x => ({ acct: x.acct, sym: x.sym, side: x.side, qty: x.qty, entry: x.entry, stop: x.stop, tp1: x.tp1, status: 'placed', placedAt: x.placedAt })) };
  }
  // Auto-send: GitHub fine-grained token (this repo only, Contents read/write), kept in its own key so backups never include it.
  const GH_KEY = 'kpd_gh';
  const ghRepo = () => (T().monRepo || '').trim();
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
    const body = JSON.stringify(buildWatch(), null, 1);
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
    const txt = JSON.stringify(buildWatch(), null, 1);
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
      <label>ORB anchor<select id=stOrb><option value=ny ${t.orbAnchor === 'ny' ? 'selected' : ''}>9:30 New York (stock open)</option><option value=utc ${t.orbAnchor === 'utc' ? 'selected' : ''}>00:00 UTC (daily candle)</option><option value=kraken ${t.orbAnchor === 'kraken' ? 'selected' : ''}>00:30 UTC (Kraken Prop daily reset)</option></select></label>
      <label>ORB length (min)<select id=stOrbM>${[5, 15, 30, 60].map(m => `<option ${m === t.orbMin ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>Symbols (e.g. BTC/USD, comma separated)<input id=stSyms value="${esc(t.symbols.join(', '))}"></label>
      <label>Stale after (sec)<input id=stAge type=number value="${t.maxAge}"></label>
      <label>P&L price<select id=stBasis><option value=usdt ${t.priceBasis === 'usdt' ? 'selected' : ''}>Prop estimate: Kraken Futures mark in USDT (default)</option><option value=mark ${t.priceBasis === 'mark' ? 'selected' : ''}>Kraken Futures mark (USD)</option><option value=spot ${t.priceBasis === 'spot' ? 'selected' : ''}>Kraken spot last</option></select></label></div>
      <p class="small mu">Kraken Prop values positions at a mark price from its own liquidity providers. The app's perp mark is a stand-in; compare it with your platform once and keep the closer one.</p></div>
      <div class=card><h3>My rules</h3><div class=form>
      <label class=chk><input type=checkbox id=stDir ${t.dirRule !== false ? 'checked' : ''}> Trade both ways only when it makes sense (4h trend that way, or 1h + 15m both turned; never long and short on one coin)</label>
      <label class=chk><input type=checkbox id=stBe ${t.beAt1R ? 'checked' : ''}> Move stop to breakeven at +1R (coach enforces it)</label>
      <label>Monthly eval budget $ (after bills, cushion, weekly buy)<input id=stBud type=number step=any value="${t.budget || ''}"></label></div>
      <p class="small mu">Profiles (per trade, % of starting balance): ${C.PROFILES.map(p => `${p.name} ${p.riskPct}% · max ${p.maxTrades} trades · stop after ${p.stopAfterLosses} losses`).join(' | ')}.</p></div>
      <div class=card><h3>Theme</h3><div class=swatches>${THEMES.map(th => { const c = th.id === 'classic' ? '#5b9cff' : `hsl(${th.id === 'custom' ? t.hue : th.hue},${th.sat != null ? th.sat : 100}%,62%)`;
        return `<button data-theme="${th.id}" class="${t.theme === th.id ? 'on' : ''}" style="color:${c}">${esc(th.name)}</button>`; }).join('')}</div>
      <label class=small style="display:block;margin-top:10px">Color (slide through every hue)<input type=range id=stHue min=0 max=359 value="${+t.hue || 0}"></label>
      <div class=row style="margin:8px 0 0"><label class=chk><input type=checkbox id=stScan ${t.scan ? 'checked' : ''}> Scanlines</label><label class=chk><input type=checkbox id=stGlow ${t.glow !== false ? 'checked' : ''}> Glow</label></div>
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
      <div class=card><h3>24/7 monitor key</h3><p class=small>Paste a GitHub fine-grained key for <b>your monitor repo only</b>${ghRepo() ? ' (' + esc(ghRepo()) + ')' : ''}, permission <b>Contents: Read and write</b>. Then every import and trade change updates the monitor by itself. The key stays on this phone and is never in backups.</p>
      <label class=small style="display:block;margin-bottom:6px">Monitor repo (owner/name)<input id=ghRepo value="${esc(ghRepo())}" placeholder="you/your-monitor-repo" style="width:100%"></label><div class=row><input id=ghTok type=password placeholder="${ghToken() ? 'Key saved (paste to replace)' : 'github_pat_…'}" style="flex:1;min-width:180px"><button class="btn sm" id=ghSave>Save &amp; test</button>${ghToken() ? '<button class="btn sm bad" id=ghDel>Remove</button>' : ''}</div><p class=small id=ghStat>${S.lastPush ? 'Last update ' + fmtTime(S.lastPush, true) : ''}</p></div>
      <div class=card><h3>Help improve the app</h3><label class=chk><input type=checkbox id=stShare ${t.shareLayout !== false ? 'checked' : ''}> When a screenshot isn't fully read, send its layout to the developer</label>
      <p class="small mu">Only the text layout is sent, with every number replaced by 9 and account numbers and emails removed. Never the picture, your balances, sizes or prices. Each layout is sent once.</p>
      <label class=chk><input type=checkbox id=stShareRes ${t.shareResults !== false ? 'checked' : ''}> Add my closed trades to everyone's Scorecard</label>
      <p class="small mu">Sends only the setup type, model version, paper or live, and the result in R. No coin amounts, prices, dollars, account or times. Only "followed plan" trades are counted.</p></div>
      <div class=card><h3>Backup</h3><p class=small>Everything lives in this browser only. Export a backup now and then.</p>
      <div class=row><button class=btn id=stExp>Export backup</button><label class="btn">Import<input type=file id=stImp accept=application/json hidden></label><button class="btn bad" id=stClr>Erase all</button></div></div>
      <div class=card><h3>Data</h3><p class=small>Chart: Kraken spot candles (public WebSocket v2 + REST). P&amp;L: Kraken Futures perp mark (public WebSocket), falling back to spot when the mark is stale. Backup: Coinbase public candles (different venue, labeled). Free, no keys, nothing to install. Kraken Prop fills are simulated on Kraken's side and can differ from the public feed.</p>
      <p class=small>Rules last checked Nov 1, 2026 against Kraken's support centre. Errors: ${esc(F.errors.slice(-3).join(' · ') || 'none')}</p></div>`;
    const bind = (id, fn) => $(id).addEventListener('change', e => { fn(e.target); save(); renderAll(true); });
    bind('#stTz', el => { try { new Intl.DateTimeFormat('en-US', { timeZone: el.value }); T().tz = el.value; } catch (e) { alert('Unknown time zone. Example: America/Chicago'); } });
    bind('#stOrb', el => { T().orbAnchor = el.value; }); bind('#stOrbM', el => { T().orbMin = +el.value; });
    bind('#stSyms', el => { const v = el.value.split(',').map(x => x.trim().toUpperCase()).filter(x => /^[A-Z0-9]+\/[A-Z]+$/.test(x)); if (v.length) { T().symbols = v; if (!v.includes(T().sym)) T().sym = v[0]; ensureFeeds(); initChart(); } });
    bind('#stAge', el => { T().maxAge = Math.max(10, +el.value || 90); });
    bind('#stBasis', el => { T().priceBasis = ['usdt', 'mark', 'spot'].includes(el.value) ? el.value : 'usdt'; });
    bind('#stBe', el => { T().beAt1R = el.checked; }); bind('#stShare', el => { T().shareLayout = el.checked; }); bind('#stShareRes', el => { T().shareResults = el.checked; }); bind('#stDir', el => { T().dirRule = el.checked; }); bind('#stBud', el => { T().budget = num(el.value) || 0; });
    $('#ghRepo').onchange = e => { const v = e.target.value.trim(); if (/^[\w.-]+\/[\w.-]+$/.test(v)) { T().monRepo = v; save(); } else alert('Use owner/repo, like you/prop-desk.'); };
    $('#ghSave').onclick = async () => { const v = $('#ghTok').value.trim(); if (!/^(github_pat_|ghp_)\w+/.test(v)) { alert('That doesn\'t look like a GitHub key.'); return; }
      try { localStorage.setItem(GH_KEY, v); } catch (e) { } $('#ghStat').textContent = 'Testing…'; const r = await pushWatch('key test');
      $('#ghStat').innerHTML = r.ok ? '<b class=up>Works. The monitor now updates automatically.</b>' : `<span class=dn>${esc(r.msg)}</span>`; if (!r.ok) { try { localStorage.removeItem(GH_KEY); } catch (e) { } } };
    if ($('#ghDel')) $('#ghDel').onclick = () => { try { localStorage.removeItem(GH_KEY); } catch (e) { } renderSettings(); };
    document.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { T().theme = b.dataset.theme; save(); applyTheme(); renderSettings(); });
    $('#stHue').oninput = e => { T().hue = +e.target.value; T().theme = 'custom'; save(); applyTheme(); document.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === 'custom')); };
    $('#stChart').onchange = e => { T().chartStyle = e.target.value; save(); applyTheme(); };
    $('#stScan').onchange = e => { T().scan = e.target.checked; save(); applyTheme(); };
    $('#stGlow').onchange = e => { T().glow = e.target.checked; save(); applyTheme(); };
    if ($('#ntMake')) $('#ntMake').onclick = () => { const b = new Uint8Array(12); crypto.getRandomValues(b); const t = 'pd-' + [...b].map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join('');
      try { localStorage.setItem(NT_KEY, t); } catch (e) { } renderSettings(); };
    if ($('#ntCopy')) $('#ntCopy').onclick = async () => { try { await navigator.clipboard.writeText(ntTopic()); $('#ntCopy').textContent = 'Copied ✓'; } catch (e) { prompt('Copy this channel name', ntTopic()); } };
    if ($('#ntTest')) $('#ntTest').onclick = async () => { $('#ntStat').textContent = 'Sending…'; const ok = await ntSend('Prop Desk test', 'Alerts are working. You\'ll only hear from me when something changes.', 3);
      $('#ntStat').innerHTML = ok ? '<b class=up>Sent. Check ntfy.</b>' : '<b class=dn>Couldn\'t send. Check your connection.</b>'; };
    if ($('#ntOff')) $('#ntOff').onclick = e => { e.preventDefault(); if (confirm('Stop alerts and forget this channel? You can make a new one.')) { try { localStorage.removeItem(NT_KEY); localStorage.removeItem(MEM_KEY); } catch (x) { } renderSettings(); } };
    $('#stExp').onclick = () => { const b = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `prop-desk-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); };
    $('#stImp').onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(j.accounts) || !Array.isArray(j.positions)) throw 0; if (confirm('Replace current data with this backup?')) { S = Object.assign({}, DEF, j); S.settings = Object.assign({}, DEF.settings, j.settings || {}); save(); location.reload(); } } catch (x) { alert('Not a Prop Desk backup file.'); } };
    $('#stClr').onclick = () => { if (confirm('Erase all accounts, positions and settings on this device?')) { localStorage.removeItem(KEY); location.reload(); } };
  }

  // ---------- Loop ----------
  async function ensureFeeds() {
    await F.want(T().sym, F.INTERVALS); F.wantMark(T().sym); F.wantRefs(T().sym); F.want('USDT/USD', []);
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
    if (tab === 'paper') renderPaper();
    if (tab === 'pos') { if (posFormDirty) { renderPosForm(); posFormDirty = false; } renderPositions(); }
    if (tab === 'coach') renderCoach();
    if (tab === 'set' && full) renderSettings();
  }
  // Don't redraw a form while the user is typing in it.
  const typing = () => { const el = document.activeElement; return !$('#modal').hidden || (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName) && tab !== 'chart'); };
  F.on(() => { if (!typing()) renderAll(false); });
  setInterval(() => { if (!typing()) renderAll(false); }, 3000);

  const demo = /[?&]demo\b/.test(location.search);
  PAL = themeColors(); Object.assign(PAL, { chartBg: '#000000', chartTx: PAL.tx, chartGrid: PAL.card, chartLine: PAL.line });
  F.start({ demo });
  initChart();
  applyTheme();
  ensureFeeds().then(() => { renderAll(true); setTimeout(applyTheme, 300); });
  renderAll(true);
  window.__app = { S, analyze, C };
})();
