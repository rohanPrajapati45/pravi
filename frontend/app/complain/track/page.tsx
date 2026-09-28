"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import PublicShell from "@/components/public/PublicShell";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import StatusBadge from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { categoryLabel, type ComplaintTracking } from "@/types/operations";

function Tracker() {
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<ComplaintTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api<ComplaintTracking>(`/public/complaints/${encodeURIComponent(code.trim())}`, { query: { phone: phone || undefined } });
      setResult(data);
    } catch (caught) {
      setResult(null);
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setResult(null);
  }, [code]);

  const rejected = result?.status === "REJECTED";
  const reached = (key: string) => {
    if (!result) return false;
    const order = ["RECEIVED", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"];
    const current = ["REJECTED", "DUPLICATE"].includes(result.status) ? (result.steps[3].at ? 3 : 0) : order.indexOf(result.status);
    return order.indexOf(key) <= current;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Track your complaint</h1>
        <p className="mt-1 text-sm text-muted">Enter your complaint number and the last 4 digits of the mobile number you gave.</p>
      </div>
      <form onSubmit={lookup} className="grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <Input label="Complaint number" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="CMP-2026-00001" className="font-mono" />
        <Input label="Last 4 digits of mobile" inputMode="numeric" maxLength={4} value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))} />
        <Button type="submit" loading={loading} disabled={!code.trim()}>Track</Button>
      </form>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-sm text-accent-text">{result.complaint_code}</p>
              <p className="text-lg font-semibold">{categoryLabel(result.category)}</p>
              <p className="text-sm text-muted">Filed {formatDateTime(result.created_at)}{result.office && ` · ${result.office}`}</p>
            </div>
            <StatusBadge status={result.status} />
          </div>
          <p className="mt-3 rounded-lg bg-page px-3 py-2 text-sm">{result.description}</p>
          {result.asset && <p className="mt-2 text-xs text-muted">Linked to {result.asset.name} (<span className="font-mono">{result.asset.code}</span>)</p>}
          {result.duplicate_of && <p className="mt-2 text-sm text-amber-700">Already reported as {result.duplicate_of} — updates are made there.</p>}
          <ol className="mt-5 space-y-4">
            {result.steps.map((step) => {
              const done = Boolean(step.at) || reached(step.key);
              return (
                <li key={step.key} className="flex gap-3">
                  <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", done ? (rejected && step.key === "RESOLVED" ? "bg-slate-500 text-white" : "bg-emerald-500 text-white") : "bg-line text-muted")}>
                    {done ? <Icon name="check" className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                  <div>
                    <p className={cn("text-sm", done ? "font-medium" : "text-muted")}>{step.label}</p>
                    {step.at && <p className="font-mono text-xs text-muted">{formatDateTime(step.at)}</p>}
                    {step.note && <p className="text-sm text-muted">{step.note}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <PublicShell>
      <Suspense fallback={<Loading />}>
        <Tracker />
      </Suspense>
    </PublicShell>
  );
}
