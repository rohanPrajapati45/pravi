import type { NavItem } from "@/components/ui/Sidebar";
import type { Role } from "@/types/auth";

// Routes that exist today; others render disabled until their module ships.
const LIVE_ROUTES = new Set(["/", "/audit", "/assets", "/inspections", "/maintenance"]);

const items: Record<string, Omit<NavItem, "disabled">> = {
  dashboard: { href: "/", label: "Dashboard" },
  assets: { href: "/assets", label: "Assets" },
  inspections: { href: "/inspections", label: "Inspections" },
  maintenance: { href: "/maintenance", label: "Maintenance" },
  works: { href: "/works", label: "Works" },
  tasks: { href: "/tasks", label: "My tasks" },
  programmes: { href: "/programmes", label: "Programmes" },
  audit: { href: "/audit", label: "Audit log" }
};

const byRole: Record<Role, Array<keyof typeof items>> = {
  HQ: ["dashboard", "assets", "programmes", "works", "maintenance", "inspections", "audit"],
  EE: ["dashboard", "tasks", "assets", "works", "maintenance", "inspections", "audit"],
  AE: ["dashboard", "tasks", "assets", "inspections", "maintenance"],
  CONTRACTOR: ["dashboard", "tasks", "works", "maintenance"]
};

export function navFor(role: Role): NavItem[] {
  return byRole[role].map((key) => ({ ...items[key], disabled: !LIVE_ROUTES.has(items[key].href) }));
}
