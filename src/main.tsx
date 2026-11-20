import React, {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
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
  Moon,
  Mountain,
  Search,
  SlidersHorizontal,
  Sun,
  TrainFront,
  X,
  Route,
  BusFront,
  Bike,
  Clock,
  Footprints,
  History,
  ChevronUp,
  ChevronDown,
  KeyRound,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";
const ValleyMap = lazy(() => import("./Map"));
import { useTheme } from "./theme";
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
import {
  dayHeading,
  dayKey,
  formatLongDay,
  formatShortDay,
  localDateTime,
  relativeDay,
  time,
} from "./format";
import { groupFrequent } from "./frequent";
import { localSuggestions, poiName } from "./places";
import { readLink, writeLink, type LinkState, type TransportMode } from "./url";
import { PlaceInput } from "./PlaceInput";
import { Journey, JourneySummary, isCancelled } from "./Journey";
import {
  readRecent,
  recentPlaces,
  rememberTrip,
  saveRecent,
  type RecentTrip,
} from "./recent";
import { locate } from "./locate";
import { LayerIcon, PlaceCard, type BikeStatus } from "./PlaceCard";
import { LayersPanel } from "./LayersPanel";
import "./style.css";

const transportOptions = [
  { value: "all", label: "Tout", icon: Route },
  { value: "transit", label: "Transports", icon: BusFront },
  { value: "bike", label: "Vélo", icon: Bike },
] as const;
const bikeOptions = [
  { value: "ebike", label: "Mon vélo électrique", icon: Zap },
  { value: "personal", label: "Mon vélo", icon: Bike },
  { value: "montenvelo", label: "MontenVélo", icon: KeyRound },
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
  shorter: Timer,
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
type Cursors = { previous?: string; next?: string };

const journeyKey = (i: Itinerary) =>
  i.id || i.startTime + i.duration + i.legs.map((l) => l.mode).join();
/** Plan results with the rider's own place names, cancelled journeys kept but listed last. */
function ordered(
  list: Itinerary[],
  preference: RoutingPreference,
  arriveBy: boolean,
) {
  return [...list]
    .sort((a, b) => compareJourneys(a, b, preference, arriveBy))
    .sort((a, b) => Number(isCancelled(a)) - Number(isCancelled(b)));
}
function named(list: Itinerary[], from: Place, to: Place) {
  for (const j of list) {
    if (j.legs[0]) j.legs[0].from.name = from.name;
    if (j.legs.at(-1)) j.legs.at(-1)!.to.name = to.name;
  }
  return list;
}
/** The journey selected by default: the best one that still runs. */
function firstKey(list: Itinerary[]) {
  const first = list.find((j) => !isCancelled(j)) ?? list[0];
  return first && journeyKey(first);
}
type Departure = { value: string; now: boolean };

function App() {
  const initial = useMemo(() => readLink(), []);
  const mobile = useMedia("(max-width: 760px)");
  const [theme, toggleTheme] = useTheme();
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
  const plannerHeading = useRef<HTMLHeadingElement>(null);
  // The card a click opened or closed, and where it was on screen, so it stays put as cards resize.
  const anchor = useRef<{ key: string; top: number }>(undefined);
  // The exact request behind the current results; MOTIS pages must repeat it with only the cursor added.
  const lastQuery = useRef<URLSearchParams>(undefined);
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
    [chosenId, setChosenId] = useState<string>(),
    // The chosen journey is drawn on the map; its card only shows the timeline once opened.
    [expanded, setExpanded] = useState(false),
    [cursors, setCursors] = useState<Cursors>({}),
    [paging, setPaging] = useState<"earlier" | "later">(),
    [pageNote, setPageNote] = useState(""),
    [recent, setRecent] = useState<RecentTrip[]>(readRecent),
    [filters, setFilters] = useState(initial.layers),
    [poi, setPoi] = useState<Poi>(),
    [layersOpen, setLayersOpen] = useState(false),
    [bikeState, setBikeState] = useState<BikeStatus>(),
    [bikeError, setBikeError] = useState(false),
    [snap, setSnap] = useState<Snap>(
      initial.from && initial.to ? "half" : "full",
    );
  const searched = Boolean(lastSearch);
  const fromState = from,
    toState = to;

  useEffect(() => {
    fetch("/data/valley.json")
      .then((r) => r.json())
      .then((d: ValleyData) => {
        setData(d);
        if (!initial.from && !initial.to) {
          const last = readRecent()[0];
          const reusable = last && !last.from.here && !last.to.here;
          setFrom(reusable ? last.from : d.places[0]);
          setTo(reusable ? last.to : d.places[1]);
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

  async function search({
    keepPlace = false,
    from = fromState,
    to = toState,
  }: { keepPlace?: boolean; from?: Place; to?: Place } = {}) {
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
      lastQuery.current = q;
      setRecent((trips) => rememberTrip(trips, from, to));
      const r = await fetch("/api/plan?" + q, { signal: controller.signal });
      const b = await r.json();
      if (controller.signal.aborted) return;
      if (!r.ok) throw Error(b.error);
      const unique = new Map<string, Itinerary>();
      for (const i of named(
        [...(b.itineraries || []), ...(b.direct || [])],
        from,
        to,
      ))
        unique.set(journeyKey(i), i);
      const list = ordered([...unique.values()], preference, arriveBy);
      setJourneys(list);
      setChosenId(firstKey(list));
      setExpanded(false);
      setCursors({ previous: b.previousPageCursor, next: b.nextPageCursor });
      setPageNote("");
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
    const list = ordered(journeys, preference, arriveBy);
    setJourneys(list);
    setChosenId(firstKey(list));
    setExpanded(false);
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
      // The search line sticks above the results, so scrolling to it shows the list under it.
      results =
        container?.querySelector(".results-query") ?? resultsRef.current;
    if (!container || !results) return;
    const offset =
      results.getBoundingClientRect().top -
      container.getBoundingClientRect().top;
    if (mobile || offset > container.clientHeight * 0.45)
      container.scrollTo({
        top: container.scrollTop + offset,
        behavior: "smooth",
      });
  }, [busy, journeys]);

  // A clicked card stays where it was while the cards around it open or close. An opened card then
  // scrolls up as far as needed to show its timeline, without slipping under the search line.
  useLayoutEffect(() => {
    const target = anchor.current,
      container = sidebarScroll.current;
    anchor.current = undefined;
    if (!target || !container) return;
    const card = container.querySelector<HTMLElement>(
      `[data-journey="${CSS.escape(target.key)}"]`,
    );
    if (!card) return;
    container.scrollTop += card.getBoundingClientRect().top - target.top;
    if (!expanded) return;
    const box = container.getBoundingClientRect(),
      rect = card.getBoundingClientRect(),
      top = Math.max(
        box.top,
        container.querySelector(".results-query")?.getBoundingClientRect()
          .bottom ?? 0,
      );
    // On a phone the sheet continues below the screen.
    const overflow = rect.bottom - Math.min(box.bottom, innerHeight) + 12,
      room = rect.top - top - 8;
    if (overflow > 0 && room > 0)
      container.scrollBy({ top: Math.min(overflow, room), behavior: "smooth" });
  }, [chosenId, expanded]);

  function editSearch() {
    if (mobile) setSnap("full");
    sidebarScroll.current?.scrollTo({ top: 0, behavior: "smooth" });
    plannerHeading.current?.focus({ preventScroll: true });
  }

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

  // Earlier or later departures for the same search, merged into the list.
  async function loadPage(direction: "earlier" | "later") {
    const cursor = direction === "earlier" ? cursors.previous : cursors.next;
    const query = lastQuery.current;
    if (!cursor || !query || !lastSearch?.from || !lastSearch.to) return;
    setPaging(direction);
    setPageNote("");
    try {
      const q = new URLSearchParams(query);
      q.set("cursor", cursor);
      const r = await fetch("/api/plan?" + q);
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      // Walking and cycling alone do not depend on the departure time, so only transit pages are merged.
      const page = named(b.itineraries || [], lastSearch.from, lastSearch.to);
      const known = new Set(journeys.map(journeyKey));
      const fresh = page.filter((j: Itinerary) => !known.has(journeyKey(j)));
      if (!fresh.length)
        setPageNote(
          direction === "earlier"
            ? "Pas d’autre trajet plus tôt dans cette période."
            : "Pas d’autre trajet plus tard dans cette période.",
        );
      setJourneys(ordered([...journeys, ...fresh], preference, arriveBy));
      setCursors((c) =>
        direction === "earlier"
          ? { ...c, previous: b.previousPageCursor }
          : { ...c, next: b.nextPageCursor },
      );
    } catch {
      setPageNote("Impossible de charger d’autres trajets.");
    } finally {
      setPaging(undefined);
    }
  }

  async function reuseTrip(trip: RecentTrip) {
    resetSearch();
    setFieldError(undefined);
    try {
      const [start, end] = await Promise.all(
        [trip.from, trip.to].map((p) => (p.here ? locate() : p)),
      );
      setFrom(start);
      setTo(end);
      search({ from: start, to: end });
    } catch (e) {
      setFieldError({
        field: trip.from.here ? "from" : "to",
        message: e instanceof Error ? e.message : "Position introuvable.",
      });
    }
  }

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
  const groups = useMemo(() => groupFrequent(journeys), [journeys]);
  const chosenGroup = groups.find((g) =>
    g.members.some((j) => journeyKey(j) === chosenId),
  );

  const transitWalks = groups
    .map((g) => g.journey)
    .filter(usesTransit)
    .map(walkingSeconds);
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
    mode !== "transit"
      ? bikeOptions.find((option) => option.value === bike)?.label
      : undefined,
    mode !== "bike" ? labels[preference] : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const selectedJourney = searched && !busy ? chosenGroup?.journey : undefined;
  const recentFieldPlaces = recentPlaces(recent);
  const statusText = busy
    ? "Recherche en cours"
    : searched && !error
      ? groups.length
        ? `${groups.length} possibilité${groups.length > 1 ? "s" : ""}`
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
        <small>{layerById[poi.mode]?.singular}</small>
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
          <div className="brand-actions">
            <button
              className="icon-button"
              aria-label={
                theme === "dark"
                  ? "Passer au thème clair"
                  : "Passer au thème sombre"
              }
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={21} /> : <Moon size={21} />}
            </button>
            <button
              className="icon-button"
              aria-label="Sources et limites des données"
              onClick={() => openDialog(infoDialog.current)}
            >
              <Info size={21} />
            </button>
          </div>
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
                  <h1 className="sr-only" ref={plannerHeading} tabIndex={-1}>
                    Itinéraires
                  </h1>
                ) : (
                  <div className="section-heading">
                    <h1 ref={plannerHeading} tabIndex={-1}>
                      La vallée, à votre rythme.
                    </h1>
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
                      onError={(message) =>
                        setFieldError({ field: "from", message })
                      }
                      recent={recentFieldPlaces}
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
                      onError={(message) =>
                        setFieldError({ field: "to", message })
                      }
                      recent={recentFieldPlaces}
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
              {lastSearch?.from && lastSearch.to && (
                <div className="results-query">
                  <div>
                    <strong>
                      {lastSearch.from.name} <span aria-hidden="true">→</span>
                      <span className="sr-only">vers</span> {lastSearch.to.name}
                    </strong>
                    <span>
                      {formatShortDay(lastSearch.at)},{" "}
                      {lastSearch.arriveBy ? "arrivée à " : ""}
                      {time(lastSearch.at)}
                    </span>
                  </div>
                  <button type="button" onClick={editSearch}>
                    Modifier
                  </button>
                </div>
              )}
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
                {searched &&
                  !busy &&
                  !error &&
                  cursors.previous &&
                  journeys.length > 0 && (
                    <button
                      className="page-button"
                      disabled={Boolean(paging)}
                      onClick={() => loadPage("earlier")}
                    >
                      {paging === "earlier" ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <ChevronUp size={16} aria-hidden="true" />
                      )}
                      Plus tôt
                    </button>
                  )}
                {busy && (
                  <div className="searching">
                    <LoaderCircle size={22} className="spin" />
                    <span>Le meilleur chemin se dessine…</span>
                  </div>
                )}
                {!busy &&
                  lastSearch &&
                  groups.map((g, i) => {
                    const j = g.journey,
                      key = journeyKey(j);
                    const day = relativeDay(j.startTime, lastSearch.at);
                    const previous =
                      i > 0
                        ? relativeDay(
                            groups[i - 1].journey.startTime,
                            lastSearch.at,
                          )
                        : undefined;
                    const separator =
                      chronological && day && day !== previous && !allLater;
                    const selected = g === chosenGroup;
                    return (
                      <React.Fragment key={key}>
                        {separator && (
                          <h3 className="day-separator">
                            {dayHeading(day, j.startTime)}
                          </h3>
                        )}
                        <Journey
                          id={key}
                          item={j}
                          day={day}
                          every={g.every}
                          lessWalking={
                            hasWalkingChoice &&
                            usesTransit(j) &&
                            walkingSeconds(j) === leastWalking
                          }
                          selected={selected}
                          expanded={selected && expanded}
                          onClick={(card) => {
                            anchor.current = {
                              key,
                              top: card.getBoundingClientRect().top,
                            };
                            if (selected && expanded) setExpanded(false);
                            else {
                              setChosenId(key);
                              setExpanded(true);
                            }
                          }}
                        />
                      </React.Fragment>
                    );
                  })}
                {searched &&
                  !busy &&
                  !error &&
                  cursors.next &&
                  journeys.length > 0 && (
                    <button
                      className="page-button"
                      disabled={Boolean(paging)}
                      onClick={() => loadPage("later")}
                    >
                      {paging === "later" ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <ChevronDown size={16} aria-hidden="true" />
                      )}
                      Plus tard
                    </button>
                  )}
                {pageNote && (
                  <p className="page-note" role="status">
                    {pageNote}
                  </p>
                )}
                {searched && !busy && !error && !journeys.length && (
                  <p className="muted">
                    {mode === "bike" && bike === "montenvelo"
                      ? "Aucun trajet MontenVélo trouvé. Vérifiez les stations et la disponibilité dans l’application MontenVélo."
                      : "Essayez un autre horaire. Les calendriers publiés ne couvrent pas toutes les saisons."}
                  </p>
                )}
                {!searched && !busy && (
                  <>
                    {recent.length > 0 && (
                      <section
                        className="recent-trips"
                        aria-labelledby="recent-title"
                      >
                        <div className="suggestions-heading">
                          <h2 id="recent-title">Récents</h2>
                          <button
                            className="text-link"
                            onClick={() => {
                              saveRecent([]);
                              setRecent([]);
                            }}
                          >
                            Effacer
                          </button>
                        </div>
                        {recent.slice(0, 4).map((t) => (
                          <button
                            className="suggestion"
                            key={`${t.from.name}→${t.to.name}`}
                            onClick={() => reuseTrip(t)}
                          >
                            <span className="suggestion-icon">
                              <History size={22} aria-hidden="true" />
                            </span>
                            <span>
                              <strong>{t.to.name}</strong>
                              <small>depuis {t.from.name}</small>
                            </span>
                            <ChevronRight size={17} aria-hidden="true" />
                          </button>
                        ))}
                      </section>
                    )}
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
            // With the sheet up, a tap on the map only lowers it: stops sit close together, so a tap
            // meant for the map would often open one.
            onPoi={(p) =>
              mobile && snap !== "peek" ? setSnap("peek") : selectPoi(p)
            }
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
            Les trajets combinent les horaires publiés par les Cars Région, la
            SNCF, les bus de Chamonix et Facilibus, et les chemins
            d’OpenStreetMap pour la marche et le vélo.
          </p>
          <p>
            Toutes les lignes ne donnent pas leurs horaires en direct. Le label
            « Temps réel » n’apparaît que sur les étapes dont l’horaire vient
            d’être actualisé.
          </p>
          <ul>
            <li>
              <strong>Valléen et ascenseur des Thermes :</strong> nous comptons
              un départ par minute pendant les heures d’ouverture publiées, avec
              la durée annoncée. Les heures de passage et l’attente sont donc
              estimées. Les fermetures connues sont prises en compte jusqu’au 31
              mars 2027.
            </li>
            <li>
              <strong>MontenVélo :</strong> les trajets tiennent compte des
              vélos disponibles au moment de la recherche. Vérifiez les vélos et
              les places de retour dans l’application avant de partir.
            </li>
            <li>
              <strong>Marche et vélo :</strong> les durées tiennent compte des
              montées et des descentes. À vélo, elles supposent un effort
              modéré, avec ou sans assistance électrique. Elles restent
              indicatives selon votre forme.
            </li>
            <li>
              <strong>Citiz et Rézo Pouce :</strong> la carte montre les
              stations et les arrêts, avec un lien vers chaque service. Les
              voitures Citiz disponibles ne sont pas affichées : réservez dans
              l’application Citiz.
            </li>
            <li>
              <strong>Navettes saisonnières et Montenbus :</strong> la carte
              montre leurs arrêts, mais ils ne font pas partie des trajets
              proposés. Plusieurs horaires d’été des navettes ne sont plus
              valables, et Montenbus se réserve à l’avance.
            </li>
            <li>
              <strong>Adresses :</strong> les adresses sont cherchées auprès du
              service national de l’
              <a
                href="https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/"
                target="_blank"
                rel="noreferrer"
              >
                IGN (Base Adresse Nationale)
              </a>
              , les arrêts et les lieux dans les données de ValléeMapper.
            </li>
            <li>
              <strong>Tarifs :</strong> les prix affichés sont des repères
              relevés à la main. ValléeMapper ne calcule pas le prix total et ne
              vend pas de billets. L’accessibilité des arrêts et des véhicules
              n’est pas encore vérifiée.
            </li>
          </ul>
          <p className="fine-print">
            Les sources et leurs licences sont détaillées sur{" "}
            <a
              href="https://github.com/mathieudutour/valleemapper/blob/main/docs/research/passy-transport-data.md"
              target="_blank"
              rel="noreferrer"
            >
              la page du projet
            </a>
            . Pour certaines données publiques, le droit de réutilisation reste
            à confirmer. Fond de carte © OpenFreeMap / OpenMapTiles /
            contributeurs OpenStreetMap. Relief : SRTM courtesy of the U.S.
            Geological Survey ; EU-DEM produced using Copernicus data and
            information funded by the European Union.
          </p>
        </div>
      </Dialog>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
