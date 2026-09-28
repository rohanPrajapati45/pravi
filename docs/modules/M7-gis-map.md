# M7 — GIS map

## What was built
- **API `GET /assets/geo`** → GeoJSON FeatureCollection. Same jurisdiction scope and the **same filter builder** as the registry list (type, category, district, office, status, condition, risk band, overdue, in DLP, search) plus an optional `bbox=minLng,minLat,maxLng,maxLat`. Road segments with geometry are returned as `LineString`, everything else as `Point`; capped at 5,000 features (highest risk first) with a `truncated` flag.
- **Migration `007`:** partial index on `(lat, lng)` for map-area queries.
- **`/map` page (Leaflet; key-free base maps: Esri light grey + labels (default), OpenStreetMap streets, Esri satellite + place names):**
  - clustered markers; **cluster ring colour = worst risk band inside it**, so hot spots stand out at state zoom;
  - marker colour by **risk band or condition** (toggle); shape by kind (● road/other, ◆ bridge/culvert, ■ building/equipment);
  - road segments drawn as coloured polylines from zoom 10;
  - popups with code, name, type, district, road chainage, risk, condition, overdue/DLP flags and **Open Asset 360** (in-app navigation);
  - filters shared with the registry, live count, legend, Light/Streets base maps, layer toggles, **Locate me**;
  - `?focus=<assetId>` deep link — Asset 360 → Location → **View on map** zooms to the asset and opens its popup.
- Map is loaded client-side only (`next/dynamic`, `ssr: false`) so server rendering is unaffected.
- New dependencies: `leaflet`, `leaflet.markercluster` (+ type packages).

## How to test
```bash
cd backend && node --experimental-websocket scripts/smoke-m7.mjs   # 15 read-only checks
```
UI: Map → zoom into Ahmedabad → toggle colour by condition → filter "Inspection overdue" → click a marker → Open Asset 360 → View on map.

## DoD
500+ assets render with clustering ✔ · filters identical to the list (verified count-for-count) ✔ · click-through to Asset 360 ✔ · scoped by jurisdiction ✔ · production build ✔.
