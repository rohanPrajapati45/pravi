"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import StatusBadge, { humanize } from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  at: string;
  actor_role: string;
  user_name: string | null;
  org_unit_name: string | null;
};

const LIMIT = 20;

const columns: Column<AuditRow>[] = [
  {
    key: "at",
    header: "When",
    render: (row) => <span className="whitespace-nowrap font-mono text-xs">{new Date(row.at).toLocaleString("en-IN")}</span>
  },
  {
    key: "user_name",
    header: "Who",
    render: (row) => (
      <div>
        <p className="font-medium">{row.user_name ?? "System"}</p>
        <p className="text-xs text-muted">{row.org_unit_name ?? row.actor_role}</p>
      </div>
    )
  },
  { key: "action", header: "Action", render: (row) => <StatusBadge status={row.action} label={humanize(row.action)} tone="info" /> },
  {
    key: "entity",
    header: "Record",
    render: (row) => (
      <span>
        {humanize(row.entity)} <span className="font-mono text-xs text-muted">{row.entity_id?.slice(0, 8)}</span>
      </span>
    )
  }
];

export default function AuditPage() {
  const { token, profile } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { data, meta } = await api<AuditRow[]>("/audit-logs", { token, query: { page, limit: LIMIT } });
      setRows(data);
      setTotal(meta?.total ?? data.length);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the audit log");
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => {
    if (profile && (profile.role === "HQ" || profile.role === "EE")) load();
  }, [load, profile]);

  return (
    <AppShell title="Audit log" allowedRoles={["HQ", "EE"]}>
      <p className="mb-4 text-sm text-muted">
        Append-only record of every state-changing action. The database rejects edits and deletes on this table.
      </p>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={load}
        emptyTitle="No actions recorded yet"
        emptyDescription="Actions such as creating users, assets, or inspections will appear here."
        pagination={{ page, limit: LIMIT, total, onPageChange: setPage }}
      />
    </AppShell>
  );
}
