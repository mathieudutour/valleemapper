import {
  compareJourneys,
  type Itinerary,
  type Plan,
  type RoutingPreference,
} from "../src/types";

export type MotisFetch = (
  path: string,
  signal?: AbortSignal,
) => Promise<Response>;

const SHORT_WALK_SECONDS = 300;
const ALTERNATIVE_TIMEOUT_SECONDS = 2;
const ALTERNATIVE_GRACE_MS = 350;

function identity(j: Itinerary): string {
  return JSON.stringify(
    j.legs.map((l) => [
      l.mode,
      l.routeId,
      l.startTime,
      l.endTime,
      l.from.stopId || [l.from.lat, l.from.lon, l.from.name],
      l.to.stopId || [l.to.lat, l.to.lon, l.to.name],
    ]),
  );
}

function walkingQueries(params: URLSearchParams): URLSearchParams[] {
  if (!params.get("transitModes")) return [];
  const limits = ["maxPreTransitTime", "maxPostTransitTime"].filter(
    (key) => Number(params.get(key) ?? 1800) > SHORT_WALK_SECONDS,
  );

  // Search each end independently, and keep the search that limits both walks.
  const variants = limits.map((key) => [key]);
  if (limits.length === 2) variants.push(limits);
  return variants.map((limited) => {
    const nearby = new URLSearchParams(params);
    for (const key of limited) nearby.set(key, String(SHORT_WALK_SECONDS));
    nearby.set("directModes", "");
    nearby.set("timeout", String(ALTERNATIVE_TIMEOUT_SECONDS));
    return nearby;
  });
}

export async function planWithWalkingOptions(
  params: URLSearchParams,
  motis: MotisFetch,
  preference: RoutingPreference = "faster",
): Promise<Response> {
  const queries = walkingQueries(params);
  const primary = motis("/api/v6/plan?" + params);
  if (!queries.length) return primary;

  const controller = new AbortController();
  const alternatives: Itinerary[][] = queries.map(() => []);
  const finished = Promise.all(
    queries.map(async (query, index) => {
      try {
        const response = await motis(
          "/api/v6/plan?" + query,
          controller.signal,
        );
        if (!response.ok || controller.signal.aborted) {
          await response.body?.cancel();
          return;
        }
        const plan = (await response.json()) as Partial<Plan> | null;
        if (!controller.signal.aborted && Array.isArray(plan?.itineraries)) {
          alternatives[index] = plan.itineraries;
        }
      } catch {
        // Failure of an alternative leaves the primary result usable.
      }
    }),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await primary;
    if (!response.ok) return response;
    const base = (await response.json()) as Plan;
    await Promise.race([
      finished,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ALTERNATIVE_GRACE_MS);
      }),
    ]);

    const keys = new Set<string>();
    const ids = new Set<string>();
    const merged: Itinerary[] = [];
    for (const journey of base.itineraries.concat(...alternatives)) {
      const key = identity(journey);
      if (keys.has(key)) continue;
      keys.add(key);
      let id = journey.id;
      if (ids.has(id)) id = `${id}:alternative-${merged.length}`;
      ids.add(id);
      merged.push({ ...journey, id });
    }
    const arriveBy = params.get("arriveBy") === "true";
    return Response.json({
      ...base,
      itineraries: merged.sort((a, b) =>
        compareJourneys(a, b, preference, arriveBy),
      ),
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}
