"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { ColourBy, GeoFeature } from "@/components/map/AssetMap";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import ErrorState from "@/components/ui/ErrorState";
import Loading from "@/components/ui/Loading";
import Select from "@/components/ui/Select";
import { humanize } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/useApi";
import { DISTRICTS, LIFECYCLE_STATUSES, RISK_BANDS, type AssetType } from "@/types/assets";

// Leaflet touches `window`, so the map is loaded in the browser only.
const AssetMap = dynamic(() => import("@/components/map/AssetMap"), { ssr: false, loading: () => <Loading label="Loading map…" /> });

type Geo = { type: "FeatureCollection"; features: GeoFeature[]; meta: { count: number; truncated: boolean } };

const riskLegend = [
  { label: "Critical", colour: "#DC2626" },
  { label: "High", colour: "#F97316" },
  { label: "Medium", colour: "#EAB308" },
  { label: "Low", colour: "#16A34A" }
];
const conditionLegend = [
  { label: "5 Excellent", colour: "#16A34A" },
  { label: "4 Good", colour: "#65A30D" },
  { label: "3 Moderate", colour: "#EAB308" },
  { label: "2 Poor", colour: "#F97316" },
  { label: "1 Critical", colour: "#DC2626" },
  { label: "Not rated", colour: "#94A3B8" }
];

function MapScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const focusId = params.get("focus");
  const [colourBy, setColourBy] = useState<ColourBy>("risk");
  const [filters, setFilters] = useState({ type_id: "", district: "", status: "", risk_band: params.get("risk_band") ?? "", overdue: "", in_dlp: "" });
  const types = useApi<AssetType[]>("/asset-types");
  const geo = useApi<Geo>("/assets/geo", filters);
  const set = (key: keyof typeof filters) => (event: { target: { value: string } }) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const active = Object.values(filters).filter(Boolean).length;
  const features = geo.data?.features ?? [];
  const legend = colourBy === "risk" ? riskLegend : conditionLegend;

  return (
    <AppShell title="Asset map" subtitle="Every asset in your jurisdiction — clusters show the worst risk inside them">
      <div className="mb-3 rounded-2xl border border-line bg-surface p-3 shadow-card">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <Select aria-label="Type" placeholder="All types" value={filters.type_id} onChange={set("type_id")} options={(types.data ?? []).map((type) => ({ value: type.id, label: type.name }))} />
          <Select aria-label="District" placeholder="All districts" value={filters.district} onChange={set("district")} options={DISTRICTS.map((district) => ({ value: district, label: district }))} />
          <Select aria-label="Status" placeholder="Any status" value={filters.status} onChange={set("status")} options={LIFECYCLE_STATUSES.map((status) => ({ value: status, label: humanize(status) }))} />
          <Select aria-label="Risk" placeholder="Any risk" value={filters.risk_band} onChange={set("risk_band")} options={RISK_BANDS.map((band) => ({ value: band, label: humanize(band) }))} />
          <Select aria-label="Inspection" placeholder="Any inspection state" value={filters.overdue} onChange={set("overdue")} options={[{ value: "true", label: "Inspection overdue" }]} />
          <Select aria-label="DLP" placeholder="Any DLP state" value={filters.in_dlp} onChange={set("in_dlp")} options={[{ value: "true", label: "In defect liability" }]} />
          <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Colour markers by">
            {(["risk", "condition"] as ColourBy[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColourBy(option)}
                aria-pressed={colourBy === option}
                className={cn("flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize", colourBy === option ? "bg-accent text-white" : "text-muted hover:text-ink")}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>
            {geo.loading ? "Loading…" : `${features.length.toLocaleString("en-IN")} assets on the map`}
            {geo.data?.meta.truncated && " (showing the 5,000 highest-risk — narrow the filters)"}
          </span>
          {active > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setFilters({ type_id: "", district: "", status: "", risk_band: "", overdue: "", in_dlp: "" })}>
              Clear {active} filter{active > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </div>

      <div className="relative h-[calc(100vh-15rem)] min-h-[420px] overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {geo.error ? (
          <ErrorState message={geo.error} onRetry={geo.reload} />
        ) : (
          <AssetMap features={features} colourBy={colourBy} focusId={focusId} onOpenAsset={(id) => router.push(`/assets/${id}`)} />
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-card backdrop-blur">
          <p className="mb-1 font-semibold">{colourBy === "risk" ? "Risk band" : "Condition"}</p>
          <ul className="space-y-0.5">
            {legend.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.colour }} aria-hidden />
                {item.label}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-muted">● road / other · ◆ bridge / culvert · ■ building / equipment</p>
        </div>
      </div>
    </AppShell>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MapScreen />
    </Suspense>
  );
}
