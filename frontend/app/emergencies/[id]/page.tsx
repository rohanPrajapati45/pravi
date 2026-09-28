"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useSave } from "@/components/admin/shared";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import StatusBadge, { humanize } from "@/components/ui/StatusBadge";
import Textarea from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRupees } from "@/lib/format";
import { uploadEvidence } from "@/lib/storage";
import { useApi } from "@/lib/useApi";
import type { EmergencyAsset, EmergencyDetail } from "@/types/operations";

const trafficTone = { OPEN: "success", RESTRICTED: "warning", CLOSED: "danger" } as const;

function ReportModal({ emergency, onClose, onDone }: { emergency: EmergencyDetail; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const { save, saving, error } = useSave();
  const [code, setCode] = useState("");
  const [asset, setAsset] = useState<{ id: string; asset_code: string; name: string; type_name: string } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [form, setForm] = useState({ damage: "", severity: "MAJOR", traffic_status: "RESTRICTED" });
  const [files, setFiles] = useState<File[]>([]);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function lookup() {
    setLookupError(null);
    try {
      const { data } = await api<{ id: string; asset_code: string; name: string; type_name: string }>("/assets/lookup", { token, query: { code: code.trim() } });
      setAsset(data);
    } catch (caught) {
      setAsset(null);
      setLookupError((caught as Error).message);
    }
  }

  async function submit() {
    if (!asset) return;
    const ok = await save(
      async () => {
        const photo_paths = [];
        for (const file of files) photo_paths.push(await uploadEvidence(file, { purpose: "emergency", ownerId: emergency.id, token }));
        await api(`/emergencies/${emergency.id}/assets`, { method: "POST", token, body: { asset_id: asset.id, ...form, photo_paths } });
      },
      { title: `Damage reported on ${asset.asset_code}`, description: form.traffic_status === "CLOSED" ? "Closed to traffic; urgent repair raised" : "Urgent repair raised" }
    );
    if (ok) {
      onDone();
      onClose();
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="Report damaged asset" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving} disabled={!asset || form.damage.trim().length < 5}>Report</Button></>}>
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label="Asset code (from the board or QR)" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && lookup()} placeholder="RDB-CV-000123" className="font-mono" error={lookupError ?? undefined} />
          </div>
          <Button variant="secondary" onClick={lookup} disabled={!code.trim()}>Find</Button>
        </div>
        {asset && (
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">
            <span className="font-mono">{asset.asset_code}</span> · {asset.name} · {asset.type_name}
          </p>
        )}
        <Textarea label="What is damaged?" value={form.damage} onChange={set("damage")} rows={2} placeholder="Approach embankment washed out; 1 m deep scour at the left abutment" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Severity" value={form.severity} onChange={set("severity")} options={[{ value: "MINOR", label: "Minor — usable" }, { value: "MAJOR", label: "Major — restricted use" }, { value: "SEVERE", label: "Severe — unsafe" }]} />
          <Select label="Traffic" value={form.traffic_status} onChange={set("traffic_status")} options={[{ value: "OPEN", label: "Open" }, { value: "RESTRICTED", label: "Restricted (one lane / light vehicles)" }, { value: "CLOSED", label: "Closed to traffic" }]} />
        </div>
        <label className="block text-sm">
          <span className="font-medium">Photos (optional, up to 3)</span>
          <input type="file" accept="image/*" capture="environment" multiple className="mt-1 block w-full text-sm" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))} />
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <p className="text-xs text-muted">
          Reporting raises an urgent repair (due in 1 day if severe, 3 if major){form.traffic_status === "CLOSED" && " and closes the asset to traffic until it is restored"}.
        </p>
      </div>
    </Modal>
  );
}

