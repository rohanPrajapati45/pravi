// M10 notifications & jobs, M11 measurement book, M12 emergencies, M13 complaints & integrations.

export type Notification = {
  id: string;
  kind: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
};

export type JobRun = {
  id: string;
  job: string;
  trigger: "SCHEDULE" | "MANUAL";
  triggered_by_name: string | null;
  run_date: string;
  started_at: string;
  finished_at: string | null;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  summary: Record<string, Record<string, number> | number> | null;
  error: string | null;
};

// ---------- measurement book ----------

export type BoqItem = {
  id: string;
  item_no: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  measured_qty: number;
  checked_qty: number;
  billed_qty: number;
  measured_amount: number;
  measured_pct: number;
  excess: boolean;
  entries: number;
};

export type Measurement = {
  id: string;
  entry_no: number;
  boq_item_id: string;
  item_no: string;
  item_description: string;
  unit: string;
  rate: number;
  measured_on: string;
  location: string | null;
  nos: number;
  length: number | null;
  breadth: number | null;
  depth: number | null;
  quantity: number;
  amount: number;
  remarks: string | null;
  excess: boolean;
  status: "RECORDED" | "CHECKED" | "REJECTED";
  recorded_by_name: string;
  recorded_by_role: string;
  recorded_at: string;
  checked_by_name: string | null;
  checked_at: string | null;
  check_remarks: string | null;
  bill_id: string | null;
  bill_no: number | null;
  actions: Array<"check" | "reject">;
};

export type RunningBill = {
  id: string;
  bill_no: number;
  status: "SUBMITTED" | "APPROVED" | "RETURNED" | "PAID";
  amount: number;
  cumulative_amount: number;
  entries: number;
  created_by_name: string;
  created_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  remarks: string | null;
  payment_ref: string | null;
  paid_at: string | null;
  actions: Array<"approve" | "return" | "pay">;
};

export type MeasurementBook = {
  work: { id: string; work_code: string; title: string; status: string; contract_value: number | null; contractor_name: string | null; org_unit_name: string };
  items: BoqItem[];
  entries: Measurement[];
  bills: RunningBill[];
  totals: {
    boq_amount: number;
    measured_amount: number;
    checked_amount: number;
    billed_amount: number;
    paid_amount: number;
    unbilled_amount: number;
    unbilled_entries: number;
    pending_check: number;
  };
  permissions: { edit_boq: boolean; record: boolean; bill: boolean; reason: string | null };
};

// ---------- emergencies ----------

export const EMERGENCY_KINDS = ["FLOOD", "HEAVY_RAIN", "CYCLONE", "EARTHQUAKE", "STRUCTURAL_FAILURE", "ACCIDENT", "OTHER"] as const;

export type Emergency = {
  id: string;
  emergency_code: string;
  title: string;
  kind: string;
  description: string | null;
  org_unit_id: string;
  area_name: string;
  area_type: string;
  status: "ACTIVE" | "CLOSED";
  declared_by_name: string;
  declared_at: string;
  closed_by_name: string | null;
  closed_at: string | null;
  closure_remarks: string | null;
  assets_reported: number;
  assets_pending: number;
  assets_closed: number;
};

export type EmergencyAsset = {
  id: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  asset_type: string;
  lifecycle_status: string;
  org_unit_name: string;
  damage: string;
  severity: "MINOR" | "MAJOR" | "SEVERE";
  traffic_status: "OPEN" | "RESTRICTED" | "CLOSED";
  status: "REPORTED" | "RESTORED";
  reported_by_name: string;
  reported_at: string;
  restored_by_name: string | null;
  restored_at: string | null;
  restore_remarks: string | null;
  maintenance_request_id: string | null;
  request_code: string | null;
  request_status: string | null;
  work_id: string | null;
  work_code: string | null;
  work_status: string | null;
  photos: Array<{ path: string; url: string | null }>;
  actions: Array<"restore" | "start_work">;
};

export type EmergencyDetail = Emergency & { assets: EmergencyAsset[]; permissions: { report: boolean; close: boolean } };

// ---------- complaints ----------

export const COMPLAINT_CATEGORIES = [
  { value: "POTHOLE", label: "Potholes" },
  { value: "ROAD_DAMAGE", label: "Damaged road surface" },
  { value: "BRIDGE_DAMAGE", label: "Bridge or culvert damage" },
  { value: "DRAINAGE", label: "Blocked drain / culvert" },
  { value: "WATERLOGGING", label: "Water-logging on road" },
  { value: "STREETLIGHT", label: "Street light not working" },
  { value: "SIGNAGE", label: "Missing or damaged sign" },
  { value: "BUILDING", label: "Government building problem" },
  { value: "OTHER", label: "Something else" }
] as const;

export const categoryLabel = (value: string) => COMPLAINT_CATEGORIES.find((item) => item.value === value)?.label ?? value;

export type ComplaintRow = {
  id: string;
  complaint_code: string;
  channel: "WEB" | "CPGRAMS" | "SWAGAT" | "HELPLINE";
  external_ref: string | null;
  category: string;
  description: string;
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  citizen_name: string | null;
  citizen_phone: string | null;
  asset_id: string | null;
  asset_code: string | null;
  asset_name: string | null;
  match_method: "CODE" | "NEAREST" | "MANUAL" | null;
  match_distance_m: number | null;
  office_name: string | null;
  status: "RECEIVED" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "REJECTED" | "DUPLICATE";
  duplicate_of: string | null;
  duplicate_of_code: string | null;
  maintenance_request_id: string | null;
  request_code: string | null;
  request_status: string | null;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  duplicates: number;
  created_at: string;
};

export type ComplaintDetail = ComplaintRow & {
  photos: Array<{ path: string; url: string | null }>;
  history: Array<{ action: string; at: string; actor_name: string | null; actor_role: string; diff: { remarks?: string } | null }>;
  duplicates_list: Array<{ id: string; complaint_code: string; created_at: string; channel: string }>;
  open_requests: Array<{ id: string; request_code: string; title: string; status: string; severity: string; due_date: string | null }>;
  candidates: Array<{ id: string; asset_code: string; name: string; type_name: string; category: string; distance: number }>;
  allowed_actions: Array<"acknowledge" | "link_asset" | "raise_request" | "resolve" | "reject">;
};

export type ComplaintTracking = {
  complaint_code: string;
  category: string;
  status: ComplaintRow["status"];
  channel: string;
  created_at: string;
  description: string;
  location_text: string | null;
  asset: { code: string; name: string } | null;
  office: string | null;
  duplicate_of: string | null;
  steps: Array<{ key: string; label: string; at: string | null; note?: string | null }>;
};

export type IntegrationStatus = {
  adapters: Array<{ key: string; name: string; description: string; direction: "INBOUND" | "OUTBOUND"; enabled: boolean; endpoint: string; calls_24h: number; failures_24h: number; last_call_at: string | null }>;
  logs: Array<{ id: string; adapter: string; direction: string; status: "OK" | "REJECTED" | "ERROR"; reference: string | null; message: string | null; created_at: string }>;
};
