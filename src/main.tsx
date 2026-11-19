import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  Mountain,
  Route,
  Compass,
  ArrowUpDown,
  Search,
  MapPin,
  Clock,
  BusFront,
  TramFront,
  Bike,
  CarFront,
  Hand,
  CableCar,
  Footprints,
  X,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Info,
  Settings,
  LoaderCircle,
  Check,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
const ValleyMap = lazy(() => import("./Map"));
import {
  DEFAULT_LAYERS,
  compareJourneys,
  walkingSeconds,
  usesTransit,
  modeLabel,
  poiLabel,
  type BikeChoice,
  type Place,
  type Poi,
  type ValleyData,
  type RoutingPreference,
  type Itinerary,
  type StopDeparture,
  type Leg,
} from "./types";
import "./style.css";
const Icon = ({ mode, size = 18 }: { mode: string; size?: number }) => {
  const C =
    mode === "WALK"
      ? Footprints
      : mode === "BIKE" || mode === "montenvelo" || mode === "RENTAL"
        ? Bike
        : mode === "citiz"
          ? CarFront
          : mode === "rezopouce"
            ? Hand
            : mode === "AERIAL_LIFT" || mode === "FUNICULAR" || mode === "lift"
              ? CableCar
              : mode === "train" || /RAIL|TRAM|SUBURBAN/.test(mode)
                ? TramFront
                : BusFront;
  return <C size={size} strokeWidth={1.8} />;
};
const time = (s: string) =>
  new Date(s).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
