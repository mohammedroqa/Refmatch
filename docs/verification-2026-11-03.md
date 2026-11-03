# Release verification — 3 November 2026

Verified using system Chromium 154.0.8037.57 and Playwright. Mobile checks use
touch emulation; physical devices, Firefox and Safari/WebKit were unavailable.

- All 29 unit/integration tests passed. Fixed calendar-dependent tests with a
  controlled clock and verified that approval is rejected after kickoff.
- Weekly planner: allocations, comparison, locks, availability, conflicts, invalid
  dates, approval prerequisites, invalidation, persistence and evidence downloads.
- Historical planner: rankings, comparison, exclusion/reset/undo, draft/export,
  date cutoff, sparse history, protected files, keyboard and mobile controls.
- Scripted assistant: comparison, exclusion, failed-response recovery, stop and
  stale-action rejection. Real provider calls were not tested; Pages is static.
- All six pages checked at 320, 375, 390, 768, 1024 and 1440 pixels. Fixed narrow
  planner grid overflow and brand-page overflow at tablet width.
- Evaluation Lab: 30/30 reference answers, 120 labelled simulated attempts at
  each viewport, report export/import, persistence, clearing results, human review,
  filters, cancellation and CSV download. Simulations are not model evaluations.
- Local link checks, images, film playback and byte-range media requests passed.
- Axe WCAG 2.0/2.1 A/AA scans on desktop and mobile; fixed scroll-region keyboard
  access and colour-button accessible names. Automated scans are not a complete
  manual accessibility audit.
- Static package checked under `/Refmatch/`, matching GitHub Pages project paths.
  Assistant and refresh controls reflect the static profile. Evaluation Lab's
  expected unavailable backend status request falls back to its offline mode.

The existing Evaluation Lab was preserved from `gh-pages` commit `4cefdfa`.
Its prebuilt bundle is retained because its source build contract is absent from
this checkout. The release manifest inventories all packaged files with SHA-256.

Screenshots and machine-readable results are in ignored `test-results/`.
Publication targets the existing `gh-pages` branch. The environment blocks
`api.github.com` and `mohammedroqa.github.io`, so deployment status and the live
URL must be confirmed outside this environment after the push.
