"""Fetch pinned CC BY 4.0 Wyscout sources and build the historical app snapshot.

Raw downloads stay in .cache. The app reads only the compact committed snapshot.
Use --offline to rebuild from checksum-verified cached files and metadata.
"""
from __future__ import annotations
import argparse
import csv
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
import time
from urllib.request import urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'demo' / 'historical.snapshot.js'
SOURCES = {
    'events': {'article_id': 7770599, 'version': 1, 'file_id': 14464685, 'name': 'events.zip'},
    'matches': {'article_id': 7770422, 'version': 1, 'file_id': 14464622, 'name': 'matches.zip'},
    'teams': {'article_id': 7765310, 'version': 3, 'file_id': 15073697, 'name': 'teams.json'},
    'referees': {'article_id': 8082665, 'version': 1, 'file_id': 15074030, 'name': 'referees.json'},
    'tags': {'article_id': 11743818, 'version': 1, 'file_id': 21385239, 'name': 'tags2name.csv'},
}

def get_metadata(source):
    url = f"https://api.figshare.com/v2/articles/{source['article_id']}/versions/{source['version']}"
    for attempt in range(3):
        try:
            with urlopen(url, timeout=30) as response:
                article = json.load(response)
            break
        except Exception:
            if attempt == 2: raise
            time.sleep(attempt + 1)
    if article['license']['name'] != 'CC BY 4.0' or article['version'] != source['version']:
        raise ValueError('Unexpected source licence or version')
    file = next(item for item in article['files'] if item['id'] == source['file_id'])
    if file['name'] != source['name']: raise ValueError('Unexpected source filename')
    return article, file

def digest(path, algorithm):
    value = hashlib.new(algorithm)
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): value.update(block)
    return value.hexdigest()

def get_archive(cache_dir, file, offline=False):
    path = cache_dir / file['name']
    if path.exists() and path.stat().st_size == file['size'] and digest(path, 'md5') == file['computed_md5']:
        print(f"Using verified cache: {file['name']}", flush=True)
        return path
    if offline: raise ValueError(f"Missing or invalid cache: {file['name']}")
    cache_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=cache_dir, prefix=file['name'] + '.', delete=False) as temporary:
        partial = Path(temporary.name)
        try:
            print(f"Downloading {file['name']} ({file['size'] / 1_000_000:.1f} MB)", flush=True)
            with urlopen(file['download_url'], timeout=120) as response:
                for block in iter(lambda: response.read(1024 * 1024), b''): temporary.write(block)
        except BaseException:
            partial.unlink(missing_ok=True)
            raise
    if partial.stat().st_size != file['size'] or digest(partial, 'md5') != file['computed_md5']:
        partial.unlink(missing_ok=True)
        raise ValueError(f"Source checksum mismatch: {file['name']}")
    partial.replace(path)
    return path

def read_member(path, name):
    with ZipFile(path) as archive:
        with archive.open(name) as stream: return json.load(stream)

def read_referee_identities(path):
    """v1 ends inside Michael Oliver's unused birthArea. Read complete values only.

    Never complete or infer an identity field. Reject any different truncation.
    No dates of birth, nationality, or other personal fields enter the snapshot.
    """
    text = path.read_text()
    decoder = json.JSONDecoder()
    cursor, records, recovered = 1, [], []
    while cursor < len(text):
        while cursor < len(text) and text[cursor] in ' ,\r\n\t': cursor += 1
        if cursor == len(text) or text[cursor] == ']': break
        try:
            record, cursor = decoder.raw_decode(text, cursor)
            records.append(record)
        except json.JSONDecodeError:
            # Decode complete top-level fields of the final object, independently.
            fields, position = {}, cursor + 1
            while position < len(text):
                try:
                    while text[position] in ' ,\r\n\t': position += 1
                    key, position = decoder.raw_decode(text, position)
                    while text[position].isspace(): position += 1
                    if text[position] != ':': break
                    position += 1
                    while text[position].isspace(): position += 1
                    value, position = decoder.raw_decode(text, position)
                    fields[key] = value
                except (json.JSONDecodeError, IndexError): break
            if (fields.get('wyId'), fields.get('firstName'), fields.get('lastName')) != (384965, 'Michael', 'Oliver'):
                raise ValueError('Unexpected truncated referee identity; refuse to guess')
            records.append(fields)
            recovered.append(fields['wyId'])
            break
    identities = {}
    for record in records:
        name = ' '.join(record[key].strip() for key in ['firstName', 'lastName'] if record.get(key, '').strip())
        # Source stores some unicode escapes twice; decode only those escapes.
        import re
        name = re.sub(r'\\u([0-9a-fA-F]{4})', lambda match: chr(int(match[1], 16)), name)
        if not name or record['wyId'] in identities: raise ValueError('Invalid referee identity')
        identities[record['wyId']] = {'id': f"r{record['wyId']}", 'sourceId': record['wyId'], 'name': name}
    return identities, recovered

