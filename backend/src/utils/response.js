export function ok(response, data, meta, status = 200) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return response.status(status).json(body);
}

export function created(response, data) {
  return ok(response, data, undefined, 201);
}

export function parsePagination(queryParams, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(queryParams.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export function pageMeta({ page, limit }, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
