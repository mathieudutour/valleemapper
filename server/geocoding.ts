export type AddressFetch = (url: string) => Promise<Response>;
type Result = {
  type: string;
  name: string;
  lat: number;
  lon: number;
  houseNumber?: string;
  precision?: "street" | "housenumber";
  source?: string;
  areas?: { name: string }[];
  [key: string]: unknown;
};
const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
const inValley = (lat: unknown, lon: unknown): boolean =>
  typeof lat === "number" &&
  typeof lon === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  lat >= 45.7 &&
  lat <= 46.1 &&
  lon >= 6.4 &&
  lon <= 7.1;

function localResults(value: unknown): Result[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((value) => {
    const p = record(value);
    if (
      typeof p.name !== "string" ||
      typeof p.type !== "string" ||
      !inValley(p.lat, p.lon)
    )
      return [];
    const result = { ...p } as Result;
    if (result.type === "ADDRESS") {
      result.precision = result.houseNumber ? "housenumber" : "street";
      if (
        result.houseNumber &&
        !result.name.startsWith(result.houseNumber + " ")
      )
        result.name = result.houseNumber + " " + result.name;
    }
    return [result];
  });
}
function nationalResults(value: unknown): Result[] {
  const body = record(value);
  if (!Array.isArray(body.features)) return [];
  return body.features.flatMap((value) => {
    const f = record(value),
      p = record(f.properties),
      g = record(f.geometry),
      c = g.coordinates;
    if (
      g.type !== "Point" ||
      !Array.isArray(c) ||
      !inValley(c[1], c[0]) ||
      typeof p.name !== "string" ||
      typeof p.city !== "string" ||
      typeof p.score !== "number" ||
      p.score < 0.5
    )
      return [];
    const house = typeof p.housenumber === "string" ? p.housenumber : undefined;
    return [
      {
        type: "ADDRESS",
        name:
          house && !p.name.startsWith(house + " ")
            ? house + " " + p.name
            : p.name,
        lat: c[1],
        lon: c[0],
        houseNumber: house,
        precision: house ? "housenumber" : "street",
        areas: [{ name: p.city }],
        source: "IGN/BAN",
        zip: p.postcode,
      } as Result,
    ];
  });
}
async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("Geocoder timeout")), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
// Only address-looking searches leave the local router. Queries are not logged or persisted.
export async function geocode(
  text: string,
  motis: (path: string) => Promise<Response>,
  addressFetch: AddressFetch = (url) =>
    fetch(url, { signal: AbortSignal.timeout(3500) }),
): Promise<Result[]> {
  const wantsAddress =
    /^\s*\d+\b|\b(rue|route|rte|chemin|avenue|av|impasse|allée|allee|boulevard|place)\b/i.test(
      text,
    );
  const q = new URLSearchParams({
    text,
    language: "fr",
    place: "45.925,6.7",
    min: "45.7,6.4",
    max: "46.1,7.1",
    numResults: "8",
  });
  const local = within(
    motis("/api/v1/geocode?" + q).then(async (r) =>
      r.ok ? localResults(await r.json()) : [],
    ),
    4000,
  );
  const national = wantsAddress
    ? within(
        addressFetch(
          "https://data.geopf.fr/geocodage/search?" +
            new URLSearchParams({
              q: text,
              index: "address",
              limit: "5",
              lat: "45.925",
              lon: "6.7",
            }),
        ).then(async (r) => (r.ok ? nationalResults(await r.json()) : [])),
        4000,
      )
    : Promise.resolve([]);
  const [a, b] = await Promise.allSettled([local, national]);
  const ordered = [
    ...(b.status === "fulfilled" ? b.value : []),
    ...(a.status === "fulfilled" ? a.value : []),
  ];
  const seen = new Set<string>();
  return ordered
    .filter((p) => {
      const key = `${p.name.toLocaleLowerCase()}|${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
