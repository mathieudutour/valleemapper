#!/usr/bin/env python3
"""Download reproducible inputs, subset GTFS without changing IDs, import MOTIS.
No synthetic bus trips; the only authored trips are explicitly estimated lifts.
"""
import sys
import argparse, csv, datetime as dt, gzip, hashlib, io, json, os, pathlib, platform, shutil, subprocess, tarfile, urllib.request, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
pidfile=ROOT/'var/dev.pid'
if pidfile.exists():
 try:
  os.kill(int(pidfile.read_text()),0)
 except (ProcessLookupError,ValueError):pidfile.unlink(missing_ok=True)
 else:raise SystemExit('Stop npm run dev before rebuilding the routing graph.')
BASE = ROOT / 'var/motis'
FEEDS = BASE / 'feeds'
RESEARCH = ROOT / 'docs/research/data'
BOUNDS = [6.48, 45.70, 7.05, 46.02]
VERSION = '2.11.4'
SOURCES = {
 'region': ('https://api.oura3.cityway.fr/dataflow/offre-tc/download?provider=HAUTE_SAVOIE&dataFormat=GTFS&dataProfil=OPENDATA','passy-hs-gtfs.zip'),
 'sncf': ('https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip','passy-sncf-gtfs.zip'),
 'chamonix': ('https://api.pysae.com/api/v4/groups/chamonix-bus/gtfs/pub','passy-pysae-chx-pub'),
 'facilibus': ('https://api.pysae.com/api/v4/groups/saint-gervais/gtfs/pub','passy-shuttle-saint-gervais-gtfs-pub'),
}
# SNCF publishes trip updates and service alerts as separate feeds; Pysae carries both in one.
RT = {'sncf':['https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates','https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-service-alerts'],'chamonix':['https://api.pysae.com/api/v4/groups/chamonix-bus/gtfs-rt'],'facilibus':['https://api.pysae.com/api/v4/groups/saint-gervais/gtfs-rt']}
parser=argparse.ArgumentParser();parser.add_argument('--refresh',action='store_true');parser.add_argument('--no-import',action='store_true');parser.add_argument('--cached-research',action='store_true',help='Use same-day /tmp research downloads for initial bootstrap');args=parser.parse_args()
def download(url, path):
 path.parent.mkdir(parents=True,exist_ok=True)
 print('Downloading',url,flush=True)
 tmp=path.with_suffix(path.suffix+'.download')
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'MontBlancMobilitePrototype/0.1'}),timeout=120) as r,tmp.open('wb') as f: shutil.copyfileobj(r,f)
  tmp.replace(path)
 finally: tmp.unlink(missing_ok=True)
def rows(z,name):
 return list(csv.DictReader(io.StringIO(z.read(name).decode('utf-8-sig')))) if name in z.namelist() else []
def write_csv(z,name,data,fields=None):
 if not data:return
 s=io.StringIO();w=csv.DictWriter(s,fieldnames=fields or list(data[0]),lineterminator='\n');w.writeheader();w.writerows(data);z.writestr(name,s.getvalue())
def in_bounds(s):
 try:return BOUNDS[0]<=float(s['stop_lon'])<=BOUNDS[2] and BOUNDS[1]<=float(s['stop_lat'])<=BOUNDS[3]
 except (ValueError,KeyError):return False
def subset(src,dst,tag):
 with zipfile.ZipFile(src) as z:
  stops=rows(z,'stops.txt');routes=rows(z,'routes.txt');trips=rows(z,'trips.txt');times=rows(z,'stop_times.txt')
  local_ids={s['stop_id'] for s in stops if in_bounds(s)}
  local_trips={s['trip_id'] for s in times if s['stop_id'] in local_ids}
  if tag=='region':
   route_ids={r['route_id'] for r in routes if r['route_short_name'].upper() in {'Y81','Y82','Y83','Y84','Y85','Y86','274'}}
   trips=[t for t in trips if t['route_id'] in route_ids]
  elif tag=='sncf':trips=[t for t in trips if t['trip_id'] in local_trips]
  else:trips=[t for t in trips if t['trip_id'] in local_trips and not any(v in (t.get('trip_headsign','')+' '+t.get('trip_short_name','')).lower() for v in ['formation','privé','private'])]
  trip_ids={t['trip_id'] for t in trips};route_ids={t['route_id'] for t in trips};service_ids={t['service_id'] for t in trips};shape_ids={t.get('shape_id') for t in trips}
  times=[s for s in times if s['trip_id'] in trip_ids];stop_ids={s['stop_id'] for s in times}
  # Retain parents and whole selected trips, never truncate a train mid-journey.
  stop_ids.update(s.get('parent_station') for s in stops if s['stop_id'] in stop_ids)
  with zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED) as out:
   write_csv(out,'stops.txt',[s for s in stops if s['stop_id'] in stop_ids]);write_csv(out,'routes.txt',[r for r in routes if r['route_id'] in route_ids]);write_csv(out,'trips.txt',trips);write_csv(out,'stop_times.txt',times)
   for name in ['agency.txt','feed_info.txt','calendar.txt','calendar_dates.txt','shapes.txt','transfers.txt','frequencies.txt']:
    data=rows(z,name)
    if name in ['calendar.txt','calendar_dates.txt']:data=[s for s in data if s['service_id'] in service_ids]
    if name=='shapes.txt':data=[s for s in data if s['shape_id'] in shape_ids]
    if name=='transfers.txt':data=[s for s in data if s.get('from_stop_id') in stop_ids and s.get('to_stop_id') in stop_ids]
    if name=='frequencies.txt':data=[s for s in data if s['trip_id'] in trip_ids]
    write_csv(out,name,data)
  print(tag,len(trips),'trips',len(stop_ids),'stops',flush=True)
  return [dict(name=s['stop_name'],lat=float(s['stop_lat']),lon=float(s['stop_lon']),id=tag+'_'+s['stop_id']) for s in stops if s['stop_id'] in stop_ids and in_bounds(s) and s.get('location_type','0') in ['','0']]
