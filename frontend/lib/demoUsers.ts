import type { Role } from "@/types/auth";

// Fake demo accounts created by `npm run seed -w backend`.
export const DEMO_PASSWORD = "GujInfra@2026";

export const demoAccounts: Array<{ email: string; name: string; role: Role; scope: string }> = [
  { email: "hq@gujinfra.example", name: "Meera Desai", role: "HQ", scope: "Chief Engineer · State-wide" },
  { email: "secretary@gujinfra.example", name: "Suresh Joshi", role: "HQ", scope: "Secretary · State-wide" },
  { email: "ee.ahmedabad@gujinfra.example", name: "Rohit Parmar", role: "EE", scope: "Ahmedabad Division" },
  { email: "ae.daskroi@gujinfra.example", name: "Kiran Solanki", role: "AE", scope: "Daskroi Sub-division" },
  { email: "ae.sanand@gujinfra.example", name: "Nisha Chauhan", role: "AE", scope: "Sanand Sub-division" },
  { email: "contractor.aarav@gujinfra.example", name: "Harsh Vora", role: "CONTRACTOR", scope: "Aarav Infra Works" },
  { email: "ee.surat@gujinfra.example", name: "Vikram Rana", role: "EE", scope: "Surat Division" },
  { email: "ae.olpad@gujinfra.example", name: "Pooja Mehta", role: "AE", scope: "Olpad Sub-division" },
  { email: "contractor.kaveri@gujinfra.example", name: "Dev Shah", role: "CONTRACTOR", scope: "Kaveri Constructions" }
];
