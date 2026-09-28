export default function errorHandler(error, _request, response, _next) {
  response.status(500).json({ error: error.message });
}
