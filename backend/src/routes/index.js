import { Router } from "express";
import auth from "../middleware/auth.js";
import assetRoutes from "./assets.routes.js";
import coreRoutes from "./core.routes.js";
import inspectionRoutes from "./inspections.routes.js";
import maintenanceRoutes from "./maintenance.routes.js";
import worksRoutes from "./works.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import adminRoutes from "./admin.routes.js";
import contractorRoutes from "./contractors.routes.js";
import documentRoutes from "./documents.routes.js";
import healthRoutes from "./health.routes.js";
import notificationRoutes from "./notifications.routes.js";
import measurementRoutes from "./measurement.routes.js";
import emergencyRoutes from "./emergencies.routes.js";
import complaintRoutes from "./complaints.routes.js";
import publicRoutes from "./public.routes.js";

const router = Router();

router.use("/health", healthRoutes);
// Citizens and external portals (rate-limited, no login).
router.use("/", publicRoutes);

// Everything below requires a verified Supabase session.
router.use(auth);
router.use("/", coreRoutes);
router.use("/", assetRoutes);
router.use("/", inspectionRoutes);
router.use("/", maintenanceRoutes);
router.use("/", worksRoutes);
router.use("/", dashboardRoutes);
router.use("/", adminRoutes);
router.use("/", contractorRoutes);
router.use("/", documentRoutes);
router.use("/", notificationRoutes);
router.use("/", measurementRoutes);
router.use("/", emergencyRoutes);
router.use("/", complaintRoutes);

export default router;
