import { decodeLine, type Itinerary, type Leg, type Plan } from "../src/types";
import type { Heights } from "./elevation";

// MOTIS times walking and cycling at one flat speed each, whatever the slope, so a climb takes as long as
// the way back down. Street legs are retimed here from their height profile. Bike steps carry the metres
// MOTIS climbed and descended; walks carry none, so their heights are sampled from the valley grid along the
// route. Uphill a cyclist holds a steady effort, so climbing time follows the height gained, and rolls
// faster downhill up to a braking limit; walkers follow Tobler's hiking function.

export type Rider = { climbPower: number; mass: number };

/** MOTIS's own cycling speed (m/s), kept on the flat so level routes keep MOTIS's times. */
export const FLAT_SPEED = 4.2;
/** MOTIS's own walking speed (m/s) on the flat. */
export const WALKING_FLAT_SPEED = 1.2;
/** Pushing the bike up what is too steep to ride. */
const PUSHING_SPEED = 1.1;
/** About 23 km/h averaged over a descent, with bends and braking. */
const DESCENT_SPEED = 6.5;
/** Descents gentler than this are ridden at the flat speed; the full descent speed is reached at the steeper one. */
const GENTLE_DESCENT = -0.02;
const STEEP_DESCENT = -0.06;
const GRAVITY = 9.81;
const ROLLING = 0.007;
/** ½·ρ·CdA for an upright rider at valley altitude. */
const DRAG = 0.5 * 1.1 * 0.55;
/** The terrain model's noise averages out over this many metres; walks are shorter and the grid smoother. */
const BIKE_STRETCH = 200;
const WALK_STRETCH = 100;
/** Walks are sampled about this often along their route. */
const WALK_SAMPLE = 20;

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
  return Math.min(FLAT_SPEED, Math.max(PUSHING_SPEED, low));
}

/** Tobler's hiking function scaled to MOTIS's flat speed: fastest on a 5 % descent, slower both ways from there. */
export function walkingSpeed(grade: number): number {
  const tobler = (g: number) => Math.exp(-3.5 * Math.abs(g + 0.05));
  return (
    (WALKING_FLAT_SPEED * tobler(Math.max(-1, Math.min(1, grade)))) / tobler(0)
  );
}

/** Points along a leg: distance from its start and height, in metres. */
type Profile = [distance: number, height: number][];

function stepProfile(leg: Leg): Profile | undefined {
  if (!leg.steps?.length) return;
  const profile: Profile = [[0, 0]];
  for (const step of leg.steps) {
    const [distance, height] = profile.at(-1)!;
    profile.push([
      distance + step.distance,
      height + (step.elevationUp ?? 0) - (step.elevationDown ?? 0),
    ]);
  }
  return profile;
}

const metres = ([lon1, lat1]: number[], [lon2, lat2]: number[]) =>
  Math.hypot(
    (lon2 - lon1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180),
    lat2 - lat1,
  ) * 111_320;

function sampledProfile(leg: Leg, heights: Heights): Profile | undefined {
  if (!leg.legGeometry) return;
  const line = decodeLine(leg.legGeometry.points, leg.legGeometry.precision);
  const start = line[0] && heights(line[0][1], line[0][0]);
  if (line.length < 2 || start === undefined) return;
  const profile: Profile = [[0, start]];
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const length = metres(a, b),
      parts = Math.max(1, Math.ceil(length / WALK_SAMPLE));
    for (let k = 1; k <= parts; k++) {
      const height = heights(
        a[1] + ((b[1] - a[1]) * k) / parts,
        a[0] + ((b[0] - a[0]) * k) / parts,
      );
      if (height === undefined) return;
      profile.push([profile.at(-1)![0] + length / parts, height]);
    }
  }
  return profile;
}

