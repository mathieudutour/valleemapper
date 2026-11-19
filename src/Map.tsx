import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type * as GeoJSON from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
maplibregl.setWorkerUrl(workerUrl);
import { decodeLine, type ValleyData, type Itinerary, type Poi } from "./types";

const colors: Record<string, string> = {
  bus: "#387aa0",
  train: "#a14c69",
  montenvelo: "#15876c",
  citiz: "#bc4e2f",
  rezopouce: "#725ba4",
  montenbus: "#46738f",
  shuttle: "#4c779c",
  lift: "#c78a23",
};
export default function ValleyMap({
  data,
  filters,
  journey,
  onPoi,
  selected,
}: {
  data: ValleyData;
  filters: string[];
  journey?: Itinerary;
  onPoi: (p: Poi) => void;
  selected?: Poi;
}) {
  const [locationMessage, setLocationMessage] = useState("");
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | undefined>(undefined),
    ready = useRef(false),
    latest = useRef({ data, filters, journey, onPoi, selected });
  latest.current = { data, filters, journey, onPoi, selected };
  function update() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { data, filters, journey, selected } = latest.current;
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
          properties: { ...p, color: colors[p.mode] || "#125451" },
        })),
    });
    const features: GeoJSON.Feature[] = [];
    for (const leg of journey?.legs || []) {
      const coords = leg.legGeometry?.points
        ? decodeLine(leg.legGeometry.points, leg.legGeometry.precision)
        : [];
      if (coords.length > 1)
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {
            walk: leg.mode === "WALK",
            color:
              leg.mode === "WALK"
                ? "#647c80"
                : leg.mode === "BIKE" || leg.mode === "RENTAL"
                  ? "#15876c"
                  : leg.routeId?.startsWith("vertical_")
                    ? "#c58c22"
                    : "#125451",
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
    if (selected)
      m.flyTo({
        center: [selected.lon, selected.lat],
        zoom: Math.max(m.getZoom(), 13),
        duration: 600,
      });
  }
  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [6.701, 45.918],
      zoom: 11.8,
      maxZoom: 18,
      minZoom: 8,
      attributionControl: { compact: true },
      locale: {
        "GeolocateControl.FindMyLocation": "Me localiser",
        "GeolocateControl.LocationNotAvailable": "Localisation indisponible",
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
    m.on("load", () => {
      m.addSource("links", { type: "geojson", data: data.links });
      m.addLayer({
        id: "lifts",
        type: "line",
        source: "links",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": "#c78a23",
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });
      for (const id of ["journey", "pois", "ends"])
        m.addSource(id, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      m.addLayer({
        id: "journey-halo",
        type: "line",
        source: "journey",
        paint: { "line-color": "#fff", "line-width": 9, "line-opacity": 0.9 },
      });
      m.addLayer({
        id: "journey-transit",
        type: "line",
        source: "journey",
        filter: ["==", ["get", "walk"], false],
        paint: { "line-color": ["get", "color"], "line-width": 5 },
        layout: { "line-join": "round", "line-cap": "round" },
      });
      m.addLayer({
        id: "journey-walk",
        type: "line",
        source: "journey",
        filter: ["==", ["get", "walk"], true],
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-dasharray": [1, 1.5],
        },
      });
      m.addLayer({
        id: "poi-circles",
        type: "circle",
        source: "pois",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 8],
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#fff",
        },
      });
      m.addLayer({
        id: "poi-labels",
        type: "symbol",
        source: "pois",
        minzoom: 14,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 13,
          "text-offset": [0, 1.5],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#314b51",
          "text-halo-color": "#fff",
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
          "circle-stroke-color": "#fff",
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
        },
        paint: { "text-color": "#fff" },
      });
      m.on("click", "poi-circles", (e) => {
        const id = e.features?.[0]?.properties?.id;
        const p = latest.current.data.pois.find((p) => p.id === id);
        if (p) latest.current.onPoi(p);
      });
      m.on(
        "mouseenter",
        "poi-circles",
        () => (m.getCanvas().style.cursor = "pointer"),
      );
      m.on(
        "mouseleave",
        "poi-circles",
        () => (m.getCanvas().style.cursor = ""),
      );
      ready.current = true;
      update();
    });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(container.current!);
    return () => {
      ro.disconnect();
      ready.current = false;
      m.remove();
    };
  }, []);
  useEffect(update, [data, filters, journey, selected]);
  useEffect(() => {
    const m = map.current;
    if (!m || !journey) return;
    const all = journey.legs.flatMap((l) =>
      l.legGeometry?.points
        ? decodeLine(l.legGeometry.points, l.legGeometry.precision)
        : ([
            [l.from.lon, l.from.lat],
            [l.to.lon, l.to.lat],
          ] as [number, number][]),
    );
    if (all.length) {
      const b = all.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(all[0], all[0]),
      );
      m.fitBounds(b, { padding: 70, maxZoom: 14, duration: 700 });
    }
  }, [journey]);
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
