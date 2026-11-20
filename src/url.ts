import type { BikeChoice, Place, RoutingPreference } from "./types";
import { DEFAULT_LAYERS } from "./layers";

export type TransportMode = "all" | "transit" | "bike";

/** What a shared link restores: the last search run, the layers shown and the selected place. */
export type LinkState = {
  from?: Place;
  to?: Place;
  /** Local "YYYY-MM-DDTHH:mm"; absent means "now". */
  time?: string;
  arriveBy: boolean;
  mode: TransportMode;
  bike: BikeChoice;
  preference: RoutingPreference;
  layers: string[];
  poi?: string;
};

// A shared "Ma position" is rounded to about 10 m and reads as someone else's position when opened.
const SHARED_HERE = "Position partagée";
const placeParam = (p: Place) => {
  const digits = p.here ? 4 : 6;
  return `${p.lat.toFixed(digits)},${p.lon.toFixed(digits)},${p.here ? SHARED_HERE : p.name}`;
};
function parsePlace(value: string | null): Place | undefined {
  const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(.+)$/.exec(value ?? "");
  if (!match) return undefined;
  const [lat, lon] = [Number(match[1]), Number(match[2])];
  return Number.isFinite(lat) && Number.isFinite(lon)
    ? { name: match[3], lat, lon }
    : undefined;
}

export function readLink(search = location.search): LinkState {
  const p = new URLSearchParams(search);
  const pick = <T extends string>(
    key: string,
    allowed: readonly T[],
    fallback: T,
  ) =>
    (allowed as readonly string[]).includes(p.get(key) ?? "")
      ? (p.get(key) as T)
      : fallback;
  const time = p.get("heure");
  return {
    from: parsePlace(p.get("de")),
    to: parsePlace(p.get("a")),
    time:
      time && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time) ? time : undefined,
    arriveBy: p.get("arrivee") === "1",
    mode: pick("mode", ["all", "transit", "bike"] as const, "all"),
    bike: pick("velo", ["personal", "montenvelo"] as const, "personal"),
    preference: pick(
      "priorite",
      ["faster", "shorter", "less-walk"] as const,
      "faster",
    ),
    layers: p.has("couches")
      ? p.get("couches")!.split(",").filter(Boolean)
      : [...DEFAULT_LAYERS],
    poi: p.get("lieu") ?? undefined,
  };
}

export function writeLink(state: LinkState) {
  const p = new URLSearchParams();
  if (state.from && state.to) {
    p.set("de", placeParam(state.from));
    p.set("a", placeParam(state.to));
    if (state.time) p.set("heure", state.time);
    if (state.arriveBy) p.set("arrivee", "1");
    if (state.mode !== "all") p.set("mode", state.mode);
    if (state.bike !== "personal") p.set("velo", state.bike);
    if (state.preference !== "faster") p.set("priorite", state.preference);
  }
  const layers = [...state.layers].sort().join(",");
  if (layers !== [...DEFAULT_LAYERS].sort().join(","))
    p.set("couches", state.layers.join(","));
  if (state.poi) p.set("lieu", state.poi);
  const query = p.toString().replace(/%2C/g, ",");
  const url = location.pathname + (query ? "?" + query : "");
  if (url !== location.pathname + location.search)
    history.replaceState(null, "", url);
}