function RecordModal({ emergency, record, action, onClose, onDone }: { emergency: EmergencyDetail; record: EmergencyAsset; action: "restore" | "start_work"; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const { save, saving, error } = useSave();
  const [value, setValue] = useState("");
  async function submit() {
    const ok = await save(
      () =>
        action === "restore"
          ? api(`/emergencies/${emergency.id}/assets/${record.id}/restore`, { method: "POST", token, body: { remarks: value } })
          : api(`/emergencies/${emergency.id}/assets/${record.id}/work`, { method: "POST", token, body: { estimated_cost: Number(value) } }),
      { title: action === "restore" ? `${record.asset_code} restored` : `Emergency work started for ${record.asset_code}` }
    );
    if (ok) {
      onDone();
      onClose();
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={action === "restore" ? `Restore ${record.asset_code}` : `Fast-track emergency work — ${record.asset_code}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>{action === "restore" ? "Mark restored" : "Start emergency work"}</Button></>}
    >
      {action === "restore" ? (
        <Textarea label="What was done to make it safe?" value={value} onChange={(event) => setValue(event.target.value)} rows={3} placeholder="Debris cleared, temporary diversion built, opened for light vehicles" />
      ) : (
        <div className="space-y-2">
          <Input label="Immediate estimate (₹)" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} hint={value ? formatRupees(Number(value)) : "Rough figure; sanction is recorded after the fact"} />
          <p className="text-xs text-muted">Creates a work from the Emergency template: immediate action first, estimate and approval recorded post facto, then permanent repair and close.</p>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}

function CloseModal({ emergency, onClose, onDone }: { emergency: EmergencyDetail; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const { save, saving, error } = useSave();
  const [remarks, setRemarks] = useState("");
  async function submit() {
    if (await save(() => api(`/emergencies/${emergency.id}/close`, { method: "POST", token, body: { remarks: remarks || undefined } }), { title: `${emergency.emergency_code} closed` })) {
      onDone();
      onClose();
    }
  }
  return (
    <Modal open onClose={onClose} title={`Close ${emergency.emergency_code}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Close emergency</Button></>}>
      {emergency.assets_pending > 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{emergency.assets_pending} asset(s) are not restored yet — explain how they are being handled.</p>}
      <Textarea label={emergency.assets_pending ? "Closure remarks (required)" : "Closure remarks"} value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={3} />
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}

export default function EmergencyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useApi<EmergencyDetail>(`/emergencies/${id}`);
  const [modal, setModal] = useState<null | { kind: "report" } | { kind: "close" } | { kind: "record"; record: EmergencyAsset; action: "restore" | "start_work" }>(null);
  const close = () => setModal(null);

  if (detail.loading && !detail.data) return <AppShell title="Emergency"><Loading /></AppShell>;
  if (detail.error || !detail.data) {
    return (
      <AppShell title="Emergency">
        <ErrorState title={detail.status === 403 ? "Outside your jurisdiction" : "Could not load emergency"} message={detail.error ?? undefined} onRetry={detail.status === 403 ? undefined : detail.reload} />
      </AppShell>
    );
  }
  const e = detail.data;
  const active = e.status === "ACTIVE";

  return (
    <AppShell title="Emergency" subtitle={`${e.emergency_code} · ${e.area_name}`}>
      <div className={cn("mb-4 rounded-2xl border p-4 shadow-card", active ? "border-red-200 bg-red-50/60" : "border-line bg-surface")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href="/emergencies" className="text-sm text-accent-text hover:underline">← Emergencies</Link>
            <p className="mt-1 font-mono text-sm text-accent-text">{e.emergency_code}</p>
            <h2 className="text-lg font-semibold">{e.title}</h2>
            <p className="text-sm text-muted">{humanize(e.kind)} · {e.area_name} ({humanize(e.area_type)})</p>
            {e.description && <p className="mt-2 max-w-2xl text-sm">{e.description}</p>}
            <p className="mt-2 font-mono text-[11px] text-muted">
              Declared {formatDateTime(e.declared_at)} by {e.declared_by_name}
              {e.closed_at && ` · closed ${formatDateTime(e.closed_at)} by ${e.closed_by_name}`}
            </p>
            {e.closure_remarks && <p className="mt-1 text-sm text-muted">Closure: {e.closure_remarks}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={e.status} />
            {e.permissions.report && <Button onClick={() => setModal({ kind: "report" })}>Report damage</Button>}
            {e.permissions.close && <Button variant="secondary" onClick={() => setModal({ kind: "close" })}>Close emergency</Button>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Damaged assets", e.assets_reported],
            ["Closed to traffic", e.assets_closed],
            ["Awaiting restoration", e.assets_pending],
            ["Restored", e.assets_reported - e.assets_pending]
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-surface p-3 shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <Card title="Damaged assets" subtitle="Each report raises an urgent repair; closing to traffic changes the asset's status until it is restored">
        {!e.assets.length ? (
          <EmptyState title="No damage reported yet" description={e.permissions.report ? "Field engineers report damaged assets by code — from the board, QR or the map." : undefined} />
        ) : (
          <ul className="space-y-3">
            {e.assets.map((record) => (
              <li key={record.id} className={cn("rounded-xl border border-l-4 p-3", record.status === "RESTORED" ? "border-line border-l-emerald-400" : record.severity === "SEVERE" ? "border-line border-l-red-500" : "border-line border-l-amber-400")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <Link href={`/assets/${record.asset_id}`} className="font-mono text-accent-text underline">{record.asset_code}</Link> · {record.asset_name}
                    </p>
                    <p className="text-xs text-muted">{record.asset_type} · {record.org_unit_name}</p>
                    <p className="mt-1.5 text-sm">{record.damage}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge status={record.severity} />
                    <StatusBadge status={record.traffic_status} label={`Traffic ${record.traffic_status.toLowerCase()}`} tone={trafficTone[record.traffic_status]} />
                    <StatusBadge status={record.status} />
                  </div>
                </div>
                {record.photos.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {record.photos.filter((photo) => photo.url).map((photo) => (
                      <a key={photo.path} href={photo.url!} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg border border-line">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.url!} alt="Damage" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="font-mono">Reported {formatDateTime(record.reported_at)} by {record.reported_by_name}</span>
                  {record.request_code && (
                    <Link href={`/maintenance/${record.maintenance_request_id}`} className="text-accent-text underline">
                      Repair {record.request_code} · {humanize(record.request_status ?? "")}
                    </Link>
                  )}
                  {record.work_code && (
                    <Link href={`/works/${record.work_id}`} className="text-accent-text underline">
                      Work {record.work_code} · {humanize(record.work_status ?? "")}
                    </Link>
                  )}
                  {record.restored_at && <span className="font-mono text-emerald-700">Restored {formatDateTime(record.restored_at)} by {record.restored_by_name} — {record.restore_remarks}</span>}
                </div>
                {record.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {record.actions.includes("restore") && <Button size="sm" onClick={() => setModal({ kind: "record", record, action: "restore" })}>Mark restored</Button>}
                    {record.actions.includes("start_work") && <Button size="sm" variant="secondary" onClick={() => setModal({ kind: "record", record, action: "start_work" })}>Fast-track emergency work</Button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {modal?.kind === "report" && <ReportModal emergency={e} onClose={close} onDone={detail.reload} />}
      {modal?.kind === "close" && <CloseModal emergency={e} onClose={close} onDone={detail.reload} />}
      {modal?.kind === "record" && <RecordModal emergency={e} record={modal.record} action={modal.action} onClose={close} onDone={detail.reload} />}
    </AppShell>
  );
}
