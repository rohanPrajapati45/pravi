export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: PageMeta;
};

export type ApiFailure = {
  success: false;
  error: { code: string; message: string; details?: unknown };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type HealthData = {
  status: string;
  api: string;
  db: string;
  dbName?: string;
  dbTime?: string;
  dbLatencyMs?: number;
};
