import {
  decodeLine,
  modeLabel,
  type Leg,
  type LineDetails,
  type LineStop,
  type StopDeparture,
} from "./types";

/** What opens a line's page: one run of it, and where the rider meets that run. */
export type LineRef = {
  trip: string;
  /** The tag that was clicked, shown until the line has loaded. */
  name: string;
  /** When the rider boards, which picks their stop out of the run. */
  at: string;
  /** Where they get off, for a line opened from a journey. */
  alight?: { stopId?: string; time: string };
};
export const lineOfLeg = (leg: Leg): LineRef => ({
  trip: leg.tripId!,
  name: leg.routeShortName || modeLabel[leg.mode] || leg.mode,
  at: leg.startTime,
  alight: { stopId: leg.to.stopId, time: leg.endTime },
});
export const lineOfDeparture = (departure: StopDeparture): LineRef => ({
  trip: departure.trip,
  name: departure.line,
  at: departure.time,
});

/** Network names by feed, as the map points carry them. */
const NETWORKS: Record<string, string> = {
  region: "Cars Région",
  sncf: "SNCF",
  chamonix: "Chamonix Mobilité",
  facilibus: "Facilibus",
  contamines: "Navettes des Contamines",
  megbus: "Meg-Bus",
  combloux: "Navette de Combloux",
  praz: "Navette de Praz-sur-Arly",
};
export const networkName = (routeId?: string, operator?: string) =>
  NETWORKS[routeId?.split("_")[0] ?? ""] ?? operator;

/** "SALLANCHES > PASSY" → "Sallanches – Passy": feeds shout their line names and join the ends their own way. */
export const lineTitle = (longName?: string) =>
  longName
    ?.replace(/\s+[>-]\s+/g, " – ")
    .replace(/\p{L}+/gu, (word) =>
      word.length > 2 && word === word.toLocaleUpperCase("fr")
        ? word[0] + word.slice(1).toLocaleLowerCase("fr")
        : word,
    );

/**
 * The part of a run the rider is on: from the stop they board at to the one they get off at, or to the
 * terminus when the line was opened from a departure board.
 */
export function rideSpan(
  stops: LineStop[],
  board: number | undefined,
  alight: LineRef["alight"],
) {
  if (board === undefined) return undefined;
  const last = stops.length - 1;
  if (!alight) return { from: board, to: last, alights: false };
  const gap = (i: number) =>
    Math.abs(Date.parse(stops[i].time ?? "") - Date.parse(alight.time));
  // A loop passes some stops twice: of the stops with that id, the one nearest the arrival time.
  let to = -1;
  for (let i = board + 1; i <= last; i++)
    if (
      (!alight.stopId || stops[i].stopId === alight.stopId) &&
      (to < 0 || gap(i) < gap(to))
    )
      to = i;
  return { from: board, to: to < 0 ? last : to, alights: true };
}

/** A line as the map draws it. */
export type MapLine = {
  paths: [number, number][][];
  /** The path only joins the stops: the feed has no shape for it. */
  approximate: boolean;
  stops: LineStop[];
};
export function mapLine(line: LineDetails): MapLine {
  const paths = line.geometry
    .map((g) => decodeLine(g.points, g.precision))
    .filter((path) => path.length > 1);
  const joined: [number, number][] = line.stops.map((s) => [s.lon, s.lat]);
  return {
    paths: paths.length ? paths : [joined],
    approximate:
      !paths.length ||
      paths.reduce((n, path) => n + path.length, 0) <= line.stops.length,
    stops: line.stops,
  };
}
