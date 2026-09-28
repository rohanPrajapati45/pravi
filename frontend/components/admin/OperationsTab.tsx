"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/ui/ErrorState";
import Icon from "@/components/ui/Icon";
import Loading from "@/components/ui/Loading";
import StatusBadge from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { useApi } from "@/lib/useApi";
import type { IntegrationStatus, JobRun } from "@/types/operations";

type JobsResponse = { runs: JobRun[]; schedule: { enabled: boolean; description: string; ran_today: boolean } };

const stepLabels: Record<string, (value: Record<string, number>) => string> = {
  risk: (value) => `Risk: ${value.changed} of ${value.assets} changed`,
  inspections_overdue: (value) => `Overdue inspections: ${value.assets} assets`,
  sla_breaches: (value) => `SLA breaches: ${value.breached}`,
  dlp_expiring: (value) => `DLP ending ≤30 d: ${value.expiring}`,
  tasks_overdue: (value) => `Overdue tasks: ${value.overdue}`
};

function alertsSent(summary: JobRun["summary"]) {
  if (!summary) return 0;
  return Object.values(summary).reduce<number>((sum, value) => sum + (typeof value === "object" && value ? Number(value.notified ?? 0) : 0), 0);
}

export default function OperationsTab() {
  const { token } = useAuth();
  const { notify } = useToast();
  const jobs = useApi<JobsResponse>("/admin/jobs");
  const integrations = useApi<IntegrationStatus>("/admin/integrations");
  const [running, setRunning] = useState(false);

  async function runNow() {
    setRunning(true);
    try {
      const { data } = await api<JobRun>("/admin/jobs/daily/run", { method: "POST", token });
      notify({ title: "Daily jobs finished", description: `${alertsSent(data.summary)} new alert(s) · ${Number(data.summary?.ms ?? 0)} ms` });
      jobs.reload();
    } catch (caught) {
      notify({ title: "Jobs failed", description: (caught as Error).message, tone: "error" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Daily jobs"
        subtitle={jobs.data?.schedule.description}
        actions={
          <Button size="sm" onClick={runNow} loading={running}>
            <Icon name="refresh" className="h-4 w-4" /> Run now
          </Button>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Recomputes every asset&apos;s risk score and alerts engineers about overdue inspections, repairs past their due date, DLPs about to end and overdue work tasks.
          Each alert is sent once, so re-running is safe.
          {jobs.data && !jobs.data.schedule.enabled && <strong className="text-amber-700"> The scheduler is disabled on this server (DISABLE_SCHEDULER=true).</strong>}
        </p>
        {jobs.loading && !jobs.data ? (
          <Loading />
        ) : jobs.error ? (
          <ErrorState message={jobs.error} onRetry={jobs.reload} />
        ) : !jobs.data?.runs.length ? (
          <p className="text-sm text-muted">No runs yet — the scheduler runs shortly after the API starts, or use Run now.</p>
        ) : (
          <ul className="divide-y divide-line">
            {jobs.data.runs.map((run) => (
              <li key={run.id} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-mono text-xs">{formatDateTime(run.started_at)}</span> · {run.trigger === "MANUAL" ? `run by ${run.triggered_by_name}` : "scheduled"}
                    {run.summary?.ms != null && <span className="text-muted"> · {Number(run.summary.ms)} ms · {alertsSent(run.summary)} alert(s)</span>}
                  </p>
                  <StatusBadge status={run.status} tone={run.status === "SUCCEEDED" ? "success" : run.status === "FAILED" ? "danger" : "info"} />
                </div>
                {run.summary && (
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                    {Object.entries(stepLabels).map(([key, label]) =>
                      typeof run.summary?.[key] === "object" ? <span key={key}>{label(run.summary[key] as Record<string, number>)}</span> : null
                    )}
                  </p>
                )}
                {run.error && <p className="mt-1 text-xs text-red-700">{run.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Integrations" subtitle="Adapters to external systems — every call is logged here">
        {integrations.loading && !integrations.data ? (
          <Loading />
        ) : integrations.error ? (
          <ErrorState message={integrations.error} onRetry={integrations.reload} />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {integrations.data?.adapters.map((adapter) => (
                <div key={adapter.key} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{adapter.name}</p>
                    <div className="flex gap-1.5">
                      <StatusBadge status={adapter.direction} label={adapter.direction === "INBOUND" ? "Inbound" : "Outbound"} tone="neutral" />
                      <StatusBadge status={adapter.enabled ? "ON" : "OFF"} label={adapter.enabled ? "Enabled" : "Disabled"} tone={adapter.enabled ? "success" : "warning"} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">{adapter.description}</p>
                  <p className="mt-1.5 break-all font-mono text-[11px]">{adapter.endpoint}</p>
                  <p className="mt-1.5 text-xs text-muted">
                    {adapter.calls_24h} call(s) in 24 h{adapter.failures_24h ? ` · ${adapter.failures_24h} rejected/failed` : ""}
                    {adapter.last_call_at && ` · last ${formatDateTime(adapter.last_call_at)}`}
                  </p>
                  {!adapter.enabled && <p className="mt-1 text-xs text-amber-700">Set INTEGRATION_API_KEY on the API server and share it with the portal to enable.</p>}
                </div>
              ))}
            </div>
            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Recent calls</p>
            {!integrations.data?.logs.length ? (
              <p className="text-sm text-muted">No calls yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {integrations.data.logs.map((log) => (
                  <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="font-mono text-xs">{formatDateTime(log.created_at)}</span> · <span className="font-medium uppercase">{log.adapter}</span>
                      {log.reference && <span className="font-mono text-xs"> · {log.reference}</span>}
                      {log.message && <span className="block text-xs text-muted">{log.message}</span>}
                    </span>
                    <StatusBadge status={log.status} tone={log.status === "OK" ? "success" : log.status === "REJECTED" ? "warning" : "danger"} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
