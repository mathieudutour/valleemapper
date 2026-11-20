import type { Itinerary, Leg, Plan, Step } from "../src/types";

// MOTIS times every bike leg at one flat speed, whatever the slope, so a climb takes as long as the
// descent back. Its street steps do carry the metres climbed and descended, so bike legs are retimed
// here: uphill a rider holds a steady effort, which makes climbing time follow the height gained;
// downhill they roll faster, up to a braking limit.

export type Rider = { climbPower: number; mass: number };

/** MOTIS's own cycling speed (m/s), kept on the flat so level routes keep MOTIS's times. */
export const FLAT_SPEED = 4.2;
/** Pushing the bike up what is too steep to ride. */
const WALKING_SPEED = 1.1;
/** About 23 km/h averaged over a descent, with bends and braking. */
const DESCENT_SPEED = 6.5;
/** Descents gentler than this are ridden at the flat speed; the full descent speed is reached at the steeper one. */
const GENTLE_DESCENT = -0.02;
const STEEP_DESCENT = -0.06;
const GRAVITY = 9.81;
const ROLLING = 0.007;
/** ½·ρ·CdA for an upright rider at valley altitude. */
const DRAG = 0.5 * 1.1 * 0.55;
/** The terrain model's point noise averages out over this many metres. */
const SMOOTHING_METRES = 200;

export const RIDERS = {
  // A bike without assist: a steady leisure effort, rider and bike together.
  bike: { climbPower: 150, mass: 90 },
  // An electric-assist bike, the rider's own or a MontenVélo (the GBFS feed says those are
  // electric-assist): rider plus motor, on a heavier bike.
  ebike: { climbPower: 320, mass: 105 },
} satisfies Record<string, Rider>;

function riderFor(leg: Leg): Rider | undefined {
  if (leg.mode === "RENTAL") return RIDERS.ebike;
  if (leg.mode === "BIKE")
    return leg.electricAssist ? RIDERS.ebike : RIDERS.bike;
}

/** Speed in m/s on a constant grade (rise over run, 0.08 for 8 %). */
export function cyclingSpeed(grade: number, rider: Rider): number {
  if (grade <= 0) {
    const steepness =
      (GENTLE_DESCENT - grade) / (GENTLE_DESCENT - STEEP_DESCENT);
    return (
      FLAT_SPEED +
      (DESCENT_SPEED - FLAT_SPEED) * Math.min(1, Math.max(0, steepness))
    );
  }
  // Solve power = v·m·g·(grade + rolling) + drag·v³; the left side only grows with v, so bisection is safe.
  const resistance = rider.mass * GRAVITY * (grade + ROLLING);
  let low = 0,
    high = FLAT_SPEED * 2;
  for (let i = 0; i < 40; i++) {
    const v = (low + high) / 2;
    if (v * resistance + DRAG * v ** 3 > rider.climbPower) high = v;
    else low = v;
  }
  return Math.min(FLAT_SPEED, Math.max(WALKING_SPEED, low));
}

/** Equal stretches of about 200 m with the height each one gains (negative when it descends). */
function stretches(steps: Step[]): { distance: number; rise: number }[] {
  const profile: [distance: number, height: number][] = [[0, 0]];
  for (const step of steps) {
    const [distance, height] = profile.at(-1)!;
    profile.push([
      distance + step.distance,
      height + (step.elevationUp ?? 0) - (step.elevationDown ?? 0),
    ]);
  }
  const total = profile.at(-1)![0];
  if (total <= 0) return [];
  const heightAt = (at: number) => {
    const i = profile.findIndex(([distance]) => distance >= at);
    if (i <= 0) return profile[Math.max(0, i)][1];
    const [d0, h0] = profile[i - 1],
      [d1, h1] = profile[i];
    return d1 === d0 ? h1 : h0 + ((h1 - h0) * (at - d0)) / (d1 - d0);
  };
  const count = Math.max(1, Math.round(total / SMOOTHING_METRES));
  const length = total / count;
  return Array.from({ length: count }, (_, i) => ({
    distance: length,
    rise: heightAt((i + 1) * length) - heightAt(i * length),
  }));
}

