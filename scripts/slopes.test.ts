import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cyclingSpeed,
  FLAT_SPEED,
  legTiming,
  retimeJourney,
  RIDERS,
  walkingSpeed,
  WALKING_FLAT_SPEED,
} from "../server/slopes.js";
import { heightGrid, type Heights } from "../server/elevation.js";
import type { Itinerary, Leg, Step } from "../src/types.js";

const kmh = (metresPerSecond: number) => metresPerSecond * 3.6;
const step = (distance: number, rise: number): Step => ({
  relativeDirection: "CONTINUE",
  distance,
  streetName: "",
  polyline: { points: "", precision: 6 },
  elevationUp: Math.max(0, rise),
  elevationDown: Math.max(0, -rise),
});
const place = (name: string) => ({ name, lat: 45.9, lon: 6.7 });
function leg(
  mode: string,
  start: string,
  seconds: number,
  steps?: Step[],
): Leg {
  return {
    mode,
    from: place("A"),
    to: place("B"),
    startTime: start,
    endTime: new Date(+new Date(start) + seconds * 1000).toISOString(),
    duration: seconds,
    steps,
    realTime: false,
  };
}
const journey = (legs: Leg[]): Itinerary => ({
  id: "j",
  legs,
  transfers: 0,
  startTime: legs[0].startTime,
  endTime: legs.at(-1)!.endTime,
  duration:
    (+new Date(legs.at(-1)!.endTime) - +new Date(legs[0].startTime)) / 1000,
});
// 3 km at 8 %, in 30 m steps like MOTIS's street segments, timed by MOTIS at its flat speed.
const climb = Array.from({ length: 100 }, () => step(30, 2.4));
const descent = climb.map((s) => step(s.distance, -2.4));
const flatSeconds = Math.round(3000 / FLAT_SPEED);

test("flat ground keeps MOTIS's speed for both bikes", () => {
  assert.equal(cyclingSpeed(0, RIDERS.bike), FLAT_SPEED);
  assert.equal(cyclingSpeed(0, RIDERS.ebike), FLAT_SPEED);
});

test("climbs slow an own bike more than an electric-assist one", () => {
  const own = kmh(cyclingSpeed(0.08, RIDERS.bike));
  const assisted = kmh(cyclingSpeed(0.08, RIDERS.ebike));
  assert(own > 5 && own < 9, `own bike at 8 %: ${own} km/h`);
  assert(assisted > own + 3, `e-bike at 8 %: ${assisted} km/h`);
  assert.equal(kmh(cyclingSpeed(0.3, RIDERS.bike)), kmh(1.1), "walks a wall");
});

test("descents get faster up to a braking limit", () => {
  assert.equal(cyclingSpeed(-0.01, RIDERS.bike), FLAT_SPEED);
  assert(cyclingSpeed(-0.04, RIDERS.bike) > FLAT_SPEED);
  assert.equal(cyclingSpeed(-0.2, RIDERS.bike), 6.5);
});

test("a climb takes about twice MOTIS's time, the way back less", () => {
  const up = legTiming(
    leg("BIKE", "2026-11-20T08:00:00Z", flatSeconds, climb),
  )!;
  const down = legTiming(
    leg("BIKE", "2026-11-20T08:00:00Z", flatSeconds, descent),
  )!;
  assert.deepEqual([up.elevation.up, up.elevation.down], [240, 0]);
  assert.deepEqual([down.elevation.up, down.elevation.down], [0, 240]);
  assert(up.duration > 2 * flatSeconds, `up ${up.duration}s`);
  assert(down.duration < 0.75 * flatSeconds, `down ${down.duration}s`);
});

test("terrain noise on the flat barely changes the time", () => {
  // ±4 m between neighbouring 30 m steps, as the 30 m terrain model gives on a valley floor.
  const noisy = Array.from({ length: 100 }, (_, i) => step(30, i % 2 ? 4 : -4));
  const timing = legTiming(
    leg("BIKE", "2026-11-20T08:00:00Z", flatSeconds, noisy),
  )!;
  assert(Math.abs(timing.duration - flatSeconds) < 0.03 * flatSeconds);
  // The raw steps add up to 200 m of climbing.
  assert(timing.elevation.up < 20, `smoothed climb ${timing.elevation.up} m`);
});

