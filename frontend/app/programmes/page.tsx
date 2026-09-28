"use client";

import Link from "next/link";
import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Modal from "@/components/ui/Modal";
import ProgressBar from "@/components/ui/ProgressBar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatRupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { Programme } from "@/types/works";

export default function ProgrammesPage() {
  const { profile, token } = useAuth();
  const list = useApi<Programme[]>("/programmes");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", financial_year: "2026-27", budget_head: "", allocated_amount: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function create() {
    setSaving(true);
    setError(null);
    try {
      await api("/programmes", { method: "POST", token, body: { ...form, allocated_amount: Number(form.allocated_amount), budget_head: form.budget_head || undefined } });
      setOpen(false);
      list.reload();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Programmes"
      allowedRoles={["HQ", "EE"]}
      headerRight={profile?.role === "HQ" && <Button size="sm" onClick={() => setOpen(true)}>+ New programme</Button>}
    >
      <p className="mb-4 text-sm text-muted">Government programmes and budget heads that works are initiated from. Allocated vs sanctioned vs contracted is a view only — finance stays in IFMS.</p>
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState title="No programmes yet" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.data.map((programme) => {
            const allocated = Number(programme.allocated_amount);
            const rows = [
              { label: "Sanctioned", value: Number(programme.sanctioned_total) },
              { label: "Contracted", value: Number(programme.contracted_total) },
              { label: "Value of work done", value: Number(programme.value_of_work_done) }
            ];
            return (
              <Link key={programme.id} href={`/works?programme_id=${programme.id}`} className="block rounded-xl border border-line bg-surface p-4 shadow-card hover:border-accent">
                <p className="font-mono text-xs text-accent-text">
                  {programme.code} · FY {programme.financial_year}
                </p>
                <h2 className="mt-1 font-semibold">{programme.name}</h2>
                {programme.description && <p className="mt-1 text-sm text-muted">{programme.description}</p>}
                <p className="mt-3 text-sm">
                  Allocated <span className="font-semibold">{formatRupees(allocated)}</span> · {programme.works_count} work(s)
                  {programme.budget_head && <span className="text-muted"> · {programme.budget_head}</span>}
                </p>
                <ul className="mt-3 space-y-2">
                  {rows.map((row) => (
                    <li key={row.label}>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">{row.label}</span>
                        <span className="font-mono">
                          {formatRupees(row.value)} ({allocated ? Math.round((row.value / allocated) * 100) : 0}%)
                        </span>
                      </div>
                      <ProgressBar value={allocated ? (row.value / allocated) * 100 : 0} className="mt-1" />
                    </li>
                  ))}
                </ul>
              </Link>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New programme"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={saving} disabled={!form.code || !form.name || !form.allocated_amount}>Create</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Code" value={form.code} onChange={set("code")} placeholder="SHIP-2027-28" />
          <Input label="Financial year" value={form.financial_year} onChange={set("financial_year")} />
          <div className="sm:col-span-2">
            <Input label="Name" value={form.name} onChange={set("name")} />
          </div>
          <Input label="Budget head" value={form.budget_head} onChange={set("budget_head")} />
          <Input label="Allocation (₹)" inputMode="numeric" value={form.allocated_amount} onChange={set("allocated_amount")} hint={form.allocated_amount ? formatRupees(Number(form.allocated_amount)) : undefined} />
          {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
        </div>
      </Modal>
    </AppShell>
  );
}
