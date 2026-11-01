# RefMatch 2.0 — Matchweek committee planner

Implemented 25 October 2026. The default app at `/demo/` plans a whole 2026/27 Premier League round. The 2017/18 replay remains at `/demo/historical.html`.

## Workflow

1. Select the season, matchweek and evidence cutoff. The first wholly upcoming round is selected automatically.
2. Review a draft with one main referee per fixture and at most one assignment per referee in the round.
3. Inspect team form, current-season standings, earlier meetings, candidate rankings, individual contributions and exclusions. Compare candidates or lock a preferred referee; the other assignments recalculate.
4. Enter committee availability, eligibility/fitness/conflict checks, specific team conflicts and other duty dates. The default three-calendar-day gap is editable; it is an app setting, not a competition policy.
5. Confirm the selected referees' operational checks, enter the reviewer name, approve locally and download the JSON evidence brief. Approval is not an official submission.

The whole plan and committee settings persist in this browser. Changing evidence, policy, roster or selections invalidates applicable approvals. Roster/policy changes invalidate all local weekly approvals; source snapshot changes invalidate all approvals and locks. Other locally approved weeks count as known commitments. Returning to a previously approved week opens a new draft for review; the previous reservation remains until that week is revised or reapproved. There is no shared database or authentication.

## Verified sources

`scripts/refresh-weekly.py` imports:

- Football-Data.co.uk Premier League CSVs for 2023/24, 2024/25, 2025/26 and 2026/27: dated results, source referee names, fouls, shots and yellow/red cards. Source definitions: https://www.football-data.co.uk/notes.txt . No betting fields are retained. No pass/duel values are invented. Referee initials are retained exactly as supplied.
- Official Fantasy Premier League `bootstrap-static` and `fixtures` endpoints: current season identity, 20 clubs, all 380 fixtures, round numbers, UTC kickoff timestamps, started/finished status and final scores. A different season is rejected rather than relabelled.

The initial snapshot contains 1,210 results and 35 observed referee identities across the four source seasons. At the 25 October 2026 planning cutoff, the 36-month window contains 1,120 games; 24 referees have enough recent evidence for the default round. Both downloaded feeds currently contain completed results through 19 October. Fixtures extend through May 2027. The interface shows results/statistics coverage and retrieval date, so delayed data is visible.

Every raw source has a SHA-256 checksum and retrieval timestamp. Raw files stay in ignored `.cache/weekly/`; the compact `demo/weekly.snapshot.json` is the app artifact. Finished FPL results supplement a lagging statistics feed with unknown referee/statistic fields, never inferred values. A score disagreement stops the build. Club aliases are explicit and repeat match identities are rejected. The snapshot is replaced atomically only after validation.

Refresh with `npm run data:weekly`, or the app's local **Refresh source data** button. `npm run data:weekly -- --offline` rebuilds byte-for-byte from the same cache. No API key is needed for these public endpoints. Access and reuse terms remain those of each source; the earlier Wyscout CC BY licence does not apply to this snapshot.

## Evidence and scoring

The window is the 36 calendar months before 00:00 UTC on the selected planning date. Same-day and future results are excluded. Team form uses the last five earlier results. Standings use only the selected season. Historical comparable appointments use their own season's standings before their own match day; earlier results needed to reconstruct that context are exported separately as context support.

For foul, card and shot volume, target = 60% latest-five union mean + 40% historical union mean. A shared meeting counts once. Historical means have a 365-day half-life. Referee averages use the same recency weighting. Only observed complete statistics are scored; each team and referee needs five complete earlier matches. Missing values are not zero. Card counts use the source's yellow-plus-red convention, not Wyscout event tags.

| Factor | Weight | Definition |
| --- | --- | --- |
| Fouls | 25% | Similarity of recency-weighted full-match foul averages |
| Cards | 20% | Similarity of source yellow-plus-red averages |
| Shots | 15% | Similarity of shot-attempt averages |
| Comparable context | 20% | Recency-weighted similar appointments / 8, capped at 100 |
| Evidence volume | 10% | Complete earlier appointments / 30, capped at 100 |
| Team spacing | 10% | Days since either team assignment / 28, capped at 100; 100 if none observed |

Volume similarity is `clamp(100 * (1 - abs(referee_mean - target) / scale), 0, 100)`. Scale is the earlier league's 90th–10th percentile spread, floored at 4 fouls, 2 cards or 8 shots. Component scores round to integers before weighting; final fit rounds to an integer. Equal fit breaks by stable referee ID.

Context uses the original transparent table-proximity heuristics and a 70/100 similarity threshold. Historical CSVs do not supply round numbers: historical stage is estimated from the two teams' played counts plus one; current FPL fixtures supply their actual round. These groupings are app assumptions. Current table ordering is points/GD/goals scored with shared exact ties, not a certified final table with all competition tie-break procedures.

The Hungarian assignment solver maximizes the number of filled fixtures first, then total fit. It incorporates user locks, exclusions, conflicts, declared duties and candidate eligibility within the model. One referee can be used once per round. Stable row/column ordering makes ties deterministic. Infeasible matches stay unassigned and block approval. The app explains when global allocation selects a lower individual rank. It currently plans main referees only, not assistant referees, fourth officials or VAR crews.

Public observations do not establish active panel membership, fitness or availability. Referees without a recorded appointment in the preceding year are excluded unless the committee confirms their eligibility; sample requirements still apply. Actual other-competition duties must be supplied by the committee. Date gaps are conservative calendar-day rules, not measured hours of rest.

Scores express experimental profile fit; they do not measure decision correctness, neutrality or probabilities. Original publication timestamps and later historical corrections are not archived: this is reconstruction from records captured at refresh time, not proof of what a feed contained on every past day.

## Assistant and verification

The weekly Gemini/CopilotKit agent has five validated tools: inspect week, inspect match, compare candidates, select week and change hypothetical inclusion. Stopped/stale requests are rejected. Chat cannot assert committee confirmations, lock assignments or approve the plan. Google and OpenAI adapters support weekly chat; the existing Studio adapter remains available in the archived replay.

`npm test` covers source integrity, temporal boundaries, season separation, sparse evidence, calendar dates, allocation optimality against exhaustive small cases, locks, exclusions, conflicts, commitments, persistence and approval/export rules. With the preview running, `npm run test:weekly` checks the full browser journey, download, mobile layout and private paths. Add `-- --live-ai` to exercise the configured assistant. The original browser suite remains at `npm run test:e2e` and targets the archive.
