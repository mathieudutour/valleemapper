import { useEffect, useState, type CSSProperties } from "react";
import {
  ChevronRight,
  ExternalLink,
  Info,
  MapPin,
  Phone,
  RefreshCw,
  Route,
  TriangleAlert,
} from "lucide-react";
import type { Place, Poi, StopDeparture, TransitAlert } from "./types";
import { layerById } from "./layers";
import { poiName, stopName, tidyName, townOf } from "./places";
import { duration, formatShortDay, tidyText, time } from "./format";

export function LayerIcon({
  mode,
  size = 20,
}: {
  mode: string;
  size?: number;
}) {
  const layer = layerById[mode];
  const Icon = layer?.icon ?? MapPin;
  return (
    <span
      className="layer-icon"
      style={{ "--layer": layer?.color } as CSSProperties}
    >
      <Icon size={size} strokeWidth={1.8} aria-hidden="true" />
    </span>
  );
}

function DepartureDetails({ departure }: { departure: StopDeparture }) {
  const delay = departure.scheduledTime
    ? Math.round(
        (Date.parse(departure.time) - Date.parse(departure.scheduledTime)) /
          60_000,
      )
    : 0;
  return (
    <div>
      <div className="stop-departure-route">
        <span className="mode-pill">{departure.line}</span>
        <strong>{stopName({ name: departure.destination })}</strong>
      </div>
      <div className="stop-departure-meta">
        {departure.cancelled ? (
          <span className="disruption-text">Supprimé</span>
        ) : delay > 0 ? (
          <span className="disruption-text">
            Retard +{delay} min · prévu à {time(departure.scheduledTime!)}
          </span>
        ) : (
          <span className={departure.realTime ? "live-dot" : undefined}>
            {departure.realTime ? "Temps réel" : "Horaire prévu"}
          </span>
        )}
        {departure.requiresReservation && !departure.cancelled && (
          <span className="stop-departure-reservation">
            Réservation obligatoire
          </span>
        )}
      </div>
    </div>
  );
}

type Board = { departures: StopDeparture[]; alerts: TransitAlert[] };

/** Where the next buses from a stop head, so two stops of the same name on either side of a road read apart. */
function useDirections(stop: string) {
  const [directions, setDirections] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/departures?" + new URLSearchParams({ stop }), {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<Board>) : Promise.reject()))
      .then((board) =>
        setDirections(
          [
            ...new Set(
              board.departures
                .filter((d) => !d.cancelled)
                .map((d) => stopName({ name: d.destination })),
            ),
          ].slice(0, 2),
        ),
      )
      .catch(() => {});
    return () => controller.abort();
  }, [stop]);
  return directions;
}

function NearbyStop({
  poi,
  onSelect,
}: {
  poi: Poi;
  onSelect: (p: Poi) => void;
}) {
  const directions = useDirections(poi.id);
  return (
    <button onClick={() => onSelect(poi)}>
      <LayerIcon mode={poi.mode} size={15} />
      <span>
        {poiName(poi)}
        <small>
          {layerById[poi.mode]?.singular}
          {directions.length > 0 && ` · vers ${directions.join(", ")}`}
        </small>
      </span>
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  );
}

