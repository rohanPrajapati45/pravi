"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import Button from "./Button";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import Loading from "./Loading";

export type Column<T> = {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  className?: string;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
};

type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  pagination?: Pagination;
};

export default function Table<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle = "No records found",
  emptyDescription,
  onRowClick,
  pagination
}: TableProps<T>) {
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

  let body: ReactNode;
  if (loading) body = <Loading />;
  else if (error) body = <ErrorState message={error} onRetry={onRetry} />;
  else if (rows.length === 0) body = <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {body ?? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className={cn("px-4 py-2.5 font-medium", column.className)}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-accent-soft/40")}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={cn("px-4 py-3 align-middle", column.className)}>
                      {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && !error && pagination.total > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-sm text-muted">
          <span>
            Page {pagination.page} of {totalPages} · {pagination.total.toLocaleString("en-IN")} records
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
