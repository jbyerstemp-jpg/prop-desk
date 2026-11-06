# Prop Desk: brief for regular Claude chats
Public brief for Prop Desk, a hobby project. (updated 2026-11-06, main 3bddca9). Don't edit by hand.

## How chats work (owner, Nov 2 2026)
- This is a talk-only session: brainstorm, plan, review ideas or trades. You can't run code or change the repo here, so don't write code unless he asks for a snippet.
- Owner: a hobby trader who wants plain English, answer first, short. Give direct links for every website step.
- Brainstorm rules: reflect ideas back plainly, poke holes against his rules below, at most one question, number the ideas. On "Distill": numbered list with what, why, open questions, size (small / medium / big) and rule clashes.
- Before he leaves, if anything should reach the master repo, end with ONE block he can paste into a Claude Code session:
```
FOR THE MASTER REPO (from chat, <date>)
Save ideas: <numbered distilled ideas>
Decisions: <only what he actually decided>
Do: <task, only if he asked for one>
```
- Switch flag: when what he wants needs a code session, say so in one line, once per topic: "🔀 Time for a code session: <why>". It does when the task needs repo files beyond this brief, running tests or a backtest, changing the app or its rules, the app's own data (positions, paper record, monitor), or saving ideas (5+ distilled ideas, or any decision he's made). Give the FOR THE MASTER REPO block with it.
- Facts here can be up to a few days old; current prices and market data aren't in this brief. Research for his own decisions, not financial advice.

## His rules
- No trading with bill money.
- No leverage without a written rule (the risk profiles are the rules).
- Every trade needs a plan.
- Never widen a live stop; stops only tighten. (A wider stop chosen BEFORE entry with a smaller size is setup design, allowed.)
- Trade both ways only when structure agrees (4h trend, or 1h and 15m both turned): C.directionCheck.
- Never raise risk to catch up. 'No trade' is valid. Nothing is financial advice.

## Hard rules (the app and any assistant)
- No code places orders, moves money or stores exchange keys (the prop platform has no API).
- Free public data only (the spot feed WS v2 + REST, the futures feed mark, Coinbase fallback, Hyperliquid mids cross-check). No paid sources without the owner's OK.
- Shared-pool uploads wait for the in-app consent choice. The server stores a salted hash of the anonymous install id, never the id, and never size, balance or account fields. Nightly verification and shrinkage must be pre-registered before they change a rating, an alert or a size.
- Escape all user/third-party text with esc() before innerHTML.
- Research: pre-register rules and pass bar BEFORE running (docs/research/HYPOTHESES.md), log every variant (RESEARCH-LOG.md), held-out + placebo, never upgrade evidence labels without evidence. Nothing reaches alerts/sizing without held-out confirmation, paper trades and the owner's star.
- Research results are data for the model engine (monitor/engine-data.json), not setups, alerts or sizing by themselves. The coach still gives ideal setups from current market data (labeled untested unless validated), using engine data as context (owner, Nov 2, 2026).
- Coach scores are rule checklists, not probabilities. Never auto-tag a loss as a mistake.
- No personal values in app code without a // PRIVATE marker; build-public.js must report no personal info.
- Actions: no third-party actions; runners ubuntu-24.04.

## the prop platform (Advanced)
- advanced: target +9% of start; daily loss 3% below balance at the 00:30 UTC reset; max drawdown 3% below start, static; pass and breach on equity
- fees: 0.04% per side on notional; swap 0.0055% of notional every 4 h from each position's open time
- leverage: BTC 10x; ETH, SOL, XRP, LINK, LTC, DOGE, AVAX, SUI 5x; HYPE, WLD 3x; others 2x (js/core.js LEVERAGE)
- platform: No partial take-profit orders: partials are manual market closes; the TP order closes whatever is left.

