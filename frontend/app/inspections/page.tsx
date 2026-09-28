"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RiskBadge } from "@/components/assets/RiskBadge";
import AppShell from "@/components/layout/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import StatusBadge, { ConditionBadge, humanize } from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";
import { useAuth } from "@/lib/auth";
import { daysFromToday, formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { AssetListRow } from "@/types/assets";
import type { InspectionRow } from "@/types/inspections";

const LIMIT = 20;

export default function InspectionsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [tab, setTab] = useState("overdue");
  const [page, setPage] = useState(1);
  const canInspect = profile?.role === "AE" || profile?.role === "EE";
  const overdue = useApi<AssetListRow[]>(tab === "overdue" ? "/inspections/overdue" : null, { page, limit: LIMIT });
  const recent = useApi<InspectionRow[]>(tab === "recent" ? "/inspections" : null, { page, limit: LIMIT });

  const overdueColumns: Column<AssetListRow>[] = [
    {
      key: "asset",
      header: "Asset",
      render: (row) => (
        <div>
          <p className="font-mono text-xs text-accent-text">{row.asset_code}</p>
          <p className="max-w-xs truncate font-medium">{row.name}</p>
          <p className="text-xs text-muted">
            {row.type_name} · {row.org_unit_name}
          </p>
        </div>
      )
    },
    { key: "overdue", header: "Overdue by", render: (row) => <StatusBadge status="OVERDUE" label={`${-(daysFromToday(row.next_inspection_due) ?? 0)} days`} /> },
    { key: "condition", header: "Last condition", render: (row) => <ConditionBadge rating={row.condition_rating} /> },
    { key: "risk", header: "Risk", render: (row) => <RiskBadge score={row.risk_score} band={row.risk_band} /> },
    {
      key: "action",
      header: "",
      render: (row) =>
        canInspect ? (
          <span onClick={(event) => event.stopPropagation()}>
            <ButtonLink href={`/inspections/new?asset=${row.id}`} size="sm">
              Inspect
            </ButtonLink>
          </span>
        ) : null
    }
  ];

  const recentColumns: Column<InspectionRow>[] = [
    {
      key: "when",
      header: "Inspection",
      render: (row) => (
        <div>
          <p className="font-mono text-xs">{row.inspection_code}</p>
          <p className="text-xs text-muted">{formatDateTime(row.inspected_at)}</p>
        </div>
      )
    },
    {
      key: "asset",
      header: "Asset",
      render: (row) => (
        <div>
          <p className="font-mono text-xs text-accent-text">{row.asset_code}</p>
          <p className="max-w-xs truncate">{row.asset_name}</p>
        </div>
      )
    },
    {
      key: "condition",
      header: "Condition",
      render: (row) => (
        <span className="flex items-center gap-1">
          {row.previous_condition && <span className="text-xs text-muted">{row.previous_condition} →</span>}
          <ConditionBadge rating={row.condition_rating} />
        </span>
      )
    },
    { key: "severity", header: "Severity", render: (row) => <StatusBadge status={row.severity} /> },
    { key: "by", header: "Inspector", render: (row) => <span className="text-sm">{row.inspector_name ?? "—"}</span> },
    {
      key: "outcome",
      header: "Outcome",
      render: (row) => (row.request_code ? <StatusBadge status="OPEN" label={row.request_code} tone="warning" /> : <span className="text-xs text-muted">{humanize(row.status)}</span>)
    }
  ];

  return (
    <AppShell
      title="Inspections"
      allowedRoles={["HQ", "EE", "AE"]}
      headerRight={
        canInspect && (
          <ButtonLink href="/inspections/new" size="sm">
            + New inspection
          </ButtonLink>
        )
      }
    >
      <div className="mb-4">
        <Tabs
          active={tab}
          onChange={(key) => {
            setTab(key);
            setPage(1);
          }}
          tabs={[
            { key: "overdue", label: "Overdue", count: overdue.meta?.total },
            { key: "recent", label: "Recent inspections" }
          ]}
        />
      </div>
      {tab === "overdue" ? (
        <Table
          columns={overdueColumns}
          rows={overdue.data ?? []}
          rowKey={(row) => row.id}
          loading={overdue.loading}
          error={overdue.error}
          onRetry={overdue.reload}
          onRowClick={(row) => router.push(`/assets/${row.id}`)}
          emptyTitle="Nothing overdue"
          emptyDescription="Every asset in your jurisdiction is within its inspection interval."
          pagination={{ page, limit: LIMIT, total: overdue.meta?.total ?? 0, onPageChange: setPage }}
        />
      ) : (
        <Table
          columns={recentColumns}
          rows={recent.data ?? []}
          rowKey={(row) => row.id}
          loading={recent.loading}
          error={recent.error}
          onRetry={recent.reload}
          onRowClick={(row) => router.push(`/assets/${row.asset_id}`)}
          emptyTitle="No inspections yet"
          pagination={{ page, limit: LIMIT, total: recent.meta?.total ?? 0, onPageChange: setPage }}
        />
      )}
    </AppShell>
  );
}
