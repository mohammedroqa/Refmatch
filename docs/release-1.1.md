# RefMatch 1.1 — real historical records

Release 1.1 replaces the app's fictional data with the 2017/18 Premier League season: **380 matches, 20 clubs, 21 referees, and 643,150 events**. Both the home-page board and assignment workspace calculate from this snapshot. The original concept film remains labelled as a synthetic illustration.

## What changed

- Real dated fixtures, club names, referee identities, and recorded appointments, with source attribution and known missing values.
- Profiles calculated strictly from records before 00:00 UTC on each selected match day. Target-day and future events cannot affect the result.
- Measurable foul, card-tagged event, recorded-event, and duel-event profiles in place of invented consistency, advantage, controversy, and physicality ratings.
- Comparison factors use full-match totals from unique earlier games involving either team. Previous head-to-head matches are counted once.
- Visible sample sizes, earlier source-match evidence, and an explicit no-ranking state for sparse early-season data.
- Hypothetical candidate inclusion controls, undo/reset, and Gemini tools using real referee IDs and historical fixture search.
- A compact, attributed snapshot with pinned source versions, checksums, repeatable offline rebuilds, and no sports-data fetch during app use.

The default fixture is Tottenham–Arsenal on 10 February 2018. The model uses 260 earlier league matches and 51 distinct earlier matches involving either club. Mike Dean leads at 91% experimental profile fit, followed by Martin Atkinson at 90%. Excluding Dean moves Atkinson to the top without changing his score. This is an app calculation, not a quality assessment or an official appointment recommendation.

## Data boundaries

Actual availability, private conflicts, fitness, and appointment eligibility are unknown. Inclusion in the comparison is not clearance to officiate. Other competitions are absent, so an observed gap between league appointments is not measured rest. Two source fixtures have no recorded referee and retain unknown assignments. Complete identity fields from the truncated final referee record are recovered verbatim and documented; no missing field is guessed.

See [source inventory](data-source-plan.md) and [formulas, extraction definitions, and limitations](../demo/README.md).

## Verification

On 24 October 2026:

- All 17 automated tests passed, including temporal leakage, golden rankings, source gaps, card definitions, scenario guards, and the optional Studio adapter.
- All 13 scripted browser checks passed: home-to-result flow, real comparison/history, exclusion/undo/reset, sparse-history and empty states, chat retry/cancellation/stale-action protection, mobile/keyboard use, and server-file protection.
- All 11 live browser checks passed, including Gemini comparison, candidate exclusion, historical fixture search/selection, and manual controls after an assistant service failure. The local configuration uses `google:gemini-3.5-flash-lite`; the Flash latest endpoint returned a service error during verification.
- The offline data rebuild reproduced the snapshot byte for byte. The production browser bundle built successfully, and screenshots were inspected at desktop and mobile widths.

## Review locally

Run `npm run preview` and open `http://127.0.0.1:4173/` or `http://127.0.0.1:4173/demo/`. Gemini uses the existing server-only key. Try comparing Mike Dean and Martin Atkinson, excluding Dean from the scenario, undoing, and asking to switch to Arsenal–Tottenham on 18 November 2017.
