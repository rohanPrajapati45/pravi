"use client";

import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Loading from "@/components/ui/Loading";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { categoryLabel, type ComplaintRow } from "@/types/operations";

export default function AssetComplaints({ assetId, linkable }: { assetId: string; linkable: boolean }) {
  const list = useApi<ComplaintRow[]>(`/assets/${assetId}/complaints`);
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data?.length) return <EmptyState title="No citizen complaints" description="Complaints filed near this asset — or with its code — appear here automatically." />;
  return (
    <ul className="space-y-2">
      {list.data.map((complaint) => {
        const body = (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                <span className="font-mono text-xs text-accent-text">{complaint.complaint_code}</span> · {categoryLabel(complaint.category)}
              </span>
              <div className="flex gap-1.5">
                {complaint.channel !== "WEB" && <StatusBadge status={complaint.channel} tone="neutral" />}
                <StatusBadge status={complaint.status} />
              </div>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{complaint.description}</p>
            <p className="mt-1 font-mono text-[11px] text-muted">
              {formatDateTime(complaint.created_at)}
              {complaint.request_code && ` · repair ${complaint.request_code}`}
              {complaint.resolution_note && ` · ${complaint.resolution_note}`}
            </p>
          </>
        );
        return (
          <li key={complaint.id}>
            {linkable ? (
              <Link href={`/complaints/${complaint.id}`} className="block rounded-xl border border-line p-3 hover:border-accent">{body}</Link>
            ) : (
              <div className="rounded-xl border border-line p-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
