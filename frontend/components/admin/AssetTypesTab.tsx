"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import ErrorState from "@/components/ui/ErrorState";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import StatusBadge, { humanize } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import type { AttributeField } from "@/types/assets";
import { FormError, useSave } from "./shared";

type AdminAssetType = {
  id: string;
  code: string;
  name: string;
  category: string;
  code_prefix: string;
  attribute_schema: AttributeField[];
  inspection_interval_days: number;
  design_life_years: number;
  is_active: boolean;
  asset_count: number;
};

const categories = ["ROAD", "BRIDGE", "CULVERT", "BUILDING", "ELECTRICAL", "ROAD_FURNITURE", "EQUIPMENT", "OTHER"];
type DraftField = AttributeField & { optionsText: string };
const toDraft = (field: AttributeField): DraftField => ({ ...field, optionsText: (field.options ?? []).join(", ") });
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1");

function SchemaEditor({ fields, onChange }: { fields: DraftField[]; onChange: (fields: DraftField[]) => void }) {
  const update = (index: number, patch: Partial<DraftField>) => onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Form fields</p>
        <Button size="sm" variant="secondary" onClick={() => onChange([...fields, { key: "", label: "", type: "text", optionsText: "", required: false }])}>
          + Add field
        </Button>
      </div>
      {!fields.length && <p className="rounded-lg bg-page p-3 text-sm text-muted">No extra fields — assets of this type only have the standard details.</p>}
      <ul className="space-y-2">
        {fields.map((field, index) => (
          <li key={index} className="rounded-xl border border-line p-3">
            <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_0.8fr_auto]">
              <Input
                label="Label"
                value={field.label}
                onChange={(event) => update(index, { label: event.target.value, key: field.key && field.key !== slug(field.label) ? field.key : slug(event.target.value) })}
              />
              <Select
                label="Type"
                value={field.type}
                onChange={(event) => update(index, { type: event.target.value as AttributeField["type"] })}
                options={[
                  { value: "text", label: "Text" },
                  { value: "number", label: "Number" },
                  { value: "select", label: "Choice list" },
                  { value: "boolean", label: "Yes / no" }
                ]}
              />
              {field.type === "number" ? <Input label="Unit" value={field.unit ?? ""} onChange={(event) => update(index, { unit: event.target.value })} placeholder="m, kW…" /> : <span />}
              <div className="flex items-end gap-1 pb-1">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={Boolean(field.required)} onChange={(event) => update(index, { required: event.target.checked })} /> Required
                </label>
                <Button size="sm" variant="ghost" aria-label="Remove field" onClick={() => onChange(fields.filter((_, i) => i !== index))}>
                  ✕
                </Button>
              </div>
            </div>
            {field.type === "select" && (
              <div className="mt-2">
                <Input label="Choices (comma-separated)" value={field.optionsText} onChange={(event) => update(index, { optionsText: event.target.value })} placeholder="Centrifugal, Submersible" />
              </div>
            )}
            <p className="mt-1 font-mono text-[11px] text-muted">key: {field.key || "—"}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TypeModal({ type, onClose, onSaved }: { type: AdminAssetType | null; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const { saving, error, fieldErrors, save } = useSave();
  const [form, setForm] = useState({
    code: type?.code ?? "",
    name: type?.name ?? "",
    category: type?.category ?? "EQUIPMENT",
    code_prefix: type?.code_prefix ?? "",
    inspection_interval_days: String(type?.inspection_interval_days ?? 180),
    design_life_years: String(type?.design_life_years ?? 20)
  });
  const [fields, setFields] = useState<DraftField[]>((type?.attribute_schema ?? []).map(toDraft));
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit() {
    const attribute_schema = fields.map(({ optionsText, ...field }) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      ...(field.type === "number" && field.unit ? { unit: field.unit } : {}),
      ...(field.type === "select" ? { options: optionsText.split(",").map((option) => option.trim()).filter(Boolean) } : {}),
      ...(field.required ? { required: true } : {})
    }));
    const common = { name: form.name, inspection_interval_days: Number(form.inspection_interval_days), design_life_years: Number(form.design_life_years), attribute_schema };
    const ok = type
      ? await save(() => api(`/admin/asset-types/${type.id}`, { method: "PATCH", token, body: common }), { title: "Asset type updated", description: `${form.name} — new assets use the updated form` })
      : await save(() => api("/admin/asset-types", { method: "POST", token, body: { ...common, code: form.code, category: form.category, code_prefix: form.code_prefix } }), {
          title: "Asset type created",
          description: `${form.name} is now available in “Register asset”`
        });
    if (ok) {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={type ? `Edit ${type.name}` : "New asset type"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!form.name || (!type && (!form.code || form.code_prefix.length < 2)) || fields.some((field) => !field.label)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" required value={form.name} onChange={set("name")} placeholder="e.g. Water pump" />
          <Input label="Code" required value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={Boolean(type)} className="font-mono" placeholder="WATER_PUMP" />
          <Select label="Category" value={form.category} onChange={set("category")} disabled={Boolean(type)} options={categories.map((category) => ({ value: category, label: humanize(category) }))} />
          <Input label="Asset code prefix" required value={form.code_prefix} onChange={(event) => setForm((current) => ({ ...current, code_prefix: event.target.value.toUpperCase().slice(0, 3) }))} disabled={Boolean(type)} className="font-mono" hint={`Codes look like RDB-${form.code_prefix || "XX"}-001234`} />
          <Input label="Inspection every (days)" inputMode="numeric" value={form.inspection_interval_days} onChange={set("inspection_interval_days")} hint="Applies to the next inspection recorded" />
          <Input label="Design life (years)" inputMode="numeric" value={form.design_life_years} onChange={set("design_life_years")} hint="Feeds the age factor of the risk score" />
        </div>
        <SchemaEditor fields={fields} onChange={setFields} />
        <FormError error={error} fieldErrors={fieldErrors} />
      </div>
    </Modal>
  );
}

export default function AssetTypesTab() {
  const { token } = useAuth();
  const { save } = useSave();
  const types = useApi<AdminAssetType[]>("/admin/asset-types");
  const [editing, setEditing] = useState<AdminAssetType | null | undefined>(undefined);
  if (types.loading) return <Loading />;
  if (types.error || !types.data) return <ErrorState message={types.error ?? undefined} onRetry={types.reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Asset types are configuration: adding one (e.g. water pumps) needs no code change. The fields below become the registration form.</p>
        <Button onClick={() => setEditing(null)}>+ New asset type</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {types.data.map((type) => (
          <div key={type.id} className={`rounded-2xl border border-line bg-surface p-4 shadow-card ${type.is_active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{type.name}</p>
                <p className="font-mono text-[11px] text-muted">
                  {type.code} · RDB-{type.code_prefix}-…
                </p>
              </div>
              <StatusBadge status={type.category} tone="neutral" />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-page p-2">
                <dt className="text-[11px] text-muted">Assets</dt>
                <dd className="font-heading font-semibold">{type.asset_count}</dd>
              </div>
              <div className="rounded-lg bg-page p-2">
                <dt className="text-[11px] text-muted">Inspect</dt>
                <dd className="font-heading font-semibold">{type.inspection_interval_days}d</dd>
              </div>
              <div className="rounded-lg bg-page p-2">
                <dt className="text-[11px] text-muted">Life</dt>
                <dd className="font-heading font-semibold">{type.design_life_years}y</dd>
              </div>
            </dl>
            <p className="mt-3 truncate text-xs text-muted">
              {type.attribute_schema.length ? type.attribute_schema.map((field) => field.label).join(" · ") : "No extra fields"}
            </p>
            <div className="mt-3 flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(type)}>Edit</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (await save(() => api(`/admin/asset-types/${type.id}`, { method: "PATCH", token, body: { is_active: !type.is_active } }), { title: `${type.name} ${type.is_active ? "hidden from new registrations" : "re-enabled"}` })) types.reload();
                }}
              >
                {type.is_active ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {editing !== undefined && <TypeModal type={editing} onClose={() => setEditing(undefined)} onSaved={types.reload} />}
    </div>
  );
}
