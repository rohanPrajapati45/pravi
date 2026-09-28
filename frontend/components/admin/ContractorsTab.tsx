"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { FormError, useSave, type Firm } from "./shared";

function FirmModal({ firm, onClose, onSaved }: { firm: Firm | null; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const { saving, error, fieldErrors, save } = useSave();
  const [form, setForm] = useState({
    code: firm?.code ?? "CON-",
    name: firm?.name ?? "",
    class: firm?.class ?? "",
    contact_name: firm?.contact_name ?? "",
    contact_phone: firm?.contact_phone ?? "",
    contact_email: firm?.contact_email ?? ""
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit() {
    const { code, ...rest } = form;
    const body = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, value || undefined]));
    const ok = firm
      ? await save(() => api(`/admin/contractors/${firm.id}`, { method: "PATCH", token, body }), { title: "Contractor updated", description: form.name })
      : await save(() => api("/admin/contractors", { method: "POST", token, body: { code, ...body } }), { title: "Contractor registered", description: `${form.name} — create a login for them under Users` });
    if (ok) {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={firm ? `Edit ${firm.name}` : "Register contractor"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={form.name.length < 3 || (!firm && form.code.length < 3)}>Save</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={Boolean(firm)} className="font-mono" />
        <Input label="Registration class" value={form.class} onChange={set("class")} placeholder="AA, A, B…" />
        <div className="sm:col-span-2">
          <Input label="Firm name" required value={form.name} onChange={set("name")} />
        </div>
        <Input label="Contact person" value={form.contact_name} onChange={set("contact_name")} />
        <Input label="Phone" value={form.contact_phone} onChange={set("contact_phone")} />
        <div className="sm:col-span-2">
          <Input label="Email" type="email" value={form.contact_email} onChange={set("contact_email")} />
        </div>
        <div className="sm:col-span-2">
          <FormError error={error} fieldErrors={fieldErrors} />
        </div>
      </div>
    </Modal>
  );
}

export default function ContractorsTab() {
  const { token } = useAuth();
  const { save } = useSave();
  const firms = useApi<Firm[]>("/admin/contractors");
  const [editing, setEditing] = useState<Firm | null | undefined>(undefined);

  const columns: Column<Firm>[] = [
    {
      key: "firm",
      header: "Firm",
      render: (firm) => (
        <div>
          <p className="font-medium">{firm.name}</p>
          <p className="font-mono text-[11px] text-muted">
            {firm.code}
            {firm.class && ` · class ${firm.class}`}
          </p>
        </div>
      )
    },
    { key: "contact", header: "Contact", render: (firm) => <span className="text-sm">{[firm.contact_name, firm.contact_phone].filter(Boolean).join(" · ") || "—"}</span> },
    { key: "works", header: "Works", render: (firm) => <span className="text-sm">{firm.active_works} active / {firm.total_works} total</span> },
    {
      key: "score",
      header: "Avg evaluation",
      render: (firm) => (firm.avg_score != null ? <span className="font-heading text-lg font-semibold">{Number(firm.avg_score)}</span> : <span className="text-muted">—</span>)
    },
    { key: "dlp", header: "Open DLP defects", render: (firm) => <span className={firm.open_dlp_defects ? "font-semibold text-condition-critical" : ""}>{firm.open_dlp_defects}</span> },
    { key: "logins", header: "Logins", render: (firm) => firm.logins },
    { key: "status", header: "Status", render: (firm) => <StatusBadge status={firm.is_active ? "ACTIVE" : "INACTIVE"} label={firm.is_active ? "Active" : "Inactive"} tone={firm.is_active ? "success" : "neutral"} /> },
    {
      key: "actions",
      header: "",
      render: (firm) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(firm)}>Edit</Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (await save(() => api(`/admin/contractors/${firm.id}`, { method: "PATCH", token, body: { is_active: !firm.is_active } }), { title: `${firm.name} ${firm.is_active ? "deactivated" : "reactivated"}` })) firms.reload();
            }}
          >
            {firm.is_active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Scores come from closure evaluations (schedule, quality, rework, DLP defects, documentation). Inactive firms cannot be awarded new works.</p>
        <Button onClick={() => setEditing(null)}>+ Register contractor</Button>
      </div>
      <Table columns={columns} rows={firms.data ?? []} rowKey={(firm) => firm.id} loading={firms.loading} error={firms.error} onRetry={firms.reload} emptyTitle="No contractors registered" />
      {editing !== undefined && <FirmModal firm={editing} onClose={() => setEditing(undefined)} onSaved={firms.reload} />}
    </div>
  );
}
