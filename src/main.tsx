import React, {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowUpDown,
  CableCar,
  ChevronRight,
  Info,
  Layers,
  LoaderCircle,
  Mountain,
  Search,
  SlidersHorizontal,
  TrainFront,
  X,
  Route,
  BusFront,
  Bike,
  Clock,
  Footprints,
  type LucideIcon,
} from "lucide-react";
const ValleyMap = lazy(() => import("./Map"));
import type { Theme } from "./Map";
import {
  compareJourneys,
  walkingSeconds,
  usesTransit,
  type BikeChoice,
  type Place,
  type Poi,
  type ValleyData,
  type RoutingPreference,
  type Itinerary,
  type Leg,
} from "./types";
import { layerById } from "./layers";
import { dayKey, formatLongDay, localDateTime, relativeDay } from "./format";
import { localSuggestions, poiName } from "./places";
import { readLink, writeLink, type LinkState, type TransportMode } from "./url";
import { PlaceInput } from "./PlaceInput";
import { Journey, JourneySummary } from "./Journey";
import { LayerIcon, PlaceCard, type BikeStatus } from "./PlaceCard";
import { LayersPanel } from "./LayersPanel";
import "./style.css";

const transportOptions = [
  { value: "all", label: "Tout", icon: Route },
  { value: "transit", label: "Transports", icon: BusFront },
  { value: "bike", label: "Vélo", icon: Bike },
] as const;
const bikeOptions = [
  { value: "personal", label: "Vélo personnel", icon: Bike },
  { value: "montenvelo", label: "MontenVélo", icon: Bike },
] as const;
const priorityLabels = (
  arriveBy: boolean,
): Record<RoutingPreference, string> => ({
  faster: arriveBy ? "Partir au plus tard" : "Arriver au plus tôt",
  shorter: "Durée la plus courte",
  "less-walk": "Moins de marche",
});
const priorityIcons: Record<RoutingPreference, LucideIcon> = {
  faster: Clock,
  shorter: Route,
  "less-walk": Footprints,
};
const modeSummary: Record<TransportMode, string> = {
  all: "Tous les modes",
  transit: "Transports en commun",
  bike: "Vélo uniquement",
};

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

