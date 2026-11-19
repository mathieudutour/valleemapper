import { useEffect, useRef } from "react";
import { Check, Layers, X } from "lucide-react";
import { LAYERS } from "./layers";
import { LayerIcon } from "./PlaceCard";
import type { Poi } from "./types";

/** The map's layer switcher: a button over the map that opens the list of mobility layers. */
export function LayersPanel({
  open,
  onOpenChange,
  filters,
  onToggle,
  pois,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: string[];
  onToggle: (id: string) => void;
  pois: Poi[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>(".layers-panel h2")?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onOpenChange(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="layers-control" ref={root}>
      <button
        ref={button}
        className="map-button"
        aria-expanded={open}
        aria-controls="layers-panel"
        onClick={() => onOpenChange(!open)}
      >
        <Layers size={18} aria-hidden="true" />
        <span>Couches</span>
        <span
          className="map-button-count"
          aria-label={`${filters.length} affichées`}
        >
          {filters.length}
        </span>
      </button>
      {open && (
        <section
          className="layers-panel"
          id="layers-panel"
          aria-labelledby="layers-title"
        >
          <header>
            <h2 id="layers-title" tabIndex={-1}>
              Sur la carte
            </h2>
            <button
              className="icon-button round"
              aria-label="Fermer les couches"
              onClick={() => {
                onOpenChange(false);
                button.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </header>
          <ul className="layer-list">
            {LAYERS.map((layer) => {
              const on = filters.includes(layer.id);
              return (
                <li key={layer.id}>
                  <button
                    className={"layer-row" + (on ? " enabled" : "")}
                    aria-pressed={on}
                    onClick={() => onToggle(layer.id)}
                  >
                    <LayerIcon mode={layer.id} />
                    <span className="layer-text">
                      <strong>{layer.label}</strong>
                      <small>{layer.description}</small>
                    </span>
                    <span className="layer-count">
                      {pois.filter((p) => p.mode === layer.id).length}
                    </span>
                    <span className="checkbox" aria-hidden="true">
                      {on && <Check size={13} strokeWidth={2.5} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="fine-print">
            Touchez un point pour voir ses horaires ou l’utiliser comme départ
            ou arrivée. Les noms apparaissent en zoomant. Montenbus et Rézo
            Pouce sont des lieux de prise en charge, hors itinéraires à horaires
            fixes.
          </p>
        </section>
      )}
    </div>
  );
}
