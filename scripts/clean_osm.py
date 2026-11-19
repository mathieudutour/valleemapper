"""Keep complete local ways and their nodes; discard invalid or empty ways.
This also avoids MOTIS ADR's invalid-location failure on boundary ways.
"""
import json, pathlib, sys
import osmium

source,destination=map(pathlib.Path,sys.argv[1:3]);west,south,east,north=6.48,45.70,7.05,46.02
way_ids=set();node_ids=set();invalid=0
class Collect(osmium.SimpleHandler):
 def way(self,w):
  global invalid
  if not w.nodes or any(not n.location.valid() for n in w.nodes):invalid+=1;return
  if not any(west<=n.lon<=east and south<=n.lat<=north for n in w.nodes):return
  way_ids.add(w.id);node_ids.update(n.ref for n in w.nodes)
reader=osmium.io.Reader(str(source));locations=osmium.NodeLocationsForWays(osmium.index.create_map('flex_mem'));locations.ignore_errors();osmium.apply(reader,locations,Collect());reader.close()
tmp=destination.with_name('valley-clean.osm.pbf');tmp.unlink(missing_ok=True)
writer=osmium.SimpleWriter(str(tmp))
class Write(osmium.SimpleHandler):
 def node(self,n):
  if n.location.valid() and (n.id in node_ids or west<=n.lon<=east and south<=n.lat<=north):writer.add_node(n);node_ids.add(n.id)
 def way(self,w):
  if w.id in way_ids:writer.add_way(w)
 def relation(self,r):
  if r.members and all(m.ref in (way_ids if m.type=='w' else node_ids if m.type=='n' else set()) for m in r.members):writer.add_relation(r)
Write().apply_file(str(source));writer.close();tmp.replace(destination)
report=dict(source=str(source),bounds=[west,south,east,north],ways=len(way_ids),nodes=len(node_ids),discardedInvalidOrEmptyWays=invalid,bytes=destination.stat().st_size)
destination.with_suffix('.json').write_text(json.dumps(report,indent=2));print('OSM extract',report,flush=True)
