"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Select from "@/components/ui/Select";
import StatusBadge from "@/components/ui/StatusBadge";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { COMPLAINT_CATEGORIES, categoryLabel, type ComplaintRow } from "@/types/operations";

const LIMIT = 20;
const lanes = [
  { key: "open", label: "Needs action", statuses: "RECEIVED,ACKNOWLEDGED" },
  { key: "IN_PROGRESS", label: "Repair under way", statuses: "IN_PROGRESS" },
  { key: "RESOLVED", label: "Resolved", statuses: "RESOLVED" },
  { key: "closed", label: "Rejected / duplicate", statuses: "REJECTED,DUPLICATE" },
  { key: "all", label: "All", statuses: "" }
];
const channelLabel: Record<string, string> = { WEB: "Web", CPGRAMS: "CPGRAMS", SWAGAT: "SWAGAT", HELPLINE: "Helpline" };

function ComplaintCard({ complaint }: { complaint: ComplaintRow }) {
  return (
    <Link href={`/complaints/${complaint.id}`} className="block rounded-xl border border-line bg-surface p-3 shadow-card transition hover:border-accent">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-accent-text">{complaint.complaint_code}</span>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={complaint.status} />
          {complaint.channel !== "WEB" && <StatusBadge status={complaint.channel} label={channelLabel[complaint.channel]} tone="accent" />}
          {complaint.duplicates > 0 && <StatusBadge status="DUP" label={`+${complaint.duplicates} same issue`} tone="warning" />}
        </div>
      </div>
      <p className="mt-1.5 text-sm font-medium">{categoryLabel(complaint.category)}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{complaint.description}</p>
      <p className="mt-1.5 text-xs text-muted">
        {complaint.asset_code ? (
          <>
            <span className="font-mono">{complaint.asset_code}</span> · {complaint.office_name}
            {complaint.match_method === "NEAREST" && complaint.match_distance_m != null && ` · matched ${Math.round(complaint.match_distance_m)} m away`}
          </>
        ) : complaint.office_name ? (
          `${complaint.office_name} · no asset linked yet`
        ) : (
          <span className="font-medium text-amber-700">Not routed — needs an office</span>
        )}
      </p>
      <p className="mt-1 font-mono text-[11px] text-muted">
        Filed {formatDateTime(complaint.created_at)}
        {complaint.request_code && ` · repair ${complaint.request_code}`}
      </p>
    </Link>
  );
}

export default function ComplaintsPage() {
  const { profile } = useAuth();
  const [lane, setLane] = useState("open");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [unrouted, setUnrouted] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const statuses = lanes.find((item) => item.key === lane)?.statuses;
  const list = useApi<ComplaintRow[]>("/complaints", { status: statuses || undefined, category: category || undefined, unrouted: unrouted || undefined, q: q || undefined, page, limit: LIMIT });
  const byStatus = list.meta?.by_status ?? {};
  const count = (keys: string) => (keys ? keys.split(",").reduce((sum, key) => sum + (byStatus[key] ?? 0), 0) : Object.values(byStatus).reduce((sum, value) => sum + value, 0));
  const totalPages = list.meta ? Math.max(1, list.meta.totalPages) : 1;

  return (
    <AppShell
      title="Citizen complaints"
      subtitle="Filed on the public page or received from CPGRAMS / SWAGAT, routed to the nearest asset and office"
      allowedRoles={["HQ", "EE", "AE"]}
      headerRight={
        <Link href="/complain" target="_blank" className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-accent-text hover:bg-accent-soft sm:flex">
          Public page <Icon name="arrow" className="h-3.5 w-3.5" />
        </Link>
      }
    >
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {lanes.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setLane(item.key);
              setPage(1);
            }}
            className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium", lane === item.key ? "border-accent text-accent-text" : "border-transparent text-muted hover:text-ink")}
          >
            {item.label}
            <span className="rounded-full bg-page px-1.5 text-xs text-muted">{count(item.statuses)}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px_auto]">
        <Input aria-label="Search complaints" placeholder="Search by number, description or place" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select aria-label="Category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} options={[{ value: "", label: "All categories" }, ...COMPLAINT_CATEGORIES.map((item) => ({ value: item.value, label: item.label }))]} />
        {profile?.role === "HQ" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={unrouted} onChange={(event) => { setUnrouted(event.target.checked); setPage(1); }} /> Not routed only
          </label>
        )}
      </div>

      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState title="No complaints here" description="Citizens file complaints on the public page (no login needed); portal grievances arrive through the integration adapters." />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.data.map((item) => <ComplaintCard key={item.id} complaint={item} />)}</div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
