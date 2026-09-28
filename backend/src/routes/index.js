import { Router } from "express";
import auth from "../middleware/auth.js";
import assetRoutes from "./assets.routes.js";
import coreRoutes from "./core.routes.js";
import inspectionRoutes from "./inspections.routes.js";
import maintenanceRoutes from "./maintenance.routes.js";
import worksRoutes from "./works.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import healthRoutes from "./health.routes.js";

const router = Router();

router.use("/health", healthRoutes);

// Everything below requires a verified Supabase session.
router.use(auth);
router.use("/", coreRoutes);
router.use("/", assetRoutes);
router.use("/", inspectionRoutes);
router.use("/", maintenanceRoutes);
router.use("/", worksRoutes);
router.use("/", dashboardRoutes);

export default router;
