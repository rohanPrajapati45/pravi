"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { KpiTile } from "@/components/dashboard/Widgets";
import AppShell from "@/components/layout/AppShell";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Loading from "@/components/ui/Loading";
import ProgressBar from "@/components/ui/ProgressBar";
import StatusBadge from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { ContractorDetail } from "@/types/contractors";

const scoreRows = [
  { key: "schedule", label: "Schedule", max: 30 },
  { key: "quality", label: "Quality", max: 30 },
  { key: "rework", label: "Rework", max: 15 },
  { key: "dlp", label: "DLP defects", max: 15 },
  { key: "documentation", label: "Documentation", max: 10 }
] as const;

const tone = (score: number | null) => (score == null ? "text-muted" : score >= 80 ? "text-condition-excellent" : score >= 60 ? "text-condition-moderate" : "text-condition-critical");

type Work = ContractorDetail["works"][number];

export default function ContractorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const detail = useApi<ContractorDetail>(`/contractors/${id}/performance`);
  const own = profile?.role === "CONTRACTOR";

  const workColumns: Column<Work>[] = [
    {
      key: "work",
      header: "Work",
      render: (row) => (
        <div>
          <p className="font-mono text-xs text-accent-text">{row.work_code}</p>
          <p className="max-w-xs truncate font-medium">{row.title}</p>
          <p className="text-xs text-muted">{row.org_unit_name}</p>
        </div>
      )
    },
    { key: "stage", header: "Status", render: (row) => <div><StatusBadge status={row.status} />{row.current_stage_name && <p className="mt-0.5 text-xs text-muted">{row.current_stage_name}</p>}</div> },
    { key: "value", header: "Contract", render: (row) => <span className="text-sm">{formatRupees(row.contract_value)}</span> },
    {
      key: "schedule",
      header: "Schedule",
      render: (row) => (
        <div className="text-xs">
          <p>
            {formatDate(row.start_date)} → {formatDate(row.actual_end ?? row.planned_end)}
            {row.actual_end && " (actual)"}
          </p>
          {row.delay_days != null && row.delay_days > 0 && <StatusBadge status="LATE" label={`${row.delay_days} d late`} tone="warning" />}
          {row.delay_days != null && row.delay_days <= 0 && <StatusBadge status="ON_TIME" label="On time" tone="success" />}
          {row.running_late && <StatusBadge status="LATE" label="Past planned end" tone="danger" />}
        </div>
      )
    },
    {
      key: "progress",
      header: "Progress",
      render: (row) => (
        <div className="w-24">
          <ProgressBar value={Number(row.progress_pct)} />
          <p className="mt-0.5 text-xs text-muted">{Number(row.progress_pct)}%</p>
        </div>
      )
    }
  ];

  if (detail.loading && !detail.data) {
    return (
      <AppShell title="Contractor">
        <Loading />
      </AppShell>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <AppShell title="Contractor">
        <ErrorState title={detail.status === 403 ? "Not your firm" : "Could not load contractor"} message={detail.error ?? undefined} onRetry={detail.status === 403 ? undefined : detail.reload} />
      </AppShell>
    );
  }

  const c = detail.data;

  return (
    <AppShell title={own ? "My performance" : c.name} subtitle={own ? `${c.name} — how the department sees your works` : `Contractor ${c.code}${c.class ? ` · class ${c.class}` : ""}`} allowedRoles={["HQ", "EE", "CONTRACTOR"]}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div>
          <p className="text-lg font-semibold">{c.name}</p>
          <p className="text-sm text-muted">{[c.contact_name, c.contact_phone, c.contact_email].filter(Boolean).join(" · ") || "No contact recorded"}</p>
          {!c.is_active && <StatusBadge status="INACTIVE" label="Inactive — cannot be awarded new works" tone="neutral" className="mt-2" />}
        </div>
        <div className="text-right">
          <p className={cn("font-heading text-4xl font-semibold leading-none", tone(c.avg_score))}>{c.avg_score ?? "—"}</p>
          <p className="mt-1 text-xs text-muted">average closure score (0–100)</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Active works" value={c.active_works} hint={formatRupees(c.active_value)} />
        <KpiTile label="Completed works" value={c.completed_works} hint={`${formatRupees(c.total_value)} total`} />
        <KpiTile label="On-time completion" value={c.on_time_pct == null ? "—" : `${c.on_time_pct}%`} hint={c.avg_delay_days != null ? `avg ${c.avg_delay_days} d late` : undefined} tone={c.on_time_pct != null && c.on_time_pct < 60 ? "warn" : "default"} />
        <KpiTile label="First-pass milestones" value={c.first_pass_pct == null ? "—" : `${c.first_pass_pct}%`} hint={`${c.milestones_reviewed} reviewed`} />
        <KpiTile label="DLP defects open" value={c.dlp_open} hint={`${c.dlp_defects} raised in total`} tone={c.dlp_open ? "alert" : "good"} />
        <KpiTile label="Avg DLP fix time" value={c.dlp_avg_fix_days != null ? `${c.dlp_avg_fix_days} d` : "—"} tone={c.running_late ? "warn" : "default"} hint={c.running_late ? `${c.running_late} work(s) past planned end` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Works" subtitle="Awarded works in your jurisdiction" bodyClassName="p-0">
            <Table columns={workColumns} rows={c.works} rowKey={(row) => row.id} onRowClick={(row) => router.push(`/works/${row.id}`)} emptyTitle="No works awarded" />
          </Card>
          <Card title="Defects under liability (DLP)" subtitle="Raised automatically from inspections of assets this firm built">
            {c.dlp_defects.length ? (
              <ul className="divide-y divide-line">
                {c.dlp_defects.map((defect) => (
                  <li key={defect.id}>
                    <Link href={`/maintenance/${defect.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-page">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-accent-text">{defect.request_code}</p>
                        <p className="max-w-md truncate text-sm">{defect.title}</p>
                        <p className="font-mono text-[11px] text-muted">
                          Raised {formatDateTime(defect.created_at)} · {defect.asset_code}
                          {defect.verified_at && ` · fixed ${formatDate(defect.verified_at)}`}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <StatusBadge status={defect.status} />
                        {defect.is_overdue && <StatusBadge status="OVERDUE" />}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No DLP defects" description="None of this firm's assets has had a defect during its liability period." />
            )}
          </Card>
        </div>

        <Card title="Closure evaluations" subtitle="Explainable score recorded at each work's closure">
          {c.evaluations.length ? (
            <ul className="space-y-5">
              {c.evaluations.map((evaluation) => (
                <li key={evaluation.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/works/${evaluation.work_id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                      {evaluation.work_code} · {evaluation.work_title}
                    </Link>
                    <span className={cn("font-heading text-2xl font-semibold", tone(Number(evaluation.total_score)))}>{Number(evaluation.total_score)}</span>
                  </div>
                  <p className="text-[11px] text-muted">
                    {formatDate(evaluation.evaluated_at)}
                    {evaluation.evaluator_name && ` · by ${evaluation.evaluator_name}`}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {scoreRows.map((row) => {
                      const value = Number(evaluation[`${row.key}_score`]);
                      return (
                        <li key={row.key}>
                          <div className="flex justify-between text-xs">
                            <span>{row.label}</span>
                            <span className="font-mono">
                              {value}/{row.max}
                            </span>
                          </div>
                          <ProgressBar value={(value / row.max) * 100} className="mt-0.5" />
                          {evaluation.inputs?.[row.key] && <p className="mt-0.5 text-[11px] text-muted">{evaluation.inputs[row.key]}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No closure evaluations yet" description="A score is recorded when a work passes its closure gate." />
          )}
        </Card>
      </div>
      <p className="mt-4 text-center text-xs text-muted">Scores support decisions; they never debar or penalise a contractor automatically.</p>
    </AppShell>
  );
}