test("an own electric bike is labelled and timed like MontenVélo", () => {
  const start = "2026-11-20T08:00:00Z";
  const own = retimeJourney(journey([leg("BIKE", start, flatSeconds, climb)]), {
    arriveBy: false,
    electricBike: true,
  }).legs[0];
  assert.equal(own.electricAssist, true);
  assert.equal(
    own.duration,
    legTiming(leg("RENTAL", start, flatSeconds, climb))!.duration,
  );
  assert(
    own.duration < legTiming(leg("BIKE", start, flatSeconds, climb))!.duration,
  );
});

test("walking legs and legs without steps keep MOTIS's time", () => {
  assert.equal(
    legTiming(leg("WALK", "2026-11-20T08:00:00Z", 300, climb)),
    undefined,
  );
  assert.equal(legTiming(leg("BIKE", "2026-11-20T08:00:00Z", 300)), undefined);
});

test("a direct ride keeps the requested departure, or the requested arrival", () => {
  const ride = journey([
    leg("BIKE", "2026-11-20T08:00:00Z", flatSeconds, climb),
  ]);
  const departing = retimeJourney(ride, { arriveBy: false });
  assert.equal(departing.startTime, ride.startTime);
  assert(+new Date(departing.endTime) > +new Date(ride.endTime));
  assert.equal(departing.duration, departing.legs[0].duration);
  assert.equal(departing.legs[0].elevation?.up, 240);
  const arriving = retimeJourney(ride, { arriveBy: true });
  assert.equal(arriving.endTime, ride.endTime);
  assert(+new Date(arriving.startTime) < +new Date(ride.startTime));
});

test("rides around a bus keep the bus and move the journey's ends", () => {
  const start = "2026-11-20T08:00:00Z";
  const walk = leg("WALK", start, 60);
  const ride = leg("RENTAL", walk.endTime, flatSeconds, climb);
  const bus = leg("BUS", ride.endTime, 1200);
  const after = leg("RENTAL", bus.endTime, flatSeconds, descent);
  const original = journey([walk, ride, bus, after]);
  const retimed = retimeJourney(original, { arriveBy: false });
  const [w, r, b, a] = retimed.legs;
  assert.deepEqual(
    [b.startTime, b.endTime],
    [bus.startTime, bus.endTime],
    "the bus is unchanged",
  );
  assert.equal(r.endTime, bus.startTime, "the climb still meets the bus");
  assert.equal(w.endTime, r.startTime);
  assert(+new Date(retimed.startTime) < +new Date(start), "leave earlier");
  assert.equal(a.startTime, bus.endTime);
  assert(
    +new Date(retimed.endTime) < +new Date(original.endTime),
    "arrive sooner",
  );
  const span =
    (+new Date(retimed.endTime) - +new Date(retimed.startTime)) / 1000;
  assert(
    Math.abs(retimed.duration - span) <= 60,
    "times move by whole minutes",
  );
});

test("journeys without bike legs are returned untouched", () => {
  const bus = journey([leg("BUS", "2026-11-20T08:00:00Z", 600)]);
  assert.equal(retimeJourney(bus, { arriveBy: false }), bus);
});

test("bike legs carry their smoothed height profile", () => {
  const { elevation } = legTiming(
    leg("BIKE", "2026-11-20T08:00:00Z", flatSeconds, climb),
  )!;
  // 3 km in 200 m stretches: 16 heights from the start, rising 16 m each.
  assert.equal(elevation.spacing, 200);
  assert.equal(elevation.profile?.length, 16);
  assert.deepEqual(elevation.profile?.slice(0, 3), [0, 16, 32]);
  assert.equal(elevation.profile?.at(-1), 240);
  assert.equal(elevation.start, undefined, "no altitude without the grid");
  const withGrid = legTiming(
    leg("BIKE", "2026-11-20T08:00:00Z", flatSeconds, climb),
    () => 583.4,
  )!;
  assert.equal(withGrid.elevation.start, 583);
});