def lifts():
 info=json.loads((RESEARCH/'vertical-links.json').read_text())['links'];today=dt.date.today();last=min(today+dt.timedelta(days=120),dt.date(2027,3,31))
 agencies=[dict(agency_id='vertical',agency_name='Liaisons verticales — modèle estimé',agency_url='https://www.saintgervais.com/',agency_timezone='Europe/Paris')]
 stops=[];routes=[];trips=[];times=[];freq=[];dates=[]
 for link in info:
  rid=link['id'];term=link['osm_terminals'];duration=link['duration_minutes']
  for i,s in enumerate(term):stops.append(dict(stop_id=f'{rid}-{i}',stop_name=f"{link['name']} — {s['name']}",stop_lat=s['latitude'],stop_lon=s['longitude']))
  routes.append(dict(route_id=rid,agency_id='vertical',route_short_name='Valléen' if rid=='valleen' else 'Thermes',route_long_name=link['name']+' (horaires estimés)',route_type=6 if rid=='valleen' else 7))
  d=today
  while d<=last:
   closed=(rid=='thermal_lift' and d.weekday()==0 and d.day<=7) or any(c.get('from','9999')<=d.isoformat()<=c.get('through','0000') for c in link.get('known_closures',[]))
   if not closed:dates.append(dict(service_id=rid,date=d.strftime('%Y%m%d'),exception_type=1))
   d+=dt.timedelta(days=1)
  for direction in [0,1]:
   tid=f'{rid}-{direction}';trips.append(dict(route_id=rid,service_id=rid,trip_id=tid,direction_id=direction,trip_headsign=term[1-direction]['name']))
   for n,i in enumerate([direction,1-direction]):times.append(dict(trip_id=tid,arrival_time=f'00:{duration*n:02}:00',departure_time=f'00:{duration*n:02}:00',stop_id=f'{rid}-{i}',stop_sequence=n+1))
   # One-minute quantization is an assumption, NEVER an official headway.
   h,m=map(int,link['hours']['closes'].split(':'));end=h*60+m-duration
   freq.append(dict(trip_id=tid,start_time=link['hours']['opens']+':00',end_time=f'{end//60:02}:{end%60:02}:00',headway_secs=60,exact_times=0))
 with zipfile.ZipFile(FEEDS/'vertical.zip','w',zipfile.ZIP_DEFLATED) as z:
  for name,data in [('agency',agencies),('stops',stops),('routes',routes),('trips',trips),('stop_times',times),('frequencies',freq),('calendar_dates',dates),('calendar',[dict(service_id=link['id'],monday=0,tuesday=0,wednesday=0,thursday=0,friday=0,saturday=0,sunday=0,start_date='20261118',end_date='20270331') for link in info])]:write_csv(z,name+'.txt',data)
 return info
