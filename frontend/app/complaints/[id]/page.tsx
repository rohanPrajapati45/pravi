"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useSave } from "@/components/admin/shared";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/ui/ErrorState";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import StatusBadge, { humanize } from "@/components/ui/StatusBadge";
import Textarea from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { useApi } from "@/lib/useApi";
import { categoryLabel, type ComplaintDetail } from "@/types/operations";

type Action = "raise_request" | "resolve" | "reject";
const FLOW = ["RECEIVED", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"];

function ActionModal({ complaint, action, onClose, onDone }: { complaint: ComplaintDetail; action: Action; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const { save, saving, error } = useSave();
  const [severity, setSeverity] = useState(complaint.category === "BRIDGE_DAMAGE" ? "HIGH" : "MEDIUM");
  const [requestId, setRequestId] = useState("");
  const [note, setNote] = useState("");
  const titles = { raise_request: "Take up for repair", resolve: "Resolve complaint", reject: "Close as not actionable" };

  async function submit() {
    const request =
      action === "raise_request"
        ? () => api(`/complaints/${complaint.id}/raise-request`, { method: "POST", token, body: requestId ? { request_id: requestId } : { severity } })
        : () => api(`/complaints/${complaint.id}/${action}`, { method: "POST", token, body: { note } });
    if (await save(request, { title: action === "raise_request" ? "Repair linked — the citizen can follow it" : titles[action] })) {
      onDone();
      onClose();
    }
  }
  return (
    <Modal open onClose={onClose} title={titles[action]} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={action === "reject" ? "danger" : "primary"} onClick={submit} loading={saving}>{titles[action]}</Button></>}>
      {action === "raise_request" ? (
        <div className="space-y-3">
          {complaint.open_requests.length > 0 && (
            <Select
              label="Already being repaired?"
              value={requestId}
              onChange={(event) => setRequestId(event.target.value)}
              options={[{ value: "", label: "No — raise a new maintenance request" }, ...complaint.open_requests.map((item) => ({ value: item.id, label: `Follow ${item.request_code} · ${humanize(item.status)} · ${item.title.slice(0, 50)}` }))]}
            />
          )}
          {!requestId && (
            <Select label="Severity" value={severity} onChange={(event) => setSeverity(event.target.value)} options={[{ value: "LOW", label: "Low — 30 days" }, { value: "MEDIUM", label: "Medium — 15 days" }, { value: "HIGH", label: "High — 7 days" }]} />
          )}
          <p className="text-xs text-muted">The request enters the normal maintenance workflow on {complaint.asset_code}. When it is closed, the complaint resolves automatically and the citizen sees it.</p>
        </div>
      ) : (
        <Textarea
          label={action === "resolve" ? "Note for the citizen" : "Reason (shown to the citizen)"}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder={action === "resolve" ? "Drain cleaned by the sub-division gang on 12 Oct" : "This road is maintained by the municipal corporation; forwarded to them"}
        />
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}

export default function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const { notify } = useToast();
  const detail = useApi<ComplaintDetail>(`/complaints/${id}`);
  const [action, setAction] = useState<Action | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(label: string, request: () => Promise<unknown>) {
    setBusy(true);
    try {
      await request();
      notify({ title: label });
      detail.reload();
    } catch (caught) {
      notify({ title: "Could not update", description: (caught as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  const link = (assetId: string) => run("Linked to the asset — routed to its office", () => api(`/complaints/${id}/link-asset`, { method: "POST", token, body: { asset_id: assetId } }));
  async function linkByCode() {
    try {
      const { data } = await api<{ id: string }>("/assets/lookup", { token, query: { code: code.trim() } });
      await link(data.id);
      setCode("");
    } catch (caught) {
      notify({ title: "Asset not found", description: (caught as Error).message, tone: "error" });
    }
  }

  if (detail.loading && !detail.data) return <AppShell title="Complaint"><Loading /></AppShell>;
  if (detail.error || !detail.data) {
    return (
      <AppShell title="Complaint">
        <ErrorState title={detail.status === 403 ? "Outside your jurisdiction" : "Could not load complaint"} message={detail.error ?? undefined} onRetry={detail.status === 403 ? undefined : detail.reload} />
      </AppShell>
    );
  }
  const c = detail.data;
  const can = (name: ComplaintDetail["allowed_actions"][number]) => c.allowed_actions.includes(name);
  const step = FLOW.indexOf(c.status);

  return (
    <AppShell title="Citizen complaint" subtitle={c.complaint_code}>
      <div className="mb-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href="/complaints" className="text-sm text-accent-text hover:underline">← Complaints</Link>
            <p className="mt-1 font-mono text-sm text-accent-text">{c.complaint_code}</p>
            <h2 className="text-lg font-semibold">{categoryLabel(c.category)}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={c.status} />
              <StatusBadge status={c.channel} label={`Via ${c.channel === "WEB" ? "public web page" : c.channel}${c.external_ref ? ` · ${c.external_ref}` : ""}`} tone="neutral" />
              {c.duplicate_of_code && <StatusBadge status="DUP" label={`Same issue as ${c.duplicate_of_code}`} tone="warning" />}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can("acknowledge") && <Button loading={busy} onClick={() => run("Acknowledged — the citizen can see it", () => api(`/complaints/${id}/acknowledge`, { method: "POST", token, body: {} }))}>Acknowledge</Button>}
            {can("raise_request") && <Button onClick={() => setAction("raise_request")}>Take up for repair</Button>}
            {can("resolve") && <Button variant="secondary" onClick={() => setAction("resolve")}>Resolve</Button>}
            {can("reject") && <Button variant="ghost" onClick={() => setAction("reject")}>Not actionable</Button>}
          </div>
        </div>
        {step >= 0 && (
          <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="Progress">
            {FLOW.map((status, index) => (
              <li key={status} className="text-center">
                <div className={`h-1.5 rounded-full ${index <= step ? "bg-accent" : "bg-line"}`} />
                <span className={`mt-1 block text-[11px] ${index === step ? "font-semibold text-ink" : "text-muted"}`}>{humanize(status)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-4">
          <Card title="What the citizen reported">
            <p className="whitespace-pre-line text-sm">{c.description}</p>
            {c.location_text && <p className="mt-2 text-sm text-muted">Location: {c.location_text}</p>}
            {c.lat != null && c.lng != null && (
              <a href={`https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=18/${c.lat}/${c.lng}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-accent-text underline">
                {Number(c.lat).toFixed(5)}, {Number(c.lng).toFixed(5)} — open map
              </a>
            )}
            {c.photos.some((photo) => photo.url) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.photos.filter((photo) => photo.url).map((photo) => (
                  <a key={photo.path} href={photo.url!} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-lg border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url!} alt="Complaint" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
            <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-muted">Filed: </dt><dd className="inline font-mono text-xs">{formatDateTime(c.created_at)}</dd></div>
              <div><dt className="inline text-muted">Citizen: </dt><dd className="inline">{c.citizen_name ?? "—"}{c.citizen_phone && ` · ${c.citizen_phone}`}</dd></div>
              {c.acknowledged_at && <div><dt className="inline text-muted">Acknowledged: </dt><dd className="inline">{c.acknowledged_by_name} · <span className="font-mono text-xs">{formatDateTime(c.acknowledged_at)}</span></dd></div>}
              {c.resolved_at && <div><dt className="inline text-muted">{c.status === "REJECTED" ? "Closed" : "Resolved"}: </dt><dd className="inline">{c.resolved_by_name ?? "—"} · <span className="font-mono text-xs">{formatDateTime(c.resolved_at)}</span></dd></div>}
            </dl>
            {c.resolution_note && <p className="mt-2 rounded-lg bg-page px-3 py-2 text-sm">{c.resolution_note}</p>}
          </Card>

          <Card title="Asset & routing" subtitle="Matched by asset code, else the nearest likely asset; officers can re-link">
            {c.asset_id ? (
              <p className="text-sm">
                <Link href={`/assets/${c.asset_id}`} className="font-mono text-accent-text underline">{c.asset_code}</Link> · {c.asset_name} · {c.office_name}
                <span className="block text-xs text-muted">
                  {c.match_method === "CODE" ? "Citizen entered the asset code" : c.match_method === "NEAREST" ? `Nearest likely asset, ${Math.round(c.match_distance_m ?? 0)} m from the reported point` : "Linked by an officer"}
                </span>
              </p>
            ) : (
              <p className="text-sm text-amber-700">{c.office_name ? `Routed to ${c.office_name}, no asset linked yet.` : "Not routed — link an asset to send it to the right office."}</p>
            )}
            {can("link_asset") && (
              <div className="mt-3 space-y-2">
                {c.candidates.length > 0 && (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {c.candidates.map((candidate) => (
                      <li key={candidate.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-mono text-xs">{candidate.asset_code}</span> · <span className="truncate">{candidate.name}</span>
                          <span className="block text-xs text-muted">{candidate.type_name} · {candidate.distance} m away</span>
                        </span>
                        {candidate.id !== c.asset_id && <Button size="sm" variant="secondary" disabled={busy} onClick={() => link(candidate.id)}>Link</Button>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-end gap-2">
                  <div className="flex-1"><Input label="Or link by asset code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="RDB-RD-000123" className="font-mono" /></div>
                  <Button variant="secondary" disabled={!code.trim() || busy} onClick={linkByCode}>Link</Button>
                </div>
              </div>
            )}
            {c.request_code && (
              <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm">
                Repair <Link href={`/maintenance/${c.maintenance_request_id}`} className="font-mono underline">{c.request_code}</Link> · {humanize(c.request_status ?? "")}
                <span className="block text-xs text-muted">The complaint resolves automatically when this request is closed.</span>
              </p>
            )}
          </Card>

          {c.duplicates_list.length > 0 && (
            <Card title="Same issue reported again" subtitle="Linked automatically — each citizen follows this complaint">
              <ul className="space-y-1 text-sm">
                {c.duplicates_list.map((item) => (
                  <li key={item.id}>
                    <Link href={`/complaints/${item.id}`} className="font-mono text-accent-text underline">{item.complaint_code}</Link> · {item.channel} · {formatDate(item.created_at)}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card title="History">
          <ol className="relative ml-2 border-l border-line">
            {c.history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="mb-4 ml-4">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-surface" aria-hidden />
                <p className="text-sm font-medium">{humanize(entry.action.replace("COMPLAINT_", ""))}</p>
                <p className="font-mono text-xs text-muted">{formatDateTime(entry.at)} · {entry.actor_name ?? humanize(entry.actor_role ?? "system")}</p>
                {entry.diff?.remarks && <p className="mt-0.5 text-sm text-muted">{entry.diff.remarks}</p>}
              </li>
            ))}
            {!c.history.length && <li className="ml-4 text-sm text-muted">Imported record — no step history.</li>}
          </ol>
        </Card>
      </div>

      {action && <ActionModal complaint={c} action={action} onClose={() => setAction(null)} onDone={detail.reload} />}
    </AppShell>
  );
}
