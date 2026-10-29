# GOD PREDITOR · LuckyJet · Time Echo

Independent copy of the owner's LuckyJet Orb Site (version 15). The source Site was not edited or redeployed. The existing cloud signal calculation and orb design are retained. New files add an archive drawer, a separate experimental time-recurrence mode and the requested spider animation.

## Open

GitHub Pages: https://miuiproking.github.io/MiuiProKing/luckyjet-time-echo/

The side tab opens the entire accessible round archive. Older pages load by keyset, with IndexedDB caching; the displayed list loads 100 rows at a time. Minimum filters include 10, 100, 500, 1000 and 50000. There is no maximum coefficient cutoff. Times include seconds in Europe/Kyiv. Unknown timestamps remain unknown. Dates refer to recorded round timestamps, not promised exact betting instants.

## Data and calculation

- Public read-only Supabase client: stzrirukuxcyalrsstxx. No collector session, password, service-role key or admin credential is included.
- Existing cloud RPCs: luckyjet_cloud_status, lucky_lab_report, lucky_orb_journal; round view: luckyjet_classic_history.
- The existing cloud collector continues to accumulate rounds while this page is closed. This page does not change the collector or database.
- The new copy defaults to the experimental recurrence mode. The button below the circle switches to the unchanged original cloud calculation.
- Each observed event >=10x produces candidates at +1 hour and at the same Kyiv clock time on the next calendar day. The target is the anchor's actual coefficient, not a random number, capped estimate or claimed known future crash. Window: +/-60 seconds. Ambiguous/nonexistent DST times are skipped.
- New windows are registered only while data is fresh, after the archive is loaded, and before the window opens. Their boundaries and targets remain fixed. Multiple windows may overlap; the circle shows the earliest eligible one, while the drawer lists all registered windows. No outcome is guaranteed.
- New-window journal is local to this browser, separately namespaced from the original app. Reloading resumes verification; closing the page stops registration of new experimental windows. Already recorded windows can be checked after reopening. Clearing browser data removes this local journal, not the Supabase archive. Cross-device experimental journals are not implemented.
- A hit records actual coefficient, round ID and timestamp. A miss requires complete boundary coverage with consecutive feed orders and no observation gap >180 seconds. Gaps/unknown times remain unknown; this deliberately errs on the side of incomplete verification.
- Backtest: up to 30 preceding days, anchor-derived targets, compared with a +30-minute control shift, running in a Web Worker. No retrospective trials enter the prospective journal. The sample depends on actual archive coverage. Windows overlap and trials are not independent. Neither accuracy advantage nor profit is established.

## Checks

`npm ci --ignore-scripts` then `npm test`. Runtime is static HTML/JS and requires no npm packages or server-side secrets.

Spider source, pinned revision and local adaptations are recorded in THIRD_PARTY.md. It is a decorative animation; it does not train or alter the model.
