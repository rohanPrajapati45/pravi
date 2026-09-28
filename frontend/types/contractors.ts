export type DlpAsset = {
  id: string;
  asset_code: string;
  name: string;
  district: string | null;
  condition_rating: number | null;
  risk_band: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  risk_score: number;
  lifecycle_status: string;
  commissioned_on: string | null;
  dlp_end_date: string;
  last_inspected_at: string | null;
  type_name: string;
  org_unit_name: string;
  days_remaining: number;
  dlp_total_days: number;
  work_id: string | null;
  work_code: string | null;
  work_title: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  defects_total: number;
  defects_open: number;
};

export type DlpSummary = {
  in_dlp: number;
  expiring_30: number;
  expired_90: number;
  liable_open: number;
  liable_overdue: number;
  liable_fixed: number;
  avg_fix_days: number | null;
};

export type ContractorPerformance = {
  id: string;
  code: string;
  name: string;
  class: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  is_active: boolean;
  active_works: number;
  completed_works: number;
  active_value: number;
  total_value: number;
  on_time_pct: number | null;
  avg_delay_days: number | null;
  running_late: number;
  first_pass_pct: number | null;
  milestones_reviewed: number;
  avg_score: number | null;
  evaluations: number;
  dlp_defects: number;
  dlp_open: number;
  dlp_avg_fix_days: number | null;
};

export type ContractorDetail = Omit<ContractorPerformance, "evaluations"> & {
  works: Array<{
    id: string;
    work_code: string;
    title: string;
    status: string;
    contract_value: number | null;
    start_date: string | null;
    planned_end: string | null;
    actual_end: string | null;
    progress_pct: number;
    delay_days: number | null;
    running_late: boolean;
    current_stage_name: string | null;
    org_unit_name: string;
  }>;
  evaluations: Array<{
    id: string;
    work_id: string;
    work_code: string;
    work_title: string;
    total_score: number;
    schedule_score: number;
    quality_score: number;
    rework_score: number;
    dlp_score: number;
    documentation_score: number;
    inputs: Record<string, string>;
    evaluator_name: string | null;
    evaluated_at: string;
  }>;
  dlp_defects: Array<{
    id: string;
    request_code: string;
    title: string;
    status: string;
    severity: string;
    created_at: string;
    due_date: string | null;
    verified_at: string | null;
    is_overdue: boolean;
    asset_id: string;
    asset_code: string;
    asset_name: string;
    dlp_end_date: string | null;
  }>;
};
