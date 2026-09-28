"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/ui/ErrorState";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import StatusBadge, { ConditionBadge, humanize } from "@/components/ui/StatusBadge";
import Textarea from "@/components/ui/Textarea";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { conditionScale } from "@/lib/defects";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { uploadEvidence } from "@/lib/storage";
import { useApi } from "@/lib/useApi";
import { MAINTENANCE_FLOW, type MaintenanceAction, type MaintenanceDetail } from "@/types/maintenance";

const actionMeta: Record<MaintenanceAction, { label: string; variant: "primary" | "secondary" | "danger" }> = {
  assign: { label: "Assign", variant: "primary" },
  start: { label: "Start work", variant: "primary" },
  complete: { label: "Mark complete", variant: "primary" },
  verify: { label: "Verify repair", variant: "primary" },
  reject: { label: "Reject — needs rework", variant: "secondary" },
  close: { label: "Close request", variant: "primary" },
  cancel: { label: "Cancel request", variant: "danger" }
};

function Photos({ photos, label }: { photos: Array<{ path: string; url: string | null }>; label: string }) {
  const visible = photos.filter((photo) => photo.url);
  if (!visible.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {visible.map((photo) => (
          <a key={photo.path} href={photo.url!} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url!} alt={label} className="h-full w-full object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children ?? "—"}</dd>
    </div>
  );
}

export default function MaintenanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useApi<MaintenanceDetail>(`/maintenance-requests/${id}`);
  const [action, setAction] = useState<MaintenanceAction | null>(null);

  if (detail.loading && !detail.data) {
    return (
      <AppShell title="Maintenance request">
        <Loading />
      </AppShell>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <AppShell title="Maintenance request">
        <ErrorState title={detail.status === 403 ? "Outside your jurisdiction" : "Could not load request"} message={detail.error ?? undefined} onRetry={detail.status === 403 ? undefined : detail.reload} />
      </AppShell>
    );
  }

  const r = detail.data;
  const stepIndex = r.status === "CANCELLED" ? -1 : MAINTENANCE_FLOW.indexOf(r.status);

  return (
    <AppShell title="Maintenance request">
      <div className="mb-4 rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm text-accent-text">{r.request_code}</p>
            <h2 className="text-lg font-semibold">{r.title}</h2>
            <p className="mt-1 text-sm text-muted">
              <Link href={`/assets/${r.asset_id}`} className="font-mono text-accent-text underline">
                {r.asset_code}
              </Link>{" "}
              · {r.asset_type} · {r.org_unit_name}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={r.status} />
              <StatusBadge status={r.severity} label={`${humanize(r.severity)} severity`} />
              {r.dlp_liable && <StatusBadge status="DLP" label={`Contractor liable (DLP)${r.contractor_name ? ` · ${r.contractor_name}` : ""}`} tone="accent" />}
              {r.is_overdue && <StatusBadge status="OVERDUE" />}
              {r.rejection_count > 0 && <StatusBadge status="REJECTED" label={`Verification rejected ×${r.rejection_count}`} tone="warning" />}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {r.allowed_actions.map((name) => (
              <Button key={name} size="sm" variant={actionMeta[name].variant} onClick={() => setAction(name)}>
                {actionMeta[name].label}
              </Button>
            ))}
            {!r.allowed_actions.length && !["CLOSED", "CANCELLED"].includes(r.status) && (
              <p className="max-w-xs text-xs text-muted">Waiting on {r.status === "COMPLETED" ? "an independent verifier" : r.status === "OPEN" ? "the EE to assign" : r.assigned_to_name ?? "the assignee"}.</p>
            )}
          </div>
        </div>

        {stepIndex >= 0 && (
          <ol className="mt-4 grid grid-cols-6 gap-1" aria-label="Progress">
            {MAINTENANCE_FLOW.map((status, index) => (
              <li key={status} className="text-center">
                <div className={cn("h-1.5 rounded-full", index <= stepIndex ? "bg-accent" : "bg-line")} />
                <span className={cn("mt-1 block text-[10px] leading-tight sm:text-xs", index === stepIndex ? "font-semibold text-ink" : "text-muted")}>{humanize(status)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-4">
          <Card title="Details">
            {r.description && <p className="mb-3 whitespace-pre-line text-sm">{r.description}</p>}
            <dl className="divide-y divide-line">
              <Row label="Raised">{`${formatDateTime(r.created_at)} · ${humanize(r.source)}`}</Row>
              <Row label="Assigned to">{r.assigned_to_name ? `${r.assigned_to_name}${r.assigned_to_role === "CONTRACTOR" && r.contractor_name ? ` (${r.contractor_name})` : ""}` : null}</Row>
              <Row label="Due">{formatDate(r.due_date)}</Row>
              <Row label="Estimated cost">{formatRupees(r.estimated_cost)}</Row>
              <Row label="Completed">{r.completed_at ? `${formatDateTime(r.completed_at)} by ${r.completed_by_name}` : null}</Row>
              <Row label="Verified">{r.verified_at ? `${formatDateTime(r.verified_at)} by ${r.verified_by_name}` : null}</Row>
              <Row label="Condition after repair">{r.verified_condition ? <ConditionBadge rating={r.verified_condition} /> : null}</Row>
              <Row label="Actual cost">{r.actual_cost != null ? formatRupees(r.actual_cost) + (r.dlp_liable && r.actual_cost === 0 ? " (borne by contractor)" : "") : null}</Row>
            </dl>
            {r.completion_remarks && <p className="mt-3 text-sm"><span className="text-muted">Completion note:</span> {r.completion_remarks}</p>}
            {r.verification_remarks && <p className="mt-1 text-sm"><span className="text-muted">Verifier:</span> {r.verification_remarks}</p>}
            {r.cancel_reason && <p className="mt-1 text-sm"><span className="text-muted">Cancelled:</span> {r.cancel_reason}</p>}
          </Card>

          {(r.source_inspection || r.after_photos.length > 0) && (
            <Card title="Evidence">
              <div className="space-y-3">
                {r.source_inspection && (
                  <div className="text-sm">
                    <p>
                      From inspection <span className="font-mono">{r.source_inspection.inspection_code}</span> on {formatDate(r.source_inspection.inspected_at)} — rated{" "}
                      <ConditionBadge rating={r.source_inspection.condition_rating} />
                    </p>
                    {r.source_inspection.defects.length > 0 && <p className="mt-1 text-muted">{r.source_inspection.defects.join(" · ")}</p>}
                  </div>
                )}
                <div className="flex flex-wrap gap-6">
                  <Photos photos={r.source_inspection?.photos ?? []} label="Before" />
                  <Photos photos={r.after_photos} label="After" />
                </div>
              </div>
            </Card>
          )}
        </div>

        <Card title="History">
          <ol className="relative ml-2 border-l border-line">
            {r.history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="mb-4 ml-4">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-surface" aria-hidden />
                <p className="text-sm font-medium">{humanize(entry.action.replace("MAINTENANCE_", ""))}</p>
                <p className="text-xs text-muted">
                  {formatDateTime(entry.at)} · {entry.actor_name ?? entry.actor_role}
                </p>
                {typeof entry.diff?.remarks === "string" && <p className="mt-0.5 text-sm text-muted">{entry.diff.remarks}</p>}
              </li>
            ))}
            {!r.history.length && <li className="ml-4 text-sm text-muted">Imported record — no step history.</li>}
          </ol>
        </Card>
      </div>

      {action && <ActionModal action={action} request={r} onClose={() => setAction(null)} onDone={detail.reload} />}
    </AppShell>
  );
}

type Assignee = { id: string; name: string; role: string; designation: string | null; org_unit_name: string; contractor_name: string | null; is_liable_contractor: boolean };

function ActionModal({ action, request, onClose, onDone }: { action: MaintenanceAction; request: MaintenanceDetail; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const assignees = useApi<Assignee[]>(action === "assign" ? `/maintenance-requests/${request.id}/assignees` : null);
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState(request.due_date ?? "");
  const [cost, setCost] = useState("");
  const [remarks, setRemarks] = useState("");
  const [condition, setCondition] = useState<number | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      let body: Record<string, unknown> = {};
      if (action === "assign") body = { assigned_to: assignedTo, due_date: dueDate || undefined, estimated_cost: cost ? Number(cost) : undefined };
      if (action === "complete") {
        const after_photo_paths = [];
        for (const file of photos) after_photo_paths.push(await uploadEvidence(file, { purpose: "maintenance", ownerId: request.id, token }));
        body = { remarks, after_photo_paths };
      }
      if (action === "verify") body = { verified_condition: condition, remarks: remarks || undefined };
      if (action === "reject" || action === "cancel") body = { remarks };
      if (action === "close") body = { actual_cost: Number(cost || 0), remarks: remarks || undefined };
      await api(`/maintenance-requests/${request.id}/${action}`, { method: "POST", token, body });
      onDone();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : (caught as Error).message);
      setSaving(false);
    }
  }

  const invalid =
    (action === "assign" && !assignedTo) ||
    (action === "complete" && (!photos.length || remarks.trim().length < 3)) ||
    (action === "verify" && !condition) ||
    ((action === "reject" || action === "cancel") && remarks.trim().length < 3) ||
    (action === "close" && cost === "");

  return (
    <Modal
      open
      onClose={onClose}
      title={actionMeta[action].label}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button variant={actionMeta[action].variant === "danger" ? "danger" : "primary"} onClick={submit} loading={saving} disabled={invalid}>
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action === "assign" && (
          <>
            <Select
              label="Assign to"
              placeholder={assignees.loading ? "Loading…" : "Select engineer or contractor"}
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              options={(assignees.data ?? []).map((person) => ({
                value: person.id,
                label: person.role === "CONTRACTOR" ? `${person.contractor_name} (${person.name})${person.is_liable_contractor ? " — liable under DLP" : ""}` : `${person.name} · AE, ${person.org_unit_name}`
              }))}
            />
            {request.dlp_liable && <p className="text-xs text-accent-text">This asset is in its defect liability period — assign to the original contractor at their cost.</p>}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Due date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              <Input label="Estimated cost (₹)" inputMode="numeric" value={cost} onChange={(event) => setCost(event.target.value)} />
            </div>
          </>
        )}
        {action === "start" && <p className="text-sm">Starting work marks the asset <strong>Under maintenance</strong> on its timeline.</p>}
        {action === "complete" && (
          <>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line p-4 text-sm text-muted hover:border-accent">
              {photos.length ? `${photos.length} photo(s) selected` : "Add after-photo (required)"}
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(event) => setPhotos(Array.from(event.target.files ?? []).slice(0, 6))} />
            </label>
            <Textarea label="What was done?" required value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          </>
        )}
        {action === "verify" && (
          <>
            <p className="text-sm text-muted">Rate the asset&apos;s condition after the repair. You must not be the person who did the work.</p>
            <div className="grid grid-cols-5 gap-2">
              {conditionScale.map((item) => (
                <button
                  key={item.rating}
                  type="button"
                  onClick={() => setCondition(item.rating)}
                  aria-pressed={condition === item.rating}
                  className={cn("flex h-16 flex-col items-center justify-center rounded-xl border-2", condition === item.rating ? "border-ink" : "border-transparent opacity-70")}
                >
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold text-white", item.className)}>{item.rating}</span>
                  <span className="mt-1 text-[11px]">{item.label}</span>
                </button>
              ))}
            </div>
            <Textarea label="Remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          </>
        )}
        {(action === "reject" || action === "cancel") && (
          <Textarea label={action === "reject" ? "What still needs fixing?" : "Reason for cancelling"} required value={remarks} onChange={(event) => setRemarks(event.target.value)} />
        )}
        {action === "close" && (
          <>
            <Input label="Actual cost (₹)" required inputMode="numeric" value={cost} onChange={(event) => setCost(event.target.value)} hint={request.dlp_liable ? "Enter 0 if borne by the contractor under DLP" : undefined} />
            <Textarea label="Closing remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          </>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
