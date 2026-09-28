import { query } from "../config/db.js";
import {
  changeAssetStatus,
  createAsset,
  getAsset360,
  getScopedAsset,
  getTimeline,
  listAssets,
  lookupAsset,
  updateAsset
} from "../services/assets.service.js";
import { created, ok, pageMeta, parsePagination } from "../utils/response.js";

export async function getAssetTypes(_request, response) {
  const { rows } = await query(
    `select id, code, name, category, code_prefix, attribute_schema, inspection_interval_days, design_life_years
       from asset_types where is_active order by category, name`
  );
  ok(response, rows);
}

export async function getAssets(request, response) {
  const pagination = parsePagination(request.query);
  const { rows, total } = await listAssets(request.user, request.valid.query, pagination);
  ok(response, rows, pageMeta(pagination, total));
}

export async function getLookup(request, response) {
  ok(response, await lookupAsset(request.user, request.valid.query.code));
}

export async function getAsset(request, response) {
  const { attribute_schema, org_path, ...asset } = await getScopedAsset(request.user, request.valid.params.id);
  ok(response, asset);
}

export async function getAssetDetail360(request, response) {
  ok(response, await getAsset360(request.user, request.valid.params.id));
}

export async function getAssetTimeline(request, response) {
  const pagination = parsePagination(request.query, { defaultLimit: 50 });
  const { rows, total } = await getTimeline(request.user, request.valid.params.id, pagination);
  ok(response, rows, pageMeta(pagination, total));
}

export async function getAssetChildren(request, response) {
  const pagination = parsePagination(request.query, { defaultLimit: 100 });
  const { rows, total } = await listAssets(request.user, { parent_id: request.valid.params.id, sort: "code" }, pagination);
  ok(response, rows, pageMeta(pagination, total));
}

export async function postAsset(request, response) {
  created(response, await createAsset(request.user, request.valid.body, request.ip));
}

export async function patchAsset(request, response) {
  const { attribute_schema, org_path, ...asset } = await updateAsset(request.user, request.valid.params.id, request.valid.body, request.ip);
  ok(response, asset);
}

export async function postAssetStatus(request, response) {
  ok(response, await changeAssetStatus(request.user, request.valid.params.id, request.valid.body, request.ip));
}
