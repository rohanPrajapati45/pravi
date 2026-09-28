"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { RiskBadge } from "@/components/assets/RiskBadge";
import AppShell from "@/components/layout/AppShell";
import Button, { ButtonLink } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Select from "@/components/ui/Select";
import StatusBadge, { ConditionBadge } from "@/components/ui/StatusBadge";
import Textarea from "@/components/ui/Textarea";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { conditionScale, defectsByCategory } from "@/lib/defects";
import { uploadEvidence } from "@/lib/storage";
import type { Asset360, RiskBand } from "@/types/assets";

type Gps = { lat: number; lng: number; accuracy: number } | null;
type Result = {
  inspection: { inspection_code: string };
  asset: { id: string; asset_code: string; name: string; previous_condition: number | null; condition_rating: number; previous_risk: { score: number; band: RiskBand }; risk: { score: number; band: RiskBand } };
  maintenance_request: { id: string; request_code: string; dlp_liable: boolean; linked_existing: boolean } | null;
  location_warning: string | null;
};

const severities = [
  { value: "LOW", label: "Low", className: "border-green-300 bg-green-50 text-green-800" },
  { value: "MEDIUM", label: "Medium", className: "border-amber-300 bg-amber-50 text-amber-800" },
  { value: "HIGH", label: "High", className: "border-red-300 bg-red-50 text-red-700" }
];

