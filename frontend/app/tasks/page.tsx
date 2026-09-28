"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Loading from "@/components/ui/Loading";
import StatusBadge from "@/components/ui/StatusBadge";
import { daysFromToday, formatDate, formatRupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";

type Inbox = {
  assigned: Array<{ id: string; title: string; status: string; due_date: string | null; is_milestone: boolean; review_remarks: string | null; stage_name: string; stage_status: string; work_id: string; work_code: string; work_title: string }>;
  to_review: Array<{ id: string; title: string; submitted_at: string; is_milestone: boolean; stage_name: string; work_id: string; work_code: string; work_title: string; submitted_by_name: string }>;
  gates: Array<{ stage_id: string; stage_name: string; gate_role: string; due_at: string | null; work_id: string; work_code: string; work_title: string; estimated_cost: number | null; sanctioned_amount: number | null }>;
};

function Item({ href, code, title, meta, badges }: { href: string; code: string; title: string; meta: ReactNode; badges?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2.5 hover:bg-page">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted">
            <span className="font-mono">{code}</span> · {meta}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">{badges}</div>
      </Link>
    </li>
  );
}

export default function TasksPage() {
  const inbox = useApi<Inbox>("/tasks/mine");
  const data = inbox.data;

  return (
    <AppShell title="My tasks">
      {inbox.loading ? (
        <Loading />
      ) : inbox.error || !data ? (
        <ErrorState message={inbox.error ?? undefined} onRetry={inbox.reload} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Assigned to me" subtitle="Submit with the required deliverables" className="lg:col-span-2">
            {data.assigned.length ? (
              <ul className="divide-y divide-line">
                {data.assigned.map((task) => {
                  const due = daysFromToday(task.due_date);
                  return (
                    <Item
                      key={task.id}
                      href={`/works/${task.work_id}`}
                      code={task.work_code}
                      title={task.title}
                      meta={
                        <>
                          {task.work_title} · {task.stage_name}
                          {task.review_remarks && task.status === "RETURNED" && <span className="text-amber-700"> · rework: {task.review_remarks}</span>}
                        </>
                      }
                      badges={
                        <>
                          {task.stage_status === "LOCKED" && <StatusBadge status="LOCKED" label="Upcoming stage" />}
                          <StatusBadge status={task.status} tone={task.status === "RETURNED" ? "warning" : task.status === "SUBMITTED" ? "info" : "neutral"} label={task.status === "SUBMITTED" ? "Awaiting review" : undefined} />
                          {task.is_milestone && <StatusBadge status="MILESTONE" label="Milestone" tone="accent" />}
                          {due !== null && task.status !== "SUBMITTED" && (due < 0 ? <StatusBadge status="OVERDUE" label={`${-due}d overdue`} /> : <StatusBadge status="DUE" label={`Due ${formatDate(task.due_date)}`} tone="neutral" />)}
                        </>
                      }
                    />
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="Nothing assigned to you" description="Tasks assigned to you on any work appear here." />
            )}
          </Card>

          {(data.to_review.length > 0 || data.gates.length > 0) && (
            <>
              <Card title="Submissions awaiting my review" subtitle="Accept, or return with remarks">
                {data.to_review.length ? (
                  <ul className="divide-y divide-line">
                    {data.to_review.map((task) => (
                      <Item
                        key={task.id}
                        href={`/works/${task.work_id}`}
                        code={task.work_code}
                        title={task.title}
                        meta={`${task.submitted_by_name} · ${task.stage_name} · ${formatDate(task.submitted_at)}`}
                        badges={task.is_milestone ? <StatusBadge status="MILESTONE" label="Quality check" tone="accent" /> : null}
                      />
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No submissions waiting" />
                )}
              </Card>
              <Card title="Stage gates awaiting my evaluation" subtitle="All tasks accepted — decide pass / return / reject">
                {data.gates.length ? (
                  <ul className="divide-y divide-line">
                    {data.gates.map((gate) => (
                      <Item
                        key={gate.stage_id}
                        href={`/works/${gate.work_id}`}
                        code={gate.work_code}
                        title={`${gate.stage_name} gate`}
                        meta={`${gate.work_title}${gate.gate_role === "COST_LIMIT" ? ` · ${formatRupees(gate.sanctioned_amount ?? gate.estimated_cost)}` : ""}`}
                        badges={<StatusBadge status="GATE" label={gate.gate_role === "COST_LIMIT" ? "Financial approval" : "Gate"} tone="accent" />}
                      />
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No gates waiting" />
                )}
              </Card>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