export type BikeTiming = {
  duration: number;
  elevation: { up: number; down: number };
};

/** A bike leg's duration from its climbs and descents, or nothing for other legs. */
export function bikeTiming(leg: Leg): BikeTiming | undefined {
  const rider = riderFor(leg);
  if (!rider || !leg.steps?.length) return;
  let seconds = 0,
    flatSeconds = 0,
    up = 0,
    down = 0;
  for (const { distance, rise } of stretches(leg.steps)) {
    seconds += distance / cyclingSpeed(rise / distance, rider);
    flatSeconds += distance / FLAT_SPEED;
    if (rise > 0) up += rise;
    else down -= rise;
  }
  // MOTIS's duration may include more than riding, so only the slope's difference is applied to it.
  return {
    duration: Math.max(0, Math.round(leg.duration + seconds - flatSeconds)),
    elevation: { up: Math.round(up), down: Math.round(down) },
  };
}

const STREET_MODES = new Set(["WALK", "BIKE", "RENTAL", "CAR"]);
const later = (iso: string, seconds: number) =>
  seconds ? new Date(+new Date(iso) + seconds * 1000).toISOString() : iso;

function shift(leg: Leg, seconds: number, ends: "start" | "end" | "both") {
  if (ends !== "end") {
    leg.startTime = later(leg.startTime, seconds);
    if (leg.scheduledStartTime)
      leg.scheduledStartTime = later(leg.scheduledStartTime, seconds);
  }
  if (ends !== "start") {
    leg.endTime = later(leg.endTime, seconds);
    if (leg.scheduledEndTime)
      leg.scheduledEndTime = later(leg.scheduledEndTime, seconds);
  }
}

/**
 * Retimes the bike legs of a journey. A ride before the first bus or train still meets it, so the journey
 * starts earlier or later; a ride after the last one moves the arrival. Without transit, the requested
 * side stays fixed: the departure, or the arrival for an arrival deadline. With `electricBike`, the rider's
 * own bike legs are marked and timed as electric-assist.
 */
export function retimeJourney(
  journey: Itinerary,
  arriveBy: boolean,
  electricBike = false,
): Itinerary {
  const transit = journey.legs.flatMap((leg, i) =>
    STREET_MODES.has(leg.mode) ? [] : [i],
  );
  const legs = journey.legs.map((leg) =>
    electricBike && leg.mode === "BIKE"
      ? { ...leg, electricAssist: true }
      : { ...leg },
  );
  let changed = false,
    added = 0;
  legs.forEach((leg, i) => {
    const timing = bikeTiming(leg);
    if (!timing) return;
    changed = true;
    leg.elevation = timing.elevation;
    const before = transit.length ? i < transit[0] : arriveBy;
    const after = transit.length ? i > transit.at(-1)! : !arriveBy;
    // A ride between two transit legs would move a fixed departure, so it keeps MOTIS's time.
    if (!before && !after) return;
    const delta = timing.duration - leg.duration;
    leg.duration = timing.duration;
    added += delta;
    // MOTIS gives times to the minute and durations to the second, so times move by whole minutes.
    const minutes = Math.round(delta / 60) * 60;
    if (before) {
      shift(leg, -minutes, "start");
      for (let k = 0; k < i; k++) shift(legs[k], -minutes, "both");
    } else {
      shift(leg, minutes, "end");
      for (let k = i + 1; k < legs.length; k++) shift(legs[k], minutes, "both");
    }
  });
  if (!changed) return journey;
  return {
    ...journey,
    legs,
    startTime: legs[0].startTime,
    endTime: legs.at(-1)!.endTime,
    duration: journey.duration + added,
  };
}

export function retimeBikeLegs(
  plan: Plan,
  arriveBy: boolean,
  electricBike = false,
): Plan {
  const retime = (j: Itinerary) => retimeJourney(j, arriveBy, electricBike);
  return {
    ...plan,
    itineraries: plan.itineraries.map(retime),
    direct: plan.direct.map(retime),
  };
}
