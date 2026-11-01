# GOD PREDITOR — LuckyJet Neural

Standalone Russian mobile page. Serve this directory over HTTP; no build required.

- Source logic: user's historique-public-audit-20261031.zip, identical SHA256 to the previously audited archive. `extracted/basic-forecast.mjs` preserved byte for byte.
- `engine.js` keeps the original pattern analysis, window start and duration; restricts target to 1.50 or 2.00. Auto uses 2.00 when the source goal is at least 2 and recent 50-round 2x frequency is at least 50%, otherwise 1.50. This is a heuristic policy, not measured predictive accuracy. No large-X opportunity signals are emitted.
- Confirmed result: first completed round at or above the target within the fixed window, after signal creation. Miss requires continuous feed_order coverage bracketing the whole window. Gaps are unknown and rechecked. Not a per-bet return or guaranteed entry time; history API does not expose a betting-open state.
- Supabase read-only public classic feed + status RPC, paginated full archive and IndexedDB cache. No service key, Telegram token or game session.
- Original neon brain and courier spider renderer. Electric tentacle algorithm adapted from Masud Rana's MIT-licensed weird-monster; license in vendor/. One bounded RAF loop, responsive Canvas, motion toggle, reduced-motion support.
- New local journal namespace; old pages and old histories are not modified.

Run `npm test` for deterministic data-flow and signal validation tests. Public API checks confirm data connectivity, not prediction accuracy against future rounds. Viewport/browser visual testing depends on browser availability.
