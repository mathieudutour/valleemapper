import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bikeTiming,
  cyclingSpeed,
  FLAT_SPEED,
  retimeJourney,
  RIDERS,
} from "../server/cycling.js";
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
  const up = bikeTiming(
    leg("BIKE", "2026-11-20T08:00:00Z", flatSeconds, climb),
  )!;
  const down = bikeTiming(
    leg("BIKE", "2026-11-20T08:00:00Z", flatSeconds, descent),
  )!;
  assert.deepEqual(up.elevation, { up: 240, down: 0 });
  assert.deepEqual(down.elevation, { up: 0, down: 240 });
  assert(up.duration > 2 * flatSeconds, `up ${up.duration}s`);
  assert(down.duration < 0.75 * flatSeconds, `down ${down.duration}s`);
});

test("terrain noise on the flat barely changes the time", () => {
  // ±4 m between neighbouring 30 m steps, as the 30 m terrain model gives on a valley floor.
  const noisy = Array.from({ length: 100 }, (_, i) => step(30, i % 2 ? 4 : -4));
  const timing = bikeTiming(
    leg("BIKE", "2026-11-20T08:00:00Z", flatSeconds, noisy),
  )!;
  assert(Math.abs(timing.duration - flatSeconds) < 0.03 * flatSeconds);
  // The raw steps add up to 200 m of climbing.
  assert(timing.elevation.up < 20, `smoothed climb ${timing.elevation.up} m`);
});

test("an own electric bike is labelled and timed like MontenVélo", () => {
  const start = "2026-11-20T08:00:00Z";
  const own = retimeJourney(
    journey([leg("BIKE", start, flatSeconds, climb)]),
    false,
    true,
  ).legs[0];
  assert.equal(own.electricAssist, true);
  assert.equal(
    own.duration,
    bikeTiming(leg("RENTAL", start, flatSeconds, climb))!.duration,
  );
  assert(
    own.duration < bikeTiming(leg("BIKE", start, flatSeconds, climb))!.duration,
  );
});

test("walking legs and legs without steps keep MOTIS's time", () => {
  assert.equal(
    bikeTiming(leg("WALK", "2026-11-20T08:00:00Z", 300, climb)),
    undefined,
  );
  assert.equal(bikeTiming(leg("BIKE", "2026-11-20T08:00:00Z", 300)), undefined);
});

test("a direct ride keeps the requested departure, or the requested arrival", () => {
  const ride = journey([
    leg("BIKE", "2026-11-20T08:00:00Z", flatSeconds, climb),
  ]);
  const departing = retimeJourney(ride, false);
  assert.equal(departing.startTime, ride.startTime);
  assert(+new Date(departing.endTime) > +new Date(ride.endTime));
  assert.equal(departing.duration, departing.legs[0].duration);
  assert.deepEqual(departing.legs[0].elevation, { up: 240, down: 0 });
  const arriving = retimeJourney(ride, true);
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
  const retimed = retimeJourney(original, false);
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
  assert.equal(retimeJourney(bus, false), bus);
});
