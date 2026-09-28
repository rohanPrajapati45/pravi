export type Role = "HQ" | "EE" | "AE" | "CONTRACTOR";

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  designation: string | null;
  orgUnit: { id: string; name: string; type: string; path: string };
  contractor: { id: string; name: string } | null;
};

export const roleLabels: Record<Role, string> = {
  HQ: "HQ / Chief Engineer",
  EE: "Executive Engineer",
  AE: "Assistant Engineer",
  CONTRACTOR: "Contractor"
};