## Research so far
As of Nov 2, 2026 (101 variant runs): no FVG/sweep entry rule beats random entries after costs. FIRST PASS: H15 S2 daily moving-average trend (20/50-day, 2-ATR stop) is profitable after costs on 10 years of daily data, beats random entries and holds at ±20% (label 3, replay-reproduced). The edge is small (+0.069R), mostly long side, weaker since 2021, and its drawdowns (−28R) don't fit a 3% evaluation; it needs 30+ paper trades and the owner's star before any use. Macro regime (H16) did not validate as a filter. SECOND PASS: H19 trend portfolio (six daily trend rules at 1/6 size, no picking) beat the MA trend alone on 2021–2026 (return/drawdown 1.08 vs 0.26, daily t 2.74, label 3); full-period worst drawdown −13.4R vs −35.6R. Drawdown control (H20) did not validate. Still slow for a 3% evaluation (~30 months to +9% at drawdown-safe risk). H25 (Nov 5): fixed 1R/2R/3R targets were not validated; Coinbase development selected X0, and the separate Bitstamp-only XRP sensitivity was negative on held-out. No target is authorized for UI/model use. H26 (Nov 5): on the registered development slice, 10R was highest only within the tested 1R–10R grid and won at the boundary; C180 mean was higher, with path-dependent cohorts. H26 is exploratory/not validated; no target or app change is approved. Full table in docs/research/RESEARCH-LOG.md. H27 (Nov 5): independently audited target-switch study is exploratory/not validated. Development leader was stall_1d_20 (+0.242295R, n=57); frozen holdout was −0.152875R (n=61), below static 10R and time-only controls. Pass bar is not evaluable because static 10R holdout n=27 < 30. All 22 variant/window summaries, 12 sensitivities and 207,057 rollover marks reconciled with zero discrepancies. Raw trades remain mode-0600 in /tmp; full aggregate-only results are in tasks/2026-11-05-h27-aggregate-results.json. H27 tests fixed 2R/10R switch timing only, not Fibonacci target placement. After separate owner authorization, H26/H27 were added to the generated evidence index as not validated, setup=false context only; no active target/model rule, app code, alert or sizing behavior changed. Cap-boundary precedence is explicit: honor active exits, charge only on observed open if still open, and do not activate a new switch at the exact cap; terminal gaps/cutoffs do not infer marks.

## Next work
- Try the normal non-admin merge of PR #84 only after the current Pages preview succeeds; do not bypass checks. If GitHub blocks it, stop and explain the failed separate Worker preview/log-access limitation.
- After private main merges, monitor Publish public app; inspect sanitized public PR #8 and its Cloudflare Pages check, then merge it without changing Access.
- After both merges, run node tools/state.js --confirm and return the exact master-repo receipt; keep H25-H27 targets not validated.
- Keep long-term copy-control scope and target-placement method as independent owner decisions; no target is approved.
- Release status: private PR #83 merged once (847a309); the owner reports the private live link works. Public mirror PR #7 merged (153d568). The public Pages host still showed Cloudflare Access on last verification; owner deferred public-only Access changes, and no Access policy was changed. No new public sync is authorized for this feature branch.
- Physical iPhone Safari check: the app link works per owner report, but chart fullscreen has not been explicitly confirmed on device. Do not treat Chromium mobile emulation as physical-device verification.
- Shared pool step 2 is not built. Pre-register nightly public-candle verification and shrinkage in docs/research/HYPOTHESES.md before either one changes a rating, alert, size, or Trust/Bench. Step 1 only collects (docs/research/POOL.md).
- Fresh session: pick one of ownerOpen (confirm the monitor is live is first), or 'Do #n' from tasks/ideas.md. Workflow: brainstorm in a regular chat (Prop Desk project, docs/CHAT.md), save with the FOR THE MASTER REPO block, build in a code session.
- H24: let auto paper trades collect; when a setup type has 30+ closed auto trades, report by type and model version (auto vs hand-picked) against the pre-registered bar. Optional: have the Worker open them 24/7 once its secrets are set and its key has Contents read/write.
- Wait for 30+ closed paper trades each on the MA trend system and the H19 trend portfolio (both in Coach → Paper trading workspace since Nov 2, 2026), then compare with the backtest and let the owner decide.
- Optional (owner): pre-register a 'high-conviction' test: are trend trades where 5–6 of 6 rules agree and all timeframes line up better enough to justify a written, capped larger risk tier?
- Strategy lab round 2 (owner's choice): candidates are a trend portfolio (several daily trend rules combined, one bet), the MAX new-highs strategy from the literature, and drawdown control on the trend system; pre-register before running.
- Owner picks the next research test; pre-register it in docs/research/HYPOTHESES.md before running.
- Use trade snapshots in research: once 30+ closed trades have snapshots, pre-register what to compare (e.g. trend agreement, session, volatility regime vs result).
- Paper trades: tag each with the analog read and the H6 macro regime (forward tests H8, H10).
- Event calendar (FOMC/CPI/NFP) from an official source -> gate 2 of the card verdict.
- Trader benchmarks: retry Coinversa per-wallet lifecycle stats (random samples), then MASTER items 18-19.
- Build a CSV import for the prop platform Trades/Ledger exports once the owner sends one (identifiers removed).

## Cold start (any AI)
This is the public copy of the brief, published by pull request the owner approves. Read it, follow the rules above, then ask the owner what to do next. Work done in a chat goes back to the master repo through the FOR THE MASTER REPO block.
