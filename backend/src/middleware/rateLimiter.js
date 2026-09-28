import AppError from "../utils/AppError.js";

// Fixed-window limiter kept in memory — enough for one API instance guarding the public endpoints.
// With several instances this moves to Redis (increment rate_limit:<key>, set a TTL, reject after the threshold).
export function rateLimit({ windowMs, max, name }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
  }, windowMs).unref();

  return (request, _response, next) => {
    const key = `${name}:${request.ip}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      const minutes = Math.ceil((entry.reset - now) / 60000);
      return next(new AppError(429, "RATE_LIMITED", `Too many requests — please try again in ${minutes} minute${minutes === 1 ? "" : "s"}`));
    }
    next();
  };
}

export default function rateLimiter(_request, _response, next) {
  next();
}
