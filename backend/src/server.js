import "./config/env.js";
import express from "express";
import cors from "cors";
import logger from "./middleware/logger.js";
import errorHandler, { notFound } from "./middleware/errorHandler.js";
import apiRoutes from "./routes/index.js";

const app = express();
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

app.use("/api/v1", apiRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}/api/v1`);
});
