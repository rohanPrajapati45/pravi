import "./config/env.js";
import express from "express";
import cors from "cors";
import logger from "./middleware/logger.js";
import errorHandler, { notFound } from "./middleware/errorHandler.js";
import apiRoutes from "./routes/index.js";
import { startScheduler } from "./services/jobs.service.js";

const app = express();
// Behind Render/Vercel proxies: use the client address from X-Forwarded-For for rate limiting.
app.set("trust proxy", 1);
const port = process.env.PORT || 4000;

// Comma-separated allow-list, e.g. "https://gujinfra.vercel.app,http://localhost:3000".
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
// Collapse accidental double slashes in the path ("//api/v1/me" → "/api/v1/me"); the query string is left untouched.
app.use((request, _response, next) => {
  const [path, query] = request.url.split("?");
  if (path.includes("//")) request.url = path.replace(/\/{2,}/g, "/") + (query !== undefined ? `?${query}` : "");
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(logger);

// Friendly landing for anyone opening the bare service URL.
app.get("/", (_request, response) => {
  response.json({ success: true, data: { service: "GujInfra 360 API", version: "v1", health: "/api/v1/health", docs: "See README.md in the repository" } });
});

app.use("/api/v1", apiRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}/api/v1`);
  startScheduler();
});
