export type InspectionRow = {
  id: string;
  inspection_code: string;
  type: string;
  inspected_at: string;
  condition_rating: number;
  previous_condition: number | null;
  severity: string;
  defects: string[];
  remarks: string | null;
  status: string;
  inspector_name: string | null;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  request_code: string | null;
  photos: Array<{ path: string; url: string | null }>;
  distance_from_asset_m: number | null;
};
