# Prop Desk: brief for regular Claude chats
Public brief for Prop Desk, a hobby project. (updated 2026-11-06, main 35dcc87). Don't edit by hand.

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
As of Nov 6, 2026: short-term FVG/sweep entries have not beaten random after costs. H15 S2 daily trend showed a small first-pass edge (+0.069R), but its drawdown is unsuitable for a 3% evaluation without tiny risk. H19's historical portfolio improved on the single trend rule but remains slow for evaluation risk. H16/H20 did not validate. H25 fixed targets and H26/H27 target methods did not validate; H28 target placement is paused and no target is approved. Research summaries are descriptive context, not active trade rules.

## Next work
- Keep all target-placement research paused until the owner explicitly resumes it; no target is approved.
- Keep public app changes on sanitized, owner-reviewed pull requests; do not change Cloudflare Access without an owner request.

## Cold start (any AI)
This is the public copy of the brief, published by pull request the owner approves. Read it, follow the rules above, then ask the owner what to do next. Work done in a chat goes back to the master repo through the FOR THE MASTER REPO block.
