"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KpiTile } from "@/components/dashboard/Widgets";
import AppShell from "@/components/layout/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import ProgressBar from "@/components/ui/ProgressBar";
import StatusBadge, { ConditionBadge } from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { DlpAsset, DlpSummary } from "@/types/contractors";
import type { MaintenanceRow } from "@/types/maintenance";

const LIMIT = 25;

export default function DlpPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [tab, setTab] = useState("active");
  const [page, setPage] = useState(1);
  const summary = useApi<DlpSummary>("/dlp/summary");
  const assets = useApi<DlpAsset[]>(tab !== "defects" ? "/dlp/assets" : null, { bucket: tab, page, limit: LIMIT });
  const defects = useApi<MaintenanceRow[]>(tab === "defects" ? "/maintenance-requests" : null, { dlp_liable: true, status: "OPEN,ASSIGNED,IN_PROGRESS,COMPLETED", page, limit: LIMIT });
  const canInspect = profile?.role === "AE" || profile?.role === "EE";
  const s = summary.data;

  const assetColumns: Column<DlpAsset>[] = [
    {
      key: "asset",
      header: "Asset",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-xs text-accent-text">{row.asset_code}</p>
          <p className="max-w-xs truncate font-medium">{row.name}</p>
          <p className="text-xs text-muted">
            {row.type_name} · {row.org_unit_name}
          </p>
        </div>
      )
    },
    {
      key: "contractor",
      header: "Liable contractor",
      render: (row) =>
        row.contractor_name ? (
          <div onClick={(event) => event.stopPropagation()}>
            <Link href={`/contractors/${row.contractor_id}`} className="text-sm font-medium hover:underline">
              {row.contractor_name}
            </Link>
            {row.work_id && (
              <Link href={`/works/${row.work_id}`} className="block font-mono text-[11px] text-accent-text hover:underline">
                {row.work_code}
              </Link>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted">Legacy asset — no origin work</span>
        )
    },
    {
      key: "dlp",
      header: tab === "expired" ? "DLP ended" : "DLP ends",
      render: (row) => {
        const elapsed = row.dlp_total_days > 0 ? Math.min(100, Math.max(0, ((row.dlp_total_days - row.days_remaining) / row.dlp_total_days) * 100)) : 100;
        return (
          <div className="w-36">
            <p className="text-sm">{formatDate(row.dlp_end_date)}</p>
            <p className={`text-xs ${row.days_remaining < 0 ? "text-muted" : row.days_remaining <= 30 ? "font-semibold text-condition-critical" : "text-muted"}`}>
              {row.days_remaining < 0 ? `${-row.days_remaining} days ago` : `${row.days_remaining} days left`}
            </p>
            <ProgressBar value={elapsed} className="mt-1" />
          </div>
        );
      }
    },
    {
      key: "defects",
      header: "Liable defects",
      render: (row) => (
        <span className="text-sm">
          {row.defects_open > 0 ? <StatusBadge status="OPEN" label={`${row.defects_open} open`} tone="danger" /> : <span className="text-muted">none open</span>}
          <span className="ml-1 text-xs text-muted">/ {row.defects_total} total</span>
        </span>
      )
    },
    { key: "condition", header: "Condition", render: (row) => <ConditionBadge rating={row.condition_rating} /> },
    {
      key: "action",
      header: "",
      render: (row) =>
        canInspect && tab === "expiring" ? (
          <span onClick={(event) => event.stopPropagation()}>
            <ButtonLink href={`/inspections/new?asset=${row.id}`} size="sm">
              End-of-DLP inspection
            </ButtonLink>
          </span>
        ) : null
    }
  ];

  const defectColumns: Column<MaintenanceRow>[] = [
    {
      key: "request",
      header: "Defect",
      render: (row) => (
        <div>
          <p className="font-mono text-xs text-accent-text">{row.request_code}</p>
          <p className="max-w-sm truncate text-sm font-medium">{row.title}</p>
          <p className="font-mono text-[11px] text-muted">Raised {formatDateTime(row.created_at)}</p>
        </div>
      )
    },
    { key: "asset", header: "Asset", render: (row) => <span className="font-mono text-xs">{row.asset_code}</span> },
    { key: "contractor", header: "Contractor", render: (row) => <span className="text-sm">{row.contractor_name ?? "—"}</span> },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "due",
      header: "Due",
      render: (row) => (row.is_overdue ? <StatusBadge status="OVERDUE" label={`Overdue · ${formatDate(row.due_date)}`} /> : <span className="text-sm">{formatDate(row.due_date)}</span>)
    }
  ];

  return (
    <AppShell title="DLP tracker" subtitle="Assets inside their defect liability period — defects are repaired by the original contractor at their cost" allowedRoles={["HQ", "EE", "AE"]}>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiTile label="Assets in DLP" value={s?.in_dlp ?? "…"} />
        <KpiTile label="DLP ending ≤ 30 days" value={s?.expiring_30 ?? "…"} hint="Schedule end-of-DLP inspections" tone={s?.expiring_30 ? "warn" : "default"} />
        <KpiTile label="Liable defects open" value={s?.liable_open ?? "…"} hint={s ? `${s.liable_overdue} overdue` : undefined} tone={s?.liable_overdue ? "alert" : "default"} />
        <KpiTile label="Avg fix time" value={s?.avg_fix_days != null ? `${s.avg_fix_days} d` : "—"} hint={s ? `${s.liable_fixed} fixed under DLP` : undefined} />
        <KpiTile label="DLP ended (90 days)" value={s?.expired_90 ?? "…"} />
      </div>
      <div className="mb-4">
        <Tabs
          active={tab}
          onChange={(key) => {
            setTab(key);
            setPage(1);
          }}
          tabs={[
            { key: "active", label: "In DLP", count: s?.in_dlp },
            { key: "expiring", label: "Ending soon", count: s?.expiring_30 },
            { key: "defects", label: "Liable defects", count: s?.liable_open },
            { key: "expired", label: "Recently ended", count: s?.expired_90 }
          ]}
        />
      </div>
      {tab === "defects" ? (
        <Table
          columns={defectColumns}
          rows={defects.data ?? []}
          rowKey={(row) => row.id}
          loading={defects.loading}
          error={defects.error}
          onRetry={defects.reload}
          onRowClick={(row) => router.push(`/maintenance/${row.id}`)}
          emptyTitle="No open contractor-liable defects"
          pagination={{ page, limit: LIMIT, total: defects.meta?.total ?? 0, onPageChange: setPage }}
        />
      ) : (
        <Table
          columns={assetColumns}
          rows={assets.data ?? []}
          rowKey={(row) => row.id}
          loading={assets.loading}
          error={assets.error}
          onRetry={assets.reload}
          onRowClick={(row) => router.push(`/assets/${row.id}`)}
          emptyTitle={tab === "expiring" ? "No DLP ends in the next 30 days" : tab === "expired" ? "No DLP ended in the last 90 days" : "No assets in DLP"}
          pagination={{ page, limit: LIMIT, total: assets.meta?.total ?? 0, onPageChange: setPage }}
        />
      )}
    </AppShell>
  );
}
