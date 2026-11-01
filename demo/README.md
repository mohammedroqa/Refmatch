> Archive: this document describes the 2017/18 replay at `historical.html`. The default app is now the [2.0 matchweek planner](../docs/release-2.0.md).

# RefMatch 1.2 — next-match assignment planning

The demo uses historical evidence to recommend a referee for **the next meeting between two teams**. It reconstructs what was known at a chosen planning date in the real Premier League 2017/18 season. The target match is treated as unplayed; its final result and actual appointed referee are removed from the planning fixture and assistant context.

## Workflow

1. Select a scheduled fixture, or choose two teams and a planning date to find their next meeting.
2. Review each team's points, position, goals, recent form, playing tendencies, recent results and recorded referees.
3. Inspect earlier head-to-head meetings, the league stage and table stakes.
4. Compare referee candidates, their earlier appointments, similar match contexts and calculated factors. Exclude candidates from the hypothetical pool if needed.
5. Record a **draft proposal** and download its JSON evidence brief. Changing the date, fixture or candidate pool clears the draft. Reloading clears the session. No external appointment is made.

## Source and temporal boundary

The saved [snapshot](historical.snapshot.js) contains 380 matches, 20 clubs, 21 referees and 643,150 events from the attributed CC BY 4.0 Wyscout/Pappalardo sources. [Source inventory](../docs/data-source-plan.md).

Every table, team profile, recent-result list, head-to-head, referee history and scoring distribution uses only matches **before 00:00 UTC on the planning date**. The whole day is excluded because kickoff timestamps are not completion times. When planning on 1 February for a 10 February match, no results from 1–10 February are available. A comparable earlier appointment's context is reconstructed from results before that appointment's own day.

The app reads the local snapshot without fetching sports data during use. `npm run data:refresh` checks pinned metadata and downloads missing or invalid cached sources. `npm run data:refresh -- --offline` rebuilds from verified files in ignored `.cache/wyscout/`. Only the compact snapshot belongs in source control.

## Team behaviour and league context

