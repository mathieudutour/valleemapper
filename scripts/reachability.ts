// Finds map points (stops, stations, bike and car-sharing spots) that MOTIS cannot walk away from.
// A point cut off from the street network gets no walk at all, or a fake one shorter than the straight
// line, as the island platforms at Le Fayet did before scripts/clean_osm.py corrected their stair levels.
// Run it against a routing server: npm run dev in another terminal, then npm run reachability
// (add "lat,lon" arguments to check other spots).
import { readFileSync } from "node:fs";

const motis = process.env.MOTIS_URL || "http://127.0.0.1:8080";
type Point = { name: string; mode: string; lat: number; lon: number };
const { pois } = JSON.parse(
  readFileSync("public/data/valley.json", "utf8"),
) as { pois: Point[] };

const metres = (a: Point, b: Point) =>
  Math.hypot(
    (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180),
    a.lat - b.lat,
  ) * 111_320;

// Extra "lat,lon" arguments are checked too, e.g. a spot where a search found nothing.
const extra = process.argv.slice(2).map((arg) => {
  const [lat, lon] = arg.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon))
    throw new Error(`Expected lat,lon, got ${arg}`);
  return { name: arg, mode: "argument", lat, lon };
});
// Points on the same spot are checked once.
const unique = (list: Point[]) => [
  ...new Map(
    list.map((p) => [`${p.lat.toFixed(5)},${p.lon.toFixed(5)}`, p]),
  ).values(),
];
// Walks go to the map's own points only, so an argument never serves as another point's neighbour.
const targets = unique(pois);
const points = unique([...pois, ...extra]);
const time = new Date(Date.now() + 86_400_000).toISOString();

/** Walking distance MOTIS finds between two points, or nothing when it finds no walk. */
async function walk(from: Point, to: Point): Promise<number | undefined> {
  const q = new URLSearchParams({
    fromPlace: `${from.lat},${from.lon}`,
    toPlace: `${to.lat},${to.lon}`,
    time,
    transitModes: "",
    directModes: "WALK",
    maxDirectTime: "3600",
  });
  const r = await fetch(`${motis}/api/v6/plan?${q}`);
  if (!r.ok) throw new Error(`MOTIS HTTP ${r.status}`);
  const plan = (await r.json()) as {
    direct: { legs: { distance?: number }[] }[];
  };
  return plan.direct[0]?.legs.reduce((sum, l) => sum + (l.distance ?? 0), 0);
}

// Snapping may leave up to 25 m off the network at each end, so a real walk is at least the straight
// line minus that; the fake walks found so far were a few metres long.
const fake = (distance: number | undefined, straight: number) =>
  distance === undefined || distance + 60 < straight;

const broken: { point: Point; checks: string[] }[] = [];
let unchecked = 0;
const queue = [...points];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let point = queue.pop(); point; point = queue.pop()) {
      const neighbours = targets
        .map((other) => ({ other, straight: metres(point, other) }))
        .filter(({ straight }) => straight >= 150 && straight <= 1500)
        .sort((a, b) => a.straight - b.straight)
        .slice(0, 3);
      if (!neighbours.length) {
        unchecked++;
        continue;
      }
      const checks = await Promise.all(
        neighbours.map(async ({ other, straight }) => {
          const distance = await walk(point, other);
          return {
            fake: fake(distance, straight),
            text: `${other.name.trim()}: ${distance === undefined ? "no walk" : `${Math.round(distance)} m`} for ${Math.round(straight)} m straight`,
          };
        }),
      );
      // A neighbour can be the cut-off one, so a point is only reported when every walk from it fails.
      if (checks.every((c) => c.fake))
        broken.push({ point, checks: checks.map((c) => c.text) });
    }
  }),
);

console.log(
  `${points.length} points, ${unchecked} without a neighbour 150 m–1.5 km away, ${broken.length} cut off from walking.`,
);
for (const { point, checks } of broken.sort((a, b) =>
  a.point.name.localeCompare(b.point.name),
)) {
  console.log(
    `- ${point.name.trim()} (${point.mode}) ${point.lat.toFixed(6)},${point.lon.toFixed(6)}`,
  );
  for (const check of checks) console.log(`    → ${check}`);
}
if (broken.length) process.exitCode = 1;
