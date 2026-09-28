"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import StatusBadge, { humanize } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import type { TaskAction, WorkStage, WorkTask } from "@/types/works";

const stageTone = { PASSED: "success", ACTIVE: "accent", LOCKED: "neutral", REJECTED: "danger", SKIPPED: "neutral" } as const;
const taskTone = { ACCEPTED: "success", SUBMITTED: "info", RETURNED: "warning", PENDING: "neutral", SKIPPED: "neutral" } as const;
const gateLabel = { HQ: "HQ", EE: "Responsible EE", COST_LIMIT: "Approver by cost limit" };

function StageIcon({ status }: { status: WorkStage["status"] }) {
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold";
  if (status === "PASSED") return <span className={cn(base, "bg-condition-excellent text-white")} aria-label="Passed">✓</span>;
  if (status === "ACTIVE") return <span className={cn(base, "bg-accent text-white ring-4 ring-accent-soft")} aria-label="Active">●</span>;
  if (status === "REJECTED") return <span className={cn(base, "bg-condition-critical text-white")} aria-label="Rejected">✕</span>;
  return <span className={cn(base, "border border-line bg-surface text-muted")} aria-label="Locked">·</span>;
}

function describeData(data: Record<string, unknown> | null) {
  if (!data) return null;
  const parts = [];
  if (data.sanctioned_amount) parts.push(`AA ${formatRupees(Number(data.sanctioned_amount))} (TS ${formatRupees(Number(data.technical_sanction_amount))})`);
  if (data.contract_value) parts.push(`Contract ${formatRupees(Number(data.contract_value))}, DLP ${data.dlp_months} months, ${data.tender_ref}`);
  if (data.completion_certificate_ref) parts.push(`Completion certificate ${data.completion_certificate_ref}`);
  if (data.planned_asset) parts.push(`Planned asset ${data.planned_asset} registered`);
  if (data.contractor_score) parts.push(`Contractor score ${data.contractor_score}/100`);
  return parts.length ? parts.join(" · ") : null;
}

