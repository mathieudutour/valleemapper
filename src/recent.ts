import type { Place } from "./types";

export type RecentTrip = { from: Place; to: Place };

const KEY = "valleemapper:recent-trips";
const LIMIT = 6;

// "Ma position" is stored without coordinates: it is located again when the trip is reused.
const strip = (p: Place): Place =>
  p.here
    ? { name: p.name, lat: 0, lon: 0, here: true }
    : { name: p.name, lat: p.lat, lon: p.lon, detail: p.detail };
const same = (a: Place, b: Place) =>
  a.name === b.name &&
  (a.here
    ? b.here === true
    : Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5);

export function readRecent(): RecentTrip[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (t) =>
            t?.from?.name &&
            t?.to?.name &&
            Number.isFinite(t.from.lat) &&
            Number.isFinite(t.to.lat),
        )
      : [];
  } catch {
    return [];
  }
}

export function rememberTrip(
  trips: RecentTrip[],
  from: Place,
  to: Place,
): RecentTrip[] {
  const trip = { from: strip(from), to: strip(to) };
  const next = [
    trip,
    ...trips.filter((t) => !(same(t.from, trip.from) && same(t.to, trip.to))),
  ].slice(0, LIMIT);
  saveRecent(next);
  return next;
}

export function saveRecent(trips: RecentTrip[]) {
  try {
    if (trips.length) localStorage.setItem(KEY, JSON.stringify(trips));
    else localStorage.removeItem(KEY);
  } catch {
    // Private browsing or full storage: recent trips are a convenience only.
  }
}

/** Distinct places from recent trips, most recent first, for the search field suggestions. */
export function recentPlaces(trips: RecentTrip[]): Place[] {
  const places: Place[] = [];
  for (const t of trips)
    for (const p of [t.to, t.from])
      if (!p.here && !places.some((q) => same(q, p))) places.push(p);
  return places;
}
