"use client";

import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Loading from "@/components/ui/Loading";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/useApi";

type Request = {
  id: string;
  request_code: string;
  title: string;
  severity: string;
  status: string;
  dlp_liable: boolean;
  due_date: string | null;
  created_at: string;
  source: string;
  assigned_to_name: string | null;
  contractor_name: string | null;
  is_overdue: boolean;
};

export default function AssetMaintenance({ assetId }: { assetId: string }) {
  const list = useApi<Request[]>(`/assets/${assetId}/maintenance`);
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data?.length) return <EmptyState title="No maintenance requests" description="Poor inspections raise requests here automatically." />;

  return (
    <ul className="divide-y divide-line">
      {list.data.map((request) => (
        <li key={request.id} className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/maintenance/${request.id}`} className="font-mono text-xs text-accent-text underline">
              {request.request_code}
            </Link>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status={request.status} />
              <StatusBadge status={request.severity} />
              {request.dlp_liable && <StatusBadge status="DLP" label="DLP-liable" tone="accent" />}
              {request.is_overdue && <StatusBadge status="OVERDUE" />}
            </div>
          </div>
          <p className="mt-1 text-sm font-medium">{request.title}</p>
          <p className="text-xs text-muted">
            Raised {formatDate(request.created_at)} from {request.source.toLowerCase()} · due {formatDate(request.due_date)}
            {request.assigned_to_name && ` · assigned to ${request.assigned_to_name}`}
            {request.contractor_name && ` · ${request.contractor_name}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
