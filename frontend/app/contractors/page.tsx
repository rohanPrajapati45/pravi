"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Loading from "@/components/ui/Loading";
import StatusBadge from "@/components/ui/StatusBadge";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { ContractorPerformance } from "@/types/contractors";

function scoreTone(score: number | null) {
  if (score == null) return "text-muted";
  if (score >= 80) return "text-condition-excellent";
  if (score >= 60) return "text-condition-moderate";
  return "text-condition-critical";
}

const pct = (value: number | null) => (value == null ? "—" : `${value}%`);

export default function ContractorsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const list = useApi<ContractorPerformance[]>("/contractors/performance");

  // Contractors land straight on their own performance page.
  useEffect(() => {
    if (profile?.role === "CONTRACTOR" && list.data?.length === 1) router.replace(`/contractors/${list.data[0].id}`);
  }, [profile, list.data, router]);

  return (
    <AppShell title="Contractors" subtitle="Performance across works in your jurisdiction — schedule, quality, DLP defects and closure scores" allowedRoles={["HQ", "EE", "CONTRACTOR"]}>
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState title="No contractors with works here yet" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.data.map((firm) => (
            <Link key={firm.id} href={`/contractors/${firm.id}`} className="block rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:border-accent hover:shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{firm.name}</p>
                  <p className="font-mono text-[11px] text-muted">
                    {firm.code}
                    {firm.class && ` · class ${firm.class}`}
                    {firm.contact_name && ` · ${firm.contact_name}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("font-heading text-3xl font-semibold leading-none", scoreTone(firm.avg_score))}>{firm.avg_score ?? "—"}</p>
                  <p className="mt-1 text-[11px] text-muted">avg score · {firm.evaluations} eval</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                {[
                  { label: "Active works", value: firm.active_works },
                  { label: "Completed", value: firm.completed_works },
                  { label: "On time", value: pct(firm.on_time_pct) },
                  { label: "Avg delay", value: firm.avg_delay_days == null ? "—" : `${firm.avg_delay_days} d` },
                  { label: "First-pass", value: pct(firm.first_pass_pct) },
                  { label: "DLP defects", value: `${firm.dlp_open}/${firm.dlp_defects}` }
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-page p-2">
                    <dt className="text-[10px] text-muted">{item.label}</dt>
                    <dd className="font-heading text-sm font-semibold">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>Active contract value {formatRupees(firm.active_value)}</span>
                {firm.running_late > 0 && <StatusBadge status="LATE" label={`${firm.running_late} running late`} tone="danger" />}
                {firm.dlp_open > 0 && <StatusBadge status="DLP" label={`${firm.dlp_open} liable defect(s) open`} tone="warning" />}
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
