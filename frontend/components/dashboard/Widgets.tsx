"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RiskWithWhy } from "@/components/assets/RiskBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Loading from "@/components/ui/Loading";
import { ConditionBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { daysFromToday } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { RiskBand, RiskFactor } from "@/types/assets";

export function KpiTile({ label, value, hint, href, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "default" | "alert" | "warn" | "good" }) {
  const body = (
    <div className={cn("h-full rounded-xl border bg-surface p-3 shadow-card transition", href && "hover:border-accent", tone === "alert" ? "border-red-200" : "border-line")}>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-heading text-2xl font-semibold",
          tone === "alert" && "text-condition-critical",
          tone === "warn" && "text-orange-600",
          tone === "good" && "text-condition-excellent"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

type ConditionRow = { name: string; excellent: number; good: number; moderate: number; poor: number; critical: number; unrated: number; total: number; avg_risk: number };

export function ConditionByArea() {
  const data = useApi<{ group: string; rows: ConditionRow[] }>("/dashboard/condition-distribution");
  if (data.loading) return <Loading />;
  if (data.error || !data.data) return <ErrorState message={data.error ?? undefined} onRetry={data.reload} />;
  const rows = data.data.rows.map((row) => ({ ...row, name: row.name.replace(/ Sub-division$/, "") }));
  return (
    <div>
      <p className="mb-2 text-xs text-muted">Assets by condition per {data.data.group}, worst average risk first</p>
      <div className="w-full" style={{ height: Math.max(220, rows.length * 26 + 60) }} role="img" aria-label={`Condition by ${data.data.group}`}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }} barSize={14}>
            <CartesianGrid stroke="#E2E8F0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11, fill: "#0F172A" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#E2E8F0", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
            <Bar dataKey="critical" stackId="c" name="Critical" fill="#DC2626" />
            <Bar dataKey="poor" stackId="c" name="Poor" fill="#F97316" />
            <Bar dataKey="moderate" stackId="c" name="Moderate" fill="#EAB308" />
            <Bar dataKey="good" stackId="c" name="Good" fill="#65A30D" />
            <Bar dataKey="excellent" stackId="c" name="Excellent" fill="#16A34A" />
            <Bar dataKey="unrated" stackId="c" name="Not rated" fill="#CBD5E1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type PriorityRow = {
  rank: number;
  id: string;
  asset_code: string;
  name: string;
  type_name: string;
  org_unit_name: string;
  district: string | null;
  condition_rating: number | null;
  lifecycle_status: string;
  risk_score: number;
  risk_band: RiskBand;
  risk_factors: RiskFactor[];
  next_inspection_due: string | null;
  open_requests: number;
  recommendation: { action: string; reason: string };
};

export function PriorityAssets({ limit = 10, title }: { limit?: number; title?: string }) {
  const data = useApi<PriorityRow[]>("/dashboard/priority-assets", { limit });
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorState message={data.error} onRetry={data.reload} />;
  if (!data.data?.length) return <EmptyState title="No assets in your jurisdiction" />;
  return (
    <div>
      {title && <p className="mb-2 text-xs text-muted">{title}</p>}
      <ol className="divide-y divide-line">
        {data.data.map((row) => {
          const due = daysFromToday(row.next_inspection_due);
          return (
            <li key={row.id} className="flex flex-wrap items-start gap-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-page font-mono text-xs font-semibold">{row.rank}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/assets/${row.id}`} className="block hover:underline">
                  <span className="font-mono text-xs text-accent-text">{row.asset_code}</span>
                  <p className="truncate text-sm font-medium">{row.name}</p>
                </Link>
                <p className="text-xs text-muted">
                  {row.type_name} · {row.district ?? row.org_unit_name}
                  {row.open_requests > 0 && ` · ${row.open_requests} open request(s)`}
                  {due !== null && due < 0 && <span className="text-condition-critical"> · inspection {-due}d overdue</span>}
                </p>
                <p className="mt-1 text-xs">
                  <span className="font-medium text-accent-text">Suggested:</span> {row.recommendation.action}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <RiskWithWhy score={row.risk_score} band={row.risk_band} factors={row.risk_factors} />
                <ConditionBadge rating={row.condition_rating} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function PipelineMini() {
  const data = useApi<Array<{ seq: number; code: string; name: string; works: number; delayed: number }>>("/works/pipeline");
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorState message={data.error} onRetry={data.reload} />;
  const merged = (data.data ?? []).reduce<Array<{ code: string; name: string; works: number; delayed: number }>>((all, row) => {
    const existing = all.find((item) => item.code === row.code);
    if (existing) {
      existing.works += row.works;
      existing.delayed += row.delayed;
    } else all.push({ ...row });
    return all;
  }, []);
  if (!merged.length) return <EmptyState title="No active works" />;
  const max = Math.max(...merged.map((row) => row.works));
  return (
    <ul className="space-y-2">
      {merged.map((row) => (
        <li key={row.code}>
          <Link href={`/works?stage=${row.code}`} className="block">
            <div className="flex justify-between text-sm">
              <span>{row.name}</span>
              <span className="font-mono text-xs">
                {row.works}
                {row.delayed > 0 && <span className="ml-1 text-condition-critical">({row.delayed} delayed)</span>}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-page">
              <div className={cn("h-2 rounded-full", row.delayed ? "bg-condition-poor" : "bg-accent")} style={{ width: `${(row.works / max) * 100}%` }} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RiskBands({ counts }: { counts: { critical: number; high: number; medium: number; low: number } }) {
  const total = counts.critical + counts.high + counts.medium + counts.low || 1;
  const bands = [
    { key: "CRITICAL", label: "Critical", value: counts.critical, colour: "bg-condition-critical" },
    { key: "HIGH", label: "High", value: counts.high, colour: "bg-condition-poor" },
    { key: "MEDIUM", label: "Medium", value: counts.medium, colour: "bg-condition-moderate" },
    { key: "LOW", label: "Low", value: counts.low, colour: "bg-condition-excellent" }
  ];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={bands.map((band) => `${band.label} ${band.value}`).join(", ")}>
        {bands.map((band) => (
          <div key={band.key} className={band.colour} style={{ width: `${(band.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
        {bands.map((band) => (
          <li key={band.key}>
            <Link href={`/assets?risk_band=${band.key}`} className="flex items-center gap-1.5 hover:underline">
              <span className={cn("h-2.5 w-2.5 rounded-full", band.colour)} aria-hidden />
              {band.label} <span className="font-mono text-xs text-muted">{band.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
