import "./config/env.js";
import express from "express";
import cors from "cors";
import logger from "./middleware/logger.js";
import errorHandler, { notFound } from "./middleware/errorHandler.js";
import apiRoutes from "./routes/index.js";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000" }));
app.use(express.json({ limit: "1mb" }));
app.use(logger);

app.use("/api/v1", apiRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}/api/v1`);
});