function TaskRow({ task, onAction }: { task: WorkTask; onAction: (task: WorkTask, action: TaskAction) => void }) {
  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {task.title}
            {task.is_milestone && <span className="ml-2 text-xs font-normal text-muted">milestone · weight {Number(task.weight)}</span>}
          </p>
          <p className="text-xs text-muted">
            {task.assigned_to_name ? <span className="font-medium text-ink">{task.assigned_to_name}</span> : `Unassigned (${task.default_assignee_role === "CONTRACTOR" ? "contractor" : task.default_assignee_role})`}
            {task.due_date && ` · due ${formatDate(task.due_date)}`}
          </p>
          <ol className="mt-1 space-y-0.5 text-[11px] text-muted">
            {task.assigned_at && task.assigned_to_name && (
              <li>
                <span className="font-mono">{formatDateTime(task.assigned_at)}</span> · assigned{task.assigned_by_name ? ` by ${task.assigned_by_name}` : ""}
              </li>
            )}
            {task.submitted_at && (
              <li>
                <span className="font-mono">{formatDateTime(task.submitted_at)}</span> · submitted by {task.submitted_by_name}
              </li>
            )}
            {task.reviewed_at && (task.status === "ACCEPTED" || task.status === "RETURNED") && (
              <li>
                <span className="font-mono">{formatDateTime(task.reviewed_at)}</span> · {task.status === "ACCEPTED" ? "accepted" : "returned"} by {task.reviewed_by_name}
              </li>
            )}
          </ol>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={task.status} tone={taskTone[task.status]} />
          {task.is_overdue && <StatusBadge status="OVERDUE" />}
          {task.return_count > 0 && <StatusBadge status="RETURNED" label={`Reworked ×${task.return_count}`} tone="warning" />}
        </div>
      </div>
      {task.deliverables.length > 0 && (
        <p className="mt-1.5 text-xs text-muted">
          {task.deliverables.map((item) => `${item.label}: ${item.reference}`).join(" · ")}
        </p>
      )}
      {task.review_remarks && task.status !== "ACCEPTED" && <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Rework: {task.review_remarks}</p>}
      {task.photos.some((photo) => photo.url) && (
        <div className="mt-2 flex gap-2">
          {task.photos.filter((photo) => photo.url).map((photo) => (
            <a key={photo.path} href={photo.url!} target="_blank" rel="noreferrer" className="block h-12 w-12 overflow-hidden rounded border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url!} alt="Progress evidence" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      {task.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {task.actions.includes("submit") && <Button size="sm" onClick={() => onAction(task, "submit")}>{task.status === "RETURNED" ? "Resubmit" : "Submit"}</Button>}
          {task.actions.includes("accept") && <Button size="sm" onClick={() => onAction(task, "accept")}>Accept</Button>}
          {task.actions.includes("return") && <Button size="sm" variant="secondary" onClick={() => onAction(task, "return")}>Return</Button>}
          {task.actions.includes("assign") && <Button size="sm" variant="ghost" onClick={() => onAction(task, "assign")}>{task.assigned_to ? "Reassign" : "Assign"}</Button>}
        </div>
      )}
    </li>
  );
}

export default function StageCard({
  stage,
  last,
  onTaskAction,
  onEvaluate
}: {
  stage: WorkStage;
  last: boolean;
  onTaskAction: (task: WorkTask, action: TaskAction) => void;
  onEvaluate: (stage: WorkStage) => void;
}) {
  const [open, setOpen] = useState(stage.status === "ACTIVE");
  useEffect(() => {
    if (stage.status === "ACTIVE") setOpen(true);
  }, [stage.status]);
  const accepted = stage.tasks.filter((task) => task.status === "ACCEPTED").length;

  return (
    <li id={`stage-${stage.seq}`} className="relative flex gap-3">
      {!last && <span className="absolute left-3.5 top-8 h-[calc(100%-1rem)] w-px bg-line" aria-hidden />}
      <StageIcon status={stage.status} />
      <div className="mb-4 min-w-0 flex-1 rounded-xl border border-line bg-surface shadow-card">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left">
          <div className="min-w-0">
            <p className="font-medium">
              {stage.seq}. {stage.name}
            </p>
            <p className="text-xs text-muted">
              {stage.started_at ? `Started ${formatDate(stage.started_at)}` : "Not started"}
              {stage.completed_at && ` · completed ${formatDate(stage.completed_at)}`}
              {stage.status === "ACTIVE" && stage.due_at && ` · due ${formatDate(stage.due_at)}`} · {accepted}/{stage.tasks.length} tasks · gate: {gateLabel[stage.gate_role]}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {stage.return_count > 0 && <StatusBadge status="RETURNED" label={`Gate returned ×${stage.return_count}`} tone="warning" />}
            {stage.is_delayed && <StatusBadge status="OVERDUE" label="Delayed" />}
            <StatusBadge status={stage.status} tone={stageTone[stage.status]} />
            <span className="text-muted" aria-hidden>{open ? "▴" : "▾"}</span>
          </div>
        </button>

        {open && (
          <div className="space-y-3 border-t border-line p-3">
            <ul className="space-y-2">
              {stage.tasks.map((task) => (
                <TaskRow key={task.id} task={task} onAction={onTaskAction} />
              ))}
            </ul>

            {stage.evaluations.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Gate decisions</p>
                <ul className="space-y-1.5">
                  {stage.evaluations.map((evaluation) => (
                    <li key={evaluation.id} className="text-sm">
                      <StatusBadge
                        status={evaluation.outcome}
                        label={humanize(evaluation.outcome)}
                        tone={evaluation.outcome === "RETURNED" ? "warning" : evaluation.outcome === "REJECTED" ? "danger" : "success"}
                      />{" "}
                      by {evaluation.evaluator_name ?? evaluation.evaluator_role} · {formatDateTime(evaluation.evaluated_at)}
                      {evaluation.remarks && <span className="text-muted"> — {evaluation.remarks}</span>}
                      {describeData(evaluation.data) && <p className="mt-0.5 text-xs text-muted">{describeData(evaluation.data)}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {stage.gate && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-page p-3">
                <p className="text-sm">
                  {stage.gate.pending_tasks > 0
                    ? `${stage.gate.pending_tasks} mandatory task(s) must be accepted before the gate.`
                    : stage.gate.can_evaluate
                      ? "All tasks accepted — ready for your gate evaluation."
                      : `All tasks accepted. ${stage.gate.reason ?? ""}`}
                </p>
                {stage.gate.can_evaluate && (
                  <Button size="sm" onClick={() => onEvaluate(stage)}>
                    Evaluate gate
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
