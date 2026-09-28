import type { NavItem } from "@/components/ui/Sidebar";
import type { Role } from "@/types/auth";

// Routes that exist today; others render disabled until their module ships.
const LIVE_ROUTES = new Set(["/", "/audit", "/assets", "/map", "/inspections", "/maintenance", "/works", "/tasks", "/programmes", "/activity", "/admin", "/dlp", "/contractors", "/complaints", "/emergencies"]);

const items: Record<string, Omit<NavItem, "disabled">> = {
  dashboard: { href: "/", label: "Dashboard", icon: "dashboard", section: "Overview" },
  tasks: { href: "/tasks", label: "My tasks", icon: "tasks", section: "Overview" },
  activity: { href: "/activity", label: "Activity", icon: "activity", section: "Overview" },
  assets: { href: "/assets", label: "Assets", icon: "assets", section: "Operations" },
  map: { href: "/map", label: "Map", icon: "map", section: "Operations" },
  inspections: { href: "/inspections", label: "Inspections", icon: "inspections", section: "Operations" },
  maintenance: { href: "/maintenance", label: "Maintenance", icon: "maintenance", section: "Operations" },
  complaints: { href: "/complaints", label: "Citizen complaints", icon: "message", section: "Operations" },
  emergencies: { href: "/emergencies", label: "Emergencies", icon: "siren", section: "Operations" },
  works: { href: "/works", label: "Works", icon: "works", section: "Projects" },
  programmes: { href: "/programmes", label: "Programmes", icon: "programmes", section: "Projects" },
  dlp: { href: "/dlp", label: "DLP tracker", icon: "shield", section: "Projects" },
  contractors: { href: "/contractors", label: "Contractors", icon: "users", section: "Projects" },
  myPerformance: { href: "/contractors", label: "My performance", icon: "programmes", section: "Projects" },
  audit: { href: "/audit", label: "Audit log", icon: "audit", section: "Governance" },
  admin: { href: "/admin", label: "Administration", icon: "settings", section: "Governance" }
};

const byRole: Record<Role, Array<keyof typeof items>> = {
  HQ: ["dashboard", "tasks", "activity", "assets", "map", "inspections", "maintenance", "complaints", "emergencies", "works", "programmes", "dlp", "contractors", "audit", "admin"],
  EE: ["dashboard", "tasks", "activity", "assets", "map", "inspections", "maintenance", "complaints", "emergencies", "works", "programmes", "dlp", "contractors", "audit"],
  AE: ["dashboard", "tasks", "activity", "assets", "map", "inspections", "maintenance", "complaints", "emergencies", "works", "dlp"],
  CONTRACTOR: ["dashboard", "tasks", "activity", "map", "maintenance", "works", "myPerformance"]
};

export function navFor(role: Role): NavItem[] {
  return byRole[role].map((key) => ({ ...items[key], disabled: !LIVE_ROUTES.has(items[key].href) }));
}
