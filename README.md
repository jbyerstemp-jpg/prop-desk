# Prop Desk

A free, private chart, risk desk and trade coach for prop-firm evaluations and funded accounts. Runs in your phone's browser. No account, no server, no keys.

- **Chart:** live crypto candles (candles, hollow, Heikin Ashi, bars, line, area), day/week levels, sessions, opening range, VWAP, fair value gaps, structure breaks, EMAs, volume. Full screen.
- **Desk:** each prop account's equity, daily and max-drawdown floors, room before a breach, target progress, total spent on evaluations vs payouts. Risk profiles from Safe to Sprint.
- **Import from screenshots:** screenshot your prop platform and the app reads it on your phone (nothing is uploaded), then syncs balance, limits, positions, stops and targets. The Kraken Prop layout is tested; other platforms use a general reader that asks you to check every number.
- **Coach:** a 1–5 health check per position (a rule checklist, not a prediction) and an account review: risk if every stop fills, breach price, planned risk vs your profile, reward at targets.
- **Optional 24/7 monitor:** a GitHub Actions job runs the same model every 15 minutes and sends phone alerts (ntfy) only when something changes.
- **Themes:** black background, Pip-Boy style colors with a hue slider. Gains always green, losses always red.

## Use it
Open the hosted page and add it to your home screen. Your accounts and trades stay in your browser; use Settings → Export backup.

## Rules and data
- Firm presets: Kraken Prop (Advanced, Intermediate, Starter), checked Nov 1, 2026, plus "Other firm" where you type your firm's rules. Always confirm against your firm's own rules page.
- Market data: free public feeds (Kraken spot and futures, Coinbase, Hyperliquid), cross-checked against each other. A prop firm's own price isn't public; the app estimates it and you can calibrate it with "Match prop price".

## Optional monitor (your own copy)
1. Fork or copy this repo (private is fine). 2. Add an Actions secret `NTFY_TOPIC_PROP` with a hard-to-guess ntfy topic and subscribe to it in the ntfy app. 3. Make a fine-grained GitHub key for that repo only (Contents: read and write), paste it in Settings → 24/7 monitor key and set the repo name. Imports then update the monitor automatically.

## Not advice, not affiliated
For your own research and decisions. Not financial advice. No trading or orders are placed by this app. Not affiliated with, endorsed by or connected to Kraken or any prop firm; names are used only to describe compatibility.

MIT License.
