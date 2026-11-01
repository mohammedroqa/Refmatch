# RefMatch hackathon demo brief

This brief records the five skill areas and four scoping questions for the RefMatch demo. Decisions below reflect the current [project README](../README.md) and [RefMatch specification](../RefMatchSKILL.md). Items marked **Open** need a product decision before implementation.

## Skill areas

1. **Rules-Based Matching & Explainability** — Build deterministic scoring and rules that rank referees per fixture, enforce eligibility, conflicts, and availability, and give clear reason codes for recommendations and rejections. Skills: rules engine design, feature weighting and scoring, explainability.
2. **Synthetic Sports Data Modeling** — Create realistic synthetic teams, referees, and fixtures with coherent correlations and edge cases, plus a small golden set to calibrate weights and validate demo rankings. Skills: synthetic data generation, data schema design, statistical intuition.
3. **Web UI & API Integration** — Build an interactive interface that selects fixtures, shows ranked referees, and drills into explanations and constraint checks with fast deterministic performance. Skills: frontend development, API integration, data visualization. A separate API is not required by the current local demo plan.
4. **Product Strategy & Responsible Use** — Define the target workflow, demo narrative, differentiation, and boundaries around fairness, transparency, and acceptable inputs. Skills: product positioning, responsible AI principles, workflow mapping.
5. **Refereeing Domain Expertise** — Define credible match-risk heuristics, referee traits, rivalry and playing-style considerations, and assignment constraints. Skills: refereeing knowledge, match-risk heuristics, competition rules.

## Four scoping questions and current decisions

### Question 1/4 — Output for one fixture

> For the hackathon demo, what exactly will the agent output for a single fixture (e.g., a ranked list of referees, a single recommended referee, a “risk score,” and/or a short explanation), and what will the user see on screen?

**Recorded decision:** Show a four-part match risk profile (aggression, card risk, controversy risk, tempo), the top three eligible referees with percentage fit scores, and a recommended referee. For each ranked candidate, show the two strongest positive factors, one risk flag, neutrality status, and a short explanation grounded in the input values and relevant Laws of the Game. The user can inspect the shortlist and change availability to see a new ranking. A pre-match briefing is an optional output.

**Current state:** The landing page shows fixed illustrative scores and an availability interaction. The separate [interactive draft](../demo/index.html) calculates rankings and displays the risk profile, shortlist, score factors, and exclusions.

### Question 2/4 — Demo data

> What data will the demo use to generate team “playing style,” rivalry/history signals, and referee profiles—will it be fully synthetic/mock data, manually curated examples, or a small real dataset you already have access to?

**Recorded decision:** Use a small, manually curated, internally consistent **synthetic** dataset of fictional teams, fixtures, and referees. Include playing-style metrics, rivalry and history signals, and edge cases for availability, neutrality, rest, and conflicts. Label all data and results as synthetic. A small golden set should check that example rankings behave as intended. No external or real-world dataset is required for the demo.

### Question 3/4 — Eligibility, availability, and neutrality

> For “eligibility,” “availability,” and “neutrality,” what rules should the demo enforce (e.g., same-city/region conflicts, prior matches with either team this season, recent controversies, rest days, travel distance), and do you want these rules to be hard filters or soft penalties in the fit score?

**Recorded decision:** Apply hard filters for unavailability, insufficient rest, and neutrality or explicit conflicts before scoring. Apply documented soft penalties for shorter rest among eligible referees and heavy recent familiarity with either team. A high fit score cannot override a hard exclusion. Return a reason code for each exclusion or penalty.

**Draft assumptions:** The interactive draft uses a three-day minimum rest rule, a six-month familiarity window, and declared team conflicts. These are provisional demonstration rules.

**Open:** Decide the competition-specific rest, neutrality, and conflict policy, and whether location, controversy, or travel distance belong in a later version. The current draft does not model all example factors.

### Question 4/4 — Technology and what is real

> What technologies and demo format do you want to use (e.g., a simple web app vs. notebook), and what parts must be “real” in the demo versus mocked (e.g., scoring logic implemented end-to-end, explanations templated, UI interactive, persistence/auth not needed)?

**Recorded decision:** Build on the existing HTML, CSS, and JavaScript web interface. Implement a real deterministic local scoring module, eligibility checks, ranking, and interactive what-if reranking. Use templates tied to calculated factors for explanations. The data is synthetic. Authentication, persistence, external integrations, and a live language model are outside the demo scope. A backend API is not required for this local demo.

**Current state:** The landing page remains illustrative. The separate [interactive draft](../demo/index.html) has a local scorer, calculated recommendations, templated explanations, and availability what-if controls.

## Release 1.0 scope update — 24 October 2026

The user approved CopilotKit conversational what-if actions and comparison cards with ranking explanations. The app now includes a local Node runtime for the assistant, while the deterministic scorer remains authoritative. The earlier decision to omit a language model applies to the original draft; the manual controls still work when chat is offline. The data source is a saved historical foul-rate calibration with fictional entities. See [release notes](release-1.0.md).

## Release 1.1 scope update — 24 October 2026

The user explicitly selected real historical Premier League matches and referees. This supersedes the earlier fictional-only data scope and scoring assumptions for the interactive app. It now uses the 2017/18 Wyscout season, pre-match date cutoffs, real identities, and observable event-profile comparisons. Availability, conflicts, and official eligibility remain unknown; controls change hypothetical inclusion only. Invented consistency, advantage, controversy, and neutrality ratings have been removed. See [source inventory](data-source-plan.md) and [method](../demo/README.md). The earlier decisions above remain a record of the original draft.

## Release 1.2 — next-match assignment planning

The user clarified the product goal: analyze both teams’ historical behaviour, form, table points/rank, competition stage and earlier referees to recommend the best fit for their next meeting. The demo now offers a planning date and next-meeting finder, pre-match team/table briefs, comparable referee assignments, a local draft proposal and evidence download. The target outcome and actual official are withheld. Historical data remains 2017/18; this is a before-kickoff replay, not a current fixture feed. See `demo/README.md` for the scorer and temporal guarantees.
