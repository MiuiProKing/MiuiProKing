# GOD PREDITOR · LUCKYJET Orb

An isolated, minimal edition of the existing LuckyJet History Lab. The original website, collector and calculation functions are unchanged.

## Screen

- Purple core/rings connection loader.
- Five latest actual LuckyJet coefficients and Kyiv times.
- One locally bundled Thinking Orbs renderer: green reasoning/squares, blue searching/crosses, purple compacting/crosses.
- Registered cloud target, original entry time and countdown to window close.
- History dialog with all-time hit, miss, unknown and pending counts, and paginated window results.

The interface reads the existing `lucky_lab_report` prediction and its registered ordinary window. It does not create replacement signals or alter their times. A target is an estimate, and a window result records whether a coefficient was reached; it does not represent betting profit or guaranteed accuracy. Missing verification remains unknown.

## Data

Uses the existing read-only Supabase client configuration and `luckyjet_classic_history`, `luckyjet_cloud_status`, `lucky_lab_report`. The complete available coefficient archive is downloaded with keyset pagination and retained in a separate IndexedDB database. The five-card display does not limit this archive. Existing server calculations retain their original model and sample selection.

`backend/journal.sql` adds only a read-only `lucky_orb_journal` RPC for the all-time ordinary window journal. No collector, original page or existing calculation function is modified. Its pagination cursor retains PostgreSQL microsecond precision.

## Run and verify

Serve the current folder with a static HTTP server. No build or package installation is needed. Run `node --test tests/*.test.mjs` from this project directory.

The public GitHub branch contains the same static files directly next to its `index.html`; its tests use that flattened layout. The Supabase journal migration is already installed for the configured project.

No provider session, AI API secret or service-role key is included. `config.js` contains the pre-existing public anonymous read client configuration.

Thinking Orbs 0.1.2 is MIT licensed; see `vendor/thinking-orbs/LICENSE` and `NOTICE.md`.
