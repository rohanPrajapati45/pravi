"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { Programme, WorkTemplate } from "@/types/works";

type OrgUnit = { id: string; name: string; district: string | null; parent_id: string | null };
type Lookup = { id: string; asset_code: string; name: string; type_name: string };

const initiationTypes = [
  { value: "PROGRAMME", label: "Government programme / budget head" },
  { value: "DIRECTIVE", label: "Directive / decision (Minister, Secretary)" },
  { value: "DEPOSIT_REQUEST", label: "Deposit work requested by another department" },
  { value: "FIELD_NEED", label: "Field need (inspection finding, renewal)" },
  { value: "EMERGENCY", label: "Emergency (flood, cyclone damage)" },
  { value: "COMPLAINT", label: "Citizen complaint" }
];

export default function NewWorkPage() {
  const router = useRouter();
  const { token } = useAuth();
  const templates = useApi<WorkTemplate[]>("/work-templates");
  const programmes = useApi<Programme[]>("/programmes");
  const divisions = useApi<OrgUnit[]>("/org-units", { type: "DIVISION", limit: 200 });
  const [form, setForm] = useState<Record<string, string>>({ template_code: "NEW_ROAD", initiation_type: "PROGRAMME", priority: "MEDIUM", initiation_date: new Date().toISOString().slice(0, 10) });
  const [asset, setAsset] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<Lookup[]>([]);
  const [targetCode, setTargetCode] = useState("");
  const [targetError, setTargetError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const subs = useApi<OrgUnit[]>(form.org_unit_id ? "/org-units" : null, { parent_id: form.org_unit_id, limit: 100 });

  const template = useMemo(() => templates.data?.find((item) => item.code === form.template_code), [templates.data, form.template_code]);
  const set = (key: string) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const setA = (key: string) => (event: { target: { value: string } }) => setAsset((current) => ({ ...current, [key]: event.target.value }));
  const newAsset = Boolean(template?.asset_type_code);
  const road = template?.asset_type_code === "ROAD_SEGMENT";

  async function addTarget() {
    setTargetError(null);
    try {
      const { data } = await api<Lookup>("/assets/lookup", { token, query: { code: targetCode.trim() } });
      if (!targets.some((item) => item.id === data.id)) setTargets((current) => [...current, data]);
      setTargetCode("");
    } catch (caught) {
      setTargetError((caught as Error).message);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = { ...form, estimated_cost: Number(form.estimated_cost) };
    for (const key of Object.keys(body)) if (body[key] === "") delete body[key];
    if (newAsset) {
      body.planned_asset = {
        name: asset.name,
        org_unit_id: asset.org_unit_id,
        road_code: asset.road_code || undefined,
        start_chainage_km: asset.start ? Number(asset.start) : undefined,
        end_chainage_km: asset.end ? Number(asset.end) : undefined
      };
    } else {
      body.target_asset_ids = targets.map((item) => item.id);
    }
    try {
      const { data } = await api<{ id: string }>("/works", { method: "POST", token, body });
      router.push(`/works/${data.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : (caught as Error).message);
      setSaving(false);
    }
  }

  return (
    <AppShell title="Initiate work" allowedRoles={["HQ", "EE"]}>
      <form onSubmit={submit} className="mx-auto max-w-3xl space-y-4">
        <Card title="1 · What kind of work?">
          <div className="grid gap-2 sm:grid-cols-2">
            {(templates.data ?? []).map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setForm((current) => ({ ...current, template_code: item.code }))}
                aria-pressed={form.template_code === item.code}
                className={cn("rounded-xl border p-3 text-left", form.template_code === item.code ? "border-accent bg-accent-soft" : "border-line hover:border-accent")}
              >
                <p className="font-medium">{item.name}</p>
                <p className="mt-0.5 text-xs text-muted">{item.stages.length} stages · {item.stages.reduce((sum, stage) => sum + Number(stage.tasks), 0)} tasks</p>
              </button>
            ))}
          </div>
          {template && <p className="mt-3 text-sm text-muted">{template.description}</p>}
          {template && (
            <p className="mt-2 text-xs text-muted">
              Stages: {template.stages.map((stage) => stage.name).join(" → ")}
            </p>
          )}
        </Card>

        <Card title="2 · Mandate">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Title" required value={form.title ?? ""} onChange={set("title")} placeholder="e.g. Sanand–Dholka link road, new 2-lane" />
            </div>
            <Select label="Initiated from" value={form.initiation_type} onChange={set("initiation_type")} options={initiationTypes} />
            <Select
              label="Programme"
              placeholder="None"
              value={form.programme_id ?? ""}
              onChange={set("programme_id")}
              options={(programmes.data ?? []).map((programme) => ({ value: programme.id, label: programme.name }))}
            />
            <Input label="Order / reference number" value={form.initiation_ref ?? ""} onChange={set("initiation_ref")} placeholder="GR/RB/2026/…" />
            <Input label="Order date" type="date" value={form.initiation_date ?? ""} onChange={set("initiation_date")} />
            <Select
              label="Responsible division"
              required
              placeholder={divisions.loading ? "Loading…" : "Select division"}
              value={form.org_unit_id ?? ""}
              onChange={(event) => {
                set("org_unit_id")(event);
                setAsset((current) => ({ ...current, org_unit_id: "" }));
              }}
              options={(divisions.data ?? []).map((unit) => ({ value: unit.id, label: unit.name }))}
            />
            <Select
              label="Priority"
              value={form.priority}
              onChange={set("priority")}
              options={["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))}
            />
            <Input
              label="Indicative estimate (₹)"
              required
              inputMode="numeric"
              value={form.estimated_cost ?? ""}
              onChange={set("estimated_cost")}
              hint={form.estimated_cost ? `${formatRupees(Number(form.estimated_cost))}${Number(form.estimated_cost) > 2e7 ? " — above the EE's ₹2 Cr limit, sanction will escalate to HQ" : ""}` : undefined}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Target start" type="date" value={form.target_start ?? ""} onChange={set("target_start")} />
              <Input label="Target end" type="date" value={form.target_end ?? ""} onChange={set("target_end")} />
            </div>
            <div className="sm:col-span-2">
              <Textarea label="Objective" value={form.objective ?? ""} onChange={set("objective")} placeholder="Why this work, and what outcome it must deliver" />
            </div>
          </div>
        </Card>

        {newAsset ? (
          <Card title="3 · The asset this work will create" subtitle="Registered as PLANNED when the DPR passes, activated at handover">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input label="Asset name" required value={asset.name ?? ""} onChange={setA("name")} />
              </div>
              <Select
                label="Sub-division"
                required
                placeholder={!form.org_unit_id ? "Pick the division first" : subs.loading ? "Loading…" : "Select sub-division"}
                value={asset.org_unit_id ?? ""}
                onChange={setA("org_unit_id")}
                options={(subs.data ?? []).map((unit) => ({ value: unit.id, label: unit.name }))}
              />
              {road && (
                <>
                  <Input label="Road code" required value={asset.road_code ?? ""} onChange={setA("road_code")} className="font-mono" placeholder="DMO-AMD-22" />
                  <Input label="Start chainage (km)" required inputMode="decimal" value={asset.start ?? ""} onChange={setA("start")} />
                  <Input label="End chainage (km)" required inputMode="decimal" value={asset.end ?? ""} onChange={setA("end")} />
                </>
              )}
            </div>
          </Card>
        ) : (
          <Card title="3 · Asset(s) to repair">
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <Input label="Asset code" value={targetCode} onChange={(event) => setTargetCode(event.target.value)} className="font-mono" placeholder="RDB-BR-000123" error={targetError ?? undefined} />
              <Button variant="secondary" onClick={addTarget}>Add</Button>
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {targets.map((item) => (
                <li key={item.id} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                  <span className="font-mono text-xs">{item.asset_code}</span> {item.name}
                  <button type="button" aria-label="Remove" onClick={() => setTargets((current) => current.filter((target) => target.id !== item.id))}>✕</button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!form.title || !form.org_unit_id || !form.estimated_cost || (newAsset ? !asset.name || !asset.org_unit_id : !targets.length)}>
            Initiate work
          </Button>
        </div>
        <p className="text-center text-xs text-muted">Creating the work instantiates every stage and task from the template; you are assigned the initiation tasks.</p>
      </form>
    </AppShell>
  );
}
