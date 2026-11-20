import { test } from "node:test";
import assert from "node:assert/strict";
import { groupFrequent } from "../src/frequent.js";
import type { Itinerary, Leg } from "../src/types.js";

const at = (minute: number) =>
  new Date(Date.UTC(2026, 10, 21, 8, minute)).toISOString();
const stop = (stopId: string) => ({
  name: stopId,
  stopId,
  lat: 45.9,
  lon: 6.7,
});
function leg(
  mode: string,
  from: string,
  to: string,
  begin: number,
  end: number,
  routeId?: string,
): Leg {
  return {
    mode,
    routeId,
    from: stop(from),
    to: stop(to),
    startTime: at(begin),
    endTime: at(end),
    duration: (end - begin) * 60,
    realTime: false,
  };
}
const journey = (id: string, legs: Leg[]): Itinerary => ({
  id,
  legs,
  startTime: legs[0].startTime,
  endTime: legs.at(-1)!.endTime,
  duration:
    (Date.parse(legs.at(-1)!.endTime) - Date.parse(legs[0].startTime)) / 1000,
  transfers: 0,
});
const lift = (minute: number) =>
  journey(`lift-${minute}`, [
    leg(
      "AERIAL_LIFT",
      "fayet",
      "valleen",
      minute,
      minute + 5,
      "vertical_valleen",
    ),
    leg("WALK", "valleen", "centre", minute + 5, minute + 9),
  ]);
const bus = (id: string, from: string, minute: number, walk: number) =>
  journey(id, [
    leg("WALK", "home", from, minute, minute + walk),
    leg("BUS", from, "gare", minute + walk, 60, "region_Y85"),
  ]);

test("a service repeated every minute becomes one card", () => {
  const lifts = [0, 1, 2, 3].map(lift);
  const groups = groupFrequent([...lifts, bus("bus", "chef-lieu", 10, 3)]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].journey, lifts[0]);
  assert.equal(groups[0].members.length, 4);
  assert.equal(groups[0].every, 1);
  assert.equal(groups[1].every, undefined);
});

test("two ways to catch the same bus keep their own cards", () => {
  const near = bus("near", "le-crey", 20, 3);
  const far = bus("far", "carabote", 10, 24);
  assert.equal(groupFrequent([far, near]).length, 2);
});

test("journeys too far apart or irregular stay separate", () => {
  assert.equal(groupFrequent([lift(0), lift(10)]).length, 2);
  // 1, then 4 minutes: the second gap is not the same frequency, so the last journey has its own card.
  const groups = groupFrequent([lift(0), lift(1), lift(5)]);
  assert.deepEqual(
    groups.map((g) => g.members.length),
    [2, 1],
  );
});

test("a card sits where its best-ranked journey was", () => {
  // Arrival-deadline order lists the latest departure first.
  const [early, late] = [lift(0), lift(1)];
  const other = bus("bus", "chef-lieu", 10, 3);
  const groups = groupFrequent([other, late, early]);
  assert.deepEqual(
    groups.map((g) => g.journey),
    [other, late],
  );
});

test("cancelled journeys are never folded", () => {
  const cancelled = lift(1);
  cancelled.legs[0].cancelled = true;
  const groups = groupFrequent([lift(0), cancelled, lift(2)]);
  assert.deepEqual(
    groups.map((g) => g.members.length),
    [2, 1],
  );
  assert.equal(groups[1].journey, cancelled);
});
