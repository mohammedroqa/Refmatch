---
name: refmatch-referee-assignment
description: Plan the next referee assignment using earlier team behaviour, form, table stakes and referee history; compare candidates and record an evidence-backed draft.
---

# RefMatch: Next-Match Referee Assignment Planning

## Current scope — release 2.0

The user approved implementation of a 2026/27 matchweek committee planner using the preceding 36 months of Premier League evidence. `/demo/` is the weekly planner; `/demo/historical.html` preserves the original replay. See [the 2.0 specification](docs/release-2.0.md) for current sources, scoring, global allocation, operational checks, persistence and approval boundaries. The older specification below applies only to the archive.


The user approved real historical Premier League data. Release 1.2 uses 380 actual 2017/18 fixtures, 20 clubs, and 21 named referees from attributed CC BY 4.0 Wyscout records. The goal is to use earlier team behaviour, form, table position, stage/stakes and referee history to propose the best fit for their next meeting. This supersedes the earlier comparison-only scope. Rankings are experimental app outputs, not official appointment recommendations or referee quality evaluations.

## Workflow

1. Load the selected real fixture and source identities.
2. Build profiles and the table using only matches before 00:00 UTC on the planning date, which may precede kickoff by several days.
3. Require five earlier matches for each team and five earlier league appointments per referee.
4. Apply the user's hypothetical candidate inclusion choices.
5. Calculate deterministic profile fit and rank the top three.
6. Explain returned evidence, the source cutoff, sample size, and operational unknowns.
7. Support next-meeting search, comparison cards, undo/reset, a local draft proposal and evidence download. Clear the draft when its plan changes.

The scorer is authoritative. The language model uses validated frontend tools and must not invent numbers, rules, names, availability, or conflicts.

## Observable fields

- Real source match/team/referee IDs, names, match dates, and recorded assignments.
- Final goals, reconstructed points/ranks, recent form, and prior head-to-head results with recorded referees.
- Passes, accurate passes, shots, fouls, card events and duel events by match/team.
- League stage and clearly labelled table-proximity heuristics.
- Earlier match/appointment sample sizes, source match IDs, and observed assignment dates.

Card-tagged events use tags 1701, 1702, and 1703, counted once per event. Match formation card values are minutes, not counts. Event and duel volumes depend on recording conventions; they are not measured pressing, aggression, decision accuracy, or advantage handling.

## Model

Use the seven-component model in [demo/README.md](demo/README.md): fouls 20%, cards 15%, duels 10%, playing patterns 15%, stage/stakes experience 20%, sample 10%, spacing 10%. Target volumes combine 60% recent and 40% season evidence. Reconstruct each comparable earlier assignment’s context before that game; never use later table positions. These are transparent experimental assumptions.

## Truthfulness and responsible use

- Label the season and retrospective nature prominently. Do not imply these are current fixtures or a current referee roster.
- Actual availability, conflicts, fitness, and appointment eligibility remain **unknown**. Included candidates are not cleared for appointment.
- Do not carry invented synthetic consistency, advantage, rivalry, controversy, or neutrality ratings onto real names.
- A gap between observed league assignments is not measured rest; other competitions are absent.
- Preserve missing source values. Two fixtures have no recorded referee. Document the narrow recovery of complete identity fields from the truncated referee source.
- Do not score candidates with insufficient history. Excluded candidates have no score.
- Fit is not a probability, causal referee effect, forecast, or measure of competence. Sample volume is not ability.
- The target fixture’s actual referee and outcome are withheld from the planning UI, tools and downloaded fixture. Earlier referees and results remain visible evidence.
- IFAB Laws 5 and 12 may supply officiating context, but do not prescribe this ranking method.

## Implementation

Use the existing HTML/CSS/JavaScript app, local historical snapshot, deterministic engine, and CopilotKit frontend tools. Google Gemini supplies the conversation through a server-only key. Eight tools inspect, search fixtures, compare, select, plan the next meeting, change scenario inclusion, reset, and undo. Only the user’s proposal button records a local draft. Stale/cancelled requests cannot mutate the scenario.

Raw data downloads happen only during explicit refresh. The normal browser and chat use the saved snapshot. Authentication, durable appointment storage, operational declarations, and a current sports feed are not part of this historical release.
