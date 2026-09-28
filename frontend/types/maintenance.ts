export type MaintenanceStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "VERIFIED" | "CLOSED" | "CANCELLED";
export type MaintenanceAction = "assign" | "start" | "complete" | "verify" | "reject" | "close" | "cancel";

export type MaintenanceRow = {
  id: string;
  request_code: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  asset_type: string;
  asset_status: string;
  org_unit_name: string;
  source: string;
  title: string;
  description: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH";
  status: MaintenanceStatus;
  priority_score: number | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_to_role: string | null;
  contractor_name: string | null;
  due_date: string | null;
  dlp_liable: boolean;
  is_overdue: boolean;
  estimated_cost: number | null;
  actual_cost: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
  completion_remarks: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  verified_condition: number | null;
  verification_remarks: string | null;
  rejection_count: number;
  closed_at: string | null;
  cancel_reason: string | null;
};

export type MaintenanceDetail = MaintenanceRow & {
  source_inspection: {
    inspection_code: string;
    inspected_at: string;
    condition_rating: number;
    defects: string[];
    photos: Array<{ path: string; url: string | null }>;
  } | null;
  after_photos: Array<{ path: string; url: string | null }>;
  history: Array<{ action: string; at: string; diff: Record<string, unknown> | null; actor_role: string; actor_name: string | null }>;
  allowed_actions: MaintenanceAction[];
};

export type MaintenanceSummary = { by_status: Partial<Record<MaintenanceStatus, number>>; overdue: number; dlp_liable_active: number };

export const MAINTENANCE_FLOW: MaintenanceStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "VERIFIED", "CLOSED"];
