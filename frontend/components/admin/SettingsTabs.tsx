"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/ui/ErrorState";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Select from "@/components/ui/Select";
import StatusBadge, { humanize } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatRupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { WorkTemplate } from "@/types/works";
import { FormError, useSave } from "./shared";

type Limit = { role: string; work_type: string | null; max_amount: number | null; label: string };

export function LimitsTab() {
  const { token } = useAuth();
  const limits = useApi<Limit[]>("/approval-limits");
  const { saving, error, save } = useSave();
  const ee = limits.data?.find((limit) => limit.role === "EE");
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (ee?.max_amount != null) setAmount(String(Number(ee.max_amount)));
  }, [ee?.max_amount]);

  if (limits.loading) return <Loading />;
  if (limits.error) return <ErrorState message={limits.error} onRetry={limits.reload} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Delegation of financial powers" subtitle="Who may pass the Approvals gate of a work, by sanctioned amount">
        <ol className="space-y-3">
          <li className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">Executive Engineer (EE)</p>
              <StatusBadge status="EE" label={`up to ${formatRupees(Number(ee?.max_amount ?? 0))}`} tone="accent" />
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
              <Input label="New limit (₹)" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} hint={amount ? formatRupees(Number(amount)) : undefined} />
              <Button
                loading={saving}
                disabled={!Number(amount) || Number(amount) === Number(ee?.max_amount)}
                onClick={async () => {
                  if (await save(() => api("/admin/approval-limits", { method: "PUT", token, body: { role: "EE", max_amount: Number(amount) } }), { title: "EE limit updated", description: `Applies immediately to every Approvals gate — now ${formatRupees(Number(amount))}` })) limits.reload();
                }}
              >
                Save
              </Button>
            </div>
          </li>
          <li className="rounded-xl border border-line bg-page p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">HQ / Chief Engineer</p>
              <StatusBadge status="HQ" label="No upper limit" tone="neutral" />
            </div>
            <p className="mt-1 text-xs text-muted">Top of the delegation — anything above the EE limit escalates here automatically.</p>
          </li>
        </ol>
        <div className="mt-3">
          <FormError error={error} />
        </div>
      </Card>
      <Card title="How it is enforced">
        <ul className="space-y-2 text-sm text-muted">
          <li>• The API checks the approver&apos;s limit when an Approvals gate is evaluated; above the limit the gate is refused with “escalate to HQ”.</li>
          <li>• My tasks only lists financial gates the officer is actually allowed to pass.</li>
          <li>• Every change here is written to the audit log with the old and new amount.</li>
          <li>• Values are illustrative for the demo — set them to the department&apos;s actual delegation of powers at handover.</li>
        </ul>
      </Card>
    </div>
  );
}

type TemplateDetail = {
  code: string;
  name: string;
  work_type: string;
  asset_type_code: string | null;
  description: string;
  stages: Array<{ seq: number; code: string; name: string; kind: string; gate_role: string; planned_days: number; checklist: string[]; tasks: Array<{ title: string; role: string; deliverables: string[]; milestone: boolean; weight: number; planned_days: number }> }>;
};

