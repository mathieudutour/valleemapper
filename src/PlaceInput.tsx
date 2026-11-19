import { useEffect, useId, useRef, useState, type Ref } from "react";
import { BusFront, House, MapPin, TrainFront } from "lucide-react";
import type { Place } from "./types";
import {
  dedupe,
  matches,
  remoteSuggestions,
  type Suggestion,
  type SuggestionKind,
} from "./places";

const kindIcon: Record<SuggestionKind, typeof MapPin> = {
  station: TrainFront,
  stop: BusFront,
  address: House,
  place: MapPin,
};

export function PlaceInput({
  label,
  value,
  onChange,
  suggestions,
  error,
  inputRef,
}: {
  label: string;
  value: Place | undefined;
  onChange: (p: Place | undefined) => void;
  suggestions: Suggestion[];
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const listId = id + "-options",
    errorId = id + "-error";
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState(value?.name || ""),
    [open, setOpen] = useState(false),
    [remote, setRemote] = useState<Suggestion[]>([]),
    [loading, setLoading] = useState(false),
    [active, setActive] = useState(0);
  useEffect(() => {
    if (value) setQuery(value.name);
  }, [value]);
  useEffect(() => {
    setActive(0);
    setRemote([]);
    setLoading(false);
    if (query.trim().length < 3 || !open || value) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(
      () =>
        fetch("/api/geocode?q=" + encodeURIComponent(query), {
          signal: controller.signal,
        })
          .then((r) => r.json())
          .then((body) => {
            if (Array.isArray(body)) setRemote(remoteSuggestions(body, query));
          })
          .catch(() => {})
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          }),
      300,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const typed = query.trim().length > 1 && !value;
  const local = typed
    ? suggestions
        .map((s) => [s, matches(s.name, query)] as const)
        .filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([s]) => s)
        .slice(0, 12)
    : suggestions.slice(0, 6);
  const results = dedupe(typed ? [...local, ...remote] : local).slice(0, 8);
  const expanded = open && (results.length > 0 || typed);

  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (p: Suggestion) => {
    onChange({ name: p.name, lat: p.lat, lon: p.lon, detail: p.detail });
    setQuery(p.name);
    setOpen(false);
  };
  return (
    <div className={"place-field" + (error ? " invalid" : "")}>
      <span className="field-dot" aria-hidden="true" />
      <label className="field-content">
        <span className="field-label">{label}</span>
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            expanded && results[active] ? `${listId}-${active}` : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          enterKeyHint="next"
          value={query}
          placeholder="Lieu, adresse ou arrêt"
          onFocus={(e) => {
            // Focus moved here by a validation error keeps the list shut so the message stays readable.
            if (!error) setOpen(true);
            e.currentTarget.select();
          }}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && expanded) {
              e.preventDefault();
              setOpen(false);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, results.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter" && expanded && results[active]) {
              e.preventDefault();
              choose(results[active]);
            }
          }}
        />
      </label>
      {error && (
        <span className="sr-only" id={errorId}>
          {error}
        </span>
      )}
      {expanded && (
        // tabIndex -1: Chrome makes scrollable lists tab stops; the input keeps focus and drives the list.
        <ul
          className="place-options"
          role="listbox"
          id={listId}
          ref={list}
          aria-label={label}
          tabIndex={-1}
        >
          {results.map((p, i) => {
            const KindIcon = kindIcon[p.kind];
            return (
              <li
                role="option"
                id={`${listId}-${i}`}
                data-index={i}
                aria-selected={active === i}
                className={active === i ? "active" : ""}
                key={`${p.name}-${p.lat}-${p.lon}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(p)}
              >
                <span className={"place-kind " + p.kind}>
                  <KindIcon size={16} aria-hidden="true" />
                </span>
                <span className="place-text">
                  <span className="place-name">{p.name}</span>
                  {p.detail && (
                    <small className="place-detail">{p.detail}</small>
                  )}
                </span>
              </li>
            );
          })}
          {results.some((r) => r.source === "IGN/BAN") && (
            <li className="place-source" role="presentation">
              Adresses : IGN · Base Adresse Nationale
            </li>
          )}
          {!results.length && (
            <li className="place-empty" role="presentation">
              {loading
                ? "Recherche…"
                : "Aucun lieu trouvé. Essayez une adresse ou un nom d’arrêt."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