const duration = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 60
    ? `${Math.floor(m / 60)} h ${m % 60 ? String(m % 60).padStart(2, "0") : ""}`
    : `${m} min`;
};
const coord = (p: Place) => `${p.lat},${p.lon}`;
function localDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function PlaceInput({
  label,
  value,
  onChange,
  places,
}: {
  label: string;
  value: Place | undefined;
  onChange: (p: Place | undefined) => void;
  places: Place[];
}) {
  const [query, setQuery] = useState(value?.name || ""),
    [focus, setFocus] = useState(false),
    [remote, setRemote] = useState<Place[]>([]),
    [active, setActive] = useState(0);
  useEffect(() => {
    if (value) setQuery(value.name);
  }, [value]);
  useEffect(() => {
    setActive(0);
    setRemote([]);
    if (query.length < 3 || !focus) return;
    const c = new AbortController();
    const t = setTimeout(
      () =>
        fetch("/api/geocode?q=" + encodeURIComponent(query), {
          signal: c.signal,
        })
          .then((r) => r.json())
          .then((b) => {
            if (Array.isArray(b))
              setRemote(
                b.map((p) => ({
                  name:
                    p.name +
                    (p.areas?.[0]?.name ? " · " + p.areas[0].name : ""),
                  detail:
                    p.precision === "street" && /^\s*\d/.test(query)
                      ? "Rue · numéro non confirmé"
                      : p.source === "IGN/BAN"
                        ? "Adresse · IGN / BAN"
                        : undefined,
                  lat: p.lat,
                  lon: p.lon,
                })),
              );
          })
          .catch(() => {}),
      350,
    );
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [query, focus]);
  const local = places
    .filter((p) =>
      p.name
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .includes(
          query
            .toLocaleLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, ""),
        ),
    )
    .slice(0, 6);
  const results = (
    query.length > 1 ? [...local, ...remote] : places.slice(0, 6)
  ).slice(0, 8);
  const choose = (p: Place) => {
    onChange(p);
    setQuery(p.name);
    setFocus(false);
  };
  return (
    <div className="place-field">
      <span className="field-dot" />
      <div className="field-content">
        <label>
          {label}
          <input
            aria-label={label}
            role="combobox"
            aria-expanded={focus}
            aria-controls={"places-" + label}
            autoComplete="off"
            value={query}
            placeholder="Lieu, adresse ou arrêt"
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 150)}
            onChange={(e) => {
              setQuery(e.target.value);
              if (value) onChange(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setFocus(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && focus && results[active]) {
                e.preventDefault();
                choose(results[active]);
              }
            }}
          />
        </label>
      </div>
      {focus && (
        <div className="place-options" role="listbox" id={"places-" + label}>
          {results.length ? (
            results.map((p, i) => (
              <button
                type="button"
                role="option"
                aria-selected={active === i}
                className={active === i ? "active" : ""}
                key={`${p.name}-${i}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
              >
                <MapPin size={16} />
                <span>
                  {p.name}
                  {p.detail && (
                    <small className="place-detail">{p.detail}</small>
                  )}
                </span>
              </button>
            ))
          ) : (
            <p>Aucun lieu trouvé. Essayez une adresse ou un nom d’arrêt.</p>
          )}
        </div>
      )}
    </div>
  );
}
function fares(legs: Leg[]) {
  const f = new Set<string>();
  for (const l of legs) {
    if (
      l.routeId?.startsWith("region_") &&
      /^Y8[1-6]$/.test(l.routeShortName || "")
    )
      f.add("Cars Région : 1,70 € le billet simple");
    if (l.routeId?.startsWith("chamonix_"))
      f.add("Chamonix : dès 1,70 € selon le canal d’achat");
    if (l.routeId?.includes("vertical_valleen"))
      f.add("Valléen : 2,50 € le trajet, hors gratuités");
    if (l.routeId?.includes("thermal_lift"))
      f.add("Ascenseur des Thermes : gratuit");
    if (/RAIL|TRAM|SUBURBAN/.test(l.mode))
      f.add("Train : tarif à vérifier auprès de SNCF");
    if (l.routeId?.startsWith("facilibus_")) f.add("Facilibus : gratuit");
  }
  return [...f];
}
function Journey({
  item,
  selected,
  onClick,
  lessWalking,
}: {
  item: Itinerary;
  lessWalking?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const transit = item.legs.filter((l) => l.mode !== "WALK"),
    walk = item.legs
      .filter((l) => l.mode === "WALK")
      .reduce((s, l) => s + l.duration, 0),
    lift = item.legs.some((l) => l.routeId?.startsWith("vertical_"));
  const requiresReservation = item.legs.some(
    (leg) => leg.reservation === "COMPULSORY",
  );
  return (
    <article className={"journey " + (selected ? "selected" : "")}>
      <button
        className="journey-summary"
        onClick={onClick}
        aria-expanded={selected}
      >
        <div className="journey-heading">
          <span className="journey-times">
            {time(item.startTime)} <span>—</span> {time(item.endTime)}
          </span>
          <strong>{duration(item.duration)}</strong>
        </div>
        <div className="mode-chain">
          {(transit.length ? item.legs : [item.legs[0]])
            .filter(
              (l) =>
                l.mode !== "WALK" || l.duration >= 180 || transit.length === 0,
            )
            .map((l, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight size={13} className="chain-chevron" />}
                <span
                  className={"mode-pill " + (l.mode === "WALK" ? "walk" : "")}
                >
                  <Icon mode={l.mode} />
                  {l.routeShortName || modeLabel[l.mode] || l.mode}
                </span>
              </React.Fragment>
            ))}
        </div>
        <div className="journey-meta">
          <span>
            {transit.length && transit[0].mode !== "BIKE"
              ? `${item.transfers === 0 ? "Direct" : `${item.transfers} correspondance${item.transfers > 1 ? "s" : ""}`} · `
              : ""}
            {walk ? `${duration(walk)} à pied` : "Sans marche"}
          </span>
          {item.legs.some((l) => l.realTime) && (
            <span className="live-dot">Temps réel</span>
          )}
          {selected ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        {lessWalking && (
          <span className="walking-badge">
            <Footprints size={14} />
            Moins de marche
          </span>
        )}
        {requiresReservation && (
          <span className="reservation-badge">
            <Info size={14} /> Réservation obligatoire
          </span>
        )}
        {lift && (
          <div className="estimate">
            Liaison verticale · heures de passage estimées
          </div>
        )}
      </button>
      {selected && (
        <div className="journey-detail">
          <div className="timeline">
            {item.legs.map((l, i) => (
              <div
                className={"leg " + (l.mode === "WALK" ? "walking" : "")}
                key={i}
              >
                <div className="leg-time">{time(l.startTime)}</div>
                <div className="leg-track">
                  <Icon mode={l.mode} size={16} />
                </div>
                <div className="leg-content">
                  <strong>{l.from.name}</strong>
                  <div className="leg-description">
                    {l.mode === "WALK" ? (
                      `Marche · ${duration(l.duration)}`
                    ) : (
                      <>
                        <span className="route-tag">
                          {l.routeShortName || modeLabel[l.mode] || l.mode}
                        </span>{" "}
                        {l.headsign &&
                          `vers ${/^\d+$/.test(l.headsign) ? l.to.name : l.headsign}`}
                        <span className="muted block">
                          {duration(l.duration)} ·{" "}
                          {l.routeId?.startsWith("vertical_")
                            ? "Passage estimé"
                            : l.mode === "BIKE" || l.mode === "RENTAL"
                              ? "Durée estimée"
                              : l.realTime
                                ? "Horaire actualisé"
                                : "Horaire prévu"}
                        </span>
                        {l.rental?.toStationName && (
                          <div className="rental-stations">
                            {l.rental.fromStationName && (
                              <div>Retrait à {l.rental.fromStationName}</div>
                            )}
                            <div>Retour à {l.rental.toStationName}</div>
                          </div>
                        )}
                        {l.reservation === "COMPULSORY" && (
                          <div className="reservation-detail">
                            <strong>Réservation obligatoire</strong>
                            {l.routeShortName === "Y85" && (
                              <>
                                {" · "}
                                <a href="tel:+33480007000">04 8000 7000</a>
                                {" · "}
                                <a
                                  href="https://www.laregionvoustransporte.fr/cars-region/cars-region-de-haute-savoie/ligne/y85-sallanches-passy-plaine-joux/"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Modalités Y85
                                </a>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div className="leg last">
              <div className="leg-time">{time(item.endTime)}</div>
              <div className="leg-track destination" />
              <div className="leg-content">
                <strong>{item.legs.at(-1)?.to.name}</strong>
              </div>
            </div>
          </div>
          {lift && (
            <p className="notice">
              <Info size={16} />
              Modèle basé sur les heures d’ouverture et la durée publiée.
              Attente non mesurée ; ouverture à vérifier, notamment en
              maintenance.
            </p>
          )}
          {item.legs.some((leg) => leg.mode === "RENTAL") && (
            <p className="notice">
              <Info size={16} />
              <span>
                Vérifiez les vélos et les places de retour avant le départ dans{" "}
                <a
                  href="https://montenvelo.fr/home-2/mode-demploi/"
                  target="_blank"
                  rel="noreferrer"
                >
                  l’application MontenVélo
                </a>
                .
              </span>
            </p>
          )}
          {fares(item.legs).length > 0 && (
            <div className="fare-box">
              <span className="eyebrow">Repères de prix</span>
              {fares(item.legs).map((f) => (
                <p key={f}>{f}</p>
              ))}
              <small>
                Tarifs publics relevés le 18/11/2026. Conditions et
                correspondances à vérifier ; ces montants ne constituent pas un
                devis.
              </small>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
const departureDay = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "short",
  day: "numeric",
  month: "short",
});

function DepartureDetails({ departure }: { departure: StopDeparture }) {
  return (
    <div>
      <div className="stop-departure-route">
        <span className="mode-pill">{departure.line}</span>
        <strong>{departure.destination}</strong>
      </div>
      <div className="stop-departure-meta">
        <span className={departure.realTime ? "live-dot" : undefined}>
          {departure.realTime ? "Temps réel" : "Horaire prévu"}
        </span>
        {departure.requiresReservation && (
          <span className="stop-departure-reservation">
            Réservation obligatoire
          </span>
        )}
      </div>
    </div>
  );
}

function StopDepartures({ stop }: { stop: string }) {
  const [state, setState] = useState<
    StopDeparture[] | "loading" | "unavailable"
  >("loading");
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
        const { departures } = (await response.json()) as {
          departures: StopDeparture[];
        };
        if (!controller.signal.aborted) setState(departures);
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

  const today = departureDay.format(now);
  const [next, ...later] = Array.isArray(state)
    ? state.filter((departure) => Date.parse(departure.time) >= now)
    : [];
  const nextDay = next ? departureDay.format(new Date(next.time)) : "";
  const waitMinutes = next
    ? Math.ceil((Date.parse(next.time) - now) / 60_000)
    : 0;
  const showCountdown = waitMinutes < 24 * 60;

  return (
    <section className="stop-departures" aria-label="Prochains départs">
      <h3>{next ? "Prochain départ" : "Prochains départs"}</h3>
      {next ? (
        <>
          <div className="stop-departure-next">
            <div className="stop-departure-next-heading">
              <strong>
                {showCountdown
                  ? waitMinutes === 0
                    ? "Maintenant"
                    : `Dans ${duration(waitMinutes * 60).trim()}`
                  : nextDay}
              </strong>
              <time dateTime={next.time}>
                <strong>{time(next.time)}</strong>
                {showCountdown && nextDay !== today && <small>{nextDay}</small>}
              </time>
            </div>
            <DepartureDetails departure={next} />
          </div>
          {later.length > 0 && (
            <>
              <h3>Ensuite</h3>
              <ul>
                {later.map((departure) => {
                  const day = departureDay.format(new Date(departure.time));
                  return (
                    <li key={departure.id}>
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
        </>
      ) : (
        <p role="status">
          {state === "loading"
            ? "Chargement des départs…"
            : state === "unavailable"
              ? "Horaires momentanément indisponibles."
              : "Aucun départ à venir trouvé."}
        </p>
      )}
    </section>
  );
}

const transportOptions = [
  { value: "all", label: "Tout", icon: Route },
  { value: "transit", label: "Transports", icon: BusFront },
  { value: "bike", label: "Vélo", icon: Bike },
] as const;
const bikeOptions = [
  { value: "personal", label: "Vélo personnel", icon: Bike },
  { value: "montenvelo", label: "MontenVélo", icon: MapPin },
] as const;
const priorityOptions = [
  { value: "faster", label: "Arriver au plus tôt", icon: Clock },
  { value: "shorter", label: "Durée la plus courte", icon: Route },
  { value: "less-walk", label: "Moins de marche", icon: Footprints },
] as const;
type TransportMode = (typeof transportOptions)[number]["value"];

function RouteChoices<Value extends string>({
  label,
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  options: readonly { value: Value; label: string; icon: LucideIcon }[];
  value: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="route-choices" disabled={disabled}>
      <legend>{label}</legend>
      <div className="route-choices-tiles">
        {options.map(({ value: option, label, icon: OptionIcon }) => (
          <label className="route-choice" key={option}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span className="route-choice-tile">
              <OptionIcon size={19} strokeWidth={1.85} aria-hidden="true" />
              <span>{label}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function App() {
  const sidebarScroll = useRef<HTMLDivElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const activeSearch = useRef<AbortController | null>(null);
  const [data, setData] = useState<ValleyData>(),
    [error, setError] = useState(""),
    [view, setView] = useState<"planner" | "explore">("planner"),
    [from, setFrom] = useState<Place>(),
    [to, setTo] = useState<Place>(),
    [departure, setDeparture] = useState(() => {
      const instant = new Date();
      return { value: localDateTime(instant), instant };
    }),
    [mode, setMode] = useState<TransportMode>("all"),
    [bike, setBike] = useState<BikeChoice>("personal"),
    [preference, setPreference] = useState<RoutingPreference>("faster"),
    [busy, setBusy] = useState(false),
    [searched, setSearched] = useState(false),
    [journeys, setJourneys] = useState<Itinerary[]>([]),
    [chosen, setChosen] = useState(0),
    [filters, setFilters] = useState([...DEFAULT_LAYERS]),
    [poi, setPoi] = useState<Poi>(),
    [bikeState, setBikeState] = useState<any>(),
    [bikeError, setBikeError] = useState(false),
    [info, setInfo] = useState(false),
    [mobileMap, setMobileMap] = useState(false);
  useEffect(() => {
    fetch("/data/valley.json")
      .then((r) => r.json())
      .then((d: ValleyData) => {
        setData(d);
        setFrom(d.places[0]);
        setTo(d.places[1]);
      })
      .catch(() => setError("Impossible de charger les données locales."));
  }, []);
  async function bikes() {
    setBikeError(false);
    try {
      const r = await fetch("/api/bikes");
      if (!r.ok) throw Error();
      setBikeState(await r.json());
    } catch {
      setBikeError(true);
    }
  }
  useEffect(() => {
    bikes();
    const id = setInterval(bikes, 60000);
    return () => clearInterval(id);
  }, []);
  function resetSearch() {
    activeSearch.current?.abort();
    activeSearch.current = null;
    setBusy(false);
    setJourneys([]);
    setSearched(false);
    setError("");
  }

  useEffect(() => () => activeSearch.current?.abort(), []);

  async function search() {
    if (!departure.value) return;
    if (!from || !to) {
      setError(
        "Sélectionnez un départ et une destination dans les suggestions.",
      );
      return;
    }
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setBusy(true);
    setError("");
    setSearched(true);
    setPoi(undefined);
    try {
      const q = new URLSearchParams({
        from: coord(from),
        to: coord(to),
        time: departure.instant.toISOString(),
        mode,
        bike,
        preference,
      });
      const r = await fetch("/api/plan?" + q, { signal: controller.signal });
      const b = await r.json();
      if (controller.signal.aborted) return;
      if (!r.ok) throw Error(b.error);
      const all = [...(b.itineraries || []), ...(b.direct || [])].filter(
        (i: Itinerary) => !i.legs.some((l) => l.cancelled),
      );
      for (const j of all) {
        if (j.legs[0]) j.legs[0].from.name = from.name;
        if (j.legs.at(-1)) j.legs.at(-1).to.name = to.name;
      }
      const unique = new Map<string, Itinerary>();
      for (const i of all)
        unique.set(
          i.id ||
            i.startTime + i.duration + i.legs.map((l: Leg) => l.mode).join(),
          i,
        );
      setJourneys(
        [...unique.values()].sort((a, b) => compareJourneys(a, b, preference)),
      );
      setChosen(0);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Le calcul a échoué.");
      setJourneys([]);
    } finally {
      if (activeSearch.current === controller) {
        activeSearch.current = null;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    setJourneys((current) =>
      [...current].sort((a, b) => compareJourneys(a, b, preference)),
    );
    setChosen(0);
  }, [preference]);
  function selectPoi(p: Poi) {
    setPoi(p);
    setView("explore");
    setMobileMap(false);
    sidebarScroll.current?.scrollTo(0, 0);
  }
  const toggle = (m: string) =>
    setFilters((f) => (f.includes(m) ? f.filter((x) => x !== m) : [...f, m]));
  const transitWalks = journeys.filter(usesTransit).map(walkingSeconds);
  const leastWalking = Math.min(...transitWalks);
  const hasWalkingChoice = transitWalks.some(
    (seconds) => seconds > leastWalking,
  );
  const nearbyStops =
    poi && ["bus", "train"].includes(poi.mode)
      ? (data?.pois || [])
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
  const selectedBike = bikeState?.stations?.find(
      (s: any) => s.station_id === poi?.id,
    ),
    statusAge = bikeState
      ? Math.max(0, (Date.now() - +new Date(bikeState.updatedAt)) / 1000)
      : Infinity,
    stale = statusAge > 180 || bikeError;
  if (!data)
    return (
      <div className="loading">
        <Mountain size={40} />
        <p>La vallée se prépare…</p>
        {error && <p>{error}</p>}
      </div>
    );
  return (
    <main className={"app " + (mobileMap ? "show-map" : "")}>
      <aside className="sidebar">
        <header className="brand">
          <a href="/" className="wordmark" aria-label="ValléeMapper, accueil">
            <span className="brand-mark">
              <Mountain size={25} />
            </span>
            <span>ValléeMapper</span>
          </a>
          <div className="brand-actions">
            <button
              className="icon-button"
              aria-label="À propos des données"
              onClick={() => setInfo(true)}
            >
              <Info size={21} />
            </button>
            <button
              className="icon-button"
              aria-label="Paramètres d’itinéraire"
              title="Paramètres d’itinéraire"
              aria-haspopup="dialog"
              onClick={() => {
                const dialog = settingsDialog.current;
                dialog?.showModal();
                dialog?.querySelector("h2")?.focus();
              }}
            >
              <Settings size={21} />
            </button>
          </div>
        </header>
        <div className="region-label">
          <span />
          PAYS DU MONT-BLANC
        </div>
        <nav className="tabs" aria-label="Vue principale">
          <button
            className={view === "planner" ? "active" : ""}
            onClick={() => setView("planner")}
          >
            <Route size={17} />
            Itinéraires
          </button>
          <button
            className={view === "explore" ? "active" : ""}
            onClick={() => setView("explore")}
          >
            <Compass size={17} />
            Explorer
          </button>
        </nav>
        <div className="sidebar-scroll" ref={sidebarScroll}>
          {view === "planner" ? (
            <>
              <section className="planner">
                <div className="section-heading">
                  <h1>La vallée, à votre rythme.</h1>
                  <p>
                    Un trajet en train, un saut en bus.
                    <br />
                    Et les derniers mètres à pied.
                  </p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    search();
                  }}
                >
                  <div className="place-box">
                    <PlaceInput
                      label="Départ"
                      value={from}
                      onChange={(place) => {
                        resetSearch();
                        setFrom(place);
                      }}
                      places={data.places}
                    />
                    <div className="field-divider" />
                    <PlaceInput
                      label="Arrivée"
                      value={to}
                      onChange={(place) => {
                        resetSearch();
                        setTo(place);
                      }}
                      places={data.places}
                    />
                    <button
                      type="button"
                      className="swap"
                      aria-label="Inverser le départ et l’arrivée"
                      onClick={() => {
                        resetSearch();
                        setFrom(to);
                        setTo(from);
                      }}
                    >
                      <ArrowUpDown size={17} />
                    </button>
                  </div>
                  <p className="address-source">
                    Adresses :{" "}
                    <a
                      href="https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      IGN · Base Adresse Nationale
                    </a>
                  </p>
                  <label className="date-field">
                    <Clock size={17} />
                    <span>Partir le</span>
                    <input
                      aria-label="Date et heure de départ"
                      type="datetime-local"
                      required
                      value={departure.value}
                      onChange={(e) => {
                        resetSearch();
                        const value = e.currentTarget.value;
                        setDeparture({ value, instant: new Date(value) });
                      }}
                    />
                  </label>
                  <button
                    className="search-button"
                    disabled={busy}
                    type="submit"
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <Search size={18} />
                    )}{" "}
                    {busy ? "Recherche en cours…" : "Trouver mon itinéraire"}
                  </button>
                </form>
              </section>
              <section className="results" aria-live="polite">
                {error && (
                  <p className="error">
                    <Info size={18} />
                    {error}
                  </p>
                )}
                {searched && !busy && !error && (
                  <div className="results-title">
                    <h2>
                      {journeys.length
                        ? `${journeys.length} possibilité${journeys.length > 1 ? "s" : ""}`
                        : "Aucun trajet trouvé"}
                    </h2>
                    <span>
                      {preference === "less-walk"
                        ? "Marche la plus courte"
                        : preference === "shorter"
                          ? "Durée la plus courte"
                          : "Arrivée la plus tôt"}
                    </span>
                  </div>
                )}
                {busy && (
                  <div className="searching">
                    <LoaderCircle size={22} className="spin" />
                    <span>Le meilleur chemin se dessine…</span>
                  </div>
                )}
                {!busy &&
                  journeys.map((j, i) => (
                    <Journey
                      key={j.id || i}
                      item={j}
                      lessWalking={
                        hasWalkingChoice &&
                        usesTransit(j) &&
                        walkingSeconds(j) === leastWalking
                      }
                      selected={chosen === i}
                      onClick={() => setChosen(i)}
                    />
                  ))}
                {searched && !busy && !error && !journeys.length && (
                  <p className="muted">
                    {mode === "bike" && bike === "montenvelo"
                      ? "Aucun trajet MontenVélo trouvé. Vérifiez les stations et la disponibilité dans l’application MontenVélo."
                      : "Essayez un autre horaire. Les calendriers publiés ne couvrent pas toutes les saisons."}
                  </p>
                )}
                {!searched && (
                  <>
                    <div className="suggestions-heading">
                      <h2>À essayer</h2>
                      <span>Au fil de la vallée</span>
                    </div>
                    {[
                      {
                        title: "Du train au Valléen",
                        sub: "Le Fayet → Saint-Gervais",
                        a: 2,
                        b: 3,
                        icon: CableCar,
                      },
                      {
                        title: "Relier les gares",
                        sub: "Chedde → Sallanches",
                        a: 0,
                        b: 1,
                        icon: TramFront,
                      },
                    ].map((s) => (
                      <button
                        className="suggestion"
                        key={s.title}
                        onClick={() => {
                          resetSearch();
                          setFrom(data.places[s.a]);
                          setTo(data.places[s.b]);
                        }}
                      >
                        <span className="suggestion-icon">
                          <s.icon size={22} />
                        </span>
                        <span>
                          <strong>{s.title}</strong>
                          <small>{s.sub}</small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                    <div className="discovery-note">
                      <Mountain size={27} />
                      <div>
                        <strong>Plusieurs façons de bouger</strong>
                        <p>
                          Retrouvez aussi les vélos, les voitures partagées et
                          les arrêts d’autostop sur la carte.
                        </p>
                        <button onClick={() => setView("explore")}>
                          Explorer les mobilités <ChevronRight size={15} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </>
          ) : (
            <section className="explore">
              <div className="section-heading">
                <h1>Tout près, d’autres options.</h1>
                <p>
                  Choisissez une mobilité, puis un point
                  <br />
                  sur la carte pour en savoir plus.
                </p>
              </div>
              {poi && (
                <article className="poi-card">
                  <div className="poi-heading">
                    <span className={"layer-icon " + poi.mode}>
                      <Icon mode={poi.mode} size={22} />
                    </span>
                    <span className="eyebrow">{poiLabel[poi.mode]}</span>
                    <button
                      className="icon-button"
                      aria-label="Fermer le lieu"
                      onClick={() => setPoi(undefined)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <h2>{poi.name}</h2>
                  {(poi.mode === "bus" || poi.mode === "train") && (
                    <StopDepartures key={poi.id} stop={poi.id} />
                  )}
                  {poi.mode === "montenvelo" && (
                    <>
                      <div className="availability">
                        {selectedBike && !stale ? (
                          <>
                            <strong>
                              {selectedBike.is_renting
                                ? selectedBike.num_bikes_available
                                : 0}
                            </strong>
                            <span>
                              vélo
                              {selectedBike.num_bikes_available > 1
                                ? "s"
                                : ""}{" "}
                              disponible
                              {selectedBike.num_bikes_available > 1 ? "s" : ""}
                              <small>
                                {selectedBike.num_docks_available} places de
                                retour
                              </small>
                            </span>
                          </>
                        ) : (
                          <p>Disponibilité non confirmée</p>
                        )}
                        <button
                          className="icon-button"
                          onClick={bikes}
                          aria-label="Actualiser les vélos"
                        >
                          <RefreshCw size={16} />
                        </button>
                      </div>
                      <p className="fine-print">
                        {bikeState
                          ? `Source mise à jour à ${time(bikeState.updatedAt)}${stale ? " · données anciennes ou indisponibles" : ""}`
                          : "Connexion au réseau vélo…"}
                      </p>
                      <p>
                        Dès 0,50 € les 30 premières minutes sans abonnement.
                      </p>
                    </>
                  )}
                  {poi.mode === "citiz" && (
                    <p>
                      Voiture à restituer à sa station de départ. Vérifiez le
                      véhicule et le créneau dans l’application Citiz.
                    </p>
                  )}
                  {poi.mode === "rezopouce" && (
                    <p>
                      Point d’autostop gratuit. Aucun passage ni temps d’attente
                      garanti.
                    </p>
                  )}
                  {poi.network && <p>{poi.network}</p>}
                  {!!poi.routes?.length && (
                    <p>
                      <strong>Lignes :</strong> {poi.routes.join(" · ")}
                    </p>
                  )}
                  {poi.note && <p>{poi.note}</p>}
                  {poi.warning && (
                    <p className="notice">
                      <Info size={16} />
                      {poi.warning}
                    </p>
                  )}
                  <div className="poi-actions">
                    <button
                      onClick={() => {
                        resetSearch();
                        setTo({ name: poi.name, lat: poi.lat, lon: poi.lon });
                        setView("planner");
                      }}
                    >
                      Y aller <Route size={16} />
                    </button>
                    <button
                      className="secondary-action"
                      onClick={() => {
                        resetSearch();
                        setFrom({ name: poi.name, lat: poi.lat, lon: poi.lon });
                        setView("planner");
                      }}
                    >
                      Partir d’ici <MapPin size={16} />
                    </button>
                    {poi.url && (
                      <a href={poi.url} target="_blank" rel="noreferrer">
                        {poi.mode === "montenbus"
                          ? "Réserver"
                          : "Voir le service"}
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                  {!!nearbyStops.length && (
                    <div className="nearby-stops">
                      <span className="eyebrow">À proximité</span>
                      {nearbyStops.map((p) => (
                        <button key={p.id} onClick={() => setPoi(p)}>
                          <Icon mode={p.mode} size={15} />
                          <span>
                            {poiLabel[p.mode]} · {p.name}
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                  <a
                    className="source-link"
                    href={poi.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source des données <ExternalLink size={12} />
                  </a>
                </article>
              )}
              <div className="layer-list">
                {[
                  ...DEFAULT_LAYERS,
                  "citiz",
                  "rezopouce",
                  "montenbus",
                  "shuttle",
                ].map((m) => (
                  <button
                    className={
                      "layer-row " + (filters.includes(m) ? "enabled" : "")
                    }
                    onClick={() => toggle(m)}
                    key={m}
                    aria-pressed={filters.includes(m)}
                  >
                    <span className={"layer-icon " + m}>
                      <Icon mode={m} size={22} />
                    </span>
                    <span>
                      <strong>{poiLabel[m]}</strong>
                      <small>
                        {m === "bus"
                          ? "Lignes régulières · arrêts GTFS"
                          : m === "train"
                            ? "Gares et haltes ferroviaires"
                            : m === "montenvelo"
                              ? "Vélos en libre-service"
                              : m === "citiz"
                                ? "Voitures en boucle"
                                : m === "rezopouce"
                                  ? "Autostop organisé"
                                  : m === "lift"
                                    ? "Valléen et ascenseur des Thermes"
                                    : m === "montenbus"
                                      ? "Transport sur réservation"
                                      : "Arrêts de navettes · saisons variables"}
                      </small>
                    </span>
                    <span className="layer-count">
                      {data.pois.filter((p) => p.mode === m).length}
                    </span>
                    <span className="checkbox">
                      {filters.includes(m) && <Check size={13} />}
                    </span>
                  </button>
                ))}
              </div>
              {!poi && (
                <div className="explore-tip">
                  <MapPin size={22} />
                  <p>
                    Les points colorés sont interactifs.
                    <br />
                    Zoomez pour afficher leurs noms.
                  </p>
                </div>
              )}
              <p className="fine-print">
                Les points de réservation et d’autostop sont des lieux de prise
                en charge. Ils ne sont pas ajoutés aux itinéraires à horaires
                fixes.
              </p>
            </section>
          )}
        </div>
        <footer className="sidebar-footer">
          <button onClick={() => setInfo(true)}>Sources & limites</button>
        </footer>
      </aside>
      <section className="map-panel">
        <Suspense
          fallback={<div className="map-loading">Chargement de la carte…</div>}
        >
          <ValleyMap
            data={data}
            filters={filters}
            journey={journeys[chosen]}
            onPoi={selectPoi}
            selected={poi}
          />
        </Suspense>
        <div className="map-heading">
          <span className="map-location">
            <MapPin size={15} />
            Pays du Mont-Blanc
          </span>
          <span className="prototype-tag">Prototype</span>
        </div>
        <div className="map-filters">
          {DEFAULT_LAYERS.map((m) => (
            <button
              key={m}
              className={filters.includes(m) ? "on " + m : ""}
              aria-pressed={filters.includes(m)}
              onClick={() => toggle(m)}
            >
              <Icon mode={m} size={17} />
              {
                {
                  bus: "Bus",
                  montenvelo: "MontenVélo",
                  train: "Gares",
                  lift: "Verticales",
                }[m]
              }
            </button>
          ))}
        </div>
      </section>
      <button className="mobile-toggle" onClick={() => setMobileMap((m) => !m)}>
        {mobileMap ? <Route size={17} /> : <Compass size={17} />}{" "}
        {mobileMap ? "Voir les trajets" : "Voir la carte"}
      </button>
      <dialog
        ref={settingsDialog}
        className="route-settings"
        aria-labelledby="route-settings-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="route-settings-content">
          <header className="route-settings-heading">
            <h2 id="route-settings-title" tabIndex={-1}>
              Paramètres d’itinéraire
            </h2>
            <button
              className="icon-button"
              aria-label="Fermer les paramètres"
              onClick={() => settingsDialog.current?.close()}
            >
              <X size={21} />
            </button>
          </header>
          <div className="route-settings-fields">
            <RouteChoices
              label="Mode de transport"
              name="route-mode"
              options={transportOptions}
              value={mode}
              onChange={(value) => {
                resetSearch();
                setMode(value);
              }}
            />
            {mode !== "transit" && (
              <RouteChoices
                label="Type de vélo"
                name="route-bike"
                options={bikeOptions}
                value={bike}
                onChange={(value) => {
                  resetSearch();
                  setBike(value);
                }}
              />
            )}
            {mode !== "bike" && (
              <RouteChoices
                label="Priorité du trajet"
                name="route-priority"
                options={priorityOptions}
                value={preference}
                onChange={setPreference}
                disabled={busy}
              />
            )}
          </div>
        </div>
      </dialog>
      {info && (
        <div className="modal-backdrop" onClick={() => setInfo(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Fermer les informations"
              onClick={() => setInfo(false)}
            >
              <X size={22} />
            </button>
            <span className="eyebrow">Prototype · 18 novembre 2026</span>
            <h2 id="data-title">
              De vraies données.
              <br />
              Un terrain d’exploration.
            </h2>
            <p>
              Les trajets sont calculés par MOTIS sur les GTFS Cars Région,
              SNCF, Chamonix et Facilibus, avec OpenStreetMap pour la marche et
              le vélo personnel.
            </p>
            <p>
              Les mises à jour temps réel dépendent des lignes et des sources ;
              seul un segment effectivement actualisé porte le label « Temps
              réel ».
            </p>
            <ul>
              <li>
                <strong>Valléen et Thermes :</strong> modèle local à la minute,
                durée et plage d’ouverture publiées. Les départs et l’attente
                sont estimés. Fermetures connues prises en compte jusqu’au 31
                mars 2027 au plus tard.
              </li>
              <li>
                <strong>MontenVélo :</strong> le calcul utilise la disponibilité
                actuelle des vélos. Vérifiez les vélos et les places de retour
                dans l’application avant de partir.
              </li>
              <li>
                <strong>Citiz et Rézo Pouce :</strong> positions et liens vers
                les services. La disponibilité Citiz n’est pas déduite du flux
                contradictoire.
              </li>
              <li>
                <strong>Navettes saisonnières :</strong> arrêts de recherche
                uniquement ; plusieurs calendriers d’été ont expiré. Montenbus
                nécessite une réservation.
              </li>
              <li>
                <strong>Adresses :</strong> les recherches contenant un numéro
                ou un nom de voie sont transmises au service IGN / Base Adresse
                Nationale. Les arrêts et lieux sont recherchés dans MOTIS.
              </li>
              <li>
                <strong>Tarifs :</strong> repères manuels, sans calcul du prix
                total ni achat. Le relief et l’accessibilité ne sont pas encore
                validés.
              </li>
            </ul>
            <p className="fine-print">
              Sources et licences détaillées dans docs/research. Certaines API
              publiques ne disposent pas d’une licence de réutilisation
              vérifiée. Fond de carte © OpenFreeMap / OpenMapTiles /
              contributeurs OpenStreetMap.
            </p>
            <button className="search-button" onClick={() => setInfo(false)}>
              C’est compris
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
