import AppError from "../utils/AppError.js";

export function notFound(request, _response, next) {
  next(AppError.notFound(`Route ${request.method} ${request.originalUrl} not found`));
}

export default function errorHandler(error, _request, response, _next) {
  if (error instanceof AppError) {
    return response.status(error.status).json({
      success: false,
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }
    });
  }

  if (error.type === "entity.parse.failed") {
    return response.status(400).json({ success: false, error: { code: "INVALID_JSON", message: "Malformed JSON body" } });
  }

  console.error(error);
  const exposeMessage = process.env.NODE_ENV !== "production";
  return response.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: exposeMessage ? error.message : "Something went wrong" }
  });
}
