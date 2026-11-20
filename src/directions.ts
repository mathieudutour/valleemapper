import { decodeLine, type Step } from "./types";

export type Instruction = { text: string; distance: number };

type Segment = { name: string; distance: number; points: [number, number][] };

const toRad = (d: number) => (d * Math.PI) / 180;
function bearing(
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number],
) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}
const metres = (
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number],
) => Math.hypot((lon2 - lon1) * Math.cos(toRad(lat1)), lat2 - lat1) * 111_000;

/** The point about `reach` metres away from one end of a polyline, to read a direction past small kinks. */
function pointAlong(points: [number, number][], fromEnd: boolean, reach = 20) {
  const ordered = fromEnd ? [...points].reverse() : points;
  let walked = 0;
  for (let i = 1; i < ordered.length; i++) {
    walked += metres(ordered[i - 1], ordered[i]);
    if (walked >= reach) return ordered[i];
  }
  return ordered.at(-1)!;
}

function turn(previous: Segment, next: Segment) {
  const end = previous.points.at(-1)!,
    start = next.points[0];
  const before = bearing(pointAlong(previous.points, true), end);
  const after = bearing(start, pointAlong(next.points, false));
  const angle = ((after - before + 540) % 360) - 180;
  const side = angle > 0 ? "à droite" : "à gauche";
  const size = Math.abs(angle);
  if (size < 25) return "Continuez";
  if (size < 60) return `Prenez légèrement ${side}`;
  if (size < 120) return `Tournez ${side}`;
  // A walking route does not double back; a very sharp angle is a hairpin or a path meeting a road.
  return `Tournez fortement ${side}`;
}

export const formatDistance = (m: number) =>
  m < 1000
    ? `${Math.max(10, Math.round(m / 10) * 10)} m`
    : `${(m / 1000).toFixed(1).replace(".", ",")} km`;

/**
 * MOTIS 2.11 marks every step "CONTINUE", so turns are read from the step geometry: steps on one street are
 * merged, short unnamed links are folded into their neighbour, and the angle between streets names the turn.
 */
export function instructions(steps: Step[]): Instruction[] {
  const segments: Segment[] = [];
  for (const step of steps) {
    const points = decodeLine(step.polyline.points, step.polyline.precision);
    if (points.length < 2) continue;
    const name = step.streetName.trim();
    const last = segments.at(-1);
    if (last && (last.name === name || (!name && step.distance < 15))) {
      last.distance += step.distance;
      last.points.push(...points.slice(1));
    } else segments.push({ name, distance: step.distance, points });
  }
  return segments.map((segment, i) => {
    const where = segment.name ? `sur ${segment.name}` : "sur le chemin";
    const verb = i === 0 ? "Partez" : turn(segments[i - 1], segment);
    return { text: `${verb} ${where}`, distance: segment.distance };
  });
}
