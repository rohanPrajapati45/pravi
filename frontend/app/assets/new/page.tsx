"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import AttributeFields from "@/components/assets/AttributeFields";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import type { AssetType } from "@/types/assets";

type OrgUnit = { id: string; name: string; district: string | null };
type Lookup = { id: string; asset_code: string; name: string; type_name: string };

const levels = [1, 2, 3, 4, 5].map((level) => ({ value: String(level), label: `${level} · ${["", "Very low", "Low", "Moderate", "High", "Very high"][level]}` }));

export default function NewAssetPage() {
  const router = useRouter();
  const { token } = useAuth();
  const types = useApi<AssetType[]>("/asset-types");
  const subs = useApi<OrgUnit[]>("/org-units", { type: "SUBDIVISION", limit: 200 });

  const [form, setForm] = useState<Record<string, string>>({ lifecycle_status: "OPERATIONAL", criticality: "3", traffic_level: "3" });
  const [attributes, setAttributes] = useState<Record<string, unknown>>({});
  const [parentCode, setParentCode] = useState("");
  const [parent, setParent] = useState<Lookup | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const type = useMemo(() => types.data?.find((candidate) => candidate.id === form.type_id), [types.data, form.type_id]);
  const set = (key: string) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function findParent() {
    setParent(null);
    if (!parentCode.trim()) return;
    try {
      const { data } = await api<Lookup>("/assets/lookup", { token, query: { code: parentCode.trim() } });
      setParent(data);
      setErrors((current) => ({ ...current, parent: "" }));
    } catch (caught) {
      setErrors((current) => ({ ...current, parent: (caught as Error).message }));
    }
  }

  function useLocation() {
    if (!navigator.geolocation) return setMessage("This browser cannot share location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({ ...current, lat: position.coords.latitude.toFixed(6), lng: position.coords.longitude.toFixed(6) }));
        setLocating(false);
      },
      () => {
        setMessage("Location permission denied — enter coordinates manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);
    const numeric = ["lat", "lng", "criticality", "traffic_level", "original_cost", "start_chainage_km", "end_chainage_km", "condition_rating"];
    const body: Record<string, unknown> = { attributes };
    for (const [key, value] of Object.entries(form)) {
      if (value === "") continue;
      body[key] = numeric.includes(key) ? Number(value) : value;
    }
    if (parent) body.parent_id = parent.id;
    try {
      const { data } = await api<{ id: string }>("/assets", { method: "POST", token, body });
      router.push(`/assets/${data.id}`);
    } catch (caught) {
      if (caught instanceof ApiError && Array.isArray(caught.details)) {
        setErrors(Object.fromEntries((caught.details as Array<{ field: string; message: string }>).map((detail) => [detail.field, detail.message])));
      }
      setMessage(caught instanceof Error ? caught.message : "Could not save");
      setSaving(false);
    }
  }

  const isRoad = type?.category === "ROAD";

  return (
    <AppShell title="Register asset" allowedRoles={["HQ", "EE", "AE"]}>
      <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-4">
        <Card title="What is it?">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Asset type"
              required
              placeholder={types.loading ? "Loading…" : "Select a type"}
              value={form.type_id ?? ""}
              onChange={(event) => {
                set("type_id")(event);
                setAttributes({});
              }}
              options={(types.data ?? []).map((candidate) => ({ value: candidate.id, label: `${candidate.name} (${candidate.category.toLowerCase()})` }))}
              error={errors.type_id}
            />
            <Input label="Name" required value={form.name ?? ""} onChange={set("name")} placeholder="e.g. Sanand Minor Bridge 4" error={errors.name} />
          </div>
          {type && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold">{type.name} details</h3>
              <AttributeFields schema={type.attribute_schema} values={attributes} onChange={setAttributes} errors={errors} />
              <p className="mt-2 text-xs text-muted">
                Inspection every {type.inspection_interval_days} days · design life {type.design_life_years} years (from type configuration)
              </p>
            </div>
          )}
        </Card>

        <Card title="Where is it?">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Sub-division"
              required
              placeholder={subs.loading ? "Loading…" : "Select sub-division"}
              value={form.org_unit_id ?? ""}
              onChange={set("org_unit_id")}
              options={(subs.data ?? []).map((unit) => ({ value: unit.id, label: `${unit.name} · ${unit.district}` }))}
              error={errors.org_unit_id}
              hint="Only sub-divisions in your jurisdiction are listed"
            />
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Input label="Latitude" inputMode="decimal" value={form.lat ?? ""} onChange={set("lat")} error={errors.lat} />
              <Input label="Longitude" inputMode="decimal" value={form.lng ?? ""} onChange={set("lng")} error={errors.lng} />
              <Button variant="secondary" onClick={useLocation} loading={locating} aria-label="Use my location">
                GPS
              </Button>
            </div>
            {isRoad && (
              <>
                <Input label="Road code" required value={form.road_code ?? ""} onChange={set("road_code")} placeholder="DMO-AMD-07" className="font-mono" />
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Start chainage (km)" required inputMode="decimal" value={form.start_chainage_km ?? ""} onChange={set("start_chainage_km")} />
                  <Input label="End chainage (km)" required inputMode="decimal" value={form.end_chainage_km ?? ""} onChange={set("end_chainage_km")} />
                </div>
              </>
            )}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
            <Input
              label="Part of (parent asset code, optional)"
              value={parentCode}
              onChange={(event) => setParentCode(event.target.value)}
              placeholder="RDB-BL-000380"
              className="font-mono"
              error={errors.parent}
              hint={parent ? `✓ ${parent.name} (${parent.type_name})` : "Use for components, e.g. a lift inside a building"}
            />
            <Button variant="secondary" onClick={findParent}>
              Find
            </Button>
          </div>
        </Card>

        <Card title="Importance & history">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Structural importance" value={form.criticality} onChange={set("criticality")} options={levels} />
            <Select label="Traffic / usage" value={form.traffic_level} onChange={set("traffic_level")} options={levels} />
            <Select
              label="Lifecycle status"
              value={form.lifecycle_status}
              onChange={set("lifecycle_status")}
              options={[
                { value: "OPERATIONAL", label: "Operational" },
                { value: "UNDER_CONSTRUCTION", label: "Under construction" },
                { value: "PLANNED", label: "Planned" }
              ]}
            />
            <Input label="Commissioned on" type="date" value={form.commissioned_on ?? ""} onChange={set("commissioned_on")} />
            <Input label="Original cost (₹)" inputMode="numeric" value={form.original_cost ?? ""} onChange={set("original_cost")} />
            <Select
              label="Current condition (if known)"
              placeholder="Not rated yet"
              value={form.condition_rating ?? ""}
              onChange={set("condition_rating")}
              options={[5, 4, 3, 2, 1].map((rating) => ({ value: String(rating), label: `${rating} · ${["", "Critical", "Poor", "Moderate", "Good", "Excellent"][rating]}` }))}
            />
          </div>
        </Card>

        {message && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Register asset
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