/** Heights relative to the start every `spacing` metres, the profile's noise smoothed over that distance. */
function resample(profile: Profile, stretch: number) {
  const total = profile.at(-1)![0];
  if (total <= 0) return;
  const heightAt = (at: number) => {
    const i = profile.findIndex(([distance]) => distance >= at);
    if (i <= 0) return profile[Math.max(0, i)][1];
    const [d0, h0] = profile[i - 1],
      [d1, h1] = profile[i];
    return d1 === d0 ? h1 : h0 + ((h1 - h0) * (at - d0)) / (d1 - d0);
  };
  const count = Math.max(1, Math.round(total / stretch));
  const spacing = total / count;
  const base = profile[0][1];
  return {
    spacing,
    heights: Array.from(
      { length: count + 1 },
      (_, i) => heightAt(i * spacing) - base,
    ),
  };
}

export type LegTiming = {
  duration: number;
  elevation: NonNullable<Leg["elevation"]>;
};

/**
 * A street leg's duration from its climbs and descents: bike legs from MOTIS's step heights, walks from the
 * height grid when one is given. Other legs, and legs without a usable profile, return nothing.
 */
export function legTiming(leg: Leg, heights?: Heights): LegTiming | undefined {
  const rider = riderFor(leg);
  const walking = leg.mode === "WALK";
  const profile = rider
    ? stepProfile(leg)
    : walking && heights
      ? sampledProfile(leg, heights)
      : undefined;
  const sampled =
    profile && resample(profile, rider ? BIKE_STRETCH : WALK_STRETCH);
  if (!sampled) return;
  const { spacing, heights: points } = sampled;
  const flat = rider ? FLAT_SPEED : WALKING_FLAT_SPEED;
  let seconds = 0,
    up = 0,
    down = 0;
  for (let i = 1; i < points.length; i++) {
    const rise = points[i] - points[i - 1];
    const grade = rise / spacing;
    seconds +=
      spacing / (rider ? cyclingSpeed(grade, rider) : walkingSpeed(grade));
    if (rise > 0) up += rise;
    else down -= rise;
  }
  const flatSeconds = (spacing * (points.length - 1)) / flat;
  const start = rider && heights?.(leg.from.lat, leg.from.lon);
  // MOTIS's duration may include more than moving, so only the slope's difference is applied to it.
  return {
    duration: Math.max(0, Math.round(leg.duration + seconds - flatSeconds)),
    elevation: {
      up: Math.round(up),
      down: Math.round(down),
      // Bike legs keep their profile for the chart; walks are short and only show the totals.
      ...(rider && {
        spacing: Math.round(spacing),
        profile: points.map(Math.round),
        ...(start !== undefined && { start: Math.round(start) }),
      }),
    },
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

export type RetimeOptions = {
  arriveBy: boolean;
  /** The rider's own bike is electric-assist: its legs are marked and timed as such. */
  electricBike?: boolean;
  /** The valley height grid, needed to retime walks. */
  heights?: Heights;
};

/**
 * Retimes the street legs of a journey. A walk or ride before the first bus or train still meets it, so the
 * journey starts earlier or later; one after the last moves the arrival. Without transit, the requested side
 * stays fixed: the departure, or the arrival for an arrival deadline.
 */
export function retimeJourney(
  journey: Itinerary,
  { arriveBy, electricBike = false, heights }: RetimeOptions,
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
    const timing = legTiming(leg, heights);
    if (!timing) return;
    changed = true;
    leg.elevation = timing.elevation;
    const before = transit.length ? i < transit[0] : arriveBy;
    const after = transit.length ? i > transit.at(-1)! : !arriveBy;
    // A walk or ride between two transit legs would move a fixed departure, so it keeps MOTIS's time.
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

export function retimePlan(plan: Plan, options: RetimeOptions): Plan {
  const retime = (j: Itinerary) => retimeJourney(j, options);
  return {
    ...plan,
    itineraries: plan.itineraries.map(retime),
    direct: plan.direct.map(retime),
  };
}
