import { planWithWalkingOptions, type MotisFetch } from "./planning.js";
import { geocode, type AddressFetch } from "./geocoding.js";
import { retimePlan } from "./slopes.js";
import type { Heights } from "./elevation.js";
import {
  BIKE_CHOICES,
  modeLabel,
  type Itinerary,
  type MotisAlert,
  type Plan,
  type StopDeparture,
  type TransitAlert,
} from "../src/types";

type MotisStopTime = {
  place: {
    departure?: string;
    scheduledDeparture?: string;
    alerts?: MotisAlert[];
  };
  tripTo: { name: string };
  tripId: string;
  headsign: string;
  mode: string;
  displayName: string;
  routeShortName: string;
  realTime: boolean;
  cancelled: boolean;
  tripCancelled: boolean;
  pickupDropoffType: "NORMAL" | "NOT_ALLOWED";
  reservation: "NONE" | "COMPULSORY";
};

const MONTENVELO_PROVIDER = "montenvelo";
type Services = {
  motis: MotisFetch;
  addressFetch?: AddressFetch;
  /** The valley height grid, used to retime walks by their slope; walks keep MOTIS's times without it. */
  heights?: () => Promise<Heights | undefined>;
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
      const heights = await services.heights?.().catch(() => undefined);
      return json({
        router: r.ok ? "ready" : "unavailable",
        engine: "MOTIS 2.11.4",
        // Walks keep MOTIS's flat times without the height grid.
        elevation: heights ? "ready" : "unavailable",
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
      const arriveBy = p.get("arriveBy") ?? "false";
      if (arriveBy !== "true" && arriveBy !== "false")
        return json({ error: "Type d’horaire invalide." }, 400);
      // MOTIS page cursors look like "EARLIER|1795190400"; the original request is repeated alongside them.
      const cursor = p.get("cursor");
      if (cursor !== null && !/^(EARLIER|LATER)\|\d{1,12}$/.test(cursor))
        return json({ error: "Page de résultats invalide." }, 400);
      const mode = p.get("mode");
      const bike = p.get("bike") ?? "montenvelo";
      if (!(BIKE_CHOICES as readonly string[]).includes(bike)) {
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
        arriveBy,
        ...(cursor ? { pageCursor: cursor } : {}),
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
      const body = retimePlan((await r.json()) as Plan, {
        arriveBy: arriveBy === "true",
        electricBike: bike === "ebike",
        heights: await services.heights?.().catch(() => undefined),
      });
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
    if (url.pathname === "/api/departures") {
      const stop = p.get("stop") ?? "";
      const match =
        /^(bus|train):(region|sncf|chamonix|facilibus):([^\x00-\x1f\x7f]{1,200})$/.exec(
          stop,
        );
      if (!match) return json({ error: "Arrêt invalide." }, 400);
      const [, mode, feed, stopId] = match;
      const params = new URLSearchParams({
        stopId: `${feed}_${stopId}`,
        mode: mode === "bus" ? "BUS,COACH" : "RAIL",
        n: "8",
        language: "fr",
      });
      if (mode === "bus") {
        // MOTIS can group opposite bays by name. A one-metre radius keeps co-located bays.
        params.set("radius", "1");
        params.set("exactRadius", "true");
      }
      const r = await services.motis(
        `/api/v6/stoptimes?${params}`,
        request.signal,
      );
      if (!r.ok) {
        await r.body?.cancel().catch(() => {});
        return json({ error: "Horaires momentanément indisponibles." }, 502);
      }
      const { stopTimes } = (await r.json()) as { stopTimes: MotisStopTime[] };
      const next = new Map<string, StopDeparture>();
      const alerts = new Map<string, TransitAlert>();
      const now = Date.now();
      for (const event of stopTimes) {
        if (event.pickupDropoffType === "NOT_ALLOWED") continue;
        for (const alert of event.place.alerts ?? []) {
          if (!alert.headerText) continue;
          alerts.set(alert.headerText + alert.descriptionText, {
            header: alert.headerText,
            description: alert.descriptionText || undefined,
            url: alert.url,
          });
        }
        const cancelled =
          event.cancelled === true || event.tripCancelled === true;
        const scheduled =
          event.place.scheduledDeparture || event.place.departure;
        const time =
          event.realTime && !cancelled ? event.place.departure : scheduled;
        if (
          !time ||
          !Number.isFinite(Date.parse(time)) ||
          Date.parse(time) < now
        )
          continue;
        const id = `${event.tripId}:${time}`;
        const headsign = /\p{L}/u.test(event.headsign ?? "")
          ? event.headsign
          : undefined;
        const destination =
          mode === "bus"
            ? headsign || event.tripTo?.name
            : event.tripTo?.name || headsign;
        next.set(id, {
          id,
          time,
          scheduledTime:
            event.realTime && scheduled && scheduled !== time
              ? scheduled
              : undefined,
          line:
            event.routeShortName ||
            event.displayName ||
            modeLabel[event.mode] ||
            (mode === "bus" ? "Bus" : "Train"),
          destination: destination || "Destination non renseignée",
          realTime: event.realTime === true,
          cancelled,
          requiresReservation: event.reservation === "COMPULSORY",
        });
      }
      // The next three departures a rider can take, with any cancellations among them kept visible.
      const departures: StopDeparture[] = [];
      for (const d of [...next.values()].sort(
        (a, b) => Date.parse(a.time) - Date.parse(b.time),
      )) {
        if (departures.filter((x) => !x.cancelled).length === 3) break;
        departures.push(d);
      }
      return json({ departures, alerts: [...alerts.values()] });
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
            : url.pathname === "/api/departures"
              ? "Horaires momentanément indisponibles."
              : "Le moteur de calcul est indisponible. Lancez npm run setup puis npm run dev.",
      },
      503,
    );
  }
}
