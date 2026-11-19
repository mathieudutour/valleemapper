import type * as GeoJSON from "geojson";
export type Place = {
  name: string;
  lat: number;
  lon: number;
  id?: string;
  stopId?: string;
  detail?: string;
};
export type Leg = {
  mode: string;
  from: Place;
  to: Place;
  startTime: string;
  endTime: string;
  scheduledStartTime?: string;
  duration: number;
  realTime: boolean;
  reservation?: "NONE" | "COMPULSORY";
  rental?: {
    providerId: string;
    fromStationName?: string;
    toStationName?: string;
  };
  routeId?: string;
  routeShortName?: string;
  routeLongName?: string;
  displayName?: string;
  headsign?: string;
  agencyName?: string;
  distance?: number;
  legGeometry?: { points: string; precision: number };
  cancelled?: boolean;
};
export type Itinerary = {
  id: string;
  duration: number;
  startTime: string;
  endTime: string;
  transfers: number;
  legs: Leg[];
};
export type Plan = { itineraries: Itinerary[]; direct: Itinerary[] };
export type StopDeparture = {
  id: string;
  time: string;
  line: string;
  destination: string;
  realTime: boolean;
  requiresReservation: boolean;
};
export type Poi = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  mode: string;
  source: string;
  routes?: string[];
  network?: string;
  warning?: string;
  note?: string;
  url?: string;
};
export type ValleyData = {
  checkedOn: string;
  pois: Poi[];
  places: Place[];
  bounds: number[];
  links: GeoJSON.FeatureCollection;
  stats: { label: string; value: number }[];
};
export const modeLabel: Record<string, string> = {
  WALK: "Marche",
  BIKE: "Vélo personnel",
  BUS: "Bus",
  COACH: "Car",
  REGIONAL_RAIL: "TER",
  RAIL: "Train",
  SUBURBAN: "Train",
  TRAM: "Train",
  AERIAL_LIFT: "Valléen",
  FUNICULAR: "Ascenseur",
  RENTAL: "MontenVélo",
};
export const DEFAULT_LAYERS = ["bus", "montenvelo", "train", "lift"];
export const poiLabel: Record<string, string> = {
  bus: "Arrêts de bus",
  train: "Gares",
  montenvelo: "MontenVélo",
  citiz: "Citiz",
  rezopouce: "Rézo Pouce",
  shuttle: "Navette",
  montenbus: "Montenbus",
  lift: "Liaisons verticales",
};
export function decodeLine(points: string, precision = 6): [number, number][] {
  let i = 0,
    lat = 0,
    lon = 0;
  const result: [number, number][] = [];
  const read = () => {
    let b = 0,
      shift = 0,
      n = 0;
    do {
      b = points.charCodeAt(i++) - 63;
      n |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32 && i < points.length);
    return n & 1 ? ~(n >> 1) : n >> 1;
  };
  while (i < points.length) {
    lat += read();
    lon += read();
    result.push([lon / 10 ** precision, lat / 10 ** precision]);
  }
  return result;
}

export const walkingSeconds = (journey: Itinerary): number =>
  journey.legs
    .filter((leg) => leg.mode === "WALK")
    .reduce((sum, leg) => sum + leg.duration, 0);
export const usesTransit = (journey: Itinerary): boolean =>
  journey.legs.some(
    (leg) => !["WALK", "BIKE", "RENTAL", "CAR"].includes(leg.mode),
  );
export type BikeChoice = "personal" | "montenvelo";
export type RoutingPreference = "faster" | "shorter" | "less-walk";
export function compareJourneys(
  a: Itinerary,
  b: Itinerary,
  preference: RoutingPreference = "faster",
): number {
  const arrival = +new Date(a.endTime) - +new Date(b.endTime);
  const walking = walkingSeconds(a) - walkingSeconds(b);
  const duration = a.duration - b.duration;
  if (preference === "shorter") return duration || arrival || walking;
  return preference === "less-walk"
    ? walking || arrival || duration
    : arrival || duration || walking;
}
