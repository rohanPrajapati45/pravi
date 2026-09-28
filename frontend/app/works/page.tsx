"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import Button, { ButtonLink } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import ProgressBar from "@/components/ui/ProgressBar";
import Select from "@/components/ui/Select";
import StatusBadge, { humanize } from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { Programme, WorkListRow } from "@/types/works";

const LIMIT = 20;

const columns: Column<WorkListRow>[] = [
  {
    key: "work",
    header: "Work",
    render: (row) => (
      <div className="min-w-0">
        <p className="font-mono text-xs text-accent-text">{row.work_code}</p>
        <p className="max-w-sm truncate font-medium">{row.title}</p>
        <p className="text-xs text-muted">
          {row.template_name} · {row.org_unit_name}
        </p>
      </div>
    )
  },
  {
    key: "stage",
    header: "Current stage",
    render: (row) =>
      row.current_stage_name ? (
        <div className="text-sm">
          <p>{row.current_stage_name}</p>
          <p className="text-xs text-muted">
            {row.days_in_stage} days in stage {row.is_delayed && <StatusBadge status="OVERDUE" label="Delayed" className="ml-1" />}
          </p>
        </div>
      ) : (
        <span className="text-sm text-muted">—</span>
      )
  },
  {
    key: "progress",
    header: "Progress",
    render: (row) => (
      <div className="w-28">
        <ProgressBar value={Number(row.progress_pct)} />
        <p className="mt-1 text-xs text-muted">{Number(row.progress_pct)}% physical</p>
      </div>
    )
  },
  {
    key: "value",
    header: "Value",
    render: (row) => (
      <div className="text-sm">
        <p>{formatRupees(row.contract_value ?? row.sanctioned_amount ?? row.estimated_cost)}</p>
        <p className="text-xs text-muted">{row.contract_value ? "contract" : row.sanctioned_amount ? "sanctioned" : "estimate"}</p>
      </div>
    )
  },
  { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> }
];

function WorksList() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState(params.get("stage") ?? "");
  const [programmeId, setProgrammeId] = useState(params.get("programme_id") ?? "");
  const [delayed, setDelayed] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const pipeline = useApi<Array<{ seq: number; code: string; name: string; works: number; delayed: number }>>("/works/pipeline");
  const programmes = useApi<Programme[]>("/programmes");
  const list = useApi<WorkListRow[]>("/works", { page, limit: LIMIT, q, stage_code: stage, programme_id: programmeId, delayed: delayed || undefined, active: showClosed ? undefined : true });

  const stages = (pipeline.data ?? []).reduce<Array<{ code: string; name: string; works: number; delayed: number; seq: number }>>((all, row) => {
    const existing = all.find((item) => item.code === row.code);
    if (existing) {
      existing.works += row.works;
      existing.delayed += row.delayed;
    } else all.push({ ...row });
    return all;
  }, []);

  return (
    <AppShell
      title="Works"
      headerRight={
        profile && ["HQ", "EE"].includes(profile.role) && (
          <ButtonLink href="/works/new" size="sm">
            + Initiate work
          </ButtonLink>
        )
      }
    >
      <section className="mb-4 rounded-xl border border-line bg-surface p-3 shadow-card">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Pipeline by stage — click to filter</p>
        {pipeline.loading ? (
          <Loading className="py-4" />
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {stages.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => {
                  setStage(stage === item.code ? "" : item.code);
                  setPage(1);
                }}
                aria-pressed={stage === item.code}
                className={cn(
                  "min-w-[8.5rem] shrink-0 rounded-lg border px-3 py-2 text-left transition",
                  stage === item.code ? "border-accent bg-accent-soft" : "border-line hover:border-accent"
                )}
              >
                <p className="truncate text-xs text-muted">{item.name}</p>
                <p className="font-heading text-xl font-semibold">{item.works}</p>
                {item.delayed > 0 && <p className="text-xs text-condition-critical">{item.delayed} delayed</p>}
              </button>
            ))}
            {!stages.length && <p className="text-sm text-muted">No active works in your jurisdiction.</p>}
          </div>
        )}
      </section>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-72">
          <Input aria-label="Search works" placeholder="Search work code or title…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="w-full sm:w-72">
          <Select
            aria-label="Programme"
            placeholder="All programmes"
            value={programmeId}
            onChange={(event) => {
              setProgrammeId(event.target.value);
              setPage(1);
            }}
            options={(programmes.data ?? []).map((programme) => ({ value: programme.id, label: programme.name }))}
          />
        </div>
        <Button size="sm" variant={delayed ? "primary" : "secondary"} aria-pressed={delayed} onClick={() => setDelayed(!delayed)}>
          Delayed only
        </Button>
        <Button size="sm" variant={showClosed ? "primary" : "secondary"} aria-pressed={showClosed} onClick={() => setShowClosed(!showClosed)}>
          Include closed
        </Button>
        {stage && (
          <Button size="sm" variant="ghost" onClick={() => setStage("")}>
            Stage: {humanize(stage)} ✕
          </Button>
        )}
      </div>

      <Table
        columns={columns}
        rows={list.data ?? []}
        rowKey={(row) => row.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={(row) => router.push(`/works/${row.id}`)}
        emptyTitle="No works match"
        emptyDescription="Initiate a work from a programme, directive or field need."
        pagination={{ page, limit: LIMIT, total: list.meta?.total ?? 0, onPageChange: setPage }}
      />
    </AppShell>
  );
}

export default function WorksPage() {
  return (
    <Suspense fallback={<Loading />}>
      <WorksList />
    </Suspense>
  );
}
