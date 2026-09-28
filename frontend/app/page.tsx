"use client";

import Link from "next/link";
import { useState } from "react";
import { ConditionByArea, KpiTile, PipelineMini, PriorityAssets, RiskBands } from "@/components/dashboard/Widgets";
import AppShell from "@/components/layout/AppShell";
import Button, { ButtonLink } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Loading from "@/components/ui/Loading";
import ProgressBar from "@/components/ui/ProgressBar";
import StatusBadge from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysFromToday, formatDate, formatRupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { AssetListRow } from "@/types/assets";
import type { MaintenanceRow } from "@/types/maintenance";
import type { Programme, WorkListRow } from "@/types/works";

type Summary = {
  assets: { total: number; critical: number; high: number; medium: number; low: number; overdue_inspections: number; in_dlp: number; under_maintenance: number; in_pipeline: number; poor_or_worse: number };
  maintenance: { active: number; unassigned: number; awaiting_verification: number; overdue: number; dlp_liable_open: number; assigned_to_me: number; spent_last_year: number };
  works: { active: number; delayed: number; in_construction: number; closed: number; sanctioned: number; contracted: number };
  my_work: { tasks_to_do: number; returned: number };
  evaluations?: Array<{ total_score: number; work_id: string; work_code: string; title: string; evaluated_at: string; schedule_score: number; quality_score: number }>;
};

type Inbox = { assigned: Array<{ id: string }>; to_review: Array<{ id: string }>; gates: Array<{ stage_id: string; stage_name: string; work_id: string; work_code: string; work_title: string }> };

