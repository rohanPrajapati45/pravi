export type TaskStatus = "PENDING" | "SUBMITTED" | "ACCEPTED" | "RETURNED" | "SKIPPED";
export type StageStatus = "LOCKED" | "ACTIVE" | "PASSED" | "REJECTED" | "SKIPPED";
export type StageKind = "GENERIC" | "DESIGN" | "APPROVAL" | "AWARD" | "CONSTRUCTION" | "HANDOVER" | "CLOSURE";
export type TaskAction = "assign" | "submit" | "accept" | "return";

export type WorkTask = {
  id: string;
  seq: number;
  title: string;
  default_assignee_role: "HQ" | "EE" | "AE" | "CONTRACTOR";
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_to_role: string | null;
  due_date: string | null;
  status: TaskStatus;
  required_deliverables: string[];
  deliverables: Array<{ label: string; reference: string }>;
  submission_note: string | null;
  progress_pct: number | null;
  photos: Array<{ path: string; url: string | null }>;
  submitted_by_name: string | null;
  submitted_at: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_remarks: string | null;
  return_count: number;
  is_mandatory: boolean;
  is_milestone: boolean;
  weight: number;
  is_overdue: boolean;
  actions: TaskAction[];
};

export type StageEvaluation = {
  id: string;
  outcome: "PASSED" | "PASSED_WITH_OBSERVATIONS" | "RETURNED" | "REJECTED";
  evaluator_name: string | null;
  evaluator_role: string | null;
  remarks: string | null;
  evaluated_at: string;
  data: Record<string, unknown> | null;
  checklist: Array<{ item: string; ok: boolean }>;
};

export type WorkStage = {
  id: string;
  seq: number;
  code: string;
  name: string;
  kind: StageKind;
  status: StageStatus;
  gate_role: "HQ" | "EE" | "COST_LIMIT";
  gate_checklist: string[];
  planned_days: number;
  return_count: number;
  started_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  is_delayed: boolean;
  tasks: WorkTask[];
  evaluations: StageEvaluation[];
  gate: { can_evaluate: boolean; reason: string | null; pending_tasks: number; limit: string | null } | null;
};

export type WorkListRow = {
  id: string;
  work_code: string;
  title: string;
  work_type: string;
  status: string;
  priority: string;
  template_code: string;
  template_name: string;
  org_unit_name: string;
  programme_name: string | null;
  contractor_name: string | null;
  estimated_cost: number | null;
  sanctioned_amount: number | null;
  contract_value: number | null;
  progress_pct: number;
  current_stage_name: string | null;
  current_stage_seq: number | null;
  days_in_stage: number | null;
  is_delayed: boolean;
  created_at: string;
};

export type WorkJourney = WorkListRow & {
  objective: string | null;
  initiation_type: string;
  initiation_ref: string | null;
  initiation_date: string | null;
  initiated_by_name: string | null;
  tender_ref: string | null;
  start_date: string | null;
  planned_end: string | null;
  actual_end: string | null;
  dlp_months: number | null;
  asset_type_code: string | null;
  stages: WorkStage[];
  approvals: Array<{ stage: string; approver_name: string; approver_role: string; amount: number; reference: string; decided_at: string }>;
  assets: Array<{ role: "CREATED" | "TARGET"; id: string; asset_code: string; name: string; lifecycle_status: string; condition_rating: number | null; dlp_end_date: string | null }>;
  contractor_evaluation: {
    total_score: number;
    schedule_score: number;
    quality_score: number;
    rework_score: number;
    dlp_score: number;
    documentation_score: number;
    inputs: Record<string, string>;
    evaluator_name: string | null;
    evaluated_at: string;
  } | null;
  who_has_file: { stage: string; days_in_stage: number; delayed: boolean; holder: string; summary: string; next_gate: string } | null;
  can_manage: boolean;
};

export type WorkTemplate = {
  id: string;
  code: string;
  name: string;
  work_type: string;
  asset_type_code: string | null;
  description: string;
  stages: Array<{ seq: number; code: string; name: string; kind: string; gate_role: string; planned_days: number; tasks: number }>;
};

export type Programme = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  financial_year: string;
  budget_head: string | null;
  allocated_amount: number;
  works_count: number;
  sanctioned_total: number;
  contracted_total: number;
  value_of_work_done: number;
  owner_org_unit_name: string;
};
