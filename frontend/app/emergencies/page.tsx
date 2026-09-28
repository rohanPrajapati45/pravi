"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSave } from "@/components/admin/shared";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import StatusBadge, { humanize } from "@/components/ui/StatusBadge";
import Textarea from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { EMERGENCY_KINDS, type Emergency } from "@/types/operations";

type Office = { id: string; name: string; type: string; path: string };

function DeclareModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { token, profile } = useAuth();
  const { save, saving, error, fieldErrors } = useSave();
  const offices = useApi<Office[]>("/org-units", { limit: 200 });
  // HQ may declare for the state, a circle or a division; an EE only within their own division.
  const areas = (offices.data ?? []).filter((office) =>
    profile?.role === "HQ" ? office.type !== "SUBDIVISION" : office.path.startsWith(profile?.orgUnit.path ?? "~")
  );
  const [form, setForm] = useState({ title: "", kind: "FLOOD", description: "", org_unit_id: "" });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit() {
    let createdId: string | null = null;
    const ok = await save(
      async () => {
        const { data } = await api<{ id: string; alerted: number }>("/emergencies", { method: "POST", token, body: { ...form, org_unit_id: form.org_unit_id || areas[0]?.id } });
        createdId = data.id;
      },
      { title: "Emergency declared", description: "Everyone in the area has been alerted" }
    );
    if (ok && createdId) router.push(`/emergencies/${createdId}`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Declare an emergency"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={saving}>Declare &amp; alert</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Title" required value={form.title} onChange={set("title")} placeholder="Heavy rain — Daskroi and Sanand talukas" error={fieldErrors.title} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Type" value={form.kind} onChange={set("kind")} options={EMERGENCY_KINDS.map((kind) => ({ value: kind, label: humanize(kind) }))} />
          <Select
            label="Affected area"
            value={form.org_unit_id || areas[0]?.id || ""}
            onChange={set("org_unit_id")}
            options={areas.map((office) => ({ value: office.id, label: `${office.name} (${humanize(office.type)})` }))}
          />
        </div>
        <Textarea label="Situation" value={form.description} onChange={set("description")} rows={3} placeholder="Rainfall, water levels, roads reported overtopped…" />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <p className="text-xs text-muted">Every engineer whose office covers the area gets a critical alert and a banner on every page until the emergency is closed.</p>
      </div>
    </Modal>
  );
}

function EmergencyCard({ emergency }: { emergency: Emergency }) {
  const active = emergency.status === "ACTIVE";
  return (
    <Link href={`/emergencies/${emergency.id}`} className={`block rounded-2xl border bg-surface p-4 shadow-card transition hover:border-accent ${active ? "border-red-200" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-accent-text">{emergency.emergency_code}</p>
          <p className="font-semibold">{emergency.title}</p>
          <p className="text-sm text-muted">{humanize(emergency.kind)} · {emergency.area_name}</p>
        </div>
        <StatusBadge status={emergency.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span><strong>{emergency.assets_reported}</strong> assets damaged</span>
        {active && <span className="text-red-700"><strong>{emergency.assets_closed}</strong> closed to traffic</span>}
        {active && <span><strong>{emergency.assets_pending}</strong> awaiting restoration</span>}
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted">
        Declared {formatDateTime(emergency.declared_at)} by {emergency.declared_by_name}
        {emergency.closed_at && ` · closed ${formatDateTime(emergency.closed_at)} by ${emergency.closed_by_name}`}
      </p>
    </Link>
  );
}

export default function EmergenciesPage() {
  const { profile } = useAuth();
  const list = useApi<Emergency[]>("/emergencies");
  const [declaring, setDeclaring] = useState(false);
  const active = list.data?.filter((item) => item.status === "ACTIVE") ?? [];
  const closed = list.data?.filter((item) => item.status === "CLOSED") ?? [];
  const canDeclare = profile?.role === "HQ" || profile?.role === "EE";

  return (
    <AppShell
      title="Emergencies"
      subtitle="Declare, report damage, close unsafe assets, fast-track repairs"
      allowedRoles={["HQ", "EE", "AE"]}
      headerRight={canDeclare ? <Button variant="danger" size="sm" onClick={() => setDeclaring(true)}><Icon name="siren" className="h-4 w-4" /> Declare</Button> : undefined}
    >
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Active</h2>
            {active.length ? (
              <div className="grid gap-3 md:grid-cols-2">{active.map((item) => <EmergencyCard key={item.id} emergency={item} />)}</div>
            ) : (
              <Card>
                <EmptyState
                  title="No active emergency"
                  description={canDeclare ? "When floods, a cyclone or a structural failure hit, declare an emergency: engineers are alerted, damaged assets can be closed to traffic and repairs fast-tracked." : "When HQ or your EE declares an emergency, it appears here and on every page."}
                />
              </Card>
            )}
          </section>
          {closed.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Past emergencies</h2>
              <div className="grid gap-3 md:grid-cols-2">{closed.map((item) => <EmergencyCard key={item.id} emergency={item} />)}</div>
            </section>
          )}
        </div>
      )}
      {declaring && <DeclareModal onClose={() => setDeclaring(false)} />}
    </AppShell>
  );
}
