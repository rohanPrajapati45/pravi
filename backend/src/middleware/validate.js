import AppError from "../utils/AppError.js";

// Usage: validate({ body: zodSchema, query: zodSchema, params: zodSchema }); parsed values land on request.valid.
export default function validate(schemas) {
  return (request, _response, next) => {
    request.valid = request.valid ?? {};
    for (const part of ["params", "query", "body"]) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(request[part] ?? {});
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }));
        return next(AppError.badRequest(`Invalid ${part}`, details));
      }
      request.valid[part] = result.data;
    }
    next();
  };
}