def public_data(stops,links):
 pois=[]
 for f in json.loads((RESEARCH/'shared-mobility-locations.geojson').read_text())['features']:
  p=f['properties'];lon,lat=f['geometry']['coordinates'];mode=p['mode'].replace('rezo_pouce','rezopouce')
  pois.append(dict(id=str(p['id']),name=p['name'],lon=lon,lat=lat,mode=mode,source=p['source_url'],warning=p.get('warning',''),url={'montenvelo':'https://montenvelo.fr/','citiz':'https://aura.citiz.coop/','rezopouce':'https://www.rezopouce.fr/'}[mode]))
 for filename,mode in [('montenbus-stops-research.geojson','montenbus'),('resort-shuttle-stops-research.geojson','shuttle')]:
  for i,f in enumerate(json.loads((RESEARCH/filename).read_text())['features']):
   p=f['properties'];lon,lat=f['geometry']['coordinates'];pois.append(dict(id=f'{mode}-{i}',name=p.get('name','Arrêt'),lon=lon,lat=lat,mode=mode,source=p.get('source_url',''),note=p.get('validity_note','Sur réservation. Adhésion nécessaire. Horaires non calculés.'),url='https://montenbus.app.ridewithvia.com/' if mode=='montenbus' else p.get('source_url','')))
 for link in links:
  s=link['osm_terminals'][0];pois.append(dict(id=link['id'],name=link['name'],lon=s['longitude'],lat=s['latitude'],mode='lift',source=link['sources'][0],url=link['sources'][0],note=f"{link['hours']['opens']}–{link['hours']['closes']} · trajet {link['duration_minutes']} min · horaires estimés, ouverture à vérifier"))
 places=[dict(name='Gare de Chedde',lat=45.92634,lon=6.719784),dict(name='Gare de Sallanches',lat=45.935699,lon=6.636458),dict(name='Gare du Fayet',lat=45.90608,lon=6.70015),dict(name='Saint-Gervais · Le Valléen',lat=45.8909264,lon=6.7082205),dict(name='Passy · Chef-lieu',lat=45.92351,lon=6.68778),dict(name="Plateau d’Assy",lat=45.93859,lon=6.70652),dict(name='Chamonix · Gare',lat=45.92272,lon=6.87441),dict(name='Lac de Passy',lat=45.91625,lon=6.64161)]
 seen=set()
 for s in stops:
  key=(s['name'].lower(),round(s['lat'],4),round(s['lon'],4))
  if key not in seen:places.append(s);seen.add(key)
 data=dict(checkedOn=dt.date.today().isoformat(),bounds=BOUNDS,pois=pois,places=places,links=json.loads((RESEARCH/'vertical-links-osm.geojson').read_text()),stats=[dict(label='stations vélo',value=23),dict(label='stations Citiz',value=5),dict(label='arrêts Rézo Pouce',value=92)])
 (ROOT/'public/data').mkdir(parents=True,exist_ok=True);(ROOT/'public/data/valley.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))

FEEDS.mkdir(parents=True,exist_ok=True);(ROOT/'var/bin').mkdir(parents=True,exist_ok=True)
all_stops=[];provenance=[]
for tag,(url,cached) in SOURCES.items():
 raw=ROOT/f'var/raw/{tag}.zip';raw.parent.mkdir(parents=True,exist_ok=True)
 if args.cached_research and pathlib.Path('/tmp',cached).exists():shutil.copy2(pathlib.Path('/tmp',cached),raw)
 elif args.refresh or not raw.exists():download(url,raw)
 all_stops.extend(subset(raw,FEEDS/f'{tag}.zip',tag));provenance.append(dict(id=tag,url=url,sha256=hashlib.sha256(raw.read_bytes()).hexdigest(),downloadedAt=dt.datetime.fromtimestamp(raw.stat().st_mtime,dt.timezone.utc).isoformat()))
info=lifts();public_data(all_stops,info)
subprocess.run([sys.executable,str(ROOT/'scripts/build_transit_locations.py')],check=True)
# Elevation lets MOTIS report each street step's climb and descent, from which the API derives bike times.
# 1-arc-second HGT tiles from the AWS Terrain Tiles open dataset (Mapzen "skadi"), unchanged since 2016.
ELEVATION=BASE/'elevation';HGT_BYTES=3601*3601*2
TILES={'N45E006':'6b9699a7d05ad3cf36af7bb1ddbf35f2a465e9236953675afec8552018825651','N45E007':'8f98a452476e0c0af474649d59ebd3c5c40211b2d189ad1fb748ada01b953e6f','N46E006':'ec8d18d39b5ca9fb3b30be57e0faced23ff44860b196a70c8e6fa3a6c4d09834','N46E007':'cf790a87057dfdf126f9b314d9ec71d407afdedbe71c79e2b14c903d024ce0b9'}
assert set(TILES)=={f'N{lat}E{lng:03d}' for lat in range(int(BOUNDS[1]),int(BOUNDS[3])+1) for lng in range(int(BOUNDS[0]),int(BOUNDS[2])+1)},'Elevation tiles must cover BOUNDS'
ELEVATION.mkdir(parents=True,exist_ok=True)
for name,sha in TILES.items():
 url=f'https://elevation-tiles-prod.s3.amazonaws.com/skadi/{name[:3]}/{name}.hgt.gz';raw=ROOT/f'var/raw/{name}.hgt.gz';tile=ELEVATION/f'{name}.hgt'
 if not raw.exists():download(url,raw)
 if hashlib.sha256(raw.read_bytes()).hexdigest()!=sha:raise RuntimeError(f'Elevation tile {name} checksum mismatch')
 if not tile.exists() or tile.stat().st_size!=HGT_BYTES:
  tmp=tile.with_suffix('.download')
  with gzip.open(raw) as src,tmp.open('wb') as dst:shutil.copyfileobj(src,dst)
  if tmp.stat().st_size!=HGT_BYTES:raise RuntimeError(f'Elevation tile {name} is not a 1-arc-second HGT tile')
  tmp.replace(tile)
 provenance.append(dict(id=f'elevation-{name}',url=url,sha256=sha))
(BASE/'provenance.json').write_text(json.dumps(provenance,indent=2))
osm=BASE/'haute-savoie.osm.pbf'
raw_osm=ROOT/'var/raw/haute-savoie.osm.pbf'
if args.cached_research and pathlib.Path('/tmp/passy-haute-savoie.osm.pbf').exists():shutil.copy2('/tmp/passy-haute-savoie.osm.pbf',raw_osm)
elif args.refresh or not raw_osm.exists():download('https://download.openstreetmap.fr/extracts/europe/france/rhone_alpes/haute_savoie-latest.osm.pbf',raw_osm)
if args.refresh or not osm.with_suffix('.json').exists():
 python=ROOT/'var/python/bin/python'
 if not python.exists():subprocess.run([sys.executable,'-m','venv',str(ROOT/'var/python')],check=True)
 subprocess.run([str(python),'-m','pip','install','osmium==4.3.0'],check=True)
 subprocess.run([str(python),str(ROOT/'scripts/clean_osm.py'),str(raw_osm),str(osm)],check=True)
# SNCF publishes no shapes; route_shapes matches those routes onto OSM tracks instead of stop-to-stop lines.
config='''server:
  host: 127.0.0.1
  port: 8080
osm: haute-savoie.osm.pbf
street_routing:
  elevation_data_dir: elevation
geocoding: true
osr_footpath: true
timetable:
  first_day: TODAY
  num_days: 180
  with_shapes: true
  route_shapes:
    mode: missing
  datasets:
'''
for tag in [*SOURCES,'vertical']:
 config+=f'    {tag}:\n      path: feeds/{tag}.zip\n      extend_calendar: false\n'
 if tag in RT:config+='      rt:\n'+''.join(f'        - url: {url}\n          protocol: gtfsrt\n' for url in RT[tag])
# MontenVélo requires return at a station, including bikes picked up off-station.
config+='''gbfs:
  feeds:
    montenvelo:
      url: https://gbfs.partners.fifteen.eu/gbfs/2.2/mont_blanc/en/gbfs.json
      name: MontenVélo
  default_restrictions:
    montenvelo:
      station_parking: true
      return_constraint: any_station
  update_interval: 60
  http_timeout: 10
'''
(BASE/'config.yml').write_text(config)
if not args.no_import:
 binary=ROOT/'var/bin/motis'
 if not binary.exists():
  kind={'Darwin':'macos','Linux':'linux'}.get(platform.system());arch={'arm64':'arm64','aarch64':'arm64','x86_64':'amd64'}.get(platform.machine())
  if (kind,arch) not in [('macos','arm64'),('linux','amd64')]:raise RuntimeError('This prototype pins macOS arm64 and Linux amd64. Set up MOTIS manually for this platform.')
  archive=ROOT/'var/bin/motis.tar.bz2';cache=pathlib.Path('/tmp/motis.tar.bz2')
  if args.cached_research and kind=='macos' and cache.exists():shutil.copy2(cache,archive)
  else:download(f'https://github.com/motis-project/motis/releases/download/v{VERSION}/motis-{kind}-{arch}.tar.bz2',archive)
  expected={'macos':'02753c7e6487beaede33b7ea1b37e6349cb5387de8be8c35be7137d55c7da9d7','linux':'b521bb29c961a3b994ff4dac663778ba64fee7b4cfaf3f2b20ff1d5e1d15e0dc'}[kind]
  if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise RuntimeError('MOTIS checksum mismatch')
  with tarfile.open(archive) as tar:
   for member in tar.getmembers():
    if pathlib.PurePosixPath(member.name).name=='motis' and member.isfile():
     with binary.open('wb') as f:shutil.copyfileobj(tar.extractfile(member),f)
  binary.chmod(0o755)
 subprocess.run([str(binary),'import'],cwd=BASE,check=True)
print('Prepared routing inputs.' if args.no_import else 'Prepared. Start with npm run dev.',flush=True)
