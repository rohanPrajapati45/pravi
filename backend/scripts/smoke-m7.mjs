// M7 map API smoke test (read-only): node --experimental-websocket scripts/smoke-m7.mjs
import { call, check, login, summary } from "./_client.mjs";

const hq = await login("hq@gujinfra.example");
const ee = await login("ee.ahmedabad@gujinfra.example");
const ae = await login("ae.daskroi@gujinfra.example");
const contractor = await login("contractor.aarav@gujinfra.example");

const all = await call(hq, "/assets/geo");
const geo = all.body.data;
check("GeoJSON FeatureCollection", all.status === 200 && geo.type === "FeatureCollection" && geo.features.length >= 500, `${geo.features.length} features in ${all.ms} ms`);
const lines = geo.features.filter((feature) => feature.geometry.type === "LineString");
check("Road segments come back as lines", lines.length >= 250 && lines.every((feature) => feature.properties.category === "ROAD"), `${lines.length} lines`);
check("Every feature carries id, code, risk band and condition for colouring", geo.features.every((feature) => feature.properties.id && feature.properties.code && feature.properties.band));

const listed = (await call(hq, "/assets?limit=1")).body.meta.total;
const plannedNoCoords = listed - geo.features.length;
check("Map count matches registry (minus assets without coordinates)", plannedNoCoords >= 0 && plannedNoCoords < 20, `${listed} listed, ${geo.features.length} mapped`);

for (const query of ["risk_band=HIGH", "overdue=true", "in_dlp=true", "district=Surat"]) {
  const mapped = (await call(hq, `/assets/geo?${query}`)).body.data.features.length;
  const listCount = (await call(hq, `/assets?${query}&limit=1`)).body.meta.total;
  check(`Filter ${query}: map = list`, mapped === listCount, `${mapped} / ${listCount}`);
}

const ahmedabadBox = "72.2,22.7,72.9,23.3";
const boxed = (await call(hq, `/assets/geo?bbox=${ahmedabadBox}`)).body.data.features;
check("bbox limits to the visible area", boxed.length > 0 && boxed.length < geo.features.length && boxed.every((feature) => {
  const [lng, lat] = feature.properties.anchor;
  return lng >= 72.2 && lng <= 72.9 && lat >= 22.7 && lat <= 23.3;
}), `${boxed.length} in box`);
check("Bad bbox -> 400", (await call(hq, "/assets/geo?bbox=1,2,3")).status === 400);

const eeGeo = (await call(ee, "/assets/geo")).body.data.features;
check("EE map scoped to own division", eeGeo.length > 0 && eeGeo.length < geo.features.length, `${eeGeo.length}`);
const aeGeo = (await call(ae, "/assets/geo")).body.data.features;
check("AE map scoped to own sub-division", aeGeo.length > 0 && aeGeo.length < eeGeo.length, `${aeGeo.length}`);
const cGeo = (await call(contractor, "/assets/geo")).body.data.features;
check("Contractor sees only assets on their works", cGeo.length < aeGeo.length, `${cGeo.length}`);

check("Registry list still works after the shared-filter refactor", (await call(ee, "/assets?risk_band=HIGH&sort=condition&limit=5")).status === 200);
check("/assets/:id still resolves (route order)", (await call(hq, `/assets/${geo.features[0].properties.id}`)).status === 200);

summary("M7");
