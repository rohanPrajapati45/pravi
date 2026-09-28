import AppError from "../utils/AppError.js";

export function requireRole(...roles) {
  return (request, _response, next) => {
    if (!request.user) return next(AppError.unauthorized());
    if (!roles.includes(request.user.role)) {
      return next(AppError.forbidden(`This action needs one of: ${roles.join(", ")}`));
    }
    next();
  };
}

export default requireRole;
