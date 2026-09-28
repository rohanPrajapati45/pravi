"use client";

import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

export type GeoFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] } | { type: "LineString"; coordinates: Array<[number, number]> };
  properties: {
    id: string;
    code: string;
    name: string;
    type: string;
    category: string;
    status: string;
    condition: number | null;
    risk: number;
    band: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    district: string | null;
    road: string | null;
    overdue: boolean;
    in_dlp: boolean;
    component: boolean;
    anchor: [number, number];
  };
};

export type ColourBy = "risk" | "condition";

export const bandColour = { LOW: "#16A34A", MEDIUM: "#EAB308", HIGH: "#F97316", CRITICAL: "#DC2626" } as const;
export const conditionColour: Record<number, string> = { 5: "#16A34A", 4: "#65A30D", 3: "#EAB308", 2: "#F97316", 1: "#DC2626" };
const bandRank = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const;
const conditionWord = ["Not rated", "Critical", "Poor", "Moderate", "Good", "Excellent"];

const colourFor = (props: GeoFeature["properties"], by: ColourBy) => (by === "risk" ? bandColour[props.band] : props.condition ? conditionColour[props.condition] : "#94A3B8");

const escape = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function popupHtml(props: GeoFeature["properties"]) {
  const pill = (text: string, colour: string) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600;background:${colour}1a;color:${colour}">${escape(text)}</span>`;
  return `
    <div style="min-width:220px;font-family:var(--font-body),system-ui,sans-serif">
      <div style="font-family:var(--font-mono),monospace;font-size:11px;color:#1D4ED8">${escape(props.code)}</div>
      <div style="font-weight:600;font-size:13px;color:#0F172A;margin-top:2px">${escape(props.name)}</div>
      <div style="font-size:12px;color:#64748B;margin-top:2px">${escape(props.type)}${props.district ? ` · ${escape(props.district)}` : ""}</div>
      ${props.road ? `<div style="font-family:var(--font-mono),monospace;font-size:11px;color:#64748B;margin-top:2px">${escape(props.road)}</div>` : ""}
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">
        ${pill(`Risk ${Math.round(props.risk)} · ${props.band.toLowerCase()}`, bandColour[props.band])}
        ${pill(`Condition ${props.condition ?? "—"} · ${conditionWord[props.condition ?? 0]}`, props.condition ? conditionColour[props.condition] : "#64748B")}
        ${props.overdue ? pill("Inspection overdue", "#DC2626") : ""}
        ${props.in_dlp ? pill("In DLP", "#1D4ED8") : ""}
      </div>
      <a href="/assets/${escape(props.id)}" data-asset="${escape(props.id)}"
         style="display:inline-block;margin-top:10px;font-size:12px;font-weight:600;color:#1D4ED8;text-decoration:none">Open Asset 360 →</a>
    </div>`;
}