function InspectionForm() {
  const params = useSearchParams();
  const { token } = useAuth();
  const [code, setCode] = useState("");
  const [asset, setAsset] = useState<Asset360 | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [gps, setGps] = useState<Gps>(null);
  const [gpsState, setGpsState] = useState<"locating" | "ok" | "denied" | "unsupported">("locating");
  const [type, setType] = useState("ROUTINE");
  const [rating, setRating] = useState<number | null>(null);
  const [severity, setSeverity] = useState("LOW");
  const [defects, setDefects] = useState<string[]>([]);
  const [customDefect, setCustomDefect] = useState("");
  const [remarks, setRemarks] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [photos, setPhotos] = useState<Array<{ file: File; preview: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function loadAsset(id: string) {
    setLooking(true);
    setLookupError(null);
    try {
      const { data } = await api<Asset360>(`/assets/${id}/360`, { token });
      setAsset(data);
      setCode(data.asset_code);
    } catch (caught) {
      setLookupError((caught as Error).message);
    } finally {
      setLooking(false);
    }
  }

  async function lookup() {
    if (!code.trim()) return;
    setLooking(true);
    setLookupError(null);
    try {
      const { data } = await api<{ id: string }>("/assets/lookup", { token, query: { code: code.trim() } });
      await loadAsset(data.id);
    } catch (caught) {
      setLookupError((caught as Error).message);
      setLooking(false);
    }
  }

  useEffect(() => {
    const id = params.get("asset");
    if (id && token && !asset) loadAsset(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, token]);

  useEffect(() => {
    if (!navigator.geolocation) return setGpsState("unsupported");
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        setGps({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
        setGpsState("ok");
      },
      () => setGpsState("denied"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  useEffect(() => {
    if (rating === 1) setSeverity("HIGH");
    else if (rating === 2 && severity === "LOW") setSeverity("MEDIUM");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rating]);

  const toggleDefect = (defect: string) => setDefects((current) => (current.includes(defect) ? current.filter((item) => item !== defect) : [...current, defect]));

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).slice(0, 6 - photos.length).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...next]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!asset || !rating) return;
    setSubmitting(true);
    setError(null);
    try {
      const photo_paths = [];
      for (const photo of photos) photo_paths.push(await uploadEvidence(photo.file, { purpose: "inspection", ownerId: asset.id, token }));
      const { data } = await api<Result>("/inspections", {
        method: "POST",
        token,
        body: {
          asset_id: asset.id,
          type,
          condition_rating: rating,
          severity,
          defects,
          remarks: remarks || undefined,
          recommendation: recommendation || undefined,
          lat: gps?.lat,
          lng: gps?.lng,
          gps_accuracy_m: gps ? Math.round(gps.accuracy) : undefined,
          photo_paths
        }
      });
      setResult(data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : (caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const request = result.maintenance_request;
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-5 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-2xl text-condition-excellent" aria-hidden>
            ✓
          </div>
          <h2 className="mt-3 text-lg font-semibold">Inspection recorded</h2>
          <p className="font-mono text-sm text-muted">{result.inspection.inspection_code}</p>
          <div className="mt-4 space-y-2 text-left text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Condition</span>
              <span className="flex items-center gap-2">
                <ConditionBadge rating={result.asset.previous_condition} /> → <ConditionBadge rating={result.asset.condition_rating} />
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Risk</span>
              <span className="flex items-center gap-2">
                <RiskBadge score={result.asset.previous_risk.score} band={result.asset.previous_risk.band} /> → <RiskBadge score={result.asset.risk.score} band={result.asset.risk.band} />
              </span>
            </div>
          </div>
        </div>
        {request ? (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm">
            <p className="font-semibold text-orange-800">
              {request.linked_existing ? "Linked to the open maintenance request" : "Maintenance request raised automatically"}
            </p>
            <p className="mt-1 font-mono">{request.request_code}</p>
            {request.dlp_liable && <StatusBadge status="DLP" label="Contractor liable — asset is in DLP" tone="accent" className="mt-2" />}
          </div>
        ) : (
          <p className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">Condition is acceptable — no repair request needed.</p>
        )}
        {result.location_warning && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">⚠ {result.location_warning}</p>}
        <div className="grid grid-cols-2 gap-2">
          <ButtonLink href={`/assets/${result.asset.id}`} variant="secondary" size="lg">
            Open asset
          </ButtonLink>
          <Button
            size="lg"
            onClick={() => {
              setResult(null);
              setAsset(null);
              setCode("");
              setRating(null);
              setSeverity("LOW");
              setDefects([]);
              setRemarks("");
              setRecommendation("");
              setPhotos([]);
            }}
          >
            Next inspection
          </Button>
        </div>
      </div>
    );
  }

  const defectOptions = asset ? defectsByCategory[asset.category] ?? defectsByCategory.BUILDING : [];

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-5 pb-28">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">1 · Asset</h2>
          <StatusBadge
            status="GPS"
            tone={gpsState === "ok" ? "success" : gpsState === "locating" ? "info" : "warning"}
            label={gpsState === "ok" ? `GPS ±${Math.round(gps?.accuracy ?? 0)} m` : gpsState === "locating" ? "Locating…" : "No GPS"}
          />
        </div>
        {asset ? (
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-accent-text">{asset.asset_code}</p>
              <p className="font-medium">{asset.name}</p>
              <p className="text-xs text-muted">
                {asset.type_name} · last rated <ConditionBadge rating={asset.condition_rating} />
              </p>
            </div>
            <button type="button" className="shrink-0 text-sm text-accent-text underline" onClick={() => setAsset(null)}>
              Change
            </button>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
            <Input
              aria-label="Asset code or QR"
              placeholder="Asset code or QR, e.g. RDB-BR-000001"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="h-12 font-mono"
              error={lookupError ?? undefined}
              autoCapitalize="characters"
            />
            <Button size="lg" onClick={lookup} loading={looking}>
              Find
            </Button>
          </div>
        )}
      </section>

      {asset && (
        <>
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <h2 className="font-semibold">2 · Condition</h2>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {conditionScale.map((item) => (
                <button
                  key={item.rating}
                  type="button"
                  onClick={() => setRating(item.rating)}
                  aria-pressed={rating === item.rating}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center rounded-xl border-2 text-sm font-semibold transition",
                    rating === item.rating ? "border-ink shadow-md" : "border-transparent opacity-70"
                  )}
                >
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-white", item.className)}>{item.rating}</span>
                  <span className="mt-1 text-[11px] font-medium text-ink">{item.label}</span>
                </button>
              ))}
            </div>
            {rating !== null && rating <= 2 && (
              <p className="mt-2 text-xs text-orange-700">A maintenance request will be raised automatically on submit.</p>
            )}
            <h3 className="mt-4 text-sm font-medium">Severity</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {severities.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSeverity(item.value)}
                  aria-pressed={severity === item.value}
                  className={cn("h-11 rounded-xl border text-sm font-medium", severity === item.value ? item.className : "border-line bg-surface text-muted")}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Select
                label="Inspection type"
                value={type}
                onChange={(event) => setType(event.target.value)}
                options={[
                  { value: "ROUTINE", label: "Routine" },
                  { value: "PRE_MONSOON", label: "Pre-monsoon" },
                  { value: "POST_MONSOON", label: "Post-monsoon" },
                  { value: "SPECIAL", label: "Special" },
                  { value: "POST_EMERGENCY", label: "Post-emergency" }
                ]}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <h2 className="font-semibold">3 · Defects</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {[...defectOptions, ...defects.filter((defect) => !defectOptions.includes(defect))].map((defect) => (
                <button
                  key={defect}
                  type="button"
                  onClick={() => toggleDefect(defect)}
                  aria-pressed={defects.includes(defect)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm",
                    defects.includes(defect) ? "border-accent-text bg-accent-soft text-accent-text" : "border-line bg-surface text-muted"
                  )}
                >
                  {defect}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
              <Input aria-label="Other defect" placeholder="Other defect…" value={customDefect} onChange={(event) => setCustomDefect(event.target.value)} />
              <Button
                variant="secondary"
                onClick={() => {
                  if (customDefect.trim()) toggleDefect(customDefect.trim());
                  setCustomDefect("");
                }}
              >
                Add
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <h2 className="font-semibold">4 · Evidence & notes</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <div key={photo.preview} className="relative aspect-square overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.preview} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                    className="absolute right-1 top-1 rounded-full bg-ink/70 px-1.5 text-xs text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {photos.length < 6 && (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line text-sm text-muted hover:border-accent">
                  <span className="text-2xl">＋</span>
                  Photo
                  <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(event) => addPhotos(event.target.files)} />
                </label>
              )}
            </div>
            <div className="mt-3 space-y-3">
              <Textarea label="Remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="What did you observe?" />
              <Input label="Recommendation" value={recommendation} onChange={(event) => setRecommendation(event.target.value)} placeholder="e.g. Clear silt before monsoon" />
            </div>
          </section>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
            <div className="mx-auto max-w-md">
              <Button type="submit" size="lg" fullWidth loading={submitting} disabled={!rating}>
                {rating ? `Submit inspection · ${conditionScale.find((item) => item.rating === rating)?.label}` : "Select a condition to submit"}
              </Button>
            </div>
          </div>
        </>
      )}
      {!asset && (
        <p className="text-center text-sm text-muted">
          Or pick from the <Link href="/inspections" className="text-accent-text underline">overdue list</Link>.
        </p>
      )}
    </form>
  );
}

export default function NewInspectionPage() {
  return (
    <AppShell title="New inspection" allowedRoles={["EE", "AE"]}>
      <Suspense fallback={<Loading />}>
        <InspectionForm />
      </Suspense>
    </AppShell>
  );
}