function StopDepartures({ stop }: { stop: string }) {
  const [state, setState] = useState<Board | "loading" | "unavailable">(
    "loading",
  );
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const controller = new AbortController();
    let refresh: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch(
          "/api/departures?" + new URLSearchParams({ stop }),
          {
            signal: controller.signal,
          },
        );
        if (!response.ok) throw Error();
        const board = (await response.json()) as Board;
        if (!controller.signal.aborted)
          setState({
            departures: board.departures,
            alerts: board.alerts ?? [],
          });
      } catch {
        if (!controller.signal.aborted) setState("unavailable");
      } finally {
        if (!controller.signal.aborted) refresh = setTimeout(load, 60_000);
      }
    }
    load();
    const clock = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      controller.abort();
      clearTimeout(refresh);
      clearInterval(clock);
    };
  }, [stop]);

  const today = formatShortDay(now);
  const upcoming =
    typeof state === "object"
      ? state.departures.filter(
          (departure) => Date.parse(departure.time) >= now,
        )
      : [];
  // The highlighted departure is the next one that runs; cancellations stay listed with the others.
  const next = upcoming.find((d) => !d.cancelled);
  const later = upcoming.filter((d) => d !== next);
  const alerts = typeof state === "object" ? state.alerts : [];
  const nextDay = next ? formatShortDay(next.time) : "";
  const waitMinutes = next
    ? Math.ceil((Date.parse(next.time) - now) / 60_000)
    : 0;
  // A countdown helps within the hour; further out, the clock time is what riders plan with.
  const soon = waitMinutes < 60;

  return (
    <section className="stop-departures" aria-label="Prochains départs">
      {alerts.map((a) => (
        <details className="alert" key={a.header + a.description}>
          <summary>
            <TriangleAlert size={15} aria-hidden="true" />
            {tidyText(a.header)}
          </summary>
          {a.description && tidyText(a.description) !== tidyText(a.header) && (
            <p>{tidyText(a.description)}</p>
          )}
          {a.url && (
            <a href={a.url} target="_blank" rel="noreferrer">
              En savoir plus
            </a>
          )}
        </details>
      ))}
      <h3>{next ? "Prochain départ" : "Prochains départs"}</h3>
      {next ? (
        <div className="stop-departure-next">
          <div className="stop-departure-next-heading">
            {soon ? (
              <>
                <strong>
                  {waitMinutes === 0
                    ? "Maintenant"
                    : `Dans ${duration(waitMinutes * 60)}`}
                </strong>
                <time dateTime={next.time}>
                  <strong>{time(next.time)}</strong>
                </time>
              </>
            ) : (
              <>
                <strong>
                  <time dateTime={next.time}>{time(next.time)}</time>
                </strong>
                <small>
                  {nextDay !== today
                    ? nextDay
                    : `dans ${duration(waitMinutes * 60)}`}
                </small>
              </>
            )}
          </div>
          <DepartureDetails departure={next} />
        </div>
      ) : (
        <p role="status">
          {state === "loading"
            ? "Chargement des départs…"
            : state === "unavailable"
              ? "Horaires momentanément indisponibles."
              : "Aucun départ à venir trouvé."}
        </p>
      )}
      {later.length > 0 && (
        <>
          <h3>{next ? "Ensuite" : "Supprimés"}</h3>
          <ul>
            {later.map((departure) => {
              const day = formatShortDay(departure.time);
              return (
                <li
                  key={departure.id}
                  className={departure.cancelled ? "cancelled" : undefined}
                >
                  <time dateTime={departure.time}>
                    <strong>{time(departure.time)}</strong>
                    {day !== today && <small>{day}</small>}
                  </time>
                  <DepartureDetails departure={departure} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

// Rules from the 2026 Montenbus regulation and CCPMB page; see docs/research/montenbus-integration.md.
function MontenbusRules({ url }: { url?: string }) {
  return (
    <section className="service-rules" aria-labelledby="montenbus-rules">
      <h3 id="montenbus-rules">Avant de réserver</h3>
      <p className="service-links">
        {url && (
          <a href={url} target="_blank" rel="noreferrer">
            Réserver en ligne <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
        <a href="tel:+33800201374">
          0 800 2013 74 <Phone size={14} aria-hidden="true" />
        </a>
      </p>
      <ul>
        <li>Du lundi au samedi, de 6 h 45 à 19 h 30, hors jours fériés.</li>
        <li>
          Réservation de 30 jours à 15 minutes avant le départ, en ligne ou au
          numéro vert (lun.–sam. 9 h–12 h 15 et 13 h 45–17 h 30).
        </li>
        <li>
          Prise en charge dans un créneau de 20 minutes ; l’horaire proposé peut
          varier de ± 30 minutes.
        </li>
        <li>
          Non réservable si un bus, un TER ou une navette fait un trajet
          similaire dans les 15 minutes avant ou après.
        </li>
        <li>
          Adhésion obligatoire : 40 € par an ou 20 € pour 30 jours, sans coût
          par trajet.
        </li>
      </ul>
      <p className="fine-print">
        ValléeMapper ne calcule pas ces trajets.{" "}
        <a
          href="https://www.montenbus.fr/reglement-montenbus/"
          target="_blank"
          rel="noreferrer"
        >
          Règlement Montenbus
        </a>
      </p>
    </section>
  );
}

export type BikeStatus = {
  updatedAt: string;
  stations: {
    station_id: string;
    is_renting: boolean;
    num_bikes_available: number;
    num_docks_available: number;
  }[];
};

function BikeAvailability({
  poi,
  bikes,
  bikeError,
  onRefresh,
}: {
  poi: Poi;
  bikes?: BikeStatus;
  bikeError: boolean;
  onRefresh: () => void;
}) {
  const station = bikes?.stations?.find((s) => s.station_id === poi.id);
  const age = bikes
    ? Math.max(0, (Date.now() - +new Date(bikes.updatedAt)) / 1000)
    : Infinity;
  const stale = age > 180 || bikeError;
  const available = station?.is_renting ? station.num_bikes_available : 0;
  return (
    <>
      <div className="availability">
        {station && !stale ? (
          <>
            <strong>{available}</strong>
            <span>
              vélo{available > 1 ? "s" : ""} disponible
              {available > 1 ? "s" : ""}
              <small>{station.num_docks_available} places de retour</small>
            </span>
          </>
        ) : (
          <p>Disponibilité non confirmée</p>
        )}
        <button
          className="icon-button"
          onClick={onRefresh}
          aria-label="Actualiser les vélos"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <p className="fine-print">
        {bikes
          ? `Source mise à jour à ${time(bikes.updatedAt)}${stale ? " · données anciennes ou indisponibles" : ""}`
          : "Connexion au réseau vélo…"}
      </p>
      <p>Dès 0,50 € les 30 premières minutes sans abonnement.</p>
    </>
  );
}

export function PlaceCard({
  poi,
  pois,
  filters,
  bikes,
  bikeError,
  onRefreshBikes,
  onSelect,
  onGo,
  onStart,
}: {
  poi: Poi;
  pois: Poi[];
  filters: string[];
  bikes?: BikeStatus;
  bikeError: boolean;
  onRefreshBikes: () => void;
  onSelect: (p: Poi) => void;
  onGo: (p: Place) => void;
  onStart: (p: Place) => void;
}) {
  const layer = layerById[poi.mode];
  const name = poiName(poi);
  const place = { name, lat: poi.lat, lon: poi.lon };
  const town = townOf(poi.id);
  const official =
    poi.mode === "train" && tidyName(poi.name) !== name ? poi.name : undefined;
  const nearbyStops = ["bus", "train"].includes(poi.mode)
    ? pois
        .filter(
          (p) =>
            p.id !== poi.id &&
            filters.includes(p.mode) &&
            ["bus", "train"].includes(p.mode) &&
            Math.hypot(
              (p.lon - poi.lon) * Math.cos((poi.lat * Math.PI) / 180),
              p.lat - poi.lat,
            ) *
              111000 <
              60,
        )
        .slice(0, 5)
    : [];
  return (
    <article className="poi-card" aria-labelledby="poi-title">
      <div className="poi-heading">
        <LayerIcon mode={poi.mode} size={22} />
        <span className="eyebrow">
          {[layer?.singular, town].filter(Boolean).join(" · ")}
        </span>
      </div>
      <h2 id="poi-title" tabIndex={-1}>
        {name}
      </h2>
      {official && <p className="poi-official">Nom SNCF : {official}</p>}
      <div className="poi-actions">
        <button onClick={() => onGo(place)}>
          Y aller <Route size={16} aria-hidden="true" />
        </button>
        <button className="secondary-action" onClick={() => onStart(place)}>
          Partir d’ici <MapPin size={16} aria-hidden="true" />
        </button>
      </div>
      {poi.mode === "montenbus" && <MontenbusRules url={poi.url} />}
      {(poi.mode === "bus" || poi.mode === "train") && (
        <StopDepartures key={poi.id} stop={poi.id} />
      )}
      {poi.mode === "montenvelo" && (
        <BikeAvailability
          poi={poi}
          bikes={bikes}
          bikeError={bikeError}
          onRefresh={onRefreshBikes}
        />
      )}
      {poi.mode === "citiz" && (
        <p>
          Voiture à restituer à sa station de départ. Vérifiez le véhicule et le
          créneau dans l’application Citiz.
        </p>
      )}
      {poi.mode === "rezopouce" && (
        <p>
          Point d’autostop gratuit. Aucun passage ni temps d’attente garanti.
        </p>
      )}
      {poi.network && <p>{poi.network}</p>}
      {!!poi.routes?.length && (
        <p>
          <strong>Lignes :</strong> {poi.routes.join(" · ")}
        </p>
      )}
      {poi.note && poi.mode !== "montenbus" && <p>{poi.note}</p>}
      {poi.warning && (
        <p className="notice">
          <Info size={16} aria-hidden="true" />
          {poi.warning}
        </p>
      )}
      {!!nearbyStops.length && (
        <div className="nearby-stops">
          <span className="eyebrow">À proximité</span>
          {nearbyStops.map((p) => (
            <NearbyStop key={p.id} poi={p} onSelect={onSelect} />
          ))}
        </div>
      )}
      <div className="poi-links">
        {poi.url && poi.mode !== "montenbus" && (
          <a
            className="source-link"
            href={poi.url}
            target="_blank"
            rel="noreferrer"
          >
            Voir le service <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
        <a
          className="source-link"
          href={poi.source}
          target="_blank"
          rel="noreferrer"
        >
          Source des données <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}
