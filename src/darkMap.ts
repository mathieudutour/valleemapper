import type { StyleSpecification } from "maplibre-gl";

// The dark map is the light basemap (Liberty) repainted, so it keeps the same land cover, roads and
// label hierarchy. Known layers get a hand-picked night palette; any other colour has its lightness flipped.

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(rgb|hsl)a?\(\s*([^)]*)\)$/i;

type Hsla = [h: number, s: number, l: number, a: number];

function rgbToHsl(r: number, g: number, b: number, a: number): Hsla {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2,
    d = max - min;
  if (!d) return [0, 0, l, a];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l, a];
}

function parse(color: string): Hsla | undefined {
  const hex = HEX.exec(color)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    const [r, g, b, a = 255] = full
      .match(/../g)!
      .map((pair) => parseInt(pair, 16));
    return rgbToHsl(r / 255, g / 255, b / 255, a / 255);
  }
  const fn = FUNC.exec(color);
  if (!fn) return;
  const parts = fn[2]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(parseFloat);
  if (parts.length < 3 || parts.some(Number.isNaN)) return;
  const [x, y, z, a = 1] = parts;
  return fn[1].toLowerCase() === "rgb"
    ? rgbToHsl(x / 255, y / 255, z / 255, a)
    : [x, y / 100, z / 100, a];
}

/** Light colours become dark and dark ones light; the background lands near the app's own surface. */
export function darkenColor(color: string): string {
  const hsla = parse(color);
  if (!hsla) return color;
  const [h, s, l, a] = hsla;
  const dark = 0.1 + (1 - l) * 0.82;
  // Keep chroma, not HSL saturation: a near-white's tiny tint would turn into a strong colour once dark.
  const chroma = s * (1 - Math.abs(2 * l - 1)) * 0.75;
  const saturation = Math.min(1, chroma / (1 - Math.abs(2 * dark - 1)));
  const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
  return `hsla(${Math.round(h)}, ${pct(saturation)}, ${pct(dark)}, ${a})`;
}

function walk(value: unknown): unknown {
  if (typeof value === "string") return darkenColor(value);
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, walk(v)]),
    );
  return value;
}

// A night palette in the app's teal-grey, keyed to Liberty's layer ids. Roads rank by lightness
// rather than hue; only land cover, water and glaciers carry colour.
const ink = {
  place: "#e2ecea",
  hamlet: "#a3b6b3",
  minor: "#8ea19f",
  water: "#7fb3cc",
};
const HALO = "#0f1819";
const palette: [RegExp, string, string?][] = [
  [/^background$/, "#172224"],
  [/^park$/, "#1e3a2f"],
  [/^park_outline$/, "#24443a"],
  [/^landuse_residential$/, "#1d2a2c"],
  [/^landcover_wood$/, "#1c3b2e"],
  [/^(landcover_grass|landuse_(pitch|track|cemetery|school))$/, "#1d332d"],
  [/^landcover_ice$/, "#2e434b"],
  [/^landcover_sand$/, "#2a2f2b"],
  [/^landuse_hospital$/, "#2a2429"],
  [/^water$/, "#133a52"],
  [/^waterway_(tunnel|river|other)$/, "#235f7e"],
  [/^aeroway_/, "#222e30"],
  [/_casing$/, "#111a1b"],
  [/rail/, "#556567"],
  [/path_pedestrian/, "#394a4d"],
  [/motorway/, "#687b7d"],
  [/trunk_primary/, "#506264"],
  [/secondary_tertiary|_link$/, "#405154"],
  [/minor|street|service_track/, "#2f3e41"],
  [/^building/, "#243336"],
  [/^boundary/, "#4e5f61"],
  [/^label_other$/, "", ink.hamlet],
  [/^label_/, "", ink.place],
  [/^water|^waterway_line_label$/, "", ink.water],
  [/^(poi_|airport|highway-name)/, "", ink.minor],
];
const COLOR_PROP: Record<string, string[]> = {
  background: ["background-color"],
  fill: ["fill-color", "fill-outline-color"],
  line: ["line-color"],
  "fill-extrusion": ["fill-extrusion-color"],
};

export function darkenStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (layer.type === "raster")
        return {
          ...layer,
          paint: { ...layer.paint, "raster-brightness-max": 0.3 },
        };
      if (!("paint" in layer) || !layer.paint) return layer;
      // Flip everything first so a layer the palette does not know still turns dark.
      const paint = walk(layer.paint) as Record<string, unknown>;
      const [, color, text] = palette.find(([id]) => id.test(layer.id)) ?? [];
      if (layer.type === "symbol") {
        if (text && "text-color" in paint) paint["text-color"] = text;
        if ("text-halo-color" in paint) paint["text-halo-color"] = HALO;
      } else if (color) {
        for (const prop of COLOR_PROP[layer.type] ?? []) paint[prop] = color;
      }
      return { ...layer, paint } as typeof layer;
    }),
  };
}