export function TemplatesTab() {
  const list = useApi<WorkTemplate[]>("/work-templates");
  const [code, setCode] = useState("NEW_ROAD");
  const detail = useApi<TemplateDetail>(`/admin/work-templates/${code}`);
  const gate = { HQ: "HQ", EE: "Responsible EE", COST_LIMIT: "By cost limit" } as Record<string, string>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="w-72">
          <Select aria-label="Template" value={code} onChange={(event) => setCode(event.target.value)} options={(list.data ?? []).map((template) => ({ value: template.code, label: template.name }))} />
        </div>
        <p className="text-xs text-muted">Read-only here. Templates are configuration rows; a template editor is on the roadmap.</p>
      </div>
      {detail.loading ? (
        <Loading />
      ) : detail.error || !detail.data ? (
        <ErrorState message={detail.error ?? undefined} onRetry={detail.reload} />
      ) : (
        <>
          <p className="text-sm">{detail.data.description}</p>
          <ol className="space-y-3">
            {detail.data.stages.map((stage) => (
              <li key={stage.code} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {stage.seq}. {stage.name}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge status={stage.kind} tone="neutral" label={humanize(stage.kind)} />
                    <StatusBadge status="GATE" tone="accent" label={`Gate: ${gate[stage.gate_role]}`} />
                    <StatusBadge status="DAYS" tone="neutral" label={`${stage.planned_days} days`} />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <ul className="space-y-1.5">
                    {stage.tasks.map((task) => (
                      <li key={task.title} className="text-sm">
                        <span className="font-medium">{task.title}</span>{" "}
                        <span className="text-xs text-muted">
                          · {task.role === "CONTRACTOR" ? "contractor" : task.role}
                          {task.milestone && ` · milestone ${Number(task.weight)}%`}
                        </span>
                        {task.deliverables.length > 0 && <p className="text-xs text-muted">Needs: {task.deliverables.join(", ")}</p>}
                      </li>
                    ))}
                  </ul>
                  <div className="rounded-lg bg-page p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Gate checklist</p>
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {stage.checklist.map((item) => (
                        <li key={item}>☐ {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

type System = {
  api: { status: string; node: string; uptime_s: number; environment: string };
  database: { status: string; latency_ms: number; version: string; size: string; pool: { total: number; idle: number } };
  counts: Record<string, number>;
  last_24h: { actions: number; people: number };
  migrations: Array<{ id: string; applied_at: string }>;
};

export function SystemTab() {
  const { token } = useAuth();
  const system = useApi<System>("/admin/system");
  const { saving, save } = useSave();
  if (system.loading && !system.data) return <Loading />;
  if (system.error || !system.data) return <ErrorState message={system.error ?? undefined} onRetry={system.reload} />;
  const s = system.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "API", value: <StatusBadge status="OK" label="Healthy" tone="success" />, hint: `${s.api.node} · up ${Math.floor(s.api.uptime_s / 60)} min` },
          { label: "Database", value: <StatusBadge status="OK" label={`${s.database.latency_ms} ms`} tone="success" />, hint: `${s.database.version} · ${s.database.size}` },
          { label: "Last 24 hours", value: <span className="font-heading text-2xl font-semibold">{s.last_24h.actions}</span>, hint: `actions by ${s.last_24h.people} people` },
          { label: "Active users", value: <span className="font-heading text-2xl font-semibold">{s.counts.active_users}</span>, hint: `of ${s.counts.users} accounts` }
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <p className="text-xs text-muted">{tile.label}</p>
            <div className="mt-1">{tile.value}</div>
            <p className="mt-1 text-xs text-muted">{tile.hint}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Records">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(s.counts)
              .filter(([key]) => !["users", "active_users"].includes(key))
              .map(([key, value]) => (
                <div key={key} className="rounded-lg bg-page p-2">
                  <dt className="text-[11px] text-muted">{humanize(key)}</dt>
                  <dd className="font-mono text-sm font-semibold">{value.toLocaleString("en-IN")}</dd>
                </div>
              ))}
          </dl>
        </Card>
        <Card title="Maintenance tools">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>Recompute risk for every asset (normally a nightly job)</span>
              <Button
                size="sm"
                variant="secondary"
                loading={saving}
                onClick={async () => {
                  if (await save(() => api("/risk/recompute", { method: "POST", token }), { title: "Risk recomputed", description: "Every asset rescored with the current weights" })) system.reload();
                }}
              >
                Run now
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Audit log — every write, append-only</span>
              <Link href="/audit" className="text-accent-text underline">Open</Link>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Activity — hand-offs between people</span>
              <Link href="/activity" className="text-accent-text underline">Open</Link>
            </div>
          </div>
        </Card>
      </div>
      <Card title="Database migrations applied" subtitle="New migrations run automatically on each deploy">
        <ul className="divide-y divide-line">
          {s.migrations.map((migration) => (
            <li key={migration.id} className="flex justify-between py-1.5 text-sm">
              <span className="font-mono">{migration.id}</span>
              <span className="font-mono text-xs text-muted">{formatDateTime(migration.applied_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
