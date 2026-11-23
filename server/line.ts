import {
  modeLabel,
  type Leg,
  type LineDetails,
  type LineStop,
  type MotisAlert,
  type Place,
} from "../src/types";

/** A trip id as MOTIS writes it: service day, first departure, then the feed's own id. */
export const TRIP_ID =
  /^\d{8}_\d{2}:\d{2}_(region|sncf|chamonix|facilibus|contamines|megbus|combloux|praz)_[^\x00-\x1f\x7f]{1,300}$/;

type TripStop = Place & {
  arrival?: string;
  departure?: string;
  scheduledArrival?: string;
  scheduledDeparture?: string;
};
type TripLeg = Leg & { directionId?: string; agencyUrl?: string };

/**
 * A line as one of its runs serves it, from MOTIS's trip itinerary: every stop of that vehicle in order
 * and the path it follows. `at` is when the rider boards, which picks their stop out of the run.
 */
export function lineDetails(
  trip: string,
  itinerary: { legs?: TripLeg[] },
  at: number,
): (LineDetails & { directionId?: string }) | undefined {
  const legs = (itinerary.legs ?? []).filter((l) => l.mode !== "WALK");
  const first = legs[0];
  if (!first) return undefined;
  // A run that changes line number on the way comes as several legs sharing their junction stop.
  const stops: LineStop[] = legs
    .flatMap((l, i) => [
      ...(i === 0 ? [l.from] : []),
      ...(l.intermediateStops ?? []),
      l.to,
    ])
    .map((p: TripStop) => {
      const time = p.departure ?? p.arrival;
      const scheduled = p.departure ? p.scheduledDeparture : p.scheduledArrival;
      return {
        name: p.name,
        stopId: p.stopId,
        lat: p.lat,
        lon: p.lon,
        time,
        scheduledTime: scheduled && scheduled !== time ? scheduled : undefined,
      };
    });
  const board = Number.isFinite(at)
    ? stops.findIndex(
        (s, i) =>
          i < stops.length - 1 &&
          [s.time, s.scheduledTime].some((t) => t && Date.parse(t) === at),
      )
    : -1;
  const alerts = new Map<string, MotisAlert>();
  for (const a of legs.flatMap((l) => l.alerts ?? []))
    if (a.headerText) alerts.set(a.headerText + a.descriptionText, a);
  return {
    trip,
    name: first.routeShortName || modeLabel[first.mode] || first.mode,
    longName: first.routeLongName || undefined,
    mode: first.mode,
    routeId: first.routeId,
    directionId: first.directionId,
    operator: first.agencyName || undefined,
    operatorUrl: first.agencyUrl || undefined,
    realTime: legs.some((l) => l.realTime),
    cancelled: legs.some((l) => l.cancelled === true),
    requiresReservation: legs.some((l) => l.reservation === "COMPULSORY"),
    alerts: [...alerts.values()],
    stops,
    geometry: legs.flatMap((l) => (l.legGeometry ? [l.legGeometry] : [])),
    board: board < 0 ? undefined : board,
  };
}
