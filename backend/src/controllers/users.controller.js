import { createUser, listUsers, toProfile } from "../services/users.service.js";
import { created, ok, pageMeta, parsePagination } from "../utils/response.js";

export async function getMe(request, response) {
  ok(response, toProfile(request.user));
}

export async function getUsers(request, response) {
  const pagination = parsePagination(request.query);
  const { rows, total } = await listUsers(request.user, { ...pagination, ...request.valid.query });
  ok(response, rows, pageMeta(pagination, total));
}

export async function postUser(request, response) {
  const user = await createUser(request.user, request.valid.body, request.ip);
  created(response, user);
}
