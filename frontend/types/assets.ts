export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AttributeField = {
  key: string;
  label: string;
  type: "number" | "text" | "select" | "boolean";
  unit?: string;
  options?: string[];
  required?: boolean;
};

export type AssetType = {
  id: string;
  code: string;
  name: string;
  category: string;
  code_prefix: string;
  attribute_schema: AttributeField[];
  inspection_interval_days: number;
  design_life_years: number;
};

export type RiskFactor = { key: string; label: string; points: number; max: number };

export type AssetListRow = {
  id: string;
  asset_code: string;
  name: string;
  lifecycle_status: string;
  condition_rating: number | null;
  risk_score: number;
  risk_band: RiskBand;
  district: string | null;
  road_code: string | null;
  start_chainage_km: number | null;
  end_chainage_km: number | null;
  next_inspection_due: string | null;
  dlp_end_date: string | null;
  parent_id: string | null;
  type_name: string;
  category: string;
  org_unit_name: string;
};

export type TimelineEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  at: string;
  remarks: string | null;
  ref_type: string | null;
  ref_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor_role: string | null;
  actor_name: string | null;
};

export type Asset360 = AssetListRow & {
  qr_token: string;
  type_id: string;
  type_code: string;
  taluka: string | null;
  lat: number | null;
  lng: number | null;
  attributes: Record<string, unknown>;
  attribute_schema: AttributeField[];
  criticality: number;
  traffic_level: number;
  commissioned_on: string | null;
  original_cost: number | null;
  design_life_years: number | null;
  last_inspected_at: string | null;
  inspection_interval_days: number;
  risk_factors: RiskFactor[];
  org_chain: Array<{ code: string; type: string; name: string }>;
  parent: { id: string; asset_code: string; name: string } | null;
  children: Array<{ id: string; asset_code: string; name: string; lifecycle_status: string; condition_rating: number | null; risk_band: RiskBand; type_name: string; child_count: number }>;
  origin_work: {
    id: string;
    work_code: string;
    title: string;
    work_type: string;
    status: string;
    contract_value: number | null;
    sanctioned_amount: number | null;
    actual_end: string | null;
    dlp_months: number | null;
    contractor_name: string | null;
  } | null;
  people: Array<{ name: string; role: string; designation: string | null; email: string }>;
  dlp: { in_dlp: boolean; days_remaining: number | null; end_date: string | null };
  recommendation: { action: string; reason: string };
  allowed_transitions: Array<{ to: string; requires: string[] }>;
  counts: { timeline: number; components: number };
};

export const LIFECYCLE_STATUSES = [
  "PLANNED",
  "UNDER_CONSTRUCTION",
  "OPERATIONAL",
  "UNDER_MAINTENANCE",
  "UNDER_REHABILITATION",
  "CLOSED_TEMPORARILY",
  "RETIRED"
];
export const RISK_BANDS: RiskBand[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const DISTRICTS = ["Ahmedabad", "Anand", "Bharuch", "Bhavnagar", "Gandhinagar", "Jamnagar", "Mehsana", "Navsari", "Panchmahal", "Rajkot", "Surat", "Vadodara"];