def build_records(matches, events, source_teams, source_referees):
    if len(matches) != 380: raise ValueError('Expected all 380 English league matches')
    teams = {team['wyId']: team for team in source_teams}
    records, team_games, referee_ids = {}, Counter(), set()
    for match in matches:
        if match['status'] != 'Played' or match['competitionId'] != 364 or match['seasonId'] != 181150:
            raise ValueError('Unexpected competition, season, or match status')
        sides = {team['side']: int(key) for key, team in match['teamsData'].items()}
        if set(sides) != {'home', 'away'}: raise ValueError('Match must have home and away teams')
        officials = [r['refereeId'] for r in match['referees'] if r['role'] == 'referee']
        if len(officials) > 1 or (officials and officials[0] not in source_referees): raise ValueError('Invalid referee identity')
        if officials: referee_ids.add(officials[0])
        stats = {}
        for team_id, team in match['teamsData'].items():
            team_games[int(team_id)] += 1
            stats[f't{team_id}'] = {'fouls': 0, 'cards': 0, 'yellowCards': 0, 'redCards': 0, 'secondYellows': 0, 'events': 0, 'duels': 0, 'passes': 0, 'accuratePasses': 0, 'shots': 0}
        scores = {side: match['teamsData'][str(team_id)]['score'] for side, team_id in sides.items()}
        if any(type(value) is not int or value < 0 for value in scores.values()): raise ValueError('Invalid final score')
        record = {
            'id': f"m{match['wyId']}", 'sourceId': match['wyId'],
            'home': f"t{sides['home']}", 'away': f"t{sides['away']}",
            'date': match['dateutc'].replace(' ', 'T') + 'Z', 'gameweek': match['gameweek'],
            'label': f"{teams[sides['home']]['name']} vs {teams[sides['away']]['name']}",
            'refereeId': f'r{officials[0]}' if officials else None, 'stats': stats,
            'score': scores, 'venue': match['venue'],
        }
        if match['wyId'] in records: raise ValueError('Duplicate match')
        records[match['wyId']] = record
    if len(team_games) != 20 or set(team_games.values()) != {38}: raise ValueError('Invalid team coverage')
    seen_events = set()
    for event in events:
        match = records.get(event['matchId'])
        team_id = f"t{event['teamId']}"
        if match is None or team_id not in match['stats'] or event['id'] in seen_events:
            raise ValueError('Invalid or duplicate event')
        seen_events.add(event['id'])
        stats = match['stats'][team_id]
        stats['events'] += 1
        stats['fouls'] += event['eventName'] == 'Foul'
        stats['duels'] += event['eventName'] == 'Duel'
        tags = {tag['id'] for tag in event['tags']}
        stats['passes'] += event['eventName'] == 'Pass'
        stats['accuratePasses'] += event['eventName'] == 'Pass' and 1801 in tags
        stats['shots'] += event['eventName'] == 'Shot' or event['subEventName'] in {'Free kick shot', 'Penalty'}
        stats['cards'] += bool(tags.intersection({1701, 1702, 1703}))
        stats['yellowCards'] += 1702 in tags
        stats['redCards'] += 1701 in tags
        stats['secondYellows'] += 1703 in tags
    if any(stats['events'] == 0 for match in records.values() for stats in match['stats'].values()):
        raise ValueError('Missing event coverage')
    totals = {key: sum(stats[key] for match in records.values() for stats in match['stats'].values()) for key in ['events', 'fouls', 'cards', 'yellowCards', 'redCards', 'secondYellows', 'duels', 'passes', 'accuratePasses', 'shots']}
    if totals['events'] != 643150 or totals['fouls'] != 8138: raise ValueError('Historical event totals changed')
    return {
        'teams': {f't{key}': {'id': f't{key}', 'sourceId': key, 'name': teams[key]['name']} for key in sorted(team_games)},
        'referees': sorted([source_referees[key] for key in referee_ids], key=lambda referee: referee['name']),
        'matches': sorted(records.values(), key=lambda match: (match['date'], match['id'])),
        'totals': totals,
        'missing_referee_match_ids': [record['id'] for record in records.values() if record['refereeId'] is None],
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=ROOT / '.cache' / 'wyscout')
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    paths, sources = {}, {}
    for key, source in SOURCES.items():
        metadata_path = args.cache_dir / f'{key}.metadata.json'
        if args.offline:
            article, file = json.loads(metadata_path.read_text())
            if article['version'] != source['version'] or file['id'] != source['file_id'] or article['license']['name'] != 'CC BY 4.0':
                raise ValueError('Unexpected cached metadata')
        else:
            article, file = get_metadata(source)
            metadata_path.write_text(json.dumps([article, file]))
        paths[key] = get_archive(args.cache_dir, file, args.offline)
        sources[key] = {
            'article': f"https://figshare.com/articles/dataset/{article['title'].replace(' ', '_')}/{source['article_id']}",
            'doi': article['doi'], 'version': article['version'], 'file_id': file['id'], 'file_name': file['name'],
            'file_md5': file['computed_md5'], 'file_sha256': digest(paths[key], 'sha256'),
            'license': article['license']['name'], 'license_url': article['license']['url'],
        }
    with paths['tags'].open(newline='') as stream:
        tag_names = {int(row['Tag']): row['Label'] for row in csv.DictReader(stream)}
    if {key: tag_names.get(key) for key in [1701, 1702, 1703]} != {1701: 'red_card', 1702: 'yellow_card', 1703: 'second_yellow_card'}:
        raise ValueError('Unexpected card tag definitions')
    if tag_names.get(1801) != 'accurate': raise ValueError('Unexpected accurate-pass tag definition')
    referees, recovered = read_referee_identities(paths['referees'])
    matches = read_member(paths['matches'], 'matches_England.json')
    print('Aggregating English match events…', flush=True)
    records = build_records(matches, read_member(paths['events'], 'events_England.json'), json.loads(paths['teams'].read_text()), referees)
    snapshot = {
        'schema_version': 3, 'method_version': 2, 'built_on': datetime.now(timezone.utc).date().isoformat(),
        'competition': 'Premier League', 'season': '2017/18', 'status': 'historical',
        'source_credit': 'Luca Pappalardo and Emanuele Massucco; Pappalardo et al. (2019), Scientific Data 6:236',
        'source_paper': 'https://www.nature.com/articles/s41597-019-0247-7', 'sources': sources,
        'source_notes': ['Referees v1 ends inside the final birthArea object. Complete, verbatim identity fields for Michael Oliver (384965) were recovered; no missing field was inferred.'],
        'recovered_identity_ids': recovered,
        'unknown_fields': ['Actual availability', 'Declared conflicts', 'Appointment eligibility', 'Other-competition assignments', 'Advantage handling', 'Consistency or decision accuracy'],
        'definitions': {
            'fouls': 'Count of Wyscout Foul events attributed to a team.',
            'cards': 'Count of events carrying at least one card tag: 1701 (red), 1702 (yellow), or 1703 (second yellow); each event counted once. Match formation card fields are minutes, not counts, and are not summed.',
            'events': 'Count of all recorded team events per match, including stoppage time. A recording-volume proxy, not measured ball-in-play tempo.',
            'duels': 'Count of Duel events attributed to a team; paired opponent records are both counted in match totals. Not a physicality or aggression assessment.',
            'passes': 'Count of Pass events; accuratePasses counts those carrying tag 1801. Recorded pass volume is not possession time.',
            'shots': 'Count of Shot events plus Free kick shot and Penalty sub-events. Not expected goals or chance quality.',
            'score': 'Final home and away goals from teamsData.score. Used only for matches strictly before the planning cutoff; target outcomes never enter the fixture schedule or assistant context.',
        },
        **records,
    }
    payload = '// Generated by scripts/refresh-data.py from attributed historical records.\nexport const historicalSnapshot = ' + json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + ';\n'
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(payload)
    temporary.replace(OUTPUT)
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: {len(records['matches'])} matches, {len(records['teams'])} teams, {len(records['referees'])} referees; {len(payload):,} bytes")

if __name__ == '__main__': main()
