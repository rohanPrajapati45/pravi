export default function logger(request, response, next) {
  const started = process.hrtime.bigint();
  response.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`${request.method} ${request.originalUrl} ${response.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
}
