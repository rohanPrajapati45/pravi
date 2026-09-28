export default function rateLimiter(_request, _response, next) {
  // TODO: Use Redis fixed-window limiting: increment rate_limit:<key>, set a TTL, and reject after the threshold.
  next();
}