function markerIcon(props: GeoFeature["properties"], by: ColourBy) {
  const shape = props.category === "BRIDGE" || props.category === "CULVERT" ? "border-radius:3px;transform:rotate(45deg)" : props.category === "BUILDING" || props.category === "EQUIPMENT" ? "border-radius:3px" : "border-radius:999px";
  return L.divIcon({
    className: "gi-marker",
    html: `<span style="display:block;width:14px;height:14px;background:${colourFor(props, by)};border:2px solid #fff;box-shadow:0 1px 3px rgba(15,23,42,.45);${shape}"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8]
  });
}

type Props = {
  features: GeoFeature[];
  colourBy: ColourBy;
  focusId?: string | null;
  onOpenAsset: (id: string) => void;
};

export default function AssetMap({ features, colourBy, focusId, onOpenAsset }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const roadsRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const fittedRef = useRef(false);
  const openRef = useRef(onOpenAsset);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  openRef.current = onOpenAsset;

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [22.4, 71.8], zoom: 7, preferCanvas: true, zoomControl: true, worldCopyJump: false });
    // Key-free base maps (verified): Esri grey canvas + labels, OpenStreetMap standard, Esri imagery + place names.
    const esri = (service: string, options: L.TileLayerOptions = {}) =>
      L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, ...options });
    const light = L.layerGroup([
      esri("Canvas/World_Light_Gray_Base", { maxNativeZoom: 16, attribution: "Tiles &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap contributors" }),
      esri("Canvas/World_Light_Gray_Reference", { maxNativeZoom: 16 })
    ]).addTo(map);
    const streets = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    const satellite = L.layerGroup([
      esri("World_Imagery", { maxNativeZoom: 18, attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics" }),
      esri("Reference/World_Boundaries_and_Places", { maxNativeZoom: 18 })
    ]);

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 48,
      spiderfyOnMaxZoom: true,
      chunkedLoading: true,
      // Cluster colour = worst risk band inside it, so hot spots stand out at state level.
      iconCreateFunction: (group) => {
        const children = group.getAllChildMarkers() as Array<L.Marker & { options: { band?: keyof typeof bandRank } }>;
        const worst = children.reduce<keyof typeof bandRank>((acc, marker) => (bandRank[marker.options.band ?? "LOW"] > bandRank[acc] ? marker.options.band ?? acc : acc), "LOW");
        const count = group.getChildCount();
        const size = count < 10 ? 32 : count < 50 ? 38 : 46;
        return L.divIcon({
          className: "gi-cluster",
          html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:999px;background:#fff;border:3px solid ${bandColour[worst]};box-shadow:0 2px 6px rgba(15,23,42,.25);font:600 12px var(--font-body),system-ui;color:#0F172A">${count}</span>`,
          iconSize: [size, size]
        });
      }
    });
    const roads = L.layerGroup();
    map.addLayer(cluster);
    L.control.layers({ Light: light, Streets: streets, Satellite: satellite }, { Assets: cluster, "Road segments": roads }, { position: "topright" }).addTo(map);

    // Road lines only make sense once zoomed in.
    const syncRoads = () => {
      if (map.getZoom() >= 10) map.addLayer(roads);
      else map.removeLayer(roads);
    };
    map.on("zoomend", syncRoads);

    // Popup links navigate inside the app instead of reloading the page.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest("a[data-asset]") as HTMLAnchorElement | null;
      if (link) {
        event.preventDefault();
        openRef.current(link.dataset.asset!);
      }
    };
    containerRef.current.addEventListener("click", onClick);

    mapRef.current = map;
    clusterRef.current = cluster;
    roadsRef.current = roads;
    const container = containerRef.current;
    return () => {
      container.removeEventListener("click", onClick);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Rebuild layers when data or colouring changes.
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    const roads = roadsRef.current;
    if (!map || !cluster || !roads) return;
    cluster.clearLayers();
    roads.clearLayers();
    markersRef.current.clear();

    const markers: L.Marker[] = [];
    for (const feature of features) {
      const props = feature.properties;
      const [lng, lat] = props.anchor;
      const marker = L.marker([lat, lng], { icon: markerIcon(props, colourBy), title: `${props.code} — ${props.name}`, keyboard: true, ...({ band: props.band } as object) });
      marker.bindPopup(popupHtml(props), { maxWidth: 280 });
      markers.push(marker);
      markersRef.current.set(props.id, marker);
      if (feature.geometry.type === "LineString") {
        const line = L.polyline(
          feature.geometry.coordinates.map(([x, y]) => [y, x] as [number, number]),
          { color: colourFor(props, colourBy), weight: 5, opacity: 0.85, lineCap: "round" }
        );
        line.bindPopup(popupHtml(props), { maxWidth: 280 });
        roads.addLayer(line);
      }
    }
    cluster.addLayers(markers);
    if (map.getZoom() >= 10) map.addLayer(roads);

    if (!fittedRef.current && markers.length && !focusId) {
      map.fitBounds(cluster.getBounds(), { padding: [32, 32], maxZoom: 12 });
      fittedRef.current = true;
    }
  }, [features, colourBy, focusId]);

  // Deep link from Asset 360: zoom to the asset and open its popup.
  useEffect(() => {
    if (!focusId || !clusterRef.current) return;
    const marker = markersRef.current.get(focusId);
    if (marker) {
      clusterRef.current.zoomToShowLayer(marker, () => {
        mapRef.current?.setView(marker.getLatLng(), Math.max(mapRef.current.getZoom(), 14));
        marker.openPopup();
      });
      fittedRef.current = true;
    }
  }, [focusId, features]);

  function locate() {
    const map = mapRef.current;
    if (!map) return;
    setLocating(true);
    setLocateError(null);
    map.once("locationfound", (event: L.LocationEvent) => {
      setLocating(false);
      L.circleMarker(event.latlng, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563EB", fillOpacity: 1 }).addTo(map).bindTooltip("You are here").openTooltip();
      L.circle(event.latlng, { radius: event.accuracy, color: "#2563EB", weight: 1, fillOpacity: 0.08 }).addTo(map);
    });
    map.once("locationerror", () => {
      setLocating(false);
      setLocateError("Location unavailable — allow location access and try again");
    });
    map.locate({ setView: true, maxZoom: 13, enableHighAccuracy: true });
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" role="application" aria-label="Map of assets" />
      <button
        type="button"
        onClick={locate}
        className="absolute left-3 top-[88px] z-[500] flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink shadow-card hover:bg-slate-50"
        aria-label="Show my location"
        title="Show my location"
      >
        {locating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" /> : <Icon name="locate" className="h-4 w-4" />}
      </button>
      {locateError && <p className="absolute left-14 top-[88px] z-[500] rounded-lg bg-surface px-3 py-2 text-xs text-red-700 shadow-card">{locateError}</p>}
    </div>
  );
}
