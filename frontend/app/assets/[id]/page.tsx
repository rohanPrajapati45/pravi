"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import AssetInspections from "@/components/assets/AssetInspections";
import AssetMaintenance from "@/components/assets/AssetMaintenance";
import AttributeFields from "@/components/assets/AttributeFields";
import NewRequestModal from "@/components/maintenance/NewRequestModal";
import { RiskWithWhy } from "@/components/assets/RiskBadge";
import Timeline from "@/components/assets/Timeline";
import AppShell from "@/components/layout/AppShell";
import Button, { ButtonLink } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import StatusBadge, { ConditionBadge, humanize } from "@/components/ui/StatusBadge";
import Tabs from "@/components/ui/Tabs";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysFromToday, formatChainage, formatDate, formatRupees } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { useApi } from "@/lib/useApi";
import type { Asset360, TimelineEvent } from "@/types/assets";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">{children ?? "—"}</dd>
    </div>
  );
}

export default function Asset360Page() {
  const { id } = useParams<{ id: string }>();
  const { profile, token } = useAuth();
  const asset = useApi<Asset360>(`/assets/${id}/360`);
  const timeline = useApi<TimelineEvent[]>(`/assets/${id}/timeline`, { limit: 100 });
  const [tab, setTab] = useState("timeline");
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);

  const refresh = () => {
    asset.reload();
    timeline.reload();
  };

  if (asset.loading && !asset.data) {
    return (
      <AppShell title="Asset 360">
        <Loading label="Loading asset…" />
      </AppShell>
    );
  }
  if (asset.error || !asset.data) {
    return (
      <AppShell title="Asset 360">
        <ErrorState
          title={asset.status === 403 ? "Outside your jurisdiction" : asset.status === 404 ? "Asset not found" : "Could not load asset"}
          message={asset.error ?? undefined}
          onRetry={asset.status === 403 || asset.status === 404 ? undefined : asset.reload}
        />
      </AppShell>
    );
  }

  const a = asset.data;
  const location = [a.district, formatChainage(a.start_chainage_km, a.end_chainage_km) && `${a.road_code} @ ${formatChainage(a.start_chainage_km, a.end_chainage_km)}`]
    .filter(Boolean)
    .join(" · ");
  const dueIn = daysFromToday(a.next_inspection_due);
  const canEdit = profile && ["HQ", "EE", "AE"].includes(profile.role) && a.lifecycle_status !== "RETIRED";
  const canChangeStatus = a.allowed_transitions.some((transition) => transition.to !== "UNDER_MAINTENANCE");

  return (
    <AppShell title="Asset 360">
      <div className="mb-4 rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm text-accent-text">{a.asset_code}</p>
            <h2 className="text-xl font-semibold">{a.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {a.type_name}
              {location && ` · ${location}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={a.lifecycle_status} />
              <ConditionBadge rating={a.condition_rating} />
              {a.dlp.in_dlp && <StatusBadge status="DLP" label={`In DLP · ${a.dlp.days_remaining} days left`} tone="accent" />}
              {dueIn !== null && dueIn < 0 && <StatusBadge status="OVERDUE" label={`Inspection ${-dueIn}d overdue`} />}
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <RiskWithWhy score={a.risk_score} band={a.risk_band} factors={a.risk_factors} />
            <div className="flex flex-wrap gap-2">
              {(profile?.role === "AE" || profile?.role === "EE") && !["RETIRED", "PLANNED"].includes(a.lifecycle_status) && (
                <ButtonLink href={`/inspections/new?asset=${a.id}`} size="sm">
                  Inspect
                </ButtonLink>
              )}
              {profile && ["HQ", "EE", "AE"].includes(profile.role) && a.lifecycle_status !== "RETIRED" && (
                <Button size="sm" variant="secondary" onClick={() => setRepairOpen(true)}>
                  Request repair
                </Button>
              )}
              {canEdit && (
                <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
              )}
              {canChangeStatus && (
                <Button size="sm" variant="secondary" onClick={() => setStatusOpen(true)}>
                  Change status
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-accent-soft px-3 py-2 text-sm">
          <span className="font-semibold text-accent-text">Suggested next step:</span> {a.recommendation.action}
          <span className="text-muted"> — {a.recommendation.reason}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div className="space-y-4">
          <Card title="Identity">
            <dl className="divide-y divide-line">
              <Row label="Type">{a.type_name}</Row>
              {a.attribute_schema.map((field) => (
                <Row key={field.key} label={field.label}>
                  {a.attributes[field.key] !== undefined ? `${String(a.attributes[field.key])}${field.unit ? ` ${field.unit}` : ""}` : "—"}
                </Row>
              ))}
              <Row label="Structural importance">{a.criticality} / 5</Row>
              <Row label="Traffic / usage">{a.traffic_level} / 5</Row>
              {a.parent && (
                <Row label="Part of">
                  <Link href={`/assets/${a.parent.id}`} className="text-accent-text underline">
                    {a.parent.asset_code}
                  </Link>
                </Row>
              )}
              <Row label="QR token">
                <span className="font-mono text-xs">{a.qr_token.slice(0, 12)}…</span>
              </Row>
            </dl>
          </Card>

          <Card title="Location">
            <dl className="divide-y divide-line">
              {a.org_chain.map((unit) => (
                <Row key={unit.code} label={humanize(unit.type)}>
                  {unit.name}
                </Row>
              ))}
              <Row label="Taluka">{a.taluka}</Row>
              {a.road_code && (
                <Row label="Road / chainage">
                  <span className="font-mono text-xs">
                    {a.road_code} {formatChainage(a.start_chainage_km, a.end_chainage_km)}
                  </span>
                </Row>
              )}
              <Row label="Coordinates">
                {a.lat != null && a.lng != null ? (
                  <a className="font-mono text-xs text-accent-text underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=15/${a.lat}/${a.lng}`}>
                    {Number(a.lat).toFixed(4)}, {Number(a.lng).toFixed(4)}
                  </a>
                ) : null}
              </Row>
            </dl>
          </Card>

          <Card title="How it came to exist">
            {a.origin_work ? (
              <dl className="divide-y divide-line">
                <Row label="Origin work">
                  <Link href={`/works/${a.origin_work.id}`} className="font-mono text-xs text-accent-text underline">
                    {a.origin_work.work_code}
                  </Link>
                </Row>
                <Row label="Title">{a.origin_work.title}</Row>
                <Row label="Contractor">{a.origin_work.contractor_name}</Row>
                <Row label="Contract value">{formatRupees(a.origin_work.contract_value)}</Row>
                <Row label="Handed over">{formatDate(a.origin_work.actual_end)}</Row>
              </dl>
            ) : (
              <p className="text-sm text-muted">Registered directly (legacy asset). Works that create or modify it will appear here.</p>
            )}
            <dl className="mt-2 divide-y divide-line border-t border-line pt-2">
              <Row label="Commissioned">{formatDate(a.commissioned_on)}</Row>
              <Row label="Original cost">{formatRupees(a.original_cost)}</Row>
              <Row label="Design life">{a.design_life_years ? `${a.design_life_years} years` : null}</Row>
              <Row label="DLP ends">{a.dlp.end_date ? `${formatDate(a.dlp.end_date)}${a.dlp.in_dlp ? "" : " (expired)"}` : null}</Row>
            </dl>
          </Card>

          <Card title="Condition & inspection">
            <dl className="divide-y divide-line">
              <Row label="Condition">
                <ConditionBadge rating={a.condition_rating} />
              </Row>
              <Row label="Last inspected">{formatDate(a.last_inspected_at)}</Row>
              <Row label="Next due">
                {a.next_inspection_due ? `${formatDate(a.next_inspection_due)} ${dueIn !== null ? (dueIn < 0 ? `(${-dueIn}d overdue)` : `(in ${dueIn}d)`) : ""}` : null}
              </Row>
              <Row label="Interval">every {a.inspection_interval_days} days</Row>
            </dl>
          </Card>

          <Card title="Responsible people">
            {a.people.length ? (
              <ul className="space-y-2">
                {a.people.map((person) => (
                  <li key={person.email} className="text-sm">
                    <p className="font-medium">{person.name}</p>
                    <p className="text-xs text-muted">{person.designation ?? person.role}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No officer mapped to this sub-division yet.</p>
            )}
          </Card>
        </div>

        <Card bodyClassName="p-0">
          <div className="px-4 pt-2">
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { key: "timeline", label: "Timeline", count: a.counts.timeline },
                { key: "components", label: "Components", count: a.counts.components },
                { key: "inspections", label: "Inspections" },
                { key: "maintenance", label: "Maintenance" },
                { key: "documents", label: "Documents" },
                { key: "complaints", label: "Complaints" }
              ]}
            />
          </div>
          <div className="p-4">
            {tab === "timeline" &&
              (timeline.loading ? (
                <Loading />
              ) : timeline.error ? (
                <ErrorState message={timeline.error} onRetry={timeline.reload} />
              ) : timeline.data?.length ? (
                <Timeline events={timeline.data} />
              ) : (
                <EmptyState title="No lifecycle events yet" />
              ))}
            {tab === "components" &&
              (a.children.length ? (
                <ul className="divide-y divide-line">
                  {a.children.map((child) => (
                    <li key={child.id}>
                      <Link href={`/assets/${child.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-page">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-accent-text">{child.asset_code}</p>
                          <p className="truncate text-sm font-medium">{child.name}</p>
                          <p className="text-xs text-muted">
                            {child.type_name}
                            {child.child_count ? ` · ${child.child_count} sub-components` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <StatusBadge status={child.lifecycle_status} />
                          <ConditionBadge rating={child.condition_rating} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No components" description="Register a lift, AC unit, bearing or drainage line with this asset as its parent." />
              ))}
            {tab === "inspections" && <AssetInspections assetId={a.id} />}
            {tab === "maintenance" && <AssetMaintenance assetId={a.id} />}
            {tab === "documents" && <EmptyState title="No documents attached" description="DPRs, drawings, as-built and completion certificates will appear here." />}
            {tab === "complaints" && <EmptyState title="No citizen complaints" description="Complaints matched to this asset will appear here." />}
          </div>
        </Card>
      </div>

      {editOpen && <EditModal asset={a} token={token} role={profile?.role ?? "AE"} onClose={() => setEditOpen(false)} onSaved={refresh} />}
      {repairOpen && <NewRequestModal assetId={a.id} assetName={`${a.asset_code} · ${a.name}`} inDlp={a.dlp.in_dlp} onClose={() => setRepairOpen(false)} />}
      {statusOpen && <StatusModal asset={a} token={token} onClose={() => setStatusOpen(false)} onSaved={refresh} />}
    </AppShell>
  );
}

function EditModal({ asset, token, role, onClose, onSaved }: { asset: Asset360; token: string | null; role: string; onClose: () => void; onSaved: () => void }) {
  const officer = role === "HQ" || role === "EE";
  const { notify } = useToast();
  const [name, setName] = useState(asset.name);
  const [attributes, setAttributes] = useState<Record<string, unknown>>(asset.attributes);
  const [lat, setLat] = useState(asset.lat?.toString() ?? "");
  const [lng, setLng] = useState(asset.lng?.toString() ?? "");
  const [criticality, setCriticality] = useState(String(asset.criticality));
  const [traffic, setTraffic] = useState(String(asset.traffic_level));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const levels = [1, 2, 3, 4, 5].map((level) => ({ value: String(level), label: String(level) }));

  async function save() {
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = { name, attributes };
    if (lat !== "") body.lat = Number(lat);
    if (lng !== "") body.lng = Number(lng);
    if (officer) {
      body.criticality = Number(criticality);
      body.traffic_level = Number(traffic);
    }
    try {
      await api(`/assets/${asset.id}`, { method: "PATCH", token, body });
      notify({ title: "Asset updated", description: "Change recorded on the timeline" });
      onSaved();
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && Array.isArray(caught.details)) {
        setFieldErrors(Object.fromEntries((caught.details as Array<{ field: string; message: string }>).map((detail) => [detail.field, detail.message])));
      }
      setError((caught as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${asset.asset_code}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <AttributeFields schema={asset.attribute_schema} values={attributes} onChange={setAttributes} errors={fieldErrors} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Latitude" value={lat} onChange={(event) => setLat(event.target.value)} />
          <Input label="Longitude" value={lng} onChange={(event) => setLng(event.target.value)} />
        </div>
        {officer ? (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Structural importance" value={criticality} onChange={(event) => setCriticality(event.target.value)} options={levels} />
            <Select label="Traffic / usage" value={traffic} onChange={(event) => setTraffic(event.target.value)} options={levels} />
          </div>
        ) : (
          <p className="text-xs text-muted">Field engineers can correct name, attributes and location. Importance and traffic are set by the EE.</p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <p className="text-xs text-muted">Every change is recorded on the asset timeline with before → after values.</p>
      </div>
    </Modal>
  );
}

function StatusModal({ asset, token, onClose, onSaved }: { asset: Asset360; token: string | null; onClose: () => void; onSaved: () => void }) {
  const options = asset.allowed_transitions.filter((transition) => transition.to !== "UNDER_MAINTENANCE");
  const [to, setTo] = useState(options[0]?.to ?? "");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const needsRemarks = options.find((option) => option.to === to)?.requires.includes("remarks");
  const { notify } = useToast();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/assets/${asset.id}/status`, { method: "POST", token, body: { to, remarks: remarks || undefined } });
      notify({ title: `Status changed to ${humanize(to)}`, description: asset.asset_code });
      onSaved();
      onClose();
    } catch (caught) {
      setError((caught as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Change lifecycle status"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} variant={to === "RETIRED" ? "danger" : "primary"} disabled={!to || (needsRemarks && !remarks.trim())}>
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          Current: <StatusBadge status={asset.lifecycle_status} />
        </p>
        <Select label="Move to" value={to} onChange={(event) => setTo(event.target.value)} options={options.map((option) => ({ value: option.to, label: humanize(option.to) }))} />
        <Input label={needsRemarks ? "Remarks (required)" : "Remarks"} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Reason, order reference…" />
        {to === "RETIRED" && <p className="text-sm text-condition-critical">Retired assets become read-only. History is kept.</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
