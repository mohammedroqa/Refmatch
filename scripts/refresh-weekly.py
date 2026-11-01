#!/usr/bin/env python3
"""Build the committee snapshot from public, attributed match records. No credentials."""
import argparse
import csv
import hashlib
import io
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache' / 'weekly'
ALIASES = {'Spurs': 'Tottenham', 'Coventry City': 'Coventry', 'Hull City': 'Hull',
           'Ipswich Town': 'Ipswich', 'Manchester City': 'Man City', 'Manchester United': 'Man United',
           'Man Utd': 'Man United', "Nott'm Forest": "Nott'm Forest"}


def identity(name, prefix='t'):
    name = ALIASES.get(name.strip(), name.strip())
    return prefix + '-' + re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-'), name


def build(season, offline=False):
    CACHE.mkdir(parents=True, exist_ok=True)
    sources, teams, referees, results = [], {}, {}, {}

    def read(name, url):
        path = CACHE / name
        if not offline:
            request = urllib.request.Request(url, headers={'User-Agent': 'RefMatch/2.0 (local research planner)'})
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read()
            path.write_bytes(data)
        data = path.read_bytes()
        sources.append({'url': url, 'file': name, 'sha256': hashlib.sha256(data).hexdigest(),
                        'retrievedAt': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat().replace('+00:00', 'Z')})
        return data.decode('utf-8-sig')

    def team(name):
        key, label = identity(name)
        teams[key] = {'id': key, 'name': label}
        return key

    for year in range(season - 3, season + 1):
        code = f'{year % 100:02d}{(year + 1) % 100:02d}'
        rows = csv.DictReader(io.StringIO(read(code + '.csv', f'https://www.football-data.co.uk/mmz4281/{code}/E0.csv')))
        required = {'Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'Referee', 'HF', 'AF', 'HY', 'AY', 'HS', 'AS'}
        if not required.issubset(rows.fieldnames or []):
            raise ValueError(f'{code}: missing match statistics columns')
        count = 0
        for row in rows:
            if not row.get('HomeTeam') or row.get('FTHG', '') == '':
                continue
            date = datetime.strptime(row['Date'], '%d/%m/%Y').strftime('%Y-%m-%d')
            if not f'{year}-07-01' <= date < f'{year+1}-07-01':
                raise ValueError(f'{code}: unexpected match date {date}')
            home, away = team(row['HomeTeam']), team(row['AwayTeam'])
            key = f'{year}:{home}:{away}'
            if key in results:
                raise ValueError(f'Duplicate match: {key}')
            rid = None
            if row['Referee'].strip():
                rid, name = identity(row['Referee'], 'r')
                referees[rid] = {'id': rid, 'name': name}
            def number(field):
                value = row.get(field, '')
                if value in ('', None):
                    return None
                result = int(value)
                if result < 0:
                    raise ValueError(f'Negative statistic: {key}/{field}')
                return result
            stats = {}
            for side, tid in [('H', home), ('A', away)]:
                yellow, red = number(side+'Y'), number(side+'R')
                stats[tid] = {'fouls': number(side+'F'), 'shots': number(side+'S'),
                              'yellow': yellow, 'red': red, 'cards': yellow+red if yellow is not None and red is not None else None}
            results[key] = {'id': key, 'season': year, 'date': date, 'home': home, 'away': away,
                            'score': {'home': number('FTHG'), 'away': number('FTAG')}, 'refereeId': rid,
                            'stats': stats, 'source': 'football-data.co.uk'}
            count += 1
        if year < season and count != 380:
            raise ValueError(f'Incomplete historical season {year}: {count}/380')

    bootstrap = json.loads(read('bootstrap.json', 'https://fantasy.premierleague.com/api/bootstrap-static/'))
    raw_fixtures = json.loads(read('fpl-fixtures.json', 'https://fantasy.premierleague.com/api/fixtures/'))
    first_deadline = bootstrap['events'][0]['deadline_time']
    if not first_deadline.startswith(str(season)):
        raise ValueError(f'FPL contains a different season ({first_deadline}); refusing to relabel it {season}.')
    fpl_teams = {t['id']: team(t['name']) for t in bootstrap['teams']}
    current_teams = sorted(fpl_teams.values())
    if len(current_teams) != 20 or len(raw_fixtures) != 380:
        raise ValueError('Expected a complete Premier League schedule of 20 clubs and 380 fixtures.')
    fixtures = []
    for raw in raw_fixtures:
        home, away = fpl_teams[raw['team_h']], fpl_teams[raw['team_a']]
        key = f'{season}:{home}:{away}'
        fixture = {'id': key, 'season': season, 'gameweek': raw['event'], 'home': home, 'away': away,
                   'kickoff': raw['kickoff_time'], 'finished': bool(raw['finished']),
                   'started': bool(raw['started']), 'provisional': bool(raw['provisional_start_time'])}
        fixtures.append(fixture)
        if raw['finished'] and raw['team_h_score'] is not None and raw['team_a_score'] is not None:
            score = {'home': raw['team_h_score'], 'away': raw['team_a_score']}
            if key in results:
                if results[key]['score'] != score:
                    raise ValueError(f'Sources disagree on final score: {key}')
            else:
                results[key] = {'id': key, 'season': season, 'date': raw['kickoff_time'][:10],
                                'home': home, 'away': away, 'score': score, 'refereeId': None,
                                'stats': {home: {'fouls': None, 'cards': None, 'shots': None},
                                          away: {'fouls': None, 'cards': None, 'shots': None}}, 'source': 'FPL results; statistics pending'}
        if key in results:
            results[key]['gameweek'] = raw['event']
    if len({f['id'] for f in fixtures}) != 380:
        raise ValueError('Duplicate schedule identities')
    matches = sorted(results.values(), key=lambda m: (m['date'], m['id']))
    payload = {'schemaVersion': 1, 'season': season, 'seasonLabel': f'{season}/{str(season+1)[2:]}',
               'builtAt': max(s['retrievedAt'] for s in sources), 'sources': sources, 'teams': teams, 'seasonTeams': {str(season): current_teams},
               'referees': sorted(referees.values(), key=lambda r: r['id']), 'fixtures': fixtures, 'matches': matches,
               'notes': ['Statistics: Football-Data.co.uk. Fixtures and latest completed results: official Fantasy Premier League API.',
                         'Historical records are a retrieval-time snapshot; original publication times and later corrections are not archived.',
                         'Referee names preserve source abbreviations. Public appointments do not establish current panel membership or availability.',
                         'Passes, duels, decision quality, other competitions and private conflicts are not supplied.',
                         'Cards are source yellow plus red counts; English second-yellow conventions are documented at football-data.co.uk/notes.txt.']}
    for year in range(season-3, season):
        payload['seasonTeams'][str(year)] = sorted({m[k] for m in matches if m['season'] == year for k in ('home', 'away')})
    payload['snapshotId'] = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    target = ROOT / 'demo' / 'weekly.snapshot.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, separators=(',', ':')) + '\n')
    temporary.replace(target)
    print(f'{target.name}: {len(fixtures)} fixtures, {len(matches)} results, {len(referees)} referee identities; season {payload["seasonLabel"]}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--season', type=int, default=2026)
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    build(args.season, args.offline)
