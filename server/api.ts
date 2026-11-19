import { planWithWalkingOptions, type MotisFetch } from "./planning.js";
import { geocode, type AddressFetch } from "./geocoding.js";
import type { Itinerary, Plan } from "../src/types";

const MONTENVELO_PROVIDER = "montenvelo";
type Services = {
  motis: MotisFetch;
  addressFetch?: AddressFetch;
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
let bikeCache: { at: number; body: unknown } | undefined;
async function getJSON(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Source HTTP ${r.status}`);
  return r.json();
}
export async function api(
  request: Request,
  services: Services,
): Promise<Response> {
  const url = new URL(request.url),
    p = url.searchParams;
  if (request.method !== "GET")
    return json({ error: "Méthode non autorisée" }, 405);
  try {
    if (url.pathname === "/api/health") {
      const r = await services.motis(
        "/api/v1/geocode?text=Chedde&numResults=1",
      );
      await r.body?.cancel();
      return json({
        router: r.ok ? "ready" : "unavailable",
        engine: "MOTIS 2.11.4",
      });
    }
    if (url.pathname === "/api/plan") {
      const valid = (s: string | null) => {
        if (!s) return false;
        const a = s.split(",").map(Number);
        return (
          a.length === 2 &&
          a.every(Number.isFinite) &&
          a[0] >= 45.7 &&
          a[0] <= 46.1 &&
          a[1] >= 6.4 &&
          a[1] <= 7.1
        );
      };
      if (!valid(p.get("from")) || !valid(p.get("to")))
        return json(
          { error: "Choisissez deux lieux dans le Pays du Mont-Blanc." },
          400,
        );
      const date = new Date(p.get("time") || Date.now());
      if (!Number.isFinite(+date))
        return json({ error: "Date de départ invalide." }, 400);
      const preference = p.get("preference") || "faster";
      if (
        preference !== "faster" &&
        preference !== "shorter" &&
        preference !== "less-walk"
      )
        return json({ error: "Préférence d’itinéraire invalide." }, 400);
      const mode = p.get("mode");
      const bike = p.get("bike") ?? "personal";
      if (bike !== "personal" && bike !== "montenvelo") {
        return json({ error: "Type de vélo invalide." }, 400);
      }
      const includesBike = mode === "bike" || mode === "all";
      const usesMontenvelo = includesBike && bike === "montenvelo";
      const cyclingMode = usesMontenvelo ? "RENTAL" : "BIKE";
      const transitAccess =
        usesMontenvelo && mode === "all" ? "WALK,RENTAL" : "WALK";
      const q = new URLSearchParams({
        fromPlace: p.get("from")!,
        toPlace: p.get("to")!,
        time: date.toISOString(),
        arriveBy: "false",
        transitModes: mode === "bike" ? "" : "TRANSIT",
        directModes:
          mode === "bike"
            ? cyclingMode
            : mode === "all"
              ? `WALK,${cyclingMode}`
              : "WALK",
        preTransitModes: transitAccess,
        postTransitModes: transitAccess,
        maxPreTransitTime: "1800",
        maxPostTransitTime: "1800",
        maxDirectTime: "5400",
        numItineraries: "5",
        maxItineraries: "8",
        detailedTransfers: "true",
        useRoutedTransfers: "true",
        language: "fr",
        timeout: "35",
      });
      if (usesMontenvelo) {
        const rentalSegments =
          mode === "all" ? ["direct", "preTransit", "postTransit"] : ["direct"];
        for (const segment of rentalSegments) {
          q.set(`${segment}RentalProviders`, MONTENVELO_PROVIDER);
          q.set(`${segment}RentalFormFactors`, "BICYCLE");
        }
      }
      const r = await planWithWalkingOptions(q, services.motis, preference);
      if (!r.ok) {
        await r.body?.cancel().catch(() => {});
        console.error("MOTIS route request failed", r.status);
        return json(
          {
            error:
              r.status === 404
                ? "Aucun itinéraire disponible pour ces lieux et cette date."
                : "Le calcul a échoué. Essayez un autre horaire.",
          },
          r.status === 404 ? 404 : 502,
        );
      }
      const body = (await r.json()) as Plan;
      if (!usesMontenvelo) return json(body);

      // Older or custom MOTIS configurations may allow a return outside a station.
      const validRentalReturn = (journey: Itinerary) =>
        journey.legs.every(
          (leg) =>
            leg.mode !== "RENTAL" ||
            (leg.rental?.providerId === MONTENVELO_PROVIDER &&
              Boolean(leg.rental.toStationName)),
        );
      return json({
        ...body,
        direct: body.direct.filter(validRentalReturn),
        itineraries: body.itineraries.filter(validRentalReturn),
      });
    }
    if (url.pathname === "/api/geocode") {
      const text = p.get("q")?.trim();
      if (!text || text.length < 2) return json([]);
      if (text.length > 120)
        return json({ error: "Recherche trop longue." }, 400);
      return json(await geocode(text, services.motis, services.addressFetch));
    }
    if (url.pathname === "/api/bikes") {
      if (bikeCache && Date.now() - bikeCache.at < 60000)
        return json(bikeCache.body);
      const discovery = await getJSON(
        "https://gbfs.partners.fifteen.eu/gbfs/2.2/mont_blanc/en/gbfs.json",
      );
      const feeds =
        discovery.data.en?.feeds ||
        (Object.values(discovery.data) as any[]).find((x) => x.feeds)?.feeds;
      const statusURL = feeds?.find(
        (x: any) => x.name === "station_status",
      )?.url;
      if (!statusURL) throw new Error("Flux station_status absent");
      const status = await getJSON(statusURL);
      const body = {
        fetchedAt: new Date().toISOString(),
        updatedAt:
          typeof status.last_updated === "number"
            ? new Date(status.last_updated * 1000).toISOString()
            : status.last_updated,
        ttl: status.ttl,
        stations: status.data.stations,
      };
      bikeCache = { at: Date.now(), body };
      return json(body);
    }
    return json({ error: "Ressource inconnue" }, 404);
  } catch {
    console.error("API request failed", url.pathname);
    return json(
      {
        error:
          url.pathname === "/api/bikes"
            ? "Disponibilité momentanément indisponible."
            : "Le moteur de calcul est indisponible. Lancez npm run setup puis npm run dev.",
      },
      503,
    );
  }
}
