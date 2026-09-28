"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Select from "@/components/ui/Select";
import StatusBadge, { humanize } from "@/components/ui/StatusBadge";
import Button from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { daysFromToday, formatDate, formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { MaintenanceRow, MaintenanceSummary } from "@/types/maintenance";

const LIMIT = 20;
const lanes = [
  { key: "active", label: "Active", statuses: "OPEN,ASSIGNED,IN_PROGRESS" },
  { key: "OPEN", label: "Open", statuses: "OPEN" },
  { key: "ASSIGNED", label: "Assigned", statuses: "ASSIGNED" },
  { key: "IN_PROGRESS", label: "In progress", statuses: "IN_PROGRESS" },
  { key: "COMPLETED", label: "Awaiting verification", statuses: "COMPLETED" },
  { key: "VERIFIED", label: "Verified", statuses: "VERIFIED" },
  { key: "CLOSED", label: "Closed", statuses: "CLOSED,CANCELLED" }
];

const severityStripe = { HIGH: "border-l-condition-critical", MEDIUM: "border-l-condition-moderate", LOW: "border-l-condition-good" };

function RequestCard({ request }: { request: MaintenanceRow }) {
  const due = daysFromToday(request.due_date);
  return (
    <Link
      href={`/maintenance/${request.id}`}
      className={cn("block rounded-xl border border-l-4 border-line bg-surface p-3 shadow-card transition hover:border-accent", severityStripe[request.severity])}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-accent-text">{request.request_code}</span>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={request.status} />
          <StatusBadge status={request.severity} />
          {request.dlp_liable && <StatusBadge status="DLP" label="DLP-liable" tone="accent" />}
          {request.is_overdue && <StatusBadge status="OVERDUE" label={`${-(due ?? 0)}d overdue`} />}
          {request.rejection_count > 0 && <StatusBadge status="REJECTED" label={`Reworked ×${request.rejection_count}`} tone="warning" />}
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-medium">{request.title}</p>
      <p className="mt-1 text-xs text-muted">
        <span className="font-mono">{request.asset_code}</span> · {request.org_unit_name}
      </p>
      <p className="mt-1 font-mono text-[11px] text-muted">Raised {formatDateTime(request.created_at)}</p>
      <p className="mt-1 text-xs text-muted">
        {request.assigned_to_name ? `→ ${request.assigned_to_name}${request.contractor_name && request.assigned_to_role === "CONTRACTOR" ? ` (${request.contractor_name})` : ""}` : "Unassigned"}
        {request.due_date && ` · due ${formatDate(request.due_date)}`}
      </p>
    </Link>
  );
}

export default function MaintenancePage() {
  const { profile } = useAuth();
  const [lane, setLane] = useState("active");
  const [page, setPage] = useState(1);
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [dlp, setDlp] = useState(false);
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const summary = useApi<MaintenanceSummary>("/maintenance-requests/summary");
  const status = lanes.find((item) => item.key === lane)!.statuses;
  const list = useApi<MaintenanceRow[]>("/maintenance-requests", { status, page, limit: LIMIT, mine: mine || undefined, overdue: overdue || undefined, dlp_liable: dlp || undefined, severity, q });
  const counts = summary.data?.by_status ?? {};
  const laneCount = (statuses: string) => statuses.split(",").reduce((sum, item) => sum + (counts[item as keyof typeof counts] ?? 0), 0);
  const total = list.meta?.total ?? 0;
  const toggle = (setter: (fn: (value: boolean) => boolean) => void) => () => {
    setter((value) => !value);
    setPage(1);
  };

  return (
    <AppShell title="Maintenance">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Active requests", value: laneCount("OPEN,ASSIGNED,IN_PROGRESS") },
          { label: "Awaiting verification", value: counts.COMPLETED ?? 0 },
          { label: "Overdue", value: summary.data?.overdue ?? 0, alert: true },
          { label: "Contractor-liable (DLP)", value: summary.data?.dlp_liable_active ?? 0 }
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-line bg-surface p-3 shadow-card">
            <p className="text-xs text-muted">{kpi.label}</p>
            <p className={cn("mt-1 font-heading text-2xl font-semibold", kpi.alert && kpi.value > 0 && "text-condition-critical")}>{summary.loading ? "…" : kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {lanes.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={lane === item.key}
            onClick={() => {
              setLane(item.key);
              setPage(1);
            }}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
              lane === item.key ? "border-accent text-accent-text" : "border-transparent text-muted hover:text-ink"
            )}
          >
            {item.label}
            <span className="rounded-full bg-page px-1.5 text-xs text-muted">{laneCount(item.statuses)}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64">
          <Input aria-label="Search requests" placeholder="Search code, title or asset…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {profile?.role !== "HQ" && (
          <Button size="sm" variant={mine ? "primary" : "secondary"} onClick={toggle(setMine)} aria-pressed={mine}>
            Assigned to me
          </Button>
        )}
        <Button size="sm" variant={overdue ? "primary" : "secondary"} onClick={toggle(setOverdue)} aria-pressed={overdue}>
          Overdue
        </Button>
        <Button size="sm" variant={dlp ? "primary" : "secondary"} onClick={toggle(setDlp)} aria-pressed={dlp}>
          DLP-liable
        </Button>
        <div className="w-40">
          <Select
            aria-label="Severity"
            placeholder="Any severity"
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value);
              setPage(1);
            }}
            options={["HIGH", "MEDIUM", "LOW"].map((value) => ({ value, label: humanize(value) }))}
          />
        </div>
      </div>

      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState title="No requests here" description="Poor inspections raise requests automatically; they appear in Open." />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.data.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
          {total > LIMIT && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted">
              <span>
                Page {page} of {Math.ceil(total / LIMIT)} · {total} requests
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="secondary" disabled={page * LIMIT >= total} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
