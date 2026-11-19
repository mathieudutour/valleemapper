import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type * as GeoJSON from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
maplibregl.setWorkerUrl(workerUrl);
import {
  decodeLine,
  hasApproximatePath,
  type ValleyData,
  type Itinerary,
  type Leg,
  type Poi,
} from "./types";
import { layerById } from "./layers";
import { poiName } from "./places";

export type Theme = "light" | "dark";
const styles: Record<Theme, string> = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const palette = {
  light: {
    halo: "#ffffff",
    route: "#125451",
    bike: "#15876c",
    walk: "#5f7478",
    lift: "#c58c22",
    label: "#314b51",
  },
  dark: {
    halo: "#0f1a1c",
    route: "#4fc2ad",
    bike: "#5fd0a6",
    walk: "#a3b6b3",
    lift: "#e0a945",
    label: "#e2ecea",
  },
};

function legCoordinates(leg: Leg): [number, number][] {
  return leg.legGeometry?.points
    ? decodeLine(leg.legGeometry.points, leg.legGeometry.precision)
    : [
        [leg.from.lon, leg.from.lat],
        [leg.to.lon, leg.to.lat],
      ];
}

export default function ValleyMap({
  data,
  filters,
  journey,
  onPoi,
  onBackgroundClick,
  selected,
  theme,
  bottomInset = 0,
}: {
  data: ValleyData;
  filters: string[];
  journey?: Itinerary;
  onPoi: (p: Poi) => void;
  onBackgroundClick?: () => void;
  selected?: Poi;
  theme: Theme;
  bottomInset?: number;
}) {
  const [locationMessage, setLocationMessage] = useState("");
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | undefined>(undefined),
    ready = useRef(false),
    latest = useRef({
      data,
      filters,
      journey,
      onPoi,
      onBackgroundClick,
      selected,
      theme,
      bottomInset,
    });
  latest.current = {
    data,
    filters,
    journey,
    onPoi,
    onBackgroundClick,
    selected,
    theme,
    bottomInset,
  };

  const padding = () => ({
    top: 80,
    left: 60,
    right: 80, // clears the zoom and locate controls
    bottom: 60 + latest.current.bottomInset,
  });

  function update() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { data, filters, journey, selected, theme } = latest.current;
    const colors = palette[theme];
    m.setLayoutProperty(
      "lifts",
      "visibility",
      filters.includes("lift") ? "visible" : "none",
    );
    (m.getSource("pois") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: data.pois
        .filter((p) => filters.includes(p.mode))
        .map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
          properties: {
            id: p.id,
            name: poiName(p),
            color: layerById[p.mode]?.color || "#125451",
          },
        })),
    });
    // A drawn route takes the foreground; unrelated points recede.
    const opacity = journey ? 0.35 : 1;
    m.setPaintProperty("poi-circles", "circle-opacity", opacity);
    m.setPaintProperty("poi-circles", "circle-stroke-opacity", opacity);
    m.setPaintProperty("poi-labels", "text-opacity", journey ? 0.6 : 1);
    m.setFilter("poi-selected", ["==", ["get", "id"], selected?.id ?? ""]);

    const features: GeoJSON.Feature[] = [];
    for (const leg of journey?.legs || []) {
      const coords = legCoordinates(leg);
      if (coords.length < 2) continue;
      const kind =
        leg.mode === "WALK"
          ? "walk"
          : hasApproximatePath(leg)
            ? "approximate"
            : "transit";
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {
          kind,
          color:
            leg.mode === "WALK"
              ? colors.walk
              : leg.mode === "BIKE" || leg.mode === "RENTAL"
                ? colors.bike
                : leg.routeId?.startsWith("vertical_")
                  ? colors.lift
                  : colors.route,
        },
      });
    }
    (m.getSource("journey") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features,
    });
    const ends = journey
      ? [journey.legs[0]?.from, journey.legs.at(-1)?.to].filter(Boolean)
      : [];
    (m.getSource("ends") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: ends.map((p, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p!.lon, p!.lat] },
        properties: { label: i ? "B" : "A" },
      })),
    });
  }

  function addLayers() {
    const m = map.current!;
    const colors = palette[latest.current.theme];
    // Our layers go under the basemap's place names so towns stay legible.
    const beforeId = m
      .getStyle()
      .layers.find(
        (l) => l.type === "symbol" && /^(label_|place_)/.test(l.id),
      )?.id;
    // The basemap's own OSM bus and rail icons would duplicate our imported stops.
    if (m.getLayer("poi_transit"))
      m.setLayoutProperty("poi_transit", "visibility", "none");
    m.addSource("links", { type: "geojson", data: latest.current.data.links });
    for (const id of ["journey", "pois", "ends"])
      m.addSource(id, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    m.addLayer(
      {
        id: "lifts",
        type: "line",
        source: "links",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": colors.lift,
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      },
      beforeId,
    );
    m.addLayer(
      {
        id: "journey-halo",
        type: "line",
        source: "journey",
        filter: ["!=", ["get", "kind"], "approximate"],
        paint: {
          "line-color": colors.halo,
          "line-width": 9,
          "line-opacity": 0.9,
        },
        layout: { "line-join": "round", "line-cap": "round" },
      },
      beforeId,
    );
    m.addLayer(
      {
        id: "journey-approximate",
        type: "line",
        source: "journey",
        filter: ["==", ["get", "kind"], "approximate"],
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3.5,
          "line-opacity": 0.6,
          "line-dasharray": [2, 1.5],
        },
      },
      beforeId,
    );
    m.addLayer(
      {
        id: "journey-transit",
        type: "line",
        source: "journey",
        filter: ["==", ["get", "kind"], "transit"],
        paint: { "line-color": ["get", "color"], "line-width": 5 },
        layout: { "line-join": "round", "line-cap": "round" },
      },
      beforeId,
    );
    m.addLayer(
      {
        id: "journey-walk",
        type: "line",
        source: "journey",
        filter: ["==", ["get", "kind"], "walk"],
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-dasharray": [1, 1.5],
        },
      },
      beforeId,
    );
    m.addLayer(
      {
        id: "poi-circles",
        type: "circle",
        source: "pois",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            2.5,
            12,
            4.5,
            15,
            7.5,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            1,
            13,
            2,
          ],
          "circle-stroke-color": colors.halo,
          "circle-opacity-transition": { duration: 250 },
          "circle-stroke-opacity-transition": { duration: 250 },
        },
      },
      beforeId,
    );
    m.addLayer(
      {
        id: "poi-selected",
        type: "circle",
        source: "pois",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 7, 15, 12],
          "circle-color": "rgba(0, 0, 0, 0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": ["get", "color"],
        },
      },
      beforeId,
    );
    m.addLayer({
      id: "poi-labels",
      type: "symbol",
      source: "pois",
      minzoom: 14,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 13,
        "text-offset": [0, 1.2],
        "text-anchor": "top",
      },
      paint: {
        "text-color": colors.label,
        "text-halo-color": colors.halo,
        "text-halo-width": 2,
      },
    });
    m.addLayer({
      id: "endpoint",
      type: "circle",
      source: "ends",
      paint: {
        "circle-radius": 13,
        "circle-color": "#125451",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffffff",
      },
    });
    m.addLayer({
      id: "endpoint-label",
      type: "symbol",
      source: "ends",
      layout: {
        "text-field": ["get", "label"],
        "text-size": 13,
        "text-font": ["Noto Sans Regular"],
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#ffffff" },
    });
    ready.current = true;
    update();
  }

  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: styles[latest.current.theme],
      center: [6.701, 45.918],
      zoom: 11.8,
      maxZoom: 18,
      minZoom: 8,
      attributionControl: { compact: true },
      locale: {
        "GeolocateControl.FindMyLocation": "Me localiser",
        "GeolocateControl.LocationNotAvailable": "Localisation indisponible",
        "NavigationControl.ZoomIn": "Zoomer",
        "NavigationControl.ZoomOut": "Dézoomer",
      },
    });
    map.current = m;
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 12_000 },
    });
    geolocate.on("geolocate", () => setLocationMessage(""));
    geolocate.on("error", (error) =>
      setLocationMessage(
        error.code === 1
          ? "Autorisez la localisation dans les réglages du navigateur."
          : "Position introuvable. Réessayez dans un instant.",
      ),
    );
    m.addControl(geolocate, "bottom-right");
    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    m.addControl(
      new maplibregl.ScaleControl({ unit: "metric" }),
      "bottom-left",
    );
    m.on("style.load", addLayers);
    // Points are small at valley zoom; accept a tap within a finger's width and pick the nearest point.
    m.on("click", (e) => {
      const slop = 14;
      const hits = m.getLayer("poi-circles")
        ? m.queryRenderedFeatures(
            [
              [e.point.x - slop, e.point.y - slop],
              [e.point.x + slop, e.point.y + slop],
            ],
            { layers: ["poi-circles"] },
          )
        : [];
      const nearest = hits
        .map((f) => {
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const p = m.project([lon, lat]);
          return {
            id: f.properties?.id,
            distance: Math.hypot(p.x - e.point.x, p.y - e.point.y),
          };
        })
        .sort((a, b) => a.distance - b.distance)[0];
      const poi =
        nearest && latest.current.data.pois.find((p) => p.id === nearest.id);
      if (poi) latest.current.onPoi(poi);
      else latest.current.onBackgroundClick?.();
    });
    m.on(
      "mouseenter",
      "poi-circles",
      () => (m.getCanvas().style.cursor = "pointer"),
    );
    m.on("mouseleave", "poi-circles", () => (m.getCanvas().style.cursor = ""));
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(container.current!);
    return () => {
      ro.disconnect();
      ready.current = false;
      m.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    ready.current = false;
    // A full reload fires style.load, which re-adds our sources and layers.
    m.setStyle(styles[theme], { diff: false });
  }, [theme]);

  useEffect(update, [data, filters, journey, selected]);

  useEffect(() => {
    const m = map.current;
    if (!m || !selected) return;
    m.easeTo({
      center: [selected.lon, selected.lat],
      zoom: Math.max(m.getZoom(), 14),
      // Centre the point in the part of the map the mobile sheet leaves visible.
      offset: [0, -bottomInset / 2],
      duration: 600,
    });
  }, [selected?.id]);

  useEffect(() => {
    const m = map.current;
    if (!m || !journey) return;
    const all = journey.legs.flatMap(legCoordinates);
    if (!all.length) return;
    const bounds = all.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(all[0], all[0]),
    );
    m.fitBounds(bounds, { padding: padding(), maxZoom: 14, duration: 700 });
  }, [journey, bottomInset]);

  return (
    <>
      <div
        ref={container}
        className="map"
        aria-label="Carte des transports du Pays du Mont-Blanc"
      />
      <p className="map-location-status" role="status">
        {locationMessage}
      </p>
    </>
  );
}
