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
  S = Object.assign({ calib: [] }, DEF, S); if (!Array.isArray(S.calib)) S.calib = []; S.settings = Object.assign({}, DEF.settings, S.settings || {});
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
    return { sym, struct, fvg, atr: at, levels, orb, sessions, price, ageSec };
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

  // ---------- Chart ----------
  const TFS = [5, 15, 60, 240, 1440];
  const LAYERS = { levels: 'Day/week levels', vwap: 'VWAP', sessions: 'Sessions', orb: 'Opening range', fvg: 'Fair value gaps', marks: 'BOS / CHoCH marks',
    pos: 'My trades (entry/stop/target)', ema9: 'EMA 9', ema21: 'EMA 21', ema50: 'EMA 50', ema200: 'EMA 200', volume: 'Volume' };
  const LAYER_DEF = { levels: true, vwap: true, sessions: true, orb: true, fvg: true, marks: true, pos: true, ema9: false, ema21: false, ema50: false, ema200: false, volume: false };
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
    const ups = C.setupsToWatch(A.sym, A, { minRR: 2 });
    $('#setupBox').innerHTML = ups.length ? ups.map(u => `<div class=small style="margin:6px 0"><b class="${u.dir === 'long' ? 'bull' : 'bear'}">${u.dir.toUpperCase()}</b> ${esc(u.text)} ${u.aligned1h ? '' : '<span class=warn>1h not aligned.</span>'}
      <button class="btn sm" data-plan='${esc(JSON.stringify({ sym: u.sym, side: u.dir, entry: +u.entry.toFixed(6), stop: +u.stop.toFixed(6), tp1: +u.target.toFixed(6), tf: u.tf, setup: 'FVG' }))}'>Plan it</button></div>`).join('')
      + '<p class="small mu">Needs a retest and your own trigger. No backtest yet: treat as a watchlist.</p>'
      : `<p class=mu>Nothing clean: ${A.struct[240] && A.struct[240].bias === 'range' ? '4h is ranging.' : 'no open FVG in the 4h direction within 2 ATR with 2R+ to the 4h swing.'} No trade is a valid answer.</p>`;
  }
  $('#setupBox').addEventListener('click', e => { const b = e.target.closest('[data-plan]'); if (!b) return; posDraft = JSON.parse(b.dataset.plan); $('#manualBox').open = true; switchTab('pos'); });
  function switchTab(t) { document.querySelector(`#tabs button[data-tab="${t}"]`).click(); }

  // ---------- Desk ----------
  function renderDesk() {
    const now = Date.now(), P = prices();
    const D = C.deskTotals(S.accounts, S.positions, P, now);
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
      <div class=row style="margin:0"><button class="btn sm" data-act="reconcile" data-id="${a.id}">Match platform balance</button><button class="btn sm" data-act="edit" data-id="${a.id}">Edit</button></div></div>
      ${live ? `<div class=kv>
        <div><span>Equity (live, ${esc(pnlQuote(a.sym || T().sym).basis)})</span><b>${usd(s.equity)}</b>${s.priceComplete ? '' : ' <span class=dn small>price missing: valued at stop</span>'}</div>
        <div><span>Balance (closed)</span>${usd(s.balance)}</div>
        <div><span>Open P&L</span><b class="${cls(s.upnl)}">${usd(s.upnl)}</b> <span class=small>fees ${usd(-s.feesOpen)}</span></div>
        <div><span>Room to breach (${s.binding} limit)</span><b class="${s.room < s.profRisk * 2 ? 'dn' : ''}">${usd(s.room)}</b> (${pct(s.roomPct)})</div>
        ${a.phase === 'eval' ? `<div><span>To target ${usd(s.targetBal)}</span>${usd(s.toTarget)} · ${pct(Math.max(0, s.progress), 0)} done (on equity)</div>` : `<div><span>Payout available (est.)</span>${usd(s.payoutAvail)}</div>`}
        <div><span>If every stop fills</span>${s.riskKnown ? `<b class="${s.stopsBreach ? 'dn' : ''}">${usd(s.equityIfStopped)}</b>${s.stopsBreach ? ' BREACH' : ''}` : '<b class=dn>Unknown: a position has no stop</b>'}</div>
        <div><span>Exposure / margin used</span>${usd(s.notional)} · ${s.leverage.toFixed(2)}x · margin ${usd(s.usedMargin)} of ${usd(s.equity)}</div>
        <div><span>Today</span>${s.tradesToday} trades · ${s.lossesToday} losses</div>
      </div>
      <div class=small>Daily floor ${usd(s.dailyFloor)} (3% of ${usd(s.dayStart)} at 00:30 UTC) · used ${pct(dU, 0)}</div><div class="${barC(dU)}"><i style="width:${dU * 100}%"></i></div>
      <div class=small>Max floor ${usd(s.maxFloor)} (static) · used ${pct(mU, 0)}</div><div class="${barC(mU)}"><i style="width:${mU * 100}%"></i></div>
      ${a.phase === 'eval' ? `<div class=small>Target progress</div><div class=bar><i style="width:${Math.max(0, Math.min(1, s.progress)) * 100}%"></i></div>` : ''}
      <div style="margin-top:8px"><div class=small>Risk profile (per trade, % of start)</div><div class=profiles>${prof}</div>
      <p class=small>${esc(s.profile.note)} Per trade <b>${usd(s.profRisk)}</b> · next trade may risk <b>${usd(s.nextRisk)}</b> · about <b>${s.lossesToBreach}</b> losses of room${wins ? ` · wins to pass: ${wins}` : ''} · max ${s.profile.maxTrades} trades/day, stop after ${s.profile.stopAfterLosses} losses.</p></div>
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
        <label>BTC leverage on this account<select id=afLev><option value=10 ${!(a.leverage && a.leverage.BTC === 5) ? 'selected' : ''}>10x (bought after Aug 18, 2026)</option><option value=5 ${a.leverage && a.leverage.BTC === 5 ? 'selected' : ''}>5x (older eval)</option></select></label>
        <label>Started<input id=afDate type=datetime-local value="${new Date(a.created - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"></label>
      </div>
      <p class="small mu">Presets fill in the firm's published rules (Kraken Prop checked Nov 1, 2026). For another firm pick "Other firm" and type its target and loss limits from its rules page.</p>
      ${T().budget ? `<p class="small warn">Monthly eval budget: ${usd(T().budget)}. Only money left after bills, your cushion and your weekly buy.</p>` : ''}
      <div class=row style="margin-top:10px"><button class="btn pri" id=afOk>Save</button><button class=btn data-close>Cancel</button>${isNew ? '' : '<button class="btn bad" id=afDel>Delete</button>'}</div>`);
    const autoFee = () => { const pk = $('#afPlan').value, z = +$('#afSize').value; const base = C.PLANS[pk].price[z]; if (base != null) $('#afFee').value = +(base * ($('#afAdd').checked ? 1 + C.ADDON_90 : 1)).toFixed(2);
      const P = C.PLANS[pk]; $('#afT').value = (P.target * 100).toFixed(2); $('#afL').value = (P.mdl * 100).toFixed(2); $('#afD').value = (P.mdd * 100).toFixed(2); };
    $('#afPlan').onchange = autoFee; $('#afSize').onchange = autoFee; $('#afAdd').onchange = autoFee;
    $('#afOk').onclick = () => {
      a.plan = $('#afPlan').value; a.size = +$('#afSize').value; a.fee = num($('#afFee').value) || 0; a.addon90 = $('#afAdd').checked;
      a.phase = $('#afPhase').value; a.label = $('#afLabel').value.trim();
      const P = C.PLANS[a.plan];
      const tg = C.parseRulePct($('#afT').value, 0.5, 50), ml = C.parseRulePct($('#afL').value, 0.5, 20), md = C.parseRulePct($('#afD').value, 0.5, 20);
      const bad = [['Target', tg], ['Daily loss', ml], ['Max drawdown', md]].filter(x => x[1].error);
      if (bad.length) { alert(bad.map(x => `${x[0]} ${x[1].error}. Leave it blank to use the plan default.`).join('\n')); return; }
      const keep = (r, d) => (r.value == null || Math.abs(r.value - d) < 1e-9 ? undefined : r.value);
      a.target = keep(tg, P.target); a.mdl = keep(ml, P.mdl); a.mdd = keep(md, P.mdd);
      a.leverage = $('#afLev').value === '5' ? { BTC: 5 } : undefined;
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
      const a = acctById($('#pfA').value), s = C.accountState(a, S.positions, prices(), Date.now());
      const entry = num($('#pfE').value) || pnlPrice($('#pfS').value), stop = num($('#pfStop').value);
      if (!entry || stop == null) { $('#pfSize').innerHTML = '<span class=warn>Need entry and stop to size.</span>'; return; }
      const side = $('#pfSide').value;
      if ((side === 'long' && stop >= entry) || (side === 'short' && stop <= entry)) { $('#pfSize').innerHTML = '<span class=dn>Stop is on the wrong side of entry.</span>'; return; }
      if (!s.riskKnown) { $('#pfSize').innerHTML = '<span class=dn>An open position on this account has no stop. Log its stop first: risk is unlimited, so the app sizes nothing.</span>'; return; }
      const z = C.sizeFor({ sym: $('#pfS').value, entry, stop, risk: s.nextRisk, equity: s.equity, usedMargin: s.usedMargin, symNotional: s.openBySym[$('#pfS').value] || 0, leverage: a.leverage });
      if (z.error) { $('#pfSize').innerHTML = `<span class=dn>${esc(z.error)}</span>`; return; }
      if (fill) $('#pfQ').value = z.qty;
      const q = num($('#pfQ').value) || z.qty, loss = q * (Math.abs(entry - stop) + (entry + stop) * C.FEES.commission);
      $('#pfSize').innerHTML = `${s.profile.name}: may risk ${usd(s.nextRisk)} → <b>${z.qty} ${esc(C.base($('#pfS').value))}</b> (${usd(z.notional)}, ${z.leverage.toFixed(2)}x of ${z.levCap}x cap${z.capped ? `, <span class=warn>capped by ${z.capped === 'margin' ? 'margin left (' + usd(z.freeMargin) + ' free)' : 'the market\'s max position'}, real risk lower</span>` : ''}). Fees ≈ ${usd(z.fees)}.
        At qty ${q}: loss at stop ≈ <b class="${loss > s.nextRisk * 1.05 ? 'dn' : ''}">${usd(loss)}</b>${loss > s.room ? ' <b class=dn>— breaches the account</b>' : ''}. Stops are not guaranteed fills; slippage adds to this.`;
    };
    $('#pfCalc').onclick = () => calc(true);
    ['#pfQ', '#pfE', '#pfStop'].forEach(id => $(id).addEventListener('input', () => calc(false)));
    $('#pfSave').onclick = () => {
      const p = { id: uid(), acct: $('#pfA').value, sym: $('#pfS').value, side: $('#pfSide').value, entry: num($('#pfE').value), stop: num($('#pfStop').value),
        qty: num($('#pfQ').value), tp1: num($('#pfT1').value), tp2: num($('#pfT2').value), tf: +$('#pfTf').value, setup: $('#pfSet').value,
        thesis: $('#pfTh').value.trim(), opened: Date.parse($('#pfOpen').value) || Date.now(), partials: [], stopHist: [] };
      if (!p.entry || !p.qty) { alert('Entry and quantity are required.'); return; }
      if (p.stop == null && !confirm('No stop logged. Your rules say every trade needs one. Log anyway?')) return;
      if (!p.thesis && !confirm('No thesis written. Every trade needs a plan. Log anyway?')) return;
      p.origStop = p.stop; p.stopHist.push({ t: Date.now(), stop: p.stop });
      S.positions.push(p); posDraft = null; posFormDirty = true; saveAndSync('new'); ensureFeeds(); renderAll(true);
    };
  }
  function renderPositions() {
    const now = Date.now();
    const open = S.positions.filter(p => !p.closed);
    $('#posOpen').innerHTML = open.length ? open.map(p => {
      const price = pnlPrice(p.sym), a = acctById(p.acct);
      const net = price != null ? C.netIfClosed(p, price, now) : null, r = price != null ? C.rMultiple(p, price) : null;
      const h = lastHealth[p.id];
      return `<div class=card><div class=acct-head><div><b>${esc(p.sym)} ${p.side.toUpperCase()}</b> ${C.openQty(p)} @ ${px(p.entry)} <span class=tag>${esc(a ? a.label || C.planOf(a).name + ' ' + usd(a.size) : '?')}</span> <span class=tag>${esc(p.setup)} · ${C.tfName(p.tf)}</span></div>
        <div>${h ? `<span class="score s${h.score || 0}">${h.score || '–'}/5</span>` : ''}</div></div>
        <div class=kv><div><span>Price</span>${px(price)}</div><div><span>Net P&L if closed now</span><b class="${cls(net)}">${usd(net)}</b></div><div><span>R</span>${r == null ? '—' : r.toFixed(2) + 'R'}</div>
        <div><span>Stop</span>${px(p.stop)}${p.origStop != null && p.stop !== p.origStop ? ` <span class=small>(was ${px(p.origStop)})</span>` : ''}</div><div><span>TP1 / TP2</span>${px(p.tp1)} / ${px(p.tp2)}</div><div><span>Opened</span>${fmtTime(p.opened, true)}</div></div>
        ${p.thesis ? `<p class=small>Thesis: ${esc(p.thesis)}</p>` : ''}
        <div class=row><button class="btn sm" data-pa="stop" data-id="${p.id}">Update stop/targets</button><button class="btn sm" data-pa="partial" data-id="${p.id}">Partial close</button><button class="btn sm" data-pa="close" data-id="${p.id}">Close</button><button class="btn sm" data-pa="del" data-id="${p.id}">Delete</button></div></div>`;
    }).join('') : '<p class=mu>No open positions logged.</p>';
    const closed = S.positions.filter(p => p.closed).sort((a, b) => b.closed.t - a.closed.t).slice(0, 50);
    $('#posClosed').innerHTML = closed.length ? `<table><tr><th>Closed</th><th>Trade</th><th class=num>Net</th><th class=num>R</th><th>Notes</th></tr>${closed.map(p => {
      const tot = C.realizedOfPos(p), risk = Math.abs(p.entry - (p.origStop != null ? p.origStop : p.entry)) * p.qty;
      return `<tr><td class=small>${fmtTime(p.closed.t, true)}</td><td>${esc(p.sym)} ${p.side} ${p.qty} @ ${px(p.entry)} → ${px(p.closed.price)} <span class=small>${esc(p.setup)}</span></td><td class="num ${cls(tot)}">${usd(tot)}</td><td class=num>${risk ? (tot / risk).toFixed(2) : '—'}</td><td class=small>${esc(p.closed.note || '')}${p.widened ? ' <span class=warn>stop widened</span>' : ''}</td></tr>`;
    }).join('')}</table>` : '<p class=mu>Nothing closed yet.</p>';
  }
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
        p.stop = ns; p.tp1 = num($('#usT1').value); p.tp2 = num($('#usT2').value); saveAndSync('stop'); closeModal(); renderAll(true);
      };
      return;
    }
    const isP = pa === 'partial';
    showModal(`<h3>${isP ? 'Partial close' : 'Close'} ${esc(p.sym)} ${p.side}</h3><div class=form>
      ${isP ? `<label>Qty closed<input id=clQ type=number step=any placeholder="max ${C.openQty(p)}"></label>` : ''}
      <label>Exit price<input id=clP type=number step=any value="${price != null ? +price.toFixed(6) : ''}"></label>
      <label>Realized $ from your platform (optional, overrides estimate)<input id=clR type=number step=any></label>
      <label>Closed at<input id=clT type=datetime-local value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"></label>
      <label class=wide>Note (followed plan? mistake?)<input id=clN></label></div>
      <p class=small id=clEst></p><div class=row><button class="btn pri" id=clOk>Save</button><button class=btn data-close>Cancel</button></div>`);
    const est = () => { const q = isP ? num($('#clQ').value) : C.openQty(p), xp = num($('#clP').value); if (!q || !xp) return null; const v = C.realizedFor(p, q, xp, Date.parse($('#clT').value) || Date.now()); $('#clEst').textContent = `Estimated net after fees: ${usd(v)}`; return v; };
    document.querySelectorAll('#clP,#clT' + (isP ? ',#clQ' : '')).forEach(x => x.addEventListener('input', est)); est();
    $('#clOk').onclick = () => {
      const q = isP ? num($('#clQ').value) : C.openQty(p), xp = num($('#clP').value), t = Date.parse($('#clT').value) || Date.now();
      if (!q || !xp || q > C.openQty(p) + 1e-12) { alert('Check quantity and exit price.'); return; }
      const rv = num($('#clR').value), v = rv != null ? rv : C.realizedFor(p, q, xp, t);
      if (isP) { p.partials.push({ t, qty: q, price: xp, realized: v }); if (C.openQty(p) <= 1e-12) p.closed = { t, price: xp, realized: 0, note: $('#clN').value }; }
      else p.closed = { t, price: xp, realized: v, note: $('#clN').value };
      saveAndSync('close'); closeModal(); renderAll(true);
    };
  });

  // ---------- Import from Kraken Prop (screenshots or text) ----------
  let ocrWorker = null, lastImport = null;
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
  }
  $('#impFiles').onchange = e => { if (e.target.files.length) importFiles([...e.target.files]); e.target.value = ''; };
  $('#impPasteBtn').onclick = () => { const t = $('#impText'); t.hidden = false; t.focus(); };
  $('#impText').addEventListener('input', e => { if (e.target.value.trim().length > 20) showImport(e.target.value, Date.now()); });
  document.addEventListener('paste', e => {
    if (tab !== 'pos') return;
    const f = [...(e.clipboardData && e.clipboardData.files || [])].filter(x => /^image\//.test(x.type));
    if (f.length) { e.preventDefault(); importFiles(f); }
  });
  function showImport(text, shotTime) {
    const r = C.parseKrakenProp(text); lastImport = { r, shotTime, text };
    const A = r.account, st = $('#impStatus');
    if (!r.positions.length && !r.details.length && A.equity == null) { st.innerHTML = '<span class=dn>Nothing recognisable. Use your prop platform\'s account screen and its positions list.</span>'; $('#impPreview').innerHTML = ''; return; }
    st.textContent = '';
    const size = A.plan ? C.sizeFromLimits(A.plan, A.drawdownLimit, A.target) : null;
    const opts = S.accounts.filter(a => a.phase === 'eval' || a.phase === 'funded').map(a => `<option value="${a.id}" ${A.label && a.label === A.label ? 'selected' : ''}>${esc(a.label || C.planOf(a).name + ' ' + usd(a.size))}</option>`).join('');
    const newOpt = A.plan && size ? `<option value="new" ${!S.accounts.some(a => a.label === A.label) ? 'selected' : ''}>+ New: ${esc(A.label || A.plan)} (${usd(size)})</option>` : '';
    const ageMin = (Date.now() - shotTime) / 60000;
    $('#impPreview').innerHTML = `<div class=kv>
        <div><span>Account</span>${esc(A.label || '—')}</div><div><span>Equity</span>${A.equity != null ? usd(A.equity) : '—'}</div>
        <div><span>Daily loss limit</span>${A.dailyLimit != null ? usd(A.dailyLimit) : '—'}</div><div><span>Drawdown limit</span>${A.drawdownLimit != null ? usd(A.drawdownLimit) : '—'}</div>
        <div><span>Open P&amp;L (sum)</span>${r.upnlSum != null ? usd(r.upnlSum) : '— (not on screen)'}</div><div><span>Balance (equity − open P&amp;L)</span>${r.balance != null ? usd(r.balance) : '—'}</div></div>
      ${r.positions.length ? `<table><tr><th>Side</th><th class=num>Qty</th><th class=num>Entry</th><th class=num>P&amp;L</th><th>Stop</th></tr>${r.positions.map(p => `<tr><td class="${p.side === 'short' ? 'dn' : 'up'}">${esc(p.side)} ${esc(p.base)}</td><td class=num>${p.qty}</td><td class=num>${px(p.entry)}</td><td class="num ${cls(p.upnl)}">${p.upnl != null ? usd(p.upnl) : '—'}</td><td>${p.hasSL ? 'SL on platform' : '<b class=dn>NO SL</b>'}${p.hasTP ? ' · TP' : ''}</td></tr>`).join('')}</table>` : ''}
      ${r.details.length ? `<table><tr><th>Position details read</th><th class=num>Size</th><th class=num>Stop</th><th class=num>Target</th><th>Opened</th></tr>${r.details.map(d => `<tr><td class="${d.side === 'short' ? 'dn' : 'up'}">${esc(d.side)} ${esc(d.base)}${d.entry ? ' @ ' + px(d.entry) : ''}</td><td class=num>${d.qty}</td><td class=num>${d.sl != null ? px(d.sl) : '—'}</td><td class=num>${d.tp != null ? px(d.tp) : '—'}</td><td class=small>${d.openedMs ? fmtTime(d.openedMs, true) : '—'}</td></tr>`).join('')}</table>` : ''}
      ${!r.positions.length && !r.flat ? '<p class=small>No position list in these screenshots: your open positions stay as they are' + (r.details.length ? '; details are added to the matching ones.' : '.') + '</p>' : ''}
      ${r.warnings.map(w => `<p class="small warn">${esc(w)}</p>`).join('')}
      ${ageMin > 10 ? `<p class="small warn">These screenshots are ${Math.round(ageMin)} min old. Prices may have moved; the balance is still right if no trade closed since.</p>` : ''}
      <div class=row style="margin-top:8px"><select id=impAcct>${opts}${newOpt}</select><button class="btn pri" id=impGo>Looks right: sync</button></div>
      <p class="small mu">Sync sets this account's balance and daily limit to your platform's, replaces its open positions with these (keeping your notes on ones that match), and marks missing ones as closed on your platform.</p>`;
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
    const t = Math.min(now, shotTime || now);
    if (r.balance != null) acct.anchor = { t, bal: r.balance };
    if (A.dailyLimit != null) acct.dayStartOverride = { reset: C.lastReset(t, acct.resetMin), bal: A.dailyLimit / (1 - C.planOf(acct).mdl) };
    // Match open positions: keep notes on ones that still exist; add new ones; close the rest.
    const open = S.positions.filter(p => p.acct === acct.id && !p.closed);
    const used = new Set();
    const reconcile = r.positions.length > 0 || r.flat;   // only when the position list is on screen
    for (const q of (reconcile ? r.positions : [])) {
      const m = open.find(p => !used.has(p.id) && p.side === q.side && p.sym === q.sym && Math.abs(C.openQty(p) - q.qty) < 1e-9 && Math.abs(p.entry - q.entry) < 0.01);
      if (m) { used.add(m.id); m.krakenSL = q.hasSL; m.krakenTP = q.hasTP; continue; }
      const p = { id: uid(), acct: acct.id, sym: q.sym, side: q.side, qty: q.qty, entry: q.entry, stop: null, origStop: null, tp1: null, tp2: null,
        tf: 15, setup: 'Imported', thesis: '', opened: t - 1, openedUnknown: true, partials: [], stopHist: [], krakenSL: q.hasSL, krakenTP: q.hasTP, source: 'kraken-import' };
      S.positions.push(p); used.add(p.id);
    }
    if (reconcile) for (const p of open) if (!used.has(p.id)) p.closed = { t, price: null, realized: 0, note: 'Closed on platform (found by import)', synced: true };
    // Position detail sheets: stop/target, real open time. Match by side + coin + size (+ entry when shown).
    let setN = 0; const unmatched = [];
    for (const d of r.details) {
      let cands = S.positions.filter(p => p.acct === acct.id && !p.closed && p.side === d.side && p.sym === d.sym && Math.abs(C.openQty(p) - d.qty) < 1e-9);
      if (d.entry != null && cands.some(p => Math.abs(p.entry - d.entry) < 0.01)) cands = cands.filter(p => Math.abs(p.entry - d.entry) < 0.01);
      const p = cands.find(x => x.stop == null) || cands[0];
      if (!p) { unmatched.push(`${d.side} ${d.qty} ${d.base}`); continue; }
      if (cands.length > 1) unmatched.push(`${d.qty} ${d.base}: ${cands.length} positions share this size, applied to one; check them`);
      if (d.sl != null && d.sl !== p.stop) {
        const wider = p.stop != null && (p.side === 'short' ? d.sl > p.stop : d.sl < p.stop);
        if (wider) p.widened = true;
        p.stopHist.push({ t, stop: d.sl, why: wider ? 'moved farther on platform (import)' : 'from platform (import)' });
        p.stop = d.sl; if (p.origStop == null) p.origStop = d.sl;
      }
      if (d.tp != null) p.tp1 = d.tp;
      if (d.sl != null) p.krakenSL = true; if (d.tp != null) p.krakenTP = true;
      if (d.openedMs && d.openedMs <= now) { p.opened = d.openedMs; p.openedUnknown = false; }
      setN++;
    }
    // The screenshot also shows Prop's real price: use it to calibrate, if it's fresh.
    const withPx = r.positions.find(q => q.price > 0) || r.details.find(q => q.price > 0);
    if (withPx && now - t < 10 * 60000) { const qq = pnlQuote(withPx.sym); if (qq.raw && Math.abs(withPx.price / qq.raw - 1) < 0.01) S.calib.push({ t, sym: withPx.sym, prop: withPx.price, est: qq.raw }); }
    save(); ensureFeeds(); lastImport = null; $('#impPreview').innerHTML = ''; $('#impText').value = ''; $('#impText').hidden = true;
    $('#impStatus').innerHTML = `<b class=up>Synced ${esc(acct.label || 'account')}</b>: ${reconcile ? r.positions.length + ' open position(s)' : 'positions unchanged'}${setN ? `, ${setN} position detail(s)` : ''}.` + (unmatched.length ? ` <span class=warn>Not matched: ${esc(unmatched.join('; '))}</span>` : '');
    posFormDirty = true; autoPush('import'); switchTab('coach');
  }

  // ---------- Coach ----------
  const lastHealth = {};
  const notified = {};
  function coachFor(p) {
    const A = analyses[p.sym] || (analyses[p.sym] = analyze(p.sym));
    const a = acctById(p.acct);
    const st = a ? C.accountState(a, S.positions, prices(), Date.now()) : null;
    const ec = F.candles(p.sym, p.tf);
    return C.health(p, { price: A.price, ageSec: A.ageSec, maxAge: T().maxAge, struct: A.struct, fvg: { 15: A.fvg[15], 60: A.fvg[60] }, levels: A.levels,
      atr: A.atr, acct: st, rules: { beAt1R: T().beAt1R }, entryStruct: ec.length > 10 ? C.structure(ec) : null, now: Date.now() });
  }
  let analyses = {};
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
    const acctHtml = liveAccts().map(a => { const s = C.accountState(a, S.positions, P, now);
      return `<div class=small><b>${esc(a.label || C.planOf(a).name + ' ' + usd(a.size))}</b>: room ${usd(s.room)} (${s.binding}), open risk ${s.riskKnown ? usd(s.riskToStops) : 'UNLIMITED (no stop)'}, ${s.profile.name} next ${usd(s.nextRisk)}. ${s.warnings.map(w => `<span class="${w.lvl === 'bad' ? 'dn' : 'warn'}">${esc(w.text)}</span>`).join(' ')}</div>`; }).join('');
    const cards = open.map(p => {
      const h = lastHealth[p.id] || coachFor(p);
      return `<div class=card><div class=acct-head><b>${esc(p.sym)} ${p.side.toUpperCase()} · ${C.tfName(p.tf)} ${esc(p.setup)}</b><span class="score s${h.score || 0}">${h.score || '–'}/5 ${h.label}</span></div>
        <p><b>Proposal:</b> ${esc(h.proposal)}</p><div class=items>${h.items.map(i => `<div class="${i.k}"><b>${i.k}</b>${esc(i.t)}</div>`).join('')}</div></div>`;
    }).join('');
    const sym = T().sym, A = analyses[sym] || analyze(sym);
    const ups = C.setupsToWatch(sym, A, { minRR: 2 });
    const reviews = liveAccts().map(a => {
      const R = C.accountReview(a, S.positions, P, now), st = R.state;
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
      <div class=card><h3>Other setups on ${esc(sym)} <span class=tag>untested idea, not a signal</span></h3>${ups.length ? ups.map(u => `<div class=small>${esc(u.text)}</div>`).join('') : '<p class=mu>Nothing clean right now. No trade is fine.</p>'}</div>
      <p class="small mu">Score 1–5 is a rule checklist (stop, breach line, 1h/4h structure, entry-TF break, levels before target, your BE rule), not a win probability. It never suggests widening a stop. Updates every few seconds while this page is open; it does not watch when the app is closed.</p>`;
  }
  $('#coachBox').addEventListener('click', e => {
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
    const keep = ['id', 'label', 'plan', 'size', 'phase', 'profile', 'leverage', 'resetMin', 'target', 'mdl', 'mdd', 'anchor', 'dayStartOverride', 'created'];
    const accts = liveAccts().map(a => Object.fromEntries(keep.filter(k => a[k] !== undefined).map(k => [k, a[k]])));
    const pos = S.positions.filter(p => !p.closed && accts.some(a => a.id === p.acct)).map(p => ({ id: p.id, acct: p.acct, sym: p.sym, side: p.side, qty: p.qty, entry: p.entry,
      stop: p.stop, origStop: p.origStop, tp1: p.tp1, tp2: p.tp2, tf: p.tf, opened: p.opened, openedUnknown: !!p.openedUnknown, krakenSL: !!p.krakenSL, partials: p.partials || [] }));
    return { v: 1, updated: Date.now(), symbols: T().symbols, rules: { beAt1R: !!T().beAt1R }, calib: S.calib.slice(-10), accounts: accts, positions: pos };
  }
  // Auto-send: GitHub fine-grained token (this repo only, Contents read/write), kept in its own key so backups never include it.
  const GH_KEY = 'kpd_gh';
  const ghRepo = () => (T().monRepo || '').trim();
  const ghFile = () => `https://api.github.com/repos/${ghRepo()}/contents/monitor/watch.json`;
  const ghToken = () => { try { return localStorage.getItem(GH_KEY) || ''; } catch (e) { return ''; } };
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
    for (const a of liveAccts()) { const s = C.accountState(a, S.positions, P, now);
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
      <label class=chk><input type=checkbox id=stBe ${t.beAt1R ? 'checked' : ''}> Move stop to breakeven at +1R (coach enforces it)</label>
      <label>Monthly eval budget $ (after bills, cushion, weekly buy)<input id=stBud type=number step=any value="${t.budget || ''}"></label></div>
      <p class="small mu">Profiles (per trade, % of starting balance): ${C.PROFILES.map(p => `${p.name} ${p.riskPct}% · max ${p.maxTrades} trades · stop after ${p.stopAfterLosses} losses`).join(' | ')}.</p></div>
      <div class=card><h3>Theme</h3><div class=swatches>${THEMES.map(th => { const c = th.id === 'classic' ? '#5b9cff' : `hsl(${th.id === 'custom' ? t.hue : th.hue},${th.sat != null ? th.sat : 100}%,62%)`;
        return `<button data-theme="${th.id}" class="${t.theme === th.id ? 'on' : ''}" style="color:${c}">${esc(th.name)}</button>`; }).join('')}</div>
      <label class=small style="display:block;margin-top:10px">Color (slide through every hue)<input type=range id=stHue min=0 max=359 value="${+t.hue || 0}"></label>
      <div class=row style="margin:8px 0 0"><label class=chk><input type=checkbox id=stScan ${t.scan ? 'checked' : ''}> Scanlines</label><label class=chk><input type=checkbox id=stGlow ${t.glow !== false ? 'checked' : ''}> Glow</label></div>
      <label class=small style="display:block;margin-top:10px">Chart colors<select id=stChart><option value=tv ${t.chartStyle !== 'theme' ? 'selected' : ''}>TradingView (green/red candles)</option><option value=theme ${t.chartStyle === 'theme' ? 'selected' : ''}>Match theme (Fallout look)</option></select></label>
      <p class="small mu">Gains and bull read green, losses and bear read red, stops and danger stay red, cautions yellow, in every theme.</p></div>
      <div class=card><h3>24/7 monitor key</h3><p class=small>Paste a GitHub fine-grained key for <b>your monitor repo only</b>${ghRepo() ? ' (' + esc(ghRepo()) + ')' : ''}, permission <b>Contents: Read and write</b>. Then every import and trade change updates the monitor by itself. The key stays on this phone and is never in backups.</p>
      <label class=small style="display:block;margin-bottom:6px">Monitor repo (owner/name)<input id=ghRepo value="${esc(ghRepo())}" placeholder="you/your-monitor-repo" style="width:100%"></label><div class=row><input id=ghTok type=password placeholder="${ghToken() ? 'Key saved (paste to replace)' : 'github_pat_…'}" style="flex:1;min-width:180px"><button class="btn sm" id=ghSave>Save &amp; test</button>${ghToken() ? '<button class="btn sm bad" id=ghDel>Remove</button>' : ''}</div><p class=small id=ghStat>${S.lastPush ? 'Last update ' + fmtTime(S.lastPush, true) : ''}</p></div>
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
    bind('#stBe', el => { T().beAt1R = el.checked; }); bind('#stBud', el => { T().budget = num(el.value) || 0; });
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
