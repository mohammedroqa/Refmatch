# Evaluation Lab 2.0 verification — 5 November 2026

Implemented and verified from source and as a static GitHub Pages artifact under
`/Refmatch/`. All figures below are simulated workflow checks, not model measurements.

- 42 automated tests passed, including 13 evaluation-specific tests.
- 136/136 authored references agree with the deterministic validator.
- Development and validation evidence-reading tasks each contain all three verdicts.
- Source and packaged Evaluation Lab workflows passed: complete batches, fixed coverage,
  unsafe clearance, extraction/citation scores, failure inspection, duplicate/tampered
  imports, blind packs, review adjudication, downloads, persistence and cancellation.
- All six main pages passed at 320, 375, 390, 768, 1024 and 1440 pixels; mobile
  uses Chromium touch emulation, not physical iOS/Android devices.
- Weekly and historical planner browser regressions passed.
- Populated evaluation screens had no Axe WCAG 2.0/2.1 A/AA violations at
  390 and 1440 pixels. This is an automated scan, not a full manual accessibility audit.
- 33 local navigation links passed; release files have SHA-256 hashes.
- Private challenges, server scripts, tests and credentials are excluded from the
  published artifact; private paths return 404.
- Source build no longer depends on a previous deployment or missing schema.

## Scripted result checks

Unsafe clearance is shown as cleared-invalid-or-unresolved / completed-invalid-or-unresolved.
End-to-end accuracy includes errors and unrun cases in its denominator.

| Scripted behaviour | Task / split | Completed / planned | Errors | Unsafe clearance | End-to-end correct |
|---|---|---:|---:|---:|---:|
| reference | audit / development | 92/92 | 0 | 0/61 | 92/92 |
| overconfident | evidence / validation | 8/8 | 0 | 3/5 | 5/8 |
| updates | evidence / development | 8/8 | 0 | 5/5 | 3/8 |
| errors | audit / development | 78/92 | 14 | 0/51 | 78/92 |

The reference-assisted simulation deliberately reads the authored answer. Its perfect
score verifies the pipeline, not intelligence. The other profiles introduce known
errors and confirm that metrics identify them. Reports and screenshots are in
ignored `test-results/evaluation-v2/`. No provider was called and no expert review
was fabricated. Provider adapters were tested with mocked HTTP responses.

## Publication boundary

The source will be pushed to `main`; the tested static artifact goes to the existing
`gh-pages` branch. This environment permits Git pushes but blocks the live Pages
URL with proxy HTTP 403, so live deployment completion cannot be independently
confirmed here. Safari/WebKit and Firefox were unavailable; testing used system Chromium.
