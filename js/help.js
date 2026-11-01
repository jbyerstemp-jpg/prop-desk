/* Help tab: a start guide and FAQ for new users. Static text only (no outside strings), so it's safe as innerHTML.
   Keep it platform-neutral: Kraken Prop is one preset, not the only firm. */
(function (root) {
  'use strict';
  const Q = (q, a) => `<details class=faq><summary>${q}</summary><div class=small>${a}</div></details>`;
  function helpHtml() {
    return `
<div class=card><h3>Start here: 5 steps</h3>
<ol class=small style="padding-left:18px;margin:0">
  <li><b>Add your prop account.</b> Desk → <b>+ Add prop account</b>. Pick the plan and size (or let a screenshot do it in step 2).</li>
  <li><b>Import screenshots from your prop platform.</b> Positions → <b>📷 Import screenshots</b>. Best set: the Portfolio screen, the positions list, each position's TP/SL, History → Trades and History → Ledger. Check the preview, then tap <b>Looks right: sync</b>.</li>
  <li><b>Check the Desk.</b> Equity, room before a breach, daily and max-drawdown floors, and progress to the target, updated live.</li>
  <li><b>Read the Coach.</b> Each open position gets a 1–5 health check and exact stop/target suggestions with reasons. Stops only ever tighten.</li>
  <li><b>Turn on phone alerts</b> (optional). Settings → Phone alerts → <b>Create my private channel</b>, then subscribe in the free ntfy app.</li>
</ol>
<p class="small mu" style="margin:8px 0 0">This app never places trades and never asks for exchange keys. You trade on your platform; the app does the math and keeps you honest.</p></div>

<div class=card><h3>Frequently asked questions</h3>
${Q('Is this financial advice? Does it trade for me?', 'No to both. It is a calculator, chart and checklist. It places no orders and moves no money. Setups it shows are <b>untested ideas, not signals</b>, until a backtest says otherwise (see the Track record card on the Chart tab).')}
${Q('Where is my data kept?', 'In this browser on this device only. Nothing is uploaded unless you turn on the optional 24/7 monitor or send a question. One exception (see below): when the reader misses something, the screen\'s layout (every number replaced) is sent to improve it. Use Settings → <b>Export backup</b> now and then, and Import it on a new phone.')}
${Q('Which screenshots should I import?', '<b>Portfolio</b> (balance, equity, limits), the <b>positions list</b> with the Closed section, each position\'s <b>TP/SL</b> and <b>Details</b> sheets (stop, target, open time), <b>History → Trades</b> (exact fills, trade count) and <b>History → Ledger</b> (exact balance, fees). For a firm other than Kraken Prop, also the <b>order screen</b> for each coin you trade: it shows the leverage, which the app takes from the venue instead of asking you. You can pick several at once. They are read on your phone; the pictures are never uploaded.')}
${Q('Does the app learn from screenshots?', 'Yes, carefully. When a screenshot isn\'t fully read (a new exchange, a changed layout), the app sends that screen\'s <b>layout only</b>: every number becomes 9 and account numbers and emails are removed, so no balance, size or price ever leaves your phone, and never the picture. The developer turns those layouts into reader fixes and tests, which arrive in the next update. The app never changes its own reader by itself, so an update can\'t quietly change your numbers. Turn it off any time in Settings → Help improve the reader.')}
${Q('What does "sync" change?', 'Your account\'s balance, equity, daily loss limit, drawdown limit and target are set to the platform\'s. Open positions become exactly the screenshot\'s list: matches keep your notes, stop and target; positions no longer on screen are closed with the result from the Closed list. The preview shows every change before you tap sync.')}
${Q('The reader got a number wrong or read nothing. What now?', 'Try a sharper screenshot (no zoom, full screen) and check the preview before syncing: nothing changes until you tap sync. If it still misreads, use <b>Add a trade manually</b> and send a question below saying which screen and platform it was.')}
${Q('Why is the app\'s P&amp;L a little different from my platform\'s?', 'Prop firms don\'t publish their own price. The app uses an estimate from public exchange prices ("Prop est"). To tighten it, on the Chart tab type the price your platform shows into <b>Match Prop price</b>; the app learns the gap. Re-importing screenshots also resets everything to the platform\'s numbers.')}
${Q('What do "room" and the floors mean?', '<b>Daily floor</b>: the equity your account can\'t go below today (resets at the firm\'s daily time; Kraken Prop 00:30 UTC). <b>Max floor</b>: the overall drawdown line. <b>Room</b>: how far equity is above the nearer floor. Next-trade size is capped so a stop-out never uses more than 90% of the room.')}
${Q('What are the risk profiles (Safe … Sprint)?', 'Your written rule for how much each trade may risk, as a % of the starting balance, plus a max number of trades and losses per day. The app sizes every trade from it. Pick one on each account; change it in Settings.')}
${Q('What does the Coach health score mean?', 'A checklist, not a probability: does the position have a stop, is structure still with you, is the stop past the breach line, and so on. 5 = everything checks out, 1–2 = act on your plan. It never suggests widening a stop.')}
${Q('How do I take a setup live?', 'On any setup list (Chart, Coach, Scan all coins) tap <b>Take it live</b>, pick the account (eval or funded), check the size and write one line of plan. The app picks the order: <b>market</b> when the price is within a quarter of the 1h ATR of the level (or already through it), otherwise a <b>limit</b> at the level. An open <b>paper trade</b> can be taken live the same way from the Paper tab. It becomes a <b>planned</b> trade on the Positions tab: nothing counts yet. <b>Market</b>: place it, then tap <b>✅ It\'s live</b>. <b>Limit</b>: place it, tap <b>📌 Limit placed</b>; it stays a working order (not counted) and becomes an open position by itself when price reaches your limit. Importing the screenshot also picks it up. Each setup is used once, on paper or live; it shows "Not used yet" or how and where it was used, even if you later delete the trade.')}
${Q('What is Paper trading?', 'Practice without money. Tap <b>Paper trade</b> on any setup: it opens at the live price and closes itself at the stop or target. You can run a simulated prop account with the same rules to see whether you\'d pass.')}
${Q('Does the model get better as I trade?', 'Yes. Every closed paper trade, and every closed live trade tagged "followed plan", is scored in R under its setup type on the <b>Scorecard</b> (Paper tab), beside the replay on past candles and everyone\'s pooled results. After 30 trades a setup is called proven, disproven, below replay or unclear, by rules fixed before any results. You accept each change: ★ trusted setups are listed first, benched ones stop sending phone alerts. It never changes your size. When the rules themselves improve, the model gets a new version, the app shows "new version ready", and the record starts fresh for the new rules. To link a live trade, use <b>Plan it</b> on a setup, or pick its setup in the journal.')}
${Q('How do phone alerts work?', 'Through ntfy, a free app; no account needed. Alerts fire only when something starts or gets worse (stop close, target hit, room low, breach), the most urgent first, and the same alert waits 2 hours. While the app is open it checks every minute. For alerts with the app closed, set up the 24/7 monitor (<a href="MONITOR-SETUP.md" target=_blank rel=noopener>guide</a>).')}
${Q('What does "Reset my day" do?', 'It restarts the app\'s own trade and loss counters only, never your platform\'s limits. It is logged as a rule break unless you tick "Accidental trade or technical reason", so your journal stays honest.')}
${Q('The price looks stuck or a feed shows red.', 'Tap <b>↻ Refresh</b> at the top. The Chart tab\'s Live data check compares four free sources and flags any that disagree. If none load, the app values positions at their stops (worst case) instead of guessing.')}
</div>

<div class=card><h3>Questions, ideas, problems</h3>
<p class=small>Send them straight to the developer. It opens a prefilled page on GitHub (free account needed) where they're kept and answered.</p>
<div class=row><button class="btn pri" id=fbBtn>💬 Send a question or comment</button></div>
<p class="small mu" id=fbNote></p></div>`;
  }
  root.PDHelp = { helpHtml };
})(typeof self !== 'undefined' ? self : this);
