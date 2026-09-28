"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import ErrorState from "@/components/ui/ErrorState";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/useApi";
import { FormError, useSave, type Office } from "./shared";

const indent = { STATE: "pl-0", CIRCLE: "pl-5", DIVISION: "pl-10", SUBDIVISION: "pl-16" };
const childType: Record<string, "CIRCLE" | "DIVISION" | "SUBDIVISION" | undefined> = { STATE: "CIRCLE", CIRCLE: "DIVISION", DIVISION: "SUBDIVISION" };
const prefix = { CIRCLE: "CIR-", DIVISION: "DIV-", SUBDIVISION: "SUB-" };

function OfficeModal({ office, parent, onClose, onSaved }: { office?: Office; parent?: Office; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const { saving, error, fieldErrors, save } = useSave();
  const type = office ? office.type : childType[parent!.type]!;
  const [name, setName] = useState(office?.name ?? "");
  const [code, setCode] = useState(office ? office.code : prefix[type as keyof typeof prefix]);
  const [district, setDistrict] = useState(office?.district ?? parent?.district ?? "");

  async function submit() {
    const ok = office
      ? await save(() => api(`/admin/org-units/${office.id}`, { method: "PATCH", token, body: { name, district: district || undefined } }), { title: "Office updated", description: name })
      : await save(() => api("/admin/org-units", { method: "POST", token, body: { type, name, code, parent_id: parent!.id, district: district || undefined } }), {
          title: `${type.charAt(0) + type.slice(1).toLowerCase()} added`,
          description: `${name} under ${parent!.name}`
        });
    if (ok) {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={office ? `Edit ${office.name}` : `Add ${type.toLowerCase()} under ${parent!.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={name.trim().length < 3 || (!office && code.length < 3)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Name" required value={name} onChange={(event) => setName(event.target.value)} placeholder={type === "SUBDIVISION" ? "e.g. Bavla Sub-division" : "e.g. Kutch Division"} />
        {!office && <Input label="Code" required value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="font-mono" hint="Unique, used in the jurisdiction path; cannot be changed later" />}
        {type !== "CIRCLE" && <Input label="District" value={district} onChange={(event) => setDistrict(event.target.value)} />}
        <FormError error={error} fieldErrors={fieldErrors} />
      </div>
    </Modal>
  );
}

export default function OfficesTab() {
  const tree = useApi<Office[]>("/admin/org-units");
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState<Office | null>(null);
  const [editing, setEditing] = useState<Office | null>(null);
  if (tree.loading) return <Loading />;
  if (tree.error || !tree.data) return <ErrorState message={tree.error ?? undefined} onRetry={tree.reload} />;

  const circles = tree.data.filter((office) => office.type === "CIRCLE");
  const shown = filter ? tree.data.filter((office) => office.type === "STATE" || office.path.startsWith(tree.data!.find((item) => item.id === filter)!.path) || tree.data!.find((item) => item.id === filter)!.path.startsWith(office.path)) : tree.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="w-64">
          <Select aria-label="Circle" placeholder="All circles" value={filter} onChange={(event) => setFilter(event.target.value)} options={circles.map((circle) => ({ value: circle.id, label: circle.name }))} />
        </div>
        <p className="text-xs text-muted">Jurisdiction = office subtree. People see data for their office and everything below it.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-line bg-slate-50/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span>Office</span>
          <span className="w-16 text-right">People</span>
          <span className="w-16 text-right">Assets</span>
          <span className="w-40" />
        </div>
        <ul className="divide-y divide-line">
          {shown.map((office) => (
            <li key={office.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2 hover:bg-slate-50">
              <div className={cn("min-w-0", indent[office.type])}>
                <p className={cn("truncate text-sm", office.type !== "SUBDIVISION" && "font-semibold")}>{office.name}</p>
                <p className="font-mono text-[11px] text-muted">
                  {office.code}
                  {office.district && office.type !== "CIRCLE" ? ` · ${office.district}` : ""}
                </p>
              </div>
              <span className="w-16 text-right font-mono text-sm">{office.users}</span>
              <span className="w-16 text-right font-mono text-sm">{office.assets}</span>
              <div className="flex w-40 justify-end gap-1">
                {office.type !== "STATE" && <Button size="sm" variant="ghost" onClick={() => setEditing(office)}>Edit</Button>}
                {childType[office.type] && (
                  <Button size="sm" variant="ghost" onClick={() => setAdding(office)}>
                    + {childType[office.type] === "SUBDIVISION" ? "Sub-div" : childType[office.type]!.charAt(0) + childType[office.type]!.slice(1).toLowerCase()}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      {adding && <OfficeModal parent={adding} onClose={() => setAdding(null)} onSaved={tree.reload} />}
      {editing && <OfficeModal office={editing} onClose={() => setEditing(null)} onSaved={tree.reload} />}
    </div>
  );
}
