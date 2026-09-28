import type { NavItem } from "@/components/ui/Sidebar";
import type { Role } from "@/types/auth";

// Routes that exist today; others render disabled until their module ships.
const LIVE_ROUTES = new Set(["/", "/audit", "/assets", "/inspections", "/maintenance", "/works", "/tasks", "/programmes", "/activity", "/admin"]);

const items: Record<string, Omit<NavItem, "disabled">> = {
  dashboard: { href: "/", label: "Dashboard", icon: "dashboard", section: "Overview" },
  tasks: { href: "/tasks", label: "My tasks", icon: "tasks", section: "Overview" },
  activity: { href: "/activity", label: "Activity", icon: "activity", section: "Overview" },
  assets: { href: "/assets", label: "Assets", icon: "assets", section: "Operations" },
  inspections: { href: "/inspections", label: "Inspections", icon: "inspections", section: "Operations" },
  maintenance: { href: "/maintenance", label: "Maintenance", icon: "maintenance", section: "Operations" },
  works: { href: "/works", label: "Works", icon: "works", section: "Projects" },
  programmes: { href: "/programmes", label: "Programmes", icon: "programmes", section: "Projects" },
  audit: { href: "/audit", label: "Audit log", icon: "audit", section: "Governance" },
  admin: { href: "/admin", label: "Administration", icon: "settings", section: "Governance" }
};

const byRole: Record<Role, Array<keyof typeof items>> = {
  HQ: ["dashboard", "tasks", "activity", "assets", "inspections", "maintenance", "works", "programmes", "audit", "admin"],
  EE: ["dashboard", "tasks", "activity", "assets", "inspections", "maintenance", "works", "programmes", "audit"],
  AE: ["dashboard", "tasks", "activity", "assets", "inspections", "maintenance", "works"],
  CONTRACTOR: ["dashboard", "tasks", "activity", "maintenance", "works"]
};

export function navFor(role: Role): NavItem[] {
  return byRole[role].map((key) => ({ ...items[key], disabled: !LIVE_ROUTES.has(items[key].href) }));
}