- Final goals come from `teamsData.score`. Points are 3 for a win and 1 for a draw. Positions sort by points, goal difference and goals scored; exact ties share a position under the [2017/18 Premier League Handbook, rules C.3–C.7](https://premierleague-static-files.s3.amazonaws.com/premierleague/document/2017/08/11/c494a26e-b573-41e4-bcd2-daf0ca76a00d/PL_Handbook_2017-18_Digital-4-.pdf). Alphabetical display order does not break a sporting tie. The reconstructed season-end table matches the source results, including Manchester City's 100 points.
- Form is each team's latest five earlier results, oldest to newest. Team cards show its own recent and season-average pass, shot, duel, foul and card-event volumes. Pass accuracy counts Pass events with tag 1801 divided by all Pass events; it is not possession time.
- Shots include Shot events, Free kick shot sub-events and Penalty sub-events. The snapshot contains 328,657 passes, 271,280 accurate passes and 8,881 shot attempts. These are source-specific event definitions, not expected goals or official disciplinary totals.
- Playing tendencies compare each team's latest-five mean with earlier league team-match distributions: at or above the 75th percentile is higher, at or below the 25th lower, otherwise typical. These describe observable patterns, not personality, temperament or intention.
- League stage is an app grouping: rounds 1–10 opening, 11–28 mid-season, 29–38 run-in. The dataset does not contain knockout rounds.
- Table context requires five earlier games per team. Title proximity: rank 1–4 and within six points of the leader. Top-four proximity: rank 1–8 and within six points either side of fourth. Safety-line proximity: rank 14–20 and within six points of 17th, or already in the bottom three. Close table rivals: rank gap at most four and points gap at most six. These are transparent heuristics, not official race definitions, emotional pressure measurements or forecasts.

## Assignment model

Both teams need five earlier games; candidates need five earlier observed league appointments. An excluded or undersampled candidate has no fit score. Actual availability, fitness, declared conflicts and appointment eligibility are unknown.

For each volume, the target is **60% recent + 40% season**. The recent sample is the union of each team's latest five games; the season sample is the union of all their earlier games. A shared meeting is counted once in each sample. Each uses full-match totals, including both opponents. This describes contexts the teams played in, not a validated forecast of their next match.

Referee profiles average full-match volumes across their earlier appointments. Similarity is `clamp(100 × (1 − abs(referee_mean − target) / scale), 0, 100)`. Scale is the earlier league 90th–10th percentile spread, floored at 4 fouls, 2 card events, 80 duel events, 120 passes or 8 shots.

| Component | Weight | Calculation |
| --- | --- | --- |
| Foul-profile similarity | 20% | Earlier foul-volume similarity |
| Card-profile similarity | 15% | Earlier card-event similarity |
| Duel-profile similarity | 10% | Earlier duel-volume similarity |
| Playing-pattern experience | 15% | Mean of pass and shot-volume similarities |
| Stage and stakes experience | 20% | Comparable earlier appointments / 8, capped at 100 |
| Observed sample | 10% | Earlier appointments / 20, capped at 100 |
| Team assignment spacing | 10% | Days from latest observed appointment with either team to target kickoff / 28, capped at 100; 100 if none observed |

Comparable contexts must reach 70/100: 35 for matching stage; up to 30 for shared context tags divided by their union (30 if both have none); up to 20 for similar rank gaps (`20 × max(0, 1 − gap_difference / 10)`); and up to 15 for similar points gaps (`15 × max(0, 1 − gap_difference / 12)`). Each prior context needs five earlier matches per team. Counts measure exposure, not successful decisions or causal referee effects.

Components round to integers before weighting; the weighted sum rounds to an integer. Displayed points round to one decimal. Ties break by source referee ID. No model weights are changed by Gemini. Weights, thresholds and spacing preferences are experimental app assumptions, not Premier League appointment policy or validated referee quality measures.

For Tottenham–Arsenal on 10 February 2018, using evidence before that day: Tottenham are fifth with 49 points, Arsenal sixth with 45; their previous meeting was Arsenal 2–0 Tottenham with Mike Dean. Michael Oliver leads at 88 fit points, Mike Dean 82, Martin Atkinson 81. Oliver has nine earlier appointments meeting this model's context threshold. This is a proposed assignment, not a claim that the historical official was wrong.

## Source quality

Two matches (`2499975`, `2499985`) have no referee in the source. They retain unknown officials and do not contribute to invented referee histories. Referees v1 is truncated inside Michael Oliver's unused `birthArea`; his complete ID and name values are recovered verbatim and documented. No missing identity value is guessed, and no birth dates or nationality fields are published.

Card events use tags 1701, 1702 and 1703, once per event (1,221 total). Formation card fields contain booking minutes and are not summed. Duel totals include paired opponent records. Other seasons and competitions are absent: an observed gap is not measured rest. There are no invented advantage, consistency, controversy, neutrality or accuracy ratings.

## Assistant and verification

[Google Gemini through CopilotKit](../docs/google-gemini-setup.md) receives the match brief, real catalogs and computed results. Eight validated tools inspect, search, compare, select, plan a next meeting, change inclusion, reset and undo. Stale or cancelled actions are rejected. The user records a draft with the proposal button; chat cannot finalize a real appointment.

Run `npm test`. With the local preview running, run `npm run test:e2e -- --live-ai`. The browser suite covers home-to-proposal flow, table/form/history evidence, next-meeting planning, draft download/invalidation, comparison, inclusion, failure recovery and mobile. For deterministic transport tests, run `node scripts/test-copilot-runtime.mjs` and `REFMATCH_TEST_URL=http://127.0.0.1:4181 npm run test:e2e -- --scripted-ai` separately. Screenshots go to ignored `test-results/`.
