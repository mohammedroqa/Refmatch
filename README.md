# RefMatch

**Plan the next matchweek. Explain every referee assignment.**

RefMatch 2.0 helps a league committee select a 2026/27 Premier League matchweek, reconstruct evidence from the preceding 36 months, rank referee candidates and review a complete weekly allocation. The scorer and allocation solver are deterministic; the Gemini assistant explains their returned results.

## Run

Use Node.js 22+ and Python 3 for data refreshes:

```sh
npm ci
npm run preview
```

Open **http://127.0.0.1:4173/demo/** for the committee workspace. The landing page is at `/`, and the original 2017/18 replay is preserved at `/demo/historical.html`. To choose another port: `npm run preview -- --port 4174`.

The included current-season snapshot lets the planner work immediately. Chat uses the existing server-only Google key in the ignored `.env`; see [Gemini setup](docs/google-gemini-setup.md). Manual planning works without chat.

## Demo walkthrough

Show the end-to-end committee decision, not just the rankings:

1. Open the automatically selected upcoming matchweek and point out the fixture coverage and 36-month evidence window.
2. Select a match to review its referee shortlist, fit factors, team context, source coverage and any unknowns. Fit is an experimental profile comparison, not a probability or referee quality rating.
3. Record an operational check using information supplied by the committee. Set a referee to unavailable or lock a preferred candidate, then show how the complete allocation recalculates while respecting one referee per fixture and one assignment per referee in the round.
4. Review the outstanding checks and approval status. Only mark checks confirmed when they have actually been reviewed; approval is local to this browser and does not submit official appointments.
5. Download the evidence brief to show the sources, cutoff, rules, committee inputs and resulting plan in a shareable record.

The point to land: RefMatch helps an appointments officer build and explain a complete draft under constraints. The evidence and limits stay visible, and the committee keeps the decision.

## Committee workflow

- Select the matchweek and planning cutoff; the first wholly upcoming round is selected automatically.
- Inspect team form, current-season points/rank, prior meetings and referees, and transparent candidate factors.
- Generate a weekly draft with one main referee per match and at most one assignment per referee in that round.
- Compare candidates, lock a selection, record availability, team conflicts, eligibility checks and other duties, and see the remaining assignments recalculate.
- Approve locally after every selected referee's checks are confirmed. Download an evidence brief with the model rules, sources, data snapshot identity, inputs and results.

Settings and drafts persist in this browser. No shared authentication, central appointment database or official submission is included. Fit is experimental and needs domain validation; it is not a quality rating or probability. The full [2.0 method and release notes](docs/release-2.0.md) describe limits and formulas.

## Current data

The source snapshot contains the 380-fixture official FPL 2026/27 schedule and Football-Data.co.uk results/referee statistics from 2023/24 onward. Four source seasons support a rolling 36-month window. Standings reset each season; evidence never includes the planning day or later results. Missing statistics remain unknown. Promoted teams may have limited Premier League evidence.

```sh
npm run data:weekly
npm run data:weekly -- --offline
```

The first command refreshes public sources; the second reconstructs the same compact snapshot from verified local files. The app also has a local refresh button. Source checksums, capture timestamps and coverage dates are visible/exported. Raw files stay in ignored `.cache/weekly/`. The source feed can lag recent fixtures; do not interpret its last result as the current date.

## Evaluation Lab 2.0

Open `/demo/eval.html` for reproducible batches, 136 synthetic cases, evidence-reading
and rule-audit tasks, unsafe-clearance scoring, failure exploration and independent
review records. Simulations are clearly labelled and are not real provider measurements.
The full [evaluation guide](docs/evaluation-v2.md) covers local private challenges,
provider runs, import formats and limitations. The lab builds entirely from tracked source.

## Verification

```sh
npm test
npm run build
npm run test:weekly
npm run test:weekly -- --live-ai
```

Start the preview before browser tests. Tests cover cutoff leakage, rolling windows, season isolation, scarce history, globally optimal allocation, conflicts, commitments, locks, approval invalidation, persistence, downloads and mobile use. `npm run test:e2e` exercises the archived 2017/18 workflow. Screenshots go to ignored `test-results/`.

## Project assets and history

- [Release 2.0 and current method](docs/release-2.0.md).
- [Archived 1.2 methodology](demo/README.md), [1.1 notes](docs/release-1.1.md), [1.0 notes](docs/release-1.0.md), and [original scope](docs/hackathon-demo-brief.md).
- [Brand](brand/README.md), [founder asset provenance](assets/README.md), and [editable concept film](video/README.md).
- The landing-page board is explicitly a 2017/18 example; the original film uses synthetic illustrations. The older Azure architecture diagram describes the concept, not the current local runtime.

Built for the Inside the Game developer hackathon concept. RefMatch is not an official Premier League appointment service.
