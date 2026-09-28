"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/ui/ErrorState";
import Loading from "@/components/ui/Loading";
import ProgressBar from "@/components/ui/ProgressBar";
import StatusBadge, { ConditionBadge, humanize } from "@/components/ui/StatusBadge";
import StageCard from "@/components/works/StageCard";
import { AssignTaskModal, GateModal, ReviewTaskModal, SubmitTaskModal } from "@/components/works/WorkModals";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { TaskAction, WorkJourney, WorkStage, WorkTask } from "@/types/works";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children ?? "—"}</dd>
    </div>
  );
}

const scoreRows = [
  { key: "schedule", label: "Schedule adherence", max: 30 },
  { key: "quality", label: "Quality (first-pass milestones)", max: 30 },
  { key: "rework", label: "Rework", max: 15 },
  { key: "dlp", label: "Defects during DLP", max: 15 },
  { key: "documentation", label: "Documentation", max: 10 }
] as const;

export default function WorkJourneyPage() {
  const { id } = useParams<{ id: string }>();
  const work = useApi<WorkJourney>(`/works/${id}`);
  const [taskAction, setTaskAction] = useState<{ task: WorkTask; action: TaskAction } | null>(null);
  const [gateStage, setGateStage] = useState<WorkStage | null>(null);

  if (work.loading && !work.data) {
    return (
      <AppShell title="Work journey">
        <Loading label="Loading journey…" />
      </AppShell>
    );
  }
  if (work.error || !work.data) {
    return (
      <AppShell title="Work journey">
        <ErrorState title={work.status === 403 ? "Outside your jurisdiction" : "Could not load work"} message={work.error ?? undefined} onRetry={work.status === 403 ? undefined : work.reload} />
      </AppShell>
    );
  }

  const w = work.data;
  const file = w.who_has_file;
  const evaluation = w.contractor_evaluation;

  return (
    <AppShell title="Work journey">
      <div className="mb-4 rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm text-accent-text">{w.work_code}</p>
            <h2 className="text-xl font-semibold">{w.title}</h2>
            <p className="mt-1 text-sm text-muted">
              {w.template_name} · {w.org_unit_name}
              {w.programme_name && ` · ${w.programme_name}`}
            </p>
            {w.objective && <p className="mt-1 text-sm">{w.objective}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={w.status} />
            <StatusBadge status={w.priority} label={`${humanize(w.priority)} priority`} tone={w.priority === "HIGH" || w.priority === "CRITICAL" ? "danger" : "neutral"} />
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted">
            <span>Physical progress (from accepted milestones)</span>
            <span className="font-mono">{Number(w.progress_pct)}%</span>
          </div>
          <ProgressBar value={Number(w.progress_pct)} className="mt-1 h-2" />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <Fact label="Initiated">{`${humanize(w.initiation_type)} · ${formatDate(w.initiation_date)}`}</Fact>
          <Fact label="Order reference">{w.initiation_ref && <span className="font-mono text-xs">{w.initiation_ref}</span>}</Fact>
          <Fact label="Estimate">{formatRupees(w.estimated_cost)}</Fact>
          <Fact label="Sanctioned">{w.sanctioned_amount ? formatRupees(w.sanctioned_amount) : null}</Fact>
          <Fact label="Contract">{w.contract_value ? `${formatRupees(w.contract_value)} · ${w.contractor_name}` : null}</Fact>
          <Fact label="Schedule">{w.start_date ? `${formatDate(w.start_date)} → ${formatDate(w.actual_end ?? w.planned_end)}${w.actual_end ? " (actual)" : ""}` : null}</Fact>
        </dl>
      </div>

      {file && (
        <div className={cn("mb-4 rounded-xl border p-4", file.delayed ? "border-red-200 bg-red-50" : "border-cyan-200 bg-accent-soft")}>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">Who has the file now</p>
          <p className="mt-1 text-lg font-semibold">{file.holder}</p>
          <p className="text-sm">
            {file.stage} · {file.days_in_stage} days in stage{file.delayed && " · delayed beyond planned duration"} · {file.summary}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ol aria-label="Work stages">
          {w.stages.map((stage, index) => (
            <StageCard
              key={stage.id}
              stage={stage}
              last={index === w.stages.length - 1}
              onTaskAction={(task, action) => setTaskAction({ task, action })}
              onEvaluate={setGateStage}
            />
          ))}
        </ol>

        <div className="space-y-4">
          <Card title="Assets">
            {w.assets.length ? (
              <ul className="space-y-3">
                {w.assets.map((asset) => (
                  <li key={asset.id}>
                    <Link href={`/assets/${asset.id}`} className="font-mono text-xs text-accent-text underline">
                      {asset.asset_code}
                    </Link>
                    <p className="text-sm font-medium">{asset.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <StatusBadge status={asset.role} label={asset.role === "CREATED" ? "Created by this work" : "Repaired by this work"} tone="accent" />
                      <StatusBadge status={asset.lifecycle_status} />
                      {asset.condition_rating && <ConditionBadge rating={asset.condition_rating} />}
                    </div>
                    {asset.dlp_end_date && <p className="mt-1 text-xs text-muted">DLP until {formatDate(asset.dlp_end_date)}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                {w.asset_type_code ? "The asset is registered as PLANNED when the DPR stage passes, so drawings and history attach to it early." : "No assets linked."}
              </p>
            )}
          </Card>

          {evaluation && (
            <Card title="Contractor evaluation" subtitle={`${w.contractor_name} · by ${evaluation.evaluator_name ?? "HQ"}`}>
              <p className="font-heading text-3xl font-semibold">
                {Number(evaluation.total_score)}
                <span className="text-base text-muted"> / 100</span>
              </p>
              <ul className="mt-3 space-y-2">
                {scoreRows.map((row) => {
                  const value = Number(evaluation[`${row.key}_score`]);
                  return (
                    <li key={row.key}>
                      <div className="flex justify-between text-sm">
                        <span>{row.label}</span>
                        <span className="font-mono text-xs">
                          {value} / {row.max}
                        </span>
                      </div>
                      <ProgressBar value={(value / row.max) * 100} className="mt-1" />
                      <p className="mt-0.5 text-xs text-muted">{evaluation.inputs[row.key]}</p>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[11px] text-muted">Illustrative weights (PRD 7.5.5). Supports decisions; does not automatically penalise anyone.</p>
            </Card>
          )}

          {w.approvals.length > 0 && (
            <Card title="Sanctions">
              <ul className="space-y-2 text-sm">
                {w.approvals.map((approval) => (
                  <li key={approval.stage}>
                    <p className="font-medium">{humanize(approval.stage)}</p>
                    <p className="text-xs text-muted">
                      {formatRupees(approval.amount)} · {approval.approver_name} ({approval.approver_role}) · <span className="font-mono">{approval.reference}</span> · {formatDate(approval.decided_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {taskAction?.action === "assign" && <AssignTaskModal work={w} task={taskAction.task} onClose={() => setTaskAction(null)} onDone={work.reload} />}
      {taskAction?.action === "submit" && <SubmitTaskModal task={taskAction.task} onClose={() => setTaskAction(null)} onDone={work.reload} />}
      {(taskAction?.action === "accept" || taskAction?.action === "return") && (
        <ReviewTaskModal task={taskAction.task} decision={taskAction.action} onClose={() => setTaskAction(null)} onDone={work.reload} />
      )}
      {gateStage && <GateModal work={w} stage={gateStage} onClose={() => setGateStage(null)} onDone={work.reload} />}
    </AppShell>
  );
}
