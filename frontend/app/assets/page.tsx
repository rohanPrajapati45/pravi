"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RiskBadge } from "@/components/assets/RiskBadge";
import AppShell from "@/components/layout/AppShell";
import Button, { ButtonLink } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import StatusBadge, { ConditionBadge, humanize } from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { useAuth } from "@/lib/auth";
import { daysFromToday, formatChainage } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { DISTRICTS, LIFECYCLE_STATUSES, RISK_BANDS, type AssetListRow, type AssetType } from "@/types/assets";

const LIMIT = 20;

const columns: Column<AssetListRow>[] = [
  {
    key: "asset",
    header: "Asset",
    render: (row) => (
      <div className="min-w-0">
        <p className="font-mono text-xs text-accent-text">{row.asset_code}</p>
        <p className="max-w-xs truncate font-medium">{row.name}</p>
        <p className="text-xs text-muted">
          {row.type_name}
          {row.parent_id && " · component"}
        </p>
      </div>
    )
  },
  {
    key: "location",
    header: "Location",
    render: (row) => (
      <div className="text-sm">
        <p>{row.district ?? "—"}</p>
        <p className="text-xs text-muted">{formatChainage(row.start_chainage_km, row.end_chainage_km) ?? row.org_unit_name}</p>
      </div>
    )
  },
  { key: "status", header: "Status", render: (row) => <StatusBadge status={row.lifecycle_status} /> },
  { key: "condition", header: "Condition", render: (row) => <ConditionBadge rating={row.condition_rating} /> },
  { key: "risk", header: "Risk", render: (row) => <RiskBadge score={row.risk_score} band={row.risk_band} /> },
  {
    key: "due",
    header: "Next inspection",
    render: (row) => {
      const days = daysFromToday(row.next_inspection_due);
      if (days === null) return <span className="text-muted">—</span>;
      return days < 0 ? <StatusBadge status="OVERDUE" label={`${-days}d overdue`} /> : <span className="text-sm">in {days}d</span>;
    }
  }
];

type Filters = { q: string; type_id: string; district: string; status: string; condition: string; risk_band: string; sort: string; overdue: string };
const empty: Filters = { q: "", type_id: "", district: "", status: "", condition: "", risk_band: "", sort: "risk", overdue: "" };

export default function AssetsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [filters, setFilters] = useState<Filters>(empty);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const types = useApi<AssetType[]>("/asset-types");

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => ({ ...current, q: search.trim() }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const list = useApi<AssetListRow[]>("/assets", { ...filters, page, limit: LIMIT });
  const setFilter = (key: keyof Filters) => (event: { target: { value: string } }) => {
    setFilters((current) => ({ ...current, [key]: event.target.value }));
    setPage(1);
  };
  const canCreate = profile && ["HQ", "EE", "AE"].includes(profile.role);
  const active = Object.entries(filters).filter(([key, value]) => value && key !== "sort").length;

  return (
    <AppShell
      title="Asset registry"
      headerRight={
        canCreate && (
          <ButtonLink href="/assets/new" size="sm">
            + New asset
          </ButtonLink>
        )
      }
    >
      <div className="mb-4 rounded-xl border border-line bg-surface p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input aria-label="Search" placeholder="Search name, asset code or road code…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Button variant="secondary" className="sm:hidden" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters}>
              Filters{active ? ` (${active})` : ""}
            </Button>
          </div>
          <div className={showFilters ? "contents" : "hidden sm:contents"}>
          <Select aria-label="Type" placeholder="All types" value={filters.type_id} onChange={setFilter("type_id")} options={(types.data ?? []).map((type) => ({ value: type.id, label: type.name }))} />
          <Select aria-label="District" placeholder="All districts" value={filters.district} onChange={setFilter("district")} options={DISTRICTS.map((district) => ({ value: district, label: district }))} />
          <Select aria-label="Status" placeholder="Any status" value={filters.status} onChange={setFilter("status")} options={LIFECYCLE_STATUSES.map((status) => ({ value: status, label: humanize(status) }))} />
          <Select
            aria-label="Condition"
            placeholder="Any condition"
            value={filters.condition}
            onChange={setFilter("condition")}
            options={[5, 4, 3, 2, 1].map((rating) => ({ value: String(rating), label: `${rating} · ${["", "Critical", "Poor", "Moderate", "Good", "Excellent"][rating]}` }))}
          />
          <Select aria-label="Risk band" placeholder="Any risk" value={filters.risk_band} onChange={setFilter("risk_band")} options={RISK_BANDS.map((band) => ({ value: band, label: humanize(band) }))} />
          <Select
            aria-label="Inspection"
            placeholder="Any inspection state"
            value={filters.overdue}
            onChange={setFilter("overdue")}
            options={[{ value: "true", label: "Inspection overdue" }]}
          />
          <Select
            aria-label="Sort"
            value={filters.sort}
            onChange={setFilter("sort")}
            options={[
              { value: "risk", label: "Sort: highest risk" },
              { value: "condition", label: "Sort: worst condition" },
              { value: "due", label: "Sort: inspection due" },
              { value: "code", label: "Sort: asset code" },
              { value: "updated", label: "Sort: recently updated" }
            ]}
          />
          </div>
        </div>
        {active > 0 && (
          <button
            type="button"
            className="mt-2 text-sm text-accent-text underline"
            onClick={() => {
              setFilters(empty);
              setSearch("");
              setPage(1);
            }}
          >
            Clear {active} filter{active > 1 ? "s" : ""}
          </button>
        )}
      </div>

      <Table
        columns={columns}
        rows={list.data ?? []}
        rowKey={(row) => row.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={(row) => router.push(`/assets/${row.id}`)}
        emptyTitle="No assets match"
        emptyDescription={active ? "Try removing a filter." : "No assets are registered in your jurisdiction yet."}
        pagination={{ page, limit: LIMIT, total: list.meta?.total ?? 0, onPageChange: setPage }}
      />
    </AppShell>
  );
}
