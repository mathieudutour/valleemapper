import React, { useState } from "react";
import type { Leg } from "./types";
import { formatDistance } from "./directions";

const WIDTH = 300;
const HEIGHT = 56;
const INSET = 4;
/** A nearly flat ride would fill the chart like a mountain, so the height axis always spans this much. */
const MIN_SPAN = 100;
/** Below this much climbing, the chart would be a nearly empty band; the leg's text still gives its climb. */
const MIN_CLIMB = 30;
const number = new Intl.NumberFormat("fr-FR");

/**
 * The height profile of a bike leg, from the smoothed heights the API sends. A crosshair follows the
 * pointer, a finger or the arrow keys and reads out the distance and height at that point.
 */
export function ElevationProfile({ leg }: { leg: Leg }) {
  const [active, setActive] = useState<number>();
  const e = leg.elevation;
  if (!e?.profile || !e.spacing || e.profile.length < 2) return null;
  if (e.up < MIN_CLIMB) return null;
  const absolute = e.start !== undefined;
  const heights = e.profile.map((h) => h + (e.start ?? 0));
  const last = heights.length - 1;
  const low = Math.min(...heights);
  const top = Math.max(Math.max(...heights), low + MIN_SPAN);
  const x = (i: number) => (i / last) * WIDTH;
  const y = (h: number) =>
    INSET + ((top - h) / (top - low)) * (HEIGHT - 2 * INSET);
  const line = heights
    .map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(h).toFixed(1)}`)
    .join(" ");
  const height = (h: number) =>
    absolute
      ? `${number.format(Math.round(h))} m`
      : `${h > 0 ? "+" : h < 0 ? "−" : ""}${number.format(Math.abs(Math.round(h)))} m`;
  const readout =
    active === undefined
      ? `${height(heights[0])} → ${height(heights[last])}`
      : `${active ? formatDistance(active * e.spacing) : "Départ"} · ${height(heights[active])}`;
  const pick = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / box.width;
    setActive(Math.round(Math.min(1, Math.max(0, fraction)) * last));
  };
  const step = (event: React.KeyboardEvent) => {
    const move =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (move) {
      event.preventDefault();
      setActive((i) => Math.min(last, Math.max(0, (i ?? -move) + move)));
    } else if (event.key === "Escape") setActive(undefined);
  };

  return (
    <figure
      className="elevation-profile"
      tabIndex={0}
      aria-label={`Profil d’altitude : montée de ${e.up} m, descente de ${e.down} m. Flèches gauche et droite pour parcourir.`}
      onKeyDown={step}
      onBlur={() => setActive(undefined)}
    >
      <figcaption className="elevation-readout" aria-live="polite">
        {readout}
      </figcaption>
      <div
        className="elevation-plot"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setActive(undefined)}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="elevation-area"
            d={`${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`}
          />
          <path className="elevation-line" d={line} />
          {active !== undefined && (
            <line
              className="elevation-crosshair"
              x1={x(active)}
              x2={x(active)}
              y1={0}
              y2={HEIGHT}
            />
          )}
        </svg>
        {active !== undefined && (
          <span
            className="elevation-dot"
            style={{
              left: `${(x(active) / WIDTH) * 100}%`,
              top: `${(y(heights[active]) / HEIGHT) * 100}%`,
            }}
          />
        )}
      </div>
      <div className="elevation-axis" aria-hidden="true">
        <span>0 km</span>
        <span>{formatDistance(last * e.spacing)}</span>
      </div>
    </figure>
  );
}