/** Native modal dialog shared by the settings and the data notes, so both close and scroll the same way. */
function Dialog({
  dialogRef,
  id,
  eyebrow,
  title,
  children,
  footer,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  id: string;
  eyebrow?: string;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={id}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="dialog-frame">
        <header className="dialog-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={id} tabIndex={-1}>
              {title}
            </h2>
          </div>
          <button
            className="icon-button round"
            aria-label="Fermer"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={20} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
const openDialog = (dialog: HTMLDialogElement | null) => {
  dialog?.showModal();
  dialog?.querySelector("h2")?.focus();
};

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const change = () => setMatches(list.matches);
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  }, [query]);
  return matches;
}
function useViewportHeight() {
  const [height, setHeight] = useState(() => innerHeight);
  useEffect(() => {
    const resize = () => setHeight(innerHeight);
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  return height;
}

// Mobile bottom sheet: the map stays behind it; these are the visible heights it snaps to.
type Snap = "peek" | "half" | "full";
const SNAPS: Snap[] = ["peek", "half", "full"];
const PEEK_HEIGHT = 100,
  TOP_GAP = 56;
const visibleHeight = (snap: Snap, viewport: number) =>
  snap === "peek"
    ? PEEK_HEIGHT
    : snap === "half"
      ? Math.round(viewport * 0.5)
      : viewport - TOP_GAP;

type FieldError = { field: "from" | "to"; message: string };
type Departure = { value: string; now: boolean };

function App() {
  const initial = useMemo(() => readLink(), []);
  const mobile = useMedia("(max-width: 760px)");
  const theme: Theme = useMedia("(prefers-color-scheme: dark)")
    ? "dark"
    : "light";
  const viewport = useViewportHeight();
  const sidebarScroll = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const infoDialog = useRef<HTMLDialogElement>(null);
  const fromInput = useRef<HTMLInputElement>(null);
  const toInput = useRef<HTMLInputElement>(null);
  const activeSearch = useRef<AbortController | null>(null);
  const settingsChanged = useRef(false);
  const plannerScroll = useRef(0);
  const scrollToResults = useRef(false);
  const [data, setData] = useState<ValleyData>(),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [fieldError, setFieldError] = useState<FieldError>(),
    [from, setFrom] = useState<Place | undefined>(initial.from),
    [to, setTo] = useState<Place | undefined>(initial.to),
    [departure, setDeparture] = useState<Departure>(() =>
      initial.time
        ? { value: initial.time, now: false }
        : { value: localDateTime(new Date()), now: true },
    ),
    [arriveBy, setArriveBy] = useState(initial.arriveBy),
    [mode, setMode] = useState<TransportMode>(initial.mode),
    [bike, setBike] = useState<BikeChoice>(initial.bike),
    [preference, setPreference] = useState<RoutingPreference>(
      initial.preference,
    ),
    [busy, setBusy] = useState(false),
    [lastSearch, setLastSearch] = useState<LinkState & { at: Date }>(),
    [hideHero, setHideHero] = useState(Boolean(initial.from && initial.to)),
    [journeys, setJourneys] = useState<Itinerary[]>([]),
    [chosen, setChosen] = useState(0),
    [filters, setFilters] = useState(initial.layers),
    [poi, setPoi] = useState<Poi>(),
    [layersOpen, setLayersOpen] = useState(false),
    [bikeState, setBikeState] = useState<BikeStatus>(),
    [bikeError, setBikeError] = useState(false),
    [snap, setSnap] = useState<Snap>(
      initial.from && initial.to ? "half" : "full",
    );
  const searched = Boolean(lastSearch);

  useEffect(() => {
    fetch("/data/valley.json")
      .then((r) => r.json())
      .then((d: ValleyData) => {
        setData(d);
        if (!initial.from && !initial.to) {
          setFrom(d.places[0]);
          setTo(d.places[1]);
        }
        const shared = initial.poi && d.pois.find((p) => p.id === initial.poi);
        if (shared) {
          setPoi(shared);
          setSnap("half");
        }
      })
      .catch(() => setLoadError("Impossible de charger les données locales."));
  }, []);
  // A shared link with a trip runs that search once the data is in.
  useEffect(() => {
    if (data && initial.from && initial.to) search({ keepPlace: true });
  }, [data]);

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
    setLastSearch(undefined);
    setError("");
  }
  useEffect(() => () => activeSearch.current?.abort(), []);

  async function search({ keepPlace = false } = {}) {
    const at = departure.now ? new Date() : new Date(departure.value);
    if (departure.now) setDeparture({ value: localDateTime(at), now: true });
    if (!from || !to) {
      const field = !from ? "from" : "to";
      setFieldError({
        field,
        message:
          field === "from"
            ? "Choisissez un départ dans les suggestions."
            : "Choisissez une arrivée dans les suggestions.",
      });
      (field === "from" ? fromInput : toInput).current?.focus();
      return;
    }
    if (!Number.isFinite(+at)) {
      setError("Choisissez une date et une heure valides.");
      return;
    }
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setBusy(true);
    setError("");
    setFieldError(undefined);
    if (!keepPlace) setPoi(undefined);
    setHideHero(true);
    if (mobile && !keepPlace) setSnap("full");
    // Recorded up front so the shareable URL already describes the search while it runs.
    setLastSearch({
      from,
      to,
      time: departure.now ? undefined : departure.value,
      arriveBy,
      mode,
      bike,
      preference,
      layers: filters,
      at,
    });
    try {
      const q = new URLSearchParams({
        from: `${from.lat},${from.lon}`,
        to: `${to.lat},${to.lon}`,
        time: at.toISOString(),
        arriveBy: String(arriveBy),
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
        [...unique.values()].sort((a, b) =>
          compareJourneys(a, b, preference, arriveBy),
        ),
      );
      setChosen(0);
      scrollToResults.current = true;
      if (mobile && !keepPlace) setSnap("half");
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(
        e instanceof Error && e.message ? e.message : "Le calcul a échoué.",
      );
      setJourneys([]);
    } finally {
      if (activeSearch.current === controller) {
        activeSearch.current = null;
        setBusy(false);
      }
    }
  }
  const latestSearch = useRef(search);
  latestSearch.current = search;

  useEffect(() => {
    setJourneys((current) =>
      [...current].sort((a, b) => compareJourneys(a, b, preference, arriveBy)),
    );
    setChosen(0);
    setLastSearch((s) => s && { ...s, preference });
  }, [preference]);

  // Closing the settings re-runs the current search when the transport choices changed.
  useEffect(() => {
    const dialog = settingsDialog.current;
    const close = () => {
      if (settingsChanged.current && lastSearchRef.current)
        latestSearch.current();
      settingsChanged.current = false;
    };
    dialog?.addEventListener("close", close);
    return () => dialog?.removeEventListener("close", close);
  }, [data]);
  const lastSearchRef = useRef(lastSearch);
  lastSearchRef.current = lastSearch;

  useEffect(() => {
    if (!scrollToResults.current || busy) return;
    scrollToResults.current = false;
    const container = sidebarScroll.current,
      results = resultsRef.current;
    if (!container || !results) return;
    const offset =
      results.getBoundingClientRect().top -
      container.getBoundingClientRect().top;
    if (mobile || offset > container.clientHeight * 0.45)
      container.scrollTo({
        top: container.scrollTop + offset + 10,
        behavior: "smooth",
      });
  }, [busy, journeys]);

  useEffect(() => {
    writeLink({
      ...(lastSearch ?? initial),
      ...(lastSearch ? {} : { from: undefined, to: undefined }),
      layers: filters,
      poi: poi?.id,
    });
  }, [lastSearch, filters, poi]);

  useEffect(() => {
    if (poi && !filters.includes(poi.mode)) setPoi(undefined);
  }, [filters]);

  function selectPoi(p: Poi) {
    if (!poi) plannerScroll.current = sidebarScroll.current?.scrollTop ?? 0;
    setPoi(p);
    setLayersOpen(false);
    if (mobile) setSnap("half");
    requestAnimationFrame(() => {
      sidebarScroll.current?.scrollTo(0, 0);
      document.getElementById("poi-title")?.focus({ preventScroll: true });
    });
  }
  function closePoi() {
    setPoi(undefined);
    requestAnimationFrame(() =>
      sidebarScroll.current?.scrollTo(0, plannerScroll.current),
    );
  }
  function choosePlace(set: (p: Place) => void, place: Place) {
    resetSearch();
    set(place);
    setPoi(undefined);
    setFieldError(undefined);
    if (mobile) setSnap("full");
    requestAnimationFrame(() => sidebarScroll.current?.scrollTo(0, 0));
  }
  const toggle = (m: string) =>
    setFilters((f) => (f.includes(m) ? f.filter((x) => x !== m) : [...f, m]));

  function openLayers() {
    setLayersOpen(true);
    if (mobile) setSnap("peek");
  }

  // Sheet dragging, applied directly to the element and settled into a snap on release.
  const sheetHeight = viewport - TOP_GAP;
  const hidden = sheetHeight - visibleHeight(snap, viewport);
  // The part of the map the sheet covers; a full sheet is treated as half so routes stay framed.
  const mapInset = mobile
    ? visibleHeight(snap === "full" ? "half" : snap, viewport)
    : 0;
  const suppressClick = useRef(false);
  // Moves are followed on the window: the pointer leaves the small grab area as soon as the drag starts.
  function startDrag(e: React.PointerEvent) {
    if (
      (e.target as Element).closest(
        "a, input, button:not(.sheet-grab, .sheet-peek)",
      )
    )
      return;
    const element = sheet.current;
    if (!element) return;
    const startY = e.clientY,
      start = hidden,
      initialSnap = snap;
    let moved = false,
      lastY = startY,
      lastT = e.timeStamp,
      velocity = 0;
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dy) < 6) return;
      moved = true;
      velocity = (ev.clientY - lastY) / Math.max(1, ev.timeStamp - lastT);
      lastY = ev.clientY;
      lastT = ev.timeStamp;
      element.classList.add("dragging");
      element.style.transform = `translateY(${Math.min(Math.max(start + dy, 0), sheetHeight - PEEK_HEIGHT)}px)`;
    };
    const end = (ev: PointerEvent) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
      removeEventListener("pointercancel", end);
      element.classList.remove("dragging");
      element.style.transform = "";
      if (!moved) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 400);
      // A fling settles on the next snap past the release point; a slow release on the nearest one.
      const shown = sheetHeight - (start + ev.clientY - startY);
      const heights = SNAPS.map((s) => visibleHeight(s, viewport));
      let target =
        SNAPS[
          heights.reduce(
            (best, h, i) =>
              Math.abs(h - shown) < Math.abs(heights[best] - shown) ? i : best,
            0,
          )
        ];
      if (velocity > 0.4) {
        const below = heights.findLastIndex((h) => h < shown);
        target = below === -1 ? "peek" : SNAPS[below];
      }
      if (velocity < -0.4) {
        const above = heights.findIndex((h) => h > shown);
        target = above === -1 ? "full" : SNAPS[above];
      }
      if (target === initialSnap && Math.abs(velocity) > 0.4)
        target =
          SNAPS[SNAPS.indexOf(initialSnap) + (velocity > 0 ? -1 : 1)] ??
          initialSnap;
      setSnap(target);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
  }
  const sheetHandlers = mobile ? { onPointerDown: startDrag } : {};
  // A drag that ends over the handle or the peek row must not also count as a tap.
  const tap = (next: Snap) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setSnap(next);
  };

  const suggestions = useMemo(
    () =>
      data
        ? localSuggestions(
            data.places,
            new Set(
              data.pois.filter((p) => p.mode === "train").map((p) => p.name),
            ),
          )
        : [],
    [data],
  );

  const transitWalks = journeys.filter(usesTransit).map(walkingSeconds);
  const leastWalking = Math.min(...transitWalks);
  const hasWalkingChoice = transitWalks.some(
    (seconds) => seconds > leastWalking,
  );
  const labels = priorityLabels(arriveBy);
  const chronological = preference === "faster" && !arriveBy;
  const allLater =
    lastSearch &&
    journeys.length > 0 &&
    journeys.every((j) => dayKey(j.startTime) !== dayKey(lastSearch.at));
  const settingsSummary = [
    modeSummary[mode],
    mode !== "transit" && bike === "montenvelo" ? "MontenVélo" : undefined,
    mode !== "bike" ? labels[preference] : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const selectedJourney = searched && !busy ? journeys[chosen] : undefined;
  const statusText = busy
    ? "Recherche en cours"
    : searched && !error
      ? journeys.length
        ? `${journeys.length} possibilité${journeys.length > 1 ? "s" : ""}`
        : "Aucun trajet trouvé"
      : "";

  if (!data)
    return (
      <div className="loading">
        <Mountain size={40} />
        <p>La vallée se prépare…</p>
        {loadError && <p>{loadError}</p>}
      </div>
    );

  const peek = poi ? (
    <>
      <LayerIcon mode={poi.mode} />
      <span className="peek-text">
        <strong>{poiName(poi)}</strong>
        <small>{layerById[poi.mode]?.label}</small>
      </span>
    </>
  ) : selectedJourney ? (
    <span className="peek-text">
      <JourneySummary
        item={selectedJourney}
        day={
          lastSearch && relativeDay(selectedJourney.startTime, lastSearch.at)
        }
      />
    </span>
  ) : (
    <span className="peek-text">
      <strong>
        <Search size={17} aria-hidden="true" /> Où allez-vous ?
      </strong>
    </span>
  );

  return (
    <main
      className={"app" + (mobile ? " mobile" : "")}
      style={{ "--map-inset": `${mapInset}px` } as React.CSSProperties}
    >
      <aside
        className="sidebar"
        ref={sheet}
        data-snap={mobile ? snap : undefined}
        style={
          mobile
            ? ({
                "--sheet-height": `${sheetHeight}px`,
                "--sheet-hidden": `${hidden}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {mobile && (
          <div className="sheet-top" {...sheetHandlers}>
            <button
              className="sheet-grab"
              aria-label={
                snap === "full" ? "Réduire le panneau" : "Agrandir le panneau"
              }
              onClick={tap(snap === "half" ? "full" : "half")}
            >
              <span />
            </button>
            {snap === "peek" && (
              <button
                className="sheet-peek"
                onClick={tap(poi || selectedJourney ? "half" : "full")}
              >
                {peek}
              </button>
            )}
          </div>
        )}
        <header className="brand" {...sheetHandlers}>
          <a href="/" className="wordmark" aria-label="ValléeMapper, accueil">
            <span className="brand-mark">
              <Mountain size={25} />
            </span>
            <span>ValléeMapper</span>
          </a>
          <button
            className="icon-button"
            aria-label="Sources et limites des données"
            onClick={() => openDialog(infoDialog.current)}
          >
            <Info size={21} />
          </button>
        </header>
        <div className="region-label" {...sheetHandlers}>
          <span className="region-dot" />
          Pays du Mont-Blanc
          <span className="prototype-tag">Prototype</span>
        </div>
        <div className="sidebar-scroll" ref={sidebarScroll}>
          {poi ? (
            <section className="place-view">
              <button className="back-button" onClick={closePoi}>
                <ArrowLeft size={17} aria-hidden="true" />
                {searched ? "Retour aux trajets" : "Retour à l’itinéraire"}
              </button>
              <PlaceCard
                poi={poi}
                pois={data.pois}
                filters={filters}
                bikes={bikeState}
                bikeError={bikeError}
                onRefreshBikes={bikes}
                onSelect={selectPoi}
                onGo={(place) => choosePlace(setTo, place)}
                onStart={(place) => choosePlace(setFrom, place)}
              />
            </section>
          ) : (
            <>
              <section className="planner">
                {hideHero ? (
                  <h1 className="sr-only">Itinéraires</h1>
                ) : (
                  <div className="section-heading">
                    <h1>La vallée, à votre rythme.</h1>
                    <p>
                      Un trajet en train, un saut en bus.
                      <br />
                      Et les derniers mètres à pied.
                    </p>
                  </div>
                )}
                <form
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    search();
                  }}
                >
                  <div className="place-box">
                    <PlaceInput
                      label="Départ"
                      value={from}
                      inputRef={fromInput}
                      error={
                        fieldError?.field === "from"
                          ? fieldError.message
                          : undefined
                      }
                      onChange={(place) => {
                        resetSearch();
                        setFrom(place);
                        if (fieldError?.field === "from")
                          setFieldError(undefined);
                      }}
                      suggestions={suggestions}
                    />
                    <div className="field-divider" />
                    <PlaceInput
                      label="Arrivée"
                      value={to}
                      inputRef={toInput}
                      error={
                        fieldError?.field === "to"
                          ? fieldError.message
                          : undefined
                      }
                      onChange={(place) => {
                        resetSearch();
                        setTo(place);
                        if (fieldError?.field === "to")
                          setFieldError(undefined);
                      }}
                      suggestions={suggestions}
                    />
                    <button
                      type="button"
                      className="swap"
                      aria-label="Inverser le départ et l’arrivée"
                      disabled={!from || !to}
                      onClick={() => {
                        resetSearch();
                        setFrom(to);
                        setTo(from);
                      }}
                    >
                      <ArrowUpDown size={17} />
                    </button>
                  </div>
                  {fieldError && (
                    <p className="field-error" aria-hidden="true">
                      <Info size={15} />
                      {fieldError.message}
                    </p>
                  )}
                  <div className="when">
                    <fieldset className="when-mode">
                      <legend className="sr-only">Type d’horaire</legend>
                      {[
                        { value: false, label: "Partir" },
                        { value: true, label: "Arriver" },
                      ].map((option) => (
                        <label key={option.label}>
                          <input
                            type="radio"
                            name="when"
                            checked={arriveBy === option.value}
                            onChange={() => {
                              resetSearch();
                              setArriveBy(option.value);
                            }}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </fieldset>
                    <button
                      type="button"
                      className={
                        "now-button" + (departure.now ? " active" : "")
                      }
                      aria-pressed={departure.now}
                      onClick={() => {
                        resetSearch();
                        setDeparture({
                          value: localDateTime(new Date()),
                          now: true,
                        });
                      }}
                    >
                      Maintenant
                    </button>
                    <input
                      aria-label={
                        arriveBy
                          ? "Date et heure d’arrivée"
                          : "Date et heure de départ"
                      }
                      type="datetime-local"
                      required
                      value={departure.value}
                      onChange={(e) => {
                        resetSearch();
                        setDeparture({
                          value: e.currentTarget.value,
                          now: false,
                        });
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="options-button"
                    onClick={() => openDialog(settingsDialog.current)}
                  >
                    <SlidersHorizontal size={16} aria-hidden="true" />
                    <span>{settingsSummary}</span>
                    <span className="options-link">Modifier</span>
                  </button>
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
              <section className="results" ref={resultsRef}>
                <p className="sr-only" role="status">
                  {statusText}
                </p>
                {error && (
                  <p className="error">
                    <Info size={18} />
                    {error}
                  </p>
                )}
                {searched && !busy && !error && (
                  <div className="results-title">
                    <h2>{statusText}</h2>
                    <span>
                      {mode === "bike"
                        ? "Durée la plus courte"
                        : labels[preference]}
                    </span>
                  </div>
                )}
                {allLater && lastSearch && (
                  <p className="notice later-notice">
                    <Info size={16} aria-hidden="true" />
                    Aucun départ le {formatLongDay(lastSearch.at)} après cette
                    heure. Voici les premiers trajets suivants.
                  </p>
                )}
                {busy && (
                  <div className="searching">
                    <LoaderCircle size={22} className="spin" />
                    <span>Le meilleur chemin se dessine…</span>
                  </div>
                )}
                {!busy &&
                  lastSearch &&
                  journeys.map((j, i) => {
                    const day = relativeDay(j.startTime, lastSearch.at);
                    const previous =
                      i > 0
                        ? relativeDay(journeys[i - 1].startTime, lastSearch.at)
                        : undefined;
                    const separator =
                      chronological && day && day !== previous && !allLater;
                    return (
                      <React.Fragment key={j.id || i}>
                        {separator && (
                          <h3 className="day-separator">
                            {day} · {formatLongDay(j.startTime)}
                          </h3>
                        )}
                        <Journey
                          item={j}
                          day={day}
                          lessWalking={
                            hasWalkingChoice &&
                            usesTransit(j) &&
                            walkingSeconds(j) === leastWalking
                          }
                          selected={chosen === i}
                          onClick={() => {
                            setChosen(i);
                            if (mobile && chosen === i) setSnap("half");
                          }}
                        />
                      </React.Fragment>
                    );
                  })}
                {searched && !busy && !error && !journeys.length && (
                  <p className="muted">
                    {mode === "bike" && bike === "montenvelo"
                      ? "Aucun trajet MontenVélo trouvé. Vérifiez les stations et la disponibilité dans l’application MontenVélo."
                      : "Essayez un autre horaire. Les calendriers publiés ne couvrent pas toutes les saisons."}
                  </p>
                )}
                {!searched && !busy && (
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
                        icon: TrainFront,
                      },
                    ].map((s) => (
                      <button
                        className="suggestion"
                        key={s.title}
                        onClick={() => {
                          resetSearch();
                          setFieldError(undefined);
                          setFrom(data.places[s.a]);
                          setTo(data.places[s.b]);
                        }}
                      >
                        <span className="suggestion-icon">
                          <s.icon size={22} aria-hidden="true" />
                        </span>
                        <span>
                          <strong>{s.title}</strong>
                          <small>{s.sub}</small>
                        </span>
                        <ChevronRight size={17} aria-hidden="true" />
                      </button>
                    ))}
                    <div className="discovery-note">
                      <Layers size={24} aria-hidden="true" />
                      <div>
                        <strong>Plusieurs façons de bouger</strong>
                        <p>
                          Retrouvez aussi les vélos, les voitures partagées et
                          les arrêts d’autostop sur la carte.
                        </p>
                        <button onClick={openLayers}>
                          Afficher les couches{" "}
                          <ChevronRight size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </>
          )}
          <footer className="panel-footer">
            <button
              className="text-link"
              onClick={() => openDialog(infoDialog.current)}
            >
              Sources & limites
            </button>
          </footer>
        </div>
      </aside>
      <section className="map-panel">
        <Suspense
          fallback={<div className="map-loading">Chargement de la carte…</div>}
        >
          <ValleyMap
            data={data}
            filters={filters}
            journey={selectedJourney}
            onPoi={selectPoi}
            onBackgroundClick={() => {
              if (mobile && snap !== "peek") setSnap("peek");
            }}
            selected={poi}
            theme={theme}
            bottomInset={mapInset}
          />
        </Suspense>
        <LayersPanel
          open={layersOpen}
          onOpenChange={(open) => (open ? openLayers() : setLayersOpen(false))}
          filters={filters}
          onToggle={toggle}
          pois={data.pois}
        />
      </section>
      <Dialog
        dialogRef={settingsDialog}
        id="route-settings-title"
        title="Paramètres d’itinéraire"
        footer={
          <button
            className="search-button"
            onClick={() => settingsDialog.current?.close()}
          >
            {searched ? "Mettre à jour les trajets" : "Terminé"}
          </button>
        }
      >
        <div className="route-settings-fields">
          <RouteChoices
            label="Mode de transport"
            name="route-mode"
            options={transportOptions}
            value={mode}
            onChange={(value) => {
              settingsChanged.current = true;
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
                settingsChanged.current = true;
                setBike(value);
              }}
            />
          )}
          {mode !== "bike" && (
            <RouteChoices
              label="Priorité du trajet"
              name="route-priority"
              options={(["faster", "shorter", "less-walk"] as const).map(
                (value) => ({
                  value,
                  label: labels[value],
                  icon: priorityIcons[value],
                }),
              )}
              value={preference}
              onChange={setPreference}
              disabled={busy}
            />
          )}
        </div>
      </Dialog>
      <Dialog
        dialogRef={infoDialog}
        id="data-title"
        eyebrow="Prototype · 18 novembre 2026"
        title={
          <>
            De vraies données.
            <br />
            Un terrain d’exploration.
          </>
        }
        footer={
          <button
            className="search-button"
            onClick={() => infoDialog.current?.close()}
          >
            C’est compris
          </button>
        }
      >
        <div className="prose">
          <p>
            Les trajets sont calculés par MOTIS sur les GTFS Cars Région, SNCF,
            Chamonix et Facilibus, avec OpenStreetMap pour la marche, le vélo
            personnel et le tracé des trains.
          </p>
          <p>
            Les mises à jour temps réel dépendent des lignes et des sources ;
            seul un segment effectivement actualisé porte le label « Temps réel
            ».
          </p>
          <ul>
            <li>
              <strong>Valléen et Thermes :</strong> modèle local à la minute,
              durée et plage d’ouverture publiées. Les départs et l’attente sont
              estimés. Fermetures connues prises en compte jusqu’au 31 mars 2027
              au plus tard.
            </li>
            <li>
              <strong>MontenVélo :</strong> le calcul utilise la disponibilité
              actuelle des vélos. Vérifiez les vélos et les places de retour
              dans l’application avant de partir.
            </li>
            <li>
              <strong>Citiz et Rézo Pouce :</strong> positions et liens vers les
              services. La disponibilité Citiz n’est pas déduite du flux
              contradictoire.
            </li>
            <li>
              <strong>Navettes saisonnières :</strong> arrêts de recherche
              uniquement ; plusieurs calendriers d’été ont expiré. Montenbus
              nécessite une réservation.
            </li>
            <li>
              <strong>Adresses :</strong> les recherches contenant un numéro ou
              un nom de voie sont transmises au service{" "}
              <a
                href="https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/"
                target="_blank"
                rel="noreferrer"
              >
                IGN / Base Adresse Nationale
              </a>
              . Les arrêts et lieux sont recherchés dans MOTIS.
            </li>
            <li>
              <strong>Tarifs :</strong> repères manuels, sans calcul du prix
              total ni achat. Le relief et l’accessibilité ne sont pas encore
              validés.
            </li>
          </ul>
          <p className="fine-print">
            Sources et licences détaillées dans docs/research. Certaines API
            publiques ne disposent pas d’une licence de réutilisation vérifiée.
            Fond de carte © OpenFreeMap / OpenMapTiles / contributeurs
            OpenStreetMap.
          </p>
        </div>
      </Dialog>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