test("walking follows Tobler's rule around MOTIS's flat speed", () => {
  assert.equal(walkingSpeed(0), WALKING_FLAT_SPEED);
  const fastest = walkingSpeed(-0.05);
  for (const grade of [-0.3, -0.1, 0, 0.1, 0.3])
    assert(walkingSpeed(grade) <= fastest, `grade ${grade}`);
  assert(walkingSpeed(0.1) < 0.9, `10 % up: ${walkingSpeed(0.1)} m/s`);
  assert(walkingSpeed(0.3) < walkingSpeed(0.1));
});

/** Google polyline encoding, as MOTIS sends leg geometry. */
function encode(points: [lon: number, lat: number][], precision = 6) {
  const scale = 10 ** precision;
  const value = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1,
      out = "";
    for (; n >= 0x20; n >>= 5)
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    return out + String.fromCharCode(n + 63);
  };
  let lat = 0,
    lon = 0,
    out = "";
  for (const [x, y] of points) {
    const [la, lo] = [Math.round(y * scale), Math.round(x * scale)];
    out += value(la - lat) + value(lo - lon);
    [lat, lon] = [la, lo];
  }
  return out;
}
// About 1 km due north, walked at MOTIS's flat speed.
const north: [number, number][] = [
  [6.7, 45.9],
  [6.7, 45.909],
];
const walkSeconds = Math.round(1002 / WALKING_FLAT_SPEED);
function walkLeg(start: string, line = north): Leg {
  return {
    ...leg("WALK", start, walkSeconds),
    distance: 1002,
    legGeometry: { points: encode(line), precision: 6 },
  };
}
/** Ground rising northwards at a constant grade. */
const slope =
  (grade: number): Heights =>
  (lat) =>
    500 + (lat - 45.9) * 111_320 * grade;

test("walks are retimed from the height grid", () => {
  const start = "2026-11-20T08:00:00Z";
  const up = legTiming(walkLeg(start), slope(0.1))!;
  assert.deepEqual([up.elevation.up, up.elevation.down], [100, 0]);
  assert.equal(
    up.elevation.profile,
    undefined,
    "only bike legs keep a profile",
  );
  assert(up.duration > walkSeconds * 1.3, `up ${up.duration}s`);
  const gentleDown = legTiming(walkLeg(start), slope(-0.05))!;
  assert(
    gentleDown.duration < walkSeconds * 0.9,
    `down ${gentleDown.duration}s`,
  );
  assert.equal(
    legTiming(walkLeg(start), () => undefined),
    undefined,
    "outside the grid",
  );
  assert.equal(legTiming(walkLeg(start)), undefined, "without a grid");
});

test("an uphill walk to the bus leaves earlier and keeps the bus", () => {
  const walk = walkLeg("2026-11-20T08:00:00Z");
  const bus = leg("BUS", walk.endTime, 1200);
  const retimed = retimeJourney(journey([walk, bus]), {
    arriveBy: false,
    heights: slope(0.1),
  });
  assert.equal(retimed.legs[1].startTime, bus.startTime);
  assert.equal(retimed.legs[0].endTime, bus.startTime);
  assert(+new Date(retimed.startTime) < +new Date(walk.startTime));
});

test("the height grid interpolates and refuses other files", () => {
  const buffer = new ArrayBuffer(40 + 4 * 2);
  const view = new DataView(buffer);
  [6, 46, 1, 2, 2].forEach((v, i) => view.setFloat64(i * 8, v, true));
  [100, 200, 300, 400].forEach((v, i) => view.setInt16(40 + i * 2, v, true));
  const heights = heightGrid(buffer);
  assert.equal(heights(46, 6), 100);
  assert.equal(heights(45, 7), 400);
  assert.equal(heights(45.5, 6.5), 250);
  assert.equal(heights(44, 6), undefined);
  assert.throws(() =>
    heightGrid(new TextEncoder().encode("<!doctype html>".repeat(4)).buffer),
  );
});
