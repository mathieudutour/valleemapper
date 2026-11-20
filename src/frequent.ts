import type { Itinerary } from "./types";

/** The widest gap between departures that still reads as one frequent service. */
const MAX_HEADWAY = 5 * 60_000;
/** Gaps may drift by a minute and still count as the same frequency. */
const TOLERANCE = 60_000;

/** One result card: a journey, or a service repeated every few minutes on the same path. */
export type JourneyGroup = {
  /** The journey the card shows: the group's best-ranked one. */
  journey: Itinerary;
  /** Every journey in the group, the shown one included. */
  members: Itinerary[];
  /** Minutes between departures, at most; only set when the group repeats a service. */
  every?: number;
};

const start = (j: Itinerary) => Date.parse(j.startTime);
const offset = (j: Itinerary, value: string) =>
  Math.round((Date.parse(value) - start(j)) / 60_000);
const placeKey = (p: { stopId?: string; lat: number; lon: number }) =>
  p.stopId ?? `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;

/** Journeys with the same signature take the same lines between the same stops, with the same timings. */
function signature(j: Itinerary) {
  return j.legs
    .map((l) =>
      [
        l.mode,
        l.routeId ?? "",
        placeKey(l.from),
        placeKey(l.to),
        offset(j, l.startTime),
        offset(j, l.endTime),
      ].join("|"),
    )
    .join(">");
}

/**
 * Folds journeys that repeat the same path every few minutes, such as the Valléen modelled every minute,
 * into one card. Different ways to catch one bus have different paths, so they keep their own cards.
 * Cards keep the order of `list`, each at the place of its best-ranked journey.
 */
export function groupFrequent(list: Itinerary[]): JourneyGroup[] {
  const bySignature = new Map<string, Itinerary[]>();
  for (const j of list) {
    if (j.legs.some((l) => l.cancelled)) continue;
    const key = signature(j);
    bySignature.set(key, [...(bySignature.get(key) ?? []), j]);
  }
  const runOf = new Map<Itinerary, { members: Itinerary[]; every: number }>();
  for (const same of bySignature.values()) {
    const byStart = [...same].sort((a, b) => start(a) - start(b));
    let run = [byStart[0]];
    const close = () => {
      if (run.length < 2) return;
      const gaps = run.slice(1).map((j, i) => start(j) - start(run[i]));
      const group = {
        members: run,
        every: Math.round(Math.max(...gaps) / 60_000),
      };
      for (const j of run) runOf.set(j, group);
    };
    for (const j of byStart.slice(1)) {
      const gap = start(j) - start(run.at(-1)!);
      const headway = run.length > 1 ? start(run[1]) - start(run[0]) : gap;
      if (gap > 0 && gap <= MAX_HEADWAY && Math.abs(gap - headway) <= TOLERANCE)
        run.push(j);
      else {
        close();
        run = [j];
      }
    }
    close();
  }
  const shown = new Set<Itinerary>();
  const groups: JourneyGroup[] = [];
  for (const j of list) {
    if (shown.has(j)) continue;
    const run = runOf.get(j);
    for (const member of run?.members ?? [j]) shown.add(member);
    groups.push(
      run
        ? { journey: j, members: run.members, every: run.every }
        : { journey: j, members: [j] },
    );
  }
  return groups;
}

export const frequencyLabel = (every: number) =>
  every <= 1 ? "Toutes les minutes" : `Toutes les ${every} minutes`;
