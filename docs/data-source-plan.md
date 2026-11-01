> Release 2.0 uses a separate current-season snapshot from official FPL fixtures and Football-Data.co.uk statistics. See [the current inventory](release-2.0.md#verified-sources). The Wyscout inventory below remains accurate for the archived 2017/18 replay only.

# RefMatch source inventory — real historical mode

The user selected historical Premier League data on 24 October 2026. The active app uses full match-level records and real identities, to plan the next meeting between two teams from a chosen historical date. Earlier results, team patterns, points/rank, stage/stakes and referee appointments inform the proposal.

## Ingested sources

All five pinned sources are by Luca Pappalardo and Emanuele Massucco and carry **CC BY 4.0** in their Figshare metadata. Attribution: [Pappalardo et al. (2019), Scientific Data 6:236](https://www.nature.com/articles/s41597-019-0247-7).

| Source | Pinned version / file | Use |
| --- | --- | --- |
| [Events](https://figshare.com/articles/dataset/Events/7770599) | v1 / `14464685`, `events.zip` | English league pass, shot, foul, card-tagged, duel, and total event counts by match/team |
| [Matches](https://figshare.com/articles/dataset/Matches/7770422) | v1 / `14464622`, `matches.zip` | Dates, matchweek, venue, home/away teams, final goals, and recorded referee assignments |
| [Teams](https://figshare.com/articles/dataset/Teams/7765310) | v3 / `15073697`, `teams.json` | Real club names and source IDs |
| [Referees](https://figshare.com/articles/dataset/Referees/8082665) | v1 / `15074030`, `referees.json` | Real referee names and source IDs |
| [Tag mapping](https://figshare.com/articles/dataset/Mapping_of_tag_identifiers_to_tag_names/11743818) | v1 / `21385239`, `tags2name.csv` | Card tags 1701, 1702, 1703 and accurate-pass tag 1801 |

The [refresh script](../scripts/refresh-data.py) checks licence, source version, filename, size, and MD5 before reading a file; the [snapshot](../demo/historical.snapshot.js) also records SHA-256 checksums and extraction definitions. The season has 380 matches, 20 teams with 38 appearances each, 21 identified main referees, and 643,150 events. Recorded totals: 8,138 foul events, 1,221 card-tagged events, and 176,688 duel events.

## Source gaps and transformations

Two fixtures have no referee field: Liverpool–Tottenham on 4 February 2018 (`2499975`) and Stoke–Brighton on 10 February 2018 (`2499985`). These remain unknown, rather than being filled from memory or inferred from a ranking.

The referee file ends inside an unused nested field of the Michael Oliver record. Its complete ID and name fields are recoverable verbatim. The importer documents this narrow recovery and fails on other malformed identities. No birth dates, nationality, or private operational fields are included in the app snapshot.

Card fields inside match formations are booking minutes, not counts. The app uses documented event tags instead, counting a tagged event once. Event and duel counts are recording-dependent proxies. See the [method and limitations](../demo/README.md).

The snapshot is downloaded/built deliberately, then reused locally. The app calculates each selected fixture from matches before 00:00 UTC on the chosen planning date, excluding its own and later results. Target scores and actual referees are withheld; earlier recorded referees remain evidence. No live sports endpoint is called during browsing or chat.

## References and future integrations

- [IFAB Law 5](https://www.theifab.com/laws/latest/the-referee/) and [Law 12](https://www.theifab.com/laws/latest/fouls-and-misconduct/) remain officiating context. They do not define this fit model, sample minimums, or spacing preference.
- The earlier plan named [StatsBomb Open Data](https://github.com/hudl/open-data) as an optional independent event source and [football-data.org](https://www.football-data.org/documentation/quickstart) for a future current-season feed. Neither is ingested by this release.
- Official appointment policies and Premier League statistics pages are domain references, not ingested databases. A future operational release needs licensed current data and authorized availability/conflict declarations.
- Founder information ([mroqa.site](https://mroqa.site/)), fonts, brand assets, and software dependencies are presentation/software sources, not football data.

The landing-page board and interactive app share the real historical snapshot and scorer. The original concept film remains labelled as a synthetic illustration. The old `calibration.snapshot.js` is retained for provenance of release 1.0 and is not imported by release 1.2.

## Table reference

The [2017/18 Premier League Handbook, rules C.3–C.7](https://premierleague-static-files.s3.amazonaws.com/premierleague/document/2017/08/11/c494a26e-b573-41e4-bcd2-daf0ca76a00d/PL_Handbook_2017-18_Digital-4-.pdf) supplies the season-specific points and tie rules. The app reconstructs the table from historical final goals, awarding 3/1/0 points, sorting by points/goal difference/goals scored, and preserving shared positions for exact ties. It does not import today’s tie-breakers into 2017/18. Phase groupings and table-proximity tags are app assumptions, documented in the method.
