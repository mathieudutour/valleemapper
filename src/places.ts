import type { Place, Poi } from "./types";

// Communes for the INSEE codes embedded in Cars Région stop IDs, read from OSM admin boundaries (ref:INSEE).
const COMMUNES: Record<string, string> = {
  "73114": "Flumet",
  "74056": "Chamonix-Mont-Blanc",
  "74083": "Combloux",
  "74085": "Les Contamines-Montjoie",
  "74089": "Cordon",
  "74099": "Demi-Quartier",
  "74103": "Domancy",
  "74143": "Les Houches",
  "74159": "Magland",
  "74173": "Megève",
  "74208": "Passy",
  "74215": "Praz-sur-Arly",
  "74236": "Saint-Gervais-les-Bains",
  "74256": "Sallanches",
  "74266": "Servoz",
};

export function townOf(id?: string): string | undefined {
  if (!id) return undefined;
  const insee = /FR:(\d{5}):/.exec(id)?.[1];
  if (insee) return COMMUNES[insee];
  if (/^(bus:)?facilibus[_:]/.test(id)) return "Saint-Gervais-les-Bains";
  return undefined;
}

const SMALL_WORDS = new Set([
  "d",
  "l",
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "et",
  "à",
  "au",
  "aux",
  "sur",
  "en",
]);
/** Chamonix and Facilibus publish stop names in capitals; show them in title case. */
export function tidyName(name: string) {
  if (!/\p{Lu}/u.test(name) || name !== name.toLocaleUpperCase("fr"))
    return name;
  let first = true;
  return name.toLocaleLowerCase("fr").replace(/\p{L}+/gu, (word) => {
    const small = !first && SMALL_WORDS.has(word);
    first = false;
    return small ? word : word[0].toLocaleUpperCase("fr") + word.slice(1);
  });
}

/** SNCF names stations after the towns they serve ("Sallanches - Combloux - Megève"); riders say "Gare de Sallanches". */
export function stationName(name: string) {
  if (/^gare\b/i.test(name)) return name;
  const town = name.split(" - ")[0].trim();
  if (/^les\s/i.test(town)) return "Gare des " + town.slice(4);
  if (/^le\s/i.test(town)) return "Gare du " + town.slice(3);
  if (/^[aeiouyéèêâîôû]/i.test(town)) return "Gare d’" + town;
  return "Gare de " + town;
}

const GENERIC =
  /^(gare|mairie|chef-lieu|église|eglise|centre|poste|la poste|école|ecole|place|village|office de tourisme)$/i;
export const isStationId = (id?: string) => /OCETrain|^train:/.test(id ?? "");

/** A stop name a rider can tell apart: stations read as "Gare de …", generic names gain their commune. */
export function stopName(
  place: { name: string; stopId?: string; id?: string },
  rail = false,
) {
  const id = place.stopId || place.id;
  if (rail || isStationId(id)) return stationName(place.name);
  const name = tidyName(place.name);
  const town = GENERIC.test(name.trim()) ? townOf(id) : undefined;
  return town ? `${name} · ${town}` : name;
}

export const poiName = (poi: Poi) =>
  poi.mode === "train" ? stationName(poi.name) : stopName(poi);

export type SuggestionKind =
  "station" | "stop" | "address" | "place" | "here" | "recent";
export type Suggestion = Place & { kind: SuggestionKind; source?: string };

const normalize = (s: string) =>
  s
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const metres = (a: Place, b: Place) =>
  Math.hypot(
    (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180),
    a.lat - b.lat,
  ) * 111_000;

const kindLabel: Record<SuggestionKind, string> = {
  station: "Gare",
  stop: "Arrêt de bus",
  address: "Adresse",
  place: "Lieu",
  here: "Position actuelle",
  recent: "Récent",
};
const describe = (kind: SuggestionKind, town?: string, extra?: string) =>
  [kindLabel[kind], town, extra].filter(Boolean).join(" · ");

/** Curated places and imported stops from valley.json. */
export function localSuggestions(places: Place[], stationNames: Set<string>) {
  return places.map((p): Suggestion => {
    const station =
      isStationId(p.id) ||
      stationNames.has(p.name) ||
      (!p.id && /\bgare\b/i.test(p.name));
    const kind: SuggestionKind = station ? "station" : p.id ? "stop" : "place";
    const town = townOf(p.id);
    return {
      ...p,
      kind,
      name: kind === "station" && p.id ? stationName(p.name) : tidyName(p.name),
      detail: p.id ? describe(kind, town) : undefined,
    };
  });
}

type GeocodeResult = {
  type: string;
  name: string;
  lat: number;
  lon: number;
  modes?: string[];
  category?: string;
  precision?: "street" | "housenumber";
  source?: string;
  areas?: { name: string; default?: boolean }[];
};
const RAIL = /RAIL|SUBURBAN|LONG_DISTANCE/;
const TOWN_CATEGORIES = /^(city|town|village|hamlet|suburb)/;

export function remoteSuggestions(
  results: GeocodeResult[],
  query: string,
): Suggestion[] {
  return results.map((r) => {
    const town = (r.areas?.find((a) => a.default) ?? r.areas?.[0])?.name;
    const kind: SuggestionKind =
      r.type === "STOP"
        ? r.modes?.some((m) => RAIL.test(m))
          ? "station"
          : "stop"
        : r.type === "ADDRESS"
          ? "address"
          : "place";
    const name = kind === "station" ? stationName(r.name) : tidyName(r.name);
    const unconfirmed =
      r.precision === "street" && /^\s*\d/.test(query)
        ? "numéro non confirmé"
        : undefined;
    const detail =
      kind === "place" && TOWN_CATEGORIES.test(r.category ?? "")
        ? "Commune"
        : describe(kind, town && town !== name ? town : undefined, unconfirmed);
    return { name, lat: r.lat, lon: r.lon, kind, detail, source: r.source };
  });
}

/**
 * Drops repeats: two bays of one stop, a village and its post office sharing a name, or entries a rider
 * could not tell apart because both name and description match.
 */
export function dedupe(suggestions: Suggestion[]) {
  const kept: Suggestion[] = [];
  for (const s of suggestions) {
    const name = normalize(s.name);
    const twin = kept.find(
      (k) =>
        normalize(k.name) === name &&
        ((k.detail ?? "") === (s.detail ?? "") || metres(k, s) < 400),
    );
    if (!twin) kept.push(s);
  }
  return kept;
}

export function matches(name: string, query: string) {
  const n = normalize(name),
    q = normalize(query);
  return q ? (n.startsWith(q) ? 2 : n.includes(q) ? 1 : 0) : 0;
}
