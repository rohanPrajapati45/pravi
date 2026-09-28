"use client";

import type { InspectionRow } from "@/types/inspections";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Loading from "@/components/ui/Loading";
import StatusBadge, { ConditionBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import ConditionChart from "./ConditionChart";

export default function AssetInspections({ assetId }: { assetId: string }) {
  const history = useApi<Array<{ inspected_at: string; condition_rating: number; type: string }>>(`/assets/${assetId}/condition-history`);
  const list = useApi<InspectionRow[]>("/inspections", { asset_id: assetId, limit: 20 });

  if (list.loading || history.loading) return <Loading />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data?.length) return <EmptyState title="No inspections recorded yet" description="Use Inspect to record the first field inspection." />;

  return (
    <div className="space-y-4">
      {history.data && history.data.length > 1 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Condition trend</h3>
          <ConditionChart points={history.data} />
        </div>
      )}
      <ul className="divide-y divide-line">
        {list.data.map((inspection) => (
          <li key={inspection.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {formatDateTime(inspection.inspected_at)} · <span className="font-mono text-xs">{inspection.inspection_code}</span>
                </p>
                <p className="text-xs text-muted">
                  {inspection.inspector_name ?? "—"} · {inspection.type.replace("_", " ").toLowerCase()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ConditionBadge rating={inspection.condition_rating} />
                <StatusBadge status={inspection.severity} />
                {inspection.request_code && <StatusBadge status="OPEN" label={inspection.request_code} tone="warning" />}
              </div>
            </div>
            {inspection.defects.length > 0 && <p className="mt-1 text-sm">{inspection.defects.join(" · ")}</p>}
            {inspection.remarks && <p className="mt-1 text-sm text-muted">{inspection.remarks}</p>}
            {inspection.distance_from_asset_m != null && inspection.distance_from_asset_m > 2000 && (
              <p className="mt-1 text-xs text-amber-700">⚠ Captured {(inspection.distance_from_asset_m / 1000).toFixed(1)} km from the registered location</p>
            )}
            {inspection.photos.some((photo) => photo.url) && (
              <div className="mt-2 flex gap-2">
                {inspection.photos
                  .filter((photo) => photo.url)
                  .map((photo) => (
                    <a key={photo.path} href={photo.url!} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url!} alt="Inspection evidence" className="h-full w-full object-cover" />
                    </a>
                  ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