function DelayedWorks() {
  const list = useApi<WorkListRow[]>("/works", { delayed: true, active: true, limit: 5 });
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data?.length) return <EmptyState title="No delayed works" description="Every active stage is within its planned duration." />;
  return (
    <ul className="divide-y divide-line">
      {list.data.map((work) => (
        <li key={work.id}>
          <Link href={`/works/${work.id}`} className="block py-2 hover:bg-page">
            <p className="truncate text-sm font-medium">{work.title}</p>
            <p className="text-xs text-muted">
              <span className="font-mono">{work.work_code}</span> · {work.current_stage_name} · {work.days_in_stage} days in stage
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Programmes() {
  const list = useApi<Programme[]>("/programmes");
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  return (
    <ul className="space-y-3">
      {(list.data ?? []).map((programme) => {
        const allocated = Number(programme.allocated_amount);
        return (
          <li key={programme.id}>
            <Link href={`/works?programme_id=${programme.id}`} className="block">
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate">{programme.name}</span>
                <span className="shrink-0 font-mono text-xs">{formatRupees(Number(programme.sanctioned_total))} / {formatRupees(allocated)}</span>
              </div>
              <ProgressBar value={allocated ? (Number(programme.sanctioned_total) / allocated) * 100 : 0} className="mt-1" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function OverdueInspections({ canInspect }: { canInspect: boolean }) {
  const list = useApi<AssetListRow[]>("/inspections/overdue", { limit: 6 });
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data?.length) return <EmptyState title="Nothing overdue" description="All your assets are within their inspection interval." />;
  return (
    <ul className="divide-y divide-line">
      {list.data.map((asset) => (
        <li key={asset.id} className="flex items-center justify-between gap-2 py-2">
          <Link href={`/assets/${asset.id}`} className="min-w-0 hover:underline">
            <p className="truncate text-sm font-medium">{asset.name}</p>
            <p className="text-xs text-muted">
              <span className="font-mono">{asset.asset_code}</span> · <span className="text-condition-critical">{-(daysFromToday(asset.next_inspection_due) ?? 0)}d overdue</span>
            </p>
          </Link>
          {canInspect && (
            <ButtonLink href={`/inspections/new?asset=${asset.id}`} size="sm">
              Inspect
            </ButtonLink>
          )}
        </li>
      ))}
    </ul>
  );
}

function MyRepairs({ query, empty }: { query: Record<string, string | boolean>; empty: string }) {
  const list = useApi<MaintenanceRow[]>("/maintenance-requests", { ...query, limit: 6 });
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data?.length) return <EmptyState title={empty} />;
  return (
    <ul className="divide-y divide-line">
      {list.data.map((request) => (
        <li key={request.id}>
          <Link href={`/maintenance/${request.id}`} className="block py-2 hover:bg-page">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs text-accent-text">{request.request_code}</span>
              <div className="flex gap-1">
                <StatusBadge status={request.status} />
                {request.dlp_liable && <StatusBadge status="DLP" label="DLP-liable" tone="accent" />}
                {request.is_overdue && <StatusBadge status="OVERDUE" />}
              </div>
            </div>
            <p className="truncate text-sm">{request.title}</p>
            <p className="text-xs text-muted">{request.due_date && `Due ${formatDate(request.due_date)}`}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GatesAwaiting() {
  const inbox = useApi<Inbox>("/tasks/mine");
  if (inbox.loading) return <Loading />;
  if (inbox.error || !inbox.data) return <ErrorState message={inbox.error ?? undefined} onRetry={inbox.reload} />;
  const { gates, to_review, assigned } = inbox.data;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Tasks to do", value: assigned.length },
          { label: "To review", value: to_review.length },
          { label: "Gates", value: gates.length }
        ].map((item) => (
          <Link key={item.label} href="/tasks" className="rounded-lg bg-page p-2 hover:bg-accent-soft">
            <p className="font-heading text-xl font-semibold">{item.value}</p>
            <p className="text-[11px] text-muted">{item.label}</p>
          </Link>
        ))}
      </div>
      {gates.length > 0 && (
        <ul className="divide-y divide-line">
          {gates.slice(0, 4).map((gate) => (
            <li key={gate.stage_id}>
              <Link href={`/works/${gate.work_id}`} className="block py-2 text-sm hover:bg-page">
                <span className="font-medium">{gate.stage_name} gate</span>
                <span className="block truncate text-xs text-muted">
                  {gate.work_code} · {gate.work_title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecomputeButton({ onDone }: { onDone: () => void }) {
  const { token } = useAuth();
  const [state, setState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {state && <span className="hidden text-xs text-muted sm:inline">{state}</span>}
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { data } = await api<{ assets: number; changed: number; ms: number }>("/risk/recompute", { method: "POST", token });
            setState(`${data.assets} assets rescored in ${data.ms} ms (${data.changed} changed)`);
            onDone();
          } catch (caught) {
            setState((caught as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Recompute risk
      </Button>
    </div>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const summary = useApi<Summary>("/dashboard/summary");
  const [refreshKey, setRefreshKey] = useState(0);
  const s = summary.data;
  const role = profile?.role;

  const title =
    role === "HQ" ? "State dashboard" : role === "EE" ? `${profile?.orgUnit.name} dashboard` : role === "AE" ? "My field dashboard" : role === "CONTRACTOR" ? "My contracts" : "Dashboard";

  return (
    <AppShell
      title={title}
      headerRight={
        role === "HQ" && (
          <RecomputeButton
            onDone={() => {
              summary.reload();
              setRefreshKey((key) => key + 1);
            }}
          />
        )
      }
    >
      {summary.loading && !s ? (
        <Loading label="Loading dashboard…" />
      ) : summary.error || !s ? (
        <ErrorState message={summary.error ?? undefined} onRetry={summary.reload} />
      ) : (
        <div key={refreshKey} className="space-y-4">
          {role === "CONTRACTOR" ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiTile label="Active works" value={s.works.active} href="/works" />
                <KpiTile label="Milestones / tasks to submit" value={s.my_work.tasks_to_do} hint={s.my_work.returned ? `${s.my_work.returned} returned for rework` : undefined} href="/tasks" tone={s.my_work.returned ? "warn" : "default"} />
                <KpiTile label="Defects you are liable for (DLP)" value={s.maintenance.dlp_liable_open} href="/maintenance" tone={s.maintenance.dlp_liable_open ? "alert" : "good"} />
                <KpiTile label="Repairs assigned to you" value={s.maintenance.assigned_to_me} href="/maintenance" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Defects under your liability" subtitle="Rectify at your cost within the defect liability period">
                  <MyRepairs query={{ dlp_liable: true, status: "OPEN,ASSIGNED,IN_PROGRESS" }} empty="No open DLP defects" />
                </Card>
                <Card title="Your evaluation results" subtitle="Recorded by the department at work closure">
                  {s.evaluations?.length ? (
                    <ul className="divide-y divide-line">
                      {s.evaluations.map((evaluation) => (
                        <li key={evaluation.work_id}>
                          <Link href={`/works/${evaluation.work_id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-page">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{evaluation.title}</p>
                              <p className="text-xs text-muted">
                                <span className="font-mono">{evaluation.work_code}</span> · {formatDate(evaluation.evaluated_at)}
                              </p>
                            </div>
                            <span className="font-heading text-xl font-semibold">{Number(evaluation.total_score)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="No evaluations yet" />
                  )}
                </Card>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <KpiTile label={role === "AE" ? "Assets in my area" : "Assets"} value={s.assets.total.toLocaleString("en-IN")} hint={`${s.assets.in_pipeline} planned / under construction`} href="/assets" />
                <KpiTile label="Critical + high risk" value={s.assets.critical + s.assets.high} hint={`${s.assets.critical} critical`} href="/assets?risk_band=CRITICAL" tone={s.assets.critical ? "alert" : "warn"} />
                <KpiTile label="Inspections overdue" value={s.assets.overdue_inspections} href="/inspections" tone={s.assets.overdue_inspections ? "warn" : "good"} />
                <KpiTile
                  label={role === "AE" ? "Repairs assigned to me" : role === "EE" ? "Repairs to assign" : "Maintenance backlog"}
                  value={role === "AE" ? s.maintenance.assigned_to_me : role === "EE" ? s.maintenance.unassigned : s.maintenance.active}
                  hint={`${s.maintenance.overdue} overdue · ${s.maintenance.awaiting_verification} to verify`}
                  href="/maintenance"
                  tone={s.maintenance.overdue ? "alert" : "default"}
                />
                <KpiTile label="Active works" value={s.works.active} hint={s.works.delayed ? `${s.works.delayed} delayed` : "none delayed"} href="/works" tone={s.works.delayed ? "warn" : "default"} />
                <KpiTile label="Assets in DLP" value={s.assets.in_dlp} hint={`${s.maintenance.dlp_liable_open} contractor-liable defects open`} href="/assets?in_dlp=true" />
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Card title="Top priority assets" subtitle="Ranked by explainable risk — click “why?” on any row">
                  <PriorityAssets limit={role === "AE" ? 5 : 10} />
                </Card>
                <div className="space-y-4">
                  <Card title="Risk profile">
                    <RiskBands counts={s.assets} />
                  </Card>
                  {role === "AE" ? (
                    <>
                      <Card title="Inspections due" subtitle="Oldest first">
                        <OverdueInspections canInspect />
                      </Card>
                      <Card title="My repairs">
                        <MyRepairs query={{ mine: true, status: "ASSIGNED,IN_PROGRESS" }} empty="No repairs assigned to you" />
                      </Card>
                    </>
                  ) : (
                    <>
                      {role === "EE" && (
                        <Card title="My desk" subtitle="Tasks, submissions and gates waiting on you">
                          <GatesAwaiting />
                        </Card>
                      )}
                      <Card title="Works pipeline by stage">
                        <PipelineMini />
                      </Card>
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <Card title={role === "HQ" ? "Condition by district" : "Condition by sub-division"}>
                  <ConditionByArea />
                </Card>
                <div className="space-y-4">
                  {role === "HQ" && (
                    <Card title="Programmes — sanctioned vs allocation">
                      <Programmes />
                    </Card>
                  )}
                  {role !== "AE" && (
                    <Card title="Delayed works" subtitle="Current stage past its planned duration">
                      <DelayedWorks />
                    </Card>
                  )}
                  {role === "EE" && (
                    <Card title="Awaiting verification" subtitle="Independent check before closing">
                      <MyRepairs query={{ status: "COMPLETED" }} empty="Nothing waiting for verification" />
                    </Card>
                  )}
                  {role === "AE" && (
                    <Card title="My work tasks">
                      <GatesAwaiting />
                    </Card>
                  )}
                </div>
              </div>

              <p className="text-center text-xs text-muted">
                Risk weights are illustrative and configurable (PRD §9). Suggestions support the officer&apos;s decision; nothing is auto-approved.
                {role === "HQ" && <> · Maintenance spend last 12 months: {formatRupees(Number(s.maintenance.spent_last_year))}</>}
              </p>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
