#!/usr/bin/env python3
"""Export selectable physical bus stops and grouped rail stations from imported GTFS."""
import collections
import csv
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'region': ('Cars Région', 'https://api.oura3.cityway.fr/dataflow/offre-tc/download?provider=HAUTE_SAVOIE&dataFormat=GTFS&dataProfil=OPENDATA', 'https://www.laregionvoustransporte.fr/'),
    'sncf': ('SNCF', 'https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip', 'https://www.sncf-connect.com/'),
    'chamonix': ('Chamonix Mobilité', 'https://api.pysae.com/api/v4/groups/chamonix-bus/gtfs/pub', 'https://www.chamonix-mobilite.com/'),
    'facilibus': ('Facilibus', 'https://api.pysae.com/api/v4/groups/saint-gervais/gtfs/pub', 'https://www.saintgervais.com/'),
}

def rows(z, name):
    return list(csv.DictReader(io.StringIO(z.read(name).decode('utf-8-sig')))) if name in z.namelist() else []

def build():
    path = ROOT / 'public/data/valley.json'
    data = json.loads(path.read_text())
    west, south, east, north = data['bounds']
    groups = {}
    for feed, (network, source, service_url) in SOURCES.items():
        with zipfile.ZipFile(ROOT / f'var/motis/feeds/{feed}.zip') as z:
            stops = {s['stop_id']: s for s in rows(z, 'stops.txt')}
            routes = {r['route_id']: r for r in rows(z, 'routes.txt')}
            trips = {t['trip_id']: t for t in rows(z, 'trips.txt')}
            for timing in rows(z, 'stop_times.txt'):
                trip = trips.get(timing['trip_id'])
                route = routes.get(trip['route_id']) if trip else None
                stop = stops.get(timing['stop_id'])
                if not route or not stop:
                    continue
                kind = int(route['route_type'])
                mode = 'train' if kind == 2 or 100 <= kind < 200 else 'bus' if kind in (3, 11) or 200 <= kind < 300 or 700 <= kind < 900 else None
                if not mode:
                    continue
                # One rail station for its platforms/services; opposite bus stops stay distinct.
                if mode == 'train' and stop.get('parent_station') in stops:
                    stop = stops[stop['parent_station']]
                try:
                    lat, lon = float(stop['stop_lat']), float(stop['stop_lon'])
                except (KeyError, ValueError):
                    continue
                if not (west <= lon <= east and south <= lat <= north):
                    continue
                key = (mode, stop['stop_name'].casefold(), round(lat, 5), round(lon, 5))
                if key not in groups:
                    groups[key] = dict(id=f'{mode}:{feed}:{stop["stop_id"]}', name=stop['stop_name'], lat=lat, lon=lon, mode=mode, source=source, url=service_url, routes=set(), networks=set())
                entry = groups[key]
                label = route.get('route_short_name') or route.get('route_long_name') or network
                entry['routes'].add(label)
                entry['networks'].add(network)
    pois = [p for p in data['pois'] if p['mode'] not in ('bus', 'train')]
    for p in sorted(groups.values(), key=lambda p: (p['mode'], p['name'], p['id'])):
        p['routes'] = sorted(p['routes'])
        p['network'] = ' · '.join(sorted(p.pop('networks')))
        pois.append(p)
    data['pois'] = pois
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    temporary.replace(path)
    print('Transit map layers:', dict(collections.Counter(p['mode'] for p in pois if p['mode'] in ('bus', 'train'))))

if __name__ == '__main__':
    build()
