"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useSave } from "@/components/admin/shared";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Modal from "@/components/ui/Modal";
import ProgressBar from "@/components/ui/ProgressBar";
import Select from "@/components/ui/Select";
import StatusBadge, { humanize } from "@/components/ui/StatusBadge";
import Tabs from "@/components/ui/Tabs";
import Textarea from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { BoqItem, Measurement, MeasurementBook, RunningBill } from "@/types/operations";

const qty = (value: number, unit?: string) => `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
const exact = (value: number) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warning" }) {
  return (
    <div className={cn("rounded-xl border bg-surface p-3 shadow-card", tone === "warning" ? "border-amber-200" : "border-line")}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null;
}

function BoqModal({ workId, onClose, onDone }: { workId: string; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const { save, saving, error, fieldErrors } = useSave();
  const [form, setForm] = useState({ item_no: "", description: "", unit: "cum", quantity: "", rate: "" });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const amount = Number(form.quantity) * Number(form.rate);
  async function submit() {
    if (await save(() => api(`/works/${workId}/boq`, { method: "POST", token, body: form }), { title: `BoQ item ${form.item_no} added` })) {
      onDone();
      onClose();
    }
  }
  return (
    <Modal open onClose={onClose} title="Add BoQ item" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Add item</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Item no." required value={form.item_no} onChange={set("item_no")} placeholder="5.07" error={fieldErrors.item_no} />
        <div className="sm:col-span-2">
          <Input label="Unit" required value={form.unit} onChange={set("unit")} placeholder="cum, sqm, rm, nos, LS" error={fieldErrors.unit} />
        </div>
        <div className="sm:col-span-3">
          <Textarea label="Description (as in the schedule of rates)" value={form.description} onChange={set("description")} rows={2} />
        </div>
        <Input label="BoQ quantity" inputMode="decimal" value={form.quantity} onChange={set("quantity")} error={fieldErrors.quantity} />
        <Input label="Rate (₹)" inputMode="decimal" value={form.rate} onChange={set("rate")} error={fieldErrors.rate} />
        <div className="flex flex-col justify-end pb-2 text-sm text-muted">Amount {Number.isFinite(amount) && amount > 0 ? exact(amount) : "—"}</div>
      </div>
      <div className="mt-3"><ErrorLine error={error} /></div>
    </Modal>
  );
}

function MeasureModal({ book, onClose, onDone }: { book: MeasurementBook; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const { save, saving, error, fieldErrors } = useSave();
  const [form, setForm] = useState({ boq_item_id: book.items[0]?.id ?? "", measured_on: new Date().toISOString().slice(0, 10), location: "", nos: "1", length: "", breadth: "", depth: "", quantity: "", remarks: "" });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const item = book.items.find((candidate) => candidate.id === form.boq_item_id);
  const dims = [form.length, form.breadth, form.depth].filter(Boolean).map(Number);
  const quantity = Math.round((dims.length ? Number(form.nos || 1) * dims.reduce((product, value) => product * value, 1) : Number(form.quantity)) * 1000) / 1000;
  const cumulative = (item?.measured_qty ?? 0) + (quantity || 0);
  const excess = item ? cumulative > item.quantity : false;

  async function submit() {
    const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ""));
    if (dims.length) delete body.quantity;
    if (await save(() => api(`/works/${book.work.id}/measurements`, { method: "POST", token, body }), { title: "Measurement recorded", description: `${qty(quantity, item?.unit)} · sent for checking` })) {
      onDone();
      onClose();
    }
  }
  return (
    <Modal open onClose={onClose} size="lg" title="Record measurement" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving} disabled={!(quantity > 0)}>Record</Button></>}>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-3">
          <Select label="BoQ item" value={form.boq_item_id} onChange={set("boq_item_id")} options={book.items.map((candidate) => ({ value: candidate.id, label: `${candidate.item_no} · ${candidate.description.slice(0, 60)} (${candidate.unit})` }))} />
        </div>
        <Input label="Measured on" type="date" value={form.measured_on} onChange={set("measured_on")} error={fieldErrors.measured_on} />
        <div className="sm:col-span-4">
          <Input label="Location / chainage" value={form.location} onChange={set("location")} placeholder="km 12.4–13.0, LHS" />
        </div>
        <Input label="Nos" inputMode="decimal" value={form.nos} onChange={set("nos")} />
        <Input label="Length (m)" inputMode="decimal" value={form.length} onChange={set("length")} />
        <Input label="Breadth (m)" inputMode="decimal" value={form.breadth} onChange={set("breadth")} />
        <Input label="Depth (m)" inputMode="decimal" value={form.depth} onChange={set("depth")} />
        {!dims.length && (
          <div className="sm:col-span-2">
            <Input label={`Or quantity directly (${item?.unit ?? ""})`} inputMode="decimal" value={form.quantity} onChange={set("quantity")} hint="For lump-sum items or counted units" />
          </div>
        )}
        <div className={cn("rounded-xl bg-page p-3 text-sm", dims.length ? "sm:col-span-4" : "sm:col-span-2")}>
          <p>
            Quantity <strong>{quantity > 0 ? qty(quantity, item?.unit) : "—"}</strong> · Amount <strong>{quantity > 0 && item ? exact(quantity * item.rate) : "—"}</strong>
          </p>
          {item && (
            <p className={cn("mt-1 text-xs", excess ? "font-medium text-amber-700" : "text-muted")}>
              Cumulative {qty(cumulative, item.unit)} of {qty(item.quantity, item.unit)} in the BoQ{excess && " — exceeds the BoQ; explain the deviation below"}
            </p>
          )}
        </div>
        <div className="sm:col-span-4">
          <Textarea label={excess ? "Deviation note (required)" : "Remarks"} value={form.remarks} onChange={set("remarks")} rows={2} />
        </div>
      </div>
      <div className="mt-3"><ErrorLine error={error} /></div>
      <p className="mt-2 text-xs text-muted">The entry is checked by someone other than you before it can be billed — an AE test-checks the contractor&apos;s entries, the EE checks the rest.</p>
    </Modal>
  );
}

function CheckModal({ entry, decision, onClose, onDone }: { entry: Measurement; decision: "check" | "reject"; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const { save, saving, error } = useSave();
  const [remarks, setRemarks] = useState("");
  async function submit() {
    if (await save(() => api(`/measurements/${entry.id}/check`, { method: "POST", token, body: { decision, remarks: remarks || undefined } }), { title: decision === "check" ? `Entry ${entry.entry_no} checked` : `Entry ${entry.entry_no} rejected` })) {
      onDone();
      onClose();
    }
  }
  return (
    <Modal open onClose={onClose} title={decision === "check" ? `Check MB entry ${entry.entry_no}` : `Reject MB entry ${entry.entry_no}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={decision === "reject" ? "danger" : "primary"} onClick={submit} loading={saving}>{decision === "check" ? "Confirm checked" : "Reject"}</Button></>}>
      <p className="text-sm">
        Item {entry.item_no} · {entry.location ?? "—"} · <strong>{qty(entry.quantity, entry.unit)}</strong> · {exact(entry.amount)}
      </p>
      <p className="mt-1 text-xs text-muted">Recorded by {entry.recorded_by_name} ({humanize(entry.recorded_by_role)}) on {formatDate(entry.measured_on)}</p>
      {entry.excess && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Exceeds the BoQ quantity. Deviation note: {entry.remarks}</p>}
      <div className="mt-3">
        <Textarea label={decision === "reject" ? "Reason (required)" : "Remarks (optional)"} value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={2} />
      </div>
      <div className="mt-3"><ErrorLine error={error} /></div>
    </Modal>
  );
}

function BillModal({ book, bill, action, onClose, onDone }: { book: MeasurementBook; bill?: RunningBill; action: "create" | "approve" | "return" | "pay"; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const { save, saving, error } = useSave();
  const [text, setText] = useState("");
  const titles = { create: "Prepare running (RA) bill", approve: `Approve RA bill ${bill?.bill_no}`, return: `Return RA bill ${bill?.bill_no}`, pay: `Record payment — RA bill ${bill?.bill_no}` };
  async function submit() {
    const request =
      action === "create"
        ? () => api(`/works/${book.work.id}/bills`, { method: "POST", token, body: { remarks: text || undefined } })
        : () => api(`/bills/${bill!.id}/${action}`, { method: "POST", token, body: action === "pay" ? { payment_ref: text } : { remarks: text || undefined } });
    if (await save(request, { title: action === "create" ? "RA bill prepared — sent for approval" : titles[action] })) {
      onDone();
      onClose();
    }
  }
  return (
    <Modal open onClose={onClose} title={titles[action]} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={action === "return" ? "danger" : "primary"} onClick={submit} loading={saving}>{action === "create" ? "Prepare bill" : action === "pay" ? "Record payment" : action === "approve" ? "Approve" : "Return"}</Button></>}>
      {action === "create" ? (
        <p className="text-sm">
          Bills <strong>{book.totals.unbilled_entries}</strong> checked entries worth <strong>{exact(book.totals.unbilled_amount)}</strong>. Cumulative billing becomes{" "}
          <strong>{exact(book.totals.billed_amount + book.totals.unbilled_amount)}</strong>
          {book.work.contract_value ? ` of the ${formatRupees(book.work.contract_value)} contract` : ""}. Approval is by an officer other than you.
        </p>
      ) : (
        <p className="text-sm">
          {exact(bill!.amount)} · {bill!.entries} entries · cumulative {exact(bill!.cumulative_amount)} · prepared by {bill!.created_by_name}
        </p>
      )}
      <div className="mt-3">
        {action === "pay" ? (
          <Input label="Treasury / PFMS payment reference" required value={text} onChange={(event) => setText(event.target.value)} placeholder="PFMS/GJ/2026/…" />
        ) : (
          <Textarea label={action === "return" ? "What needs correcting? (required)" : "Remarks (optional)"} value={text} onChange={(event) => setText(event.target.value)} rows={2} />
        )}
      </div>
      {action === "return" && <p className="mt-2 text-xs text-muted">Returning releases its entries so they can be corrected and billed again.</p>}
      <div className="mt-3"><ErrorLine error={error} /></div>
    </Modal>
  );
}

function PfmsModal({ bill, onClose }: { bill: RunningBill; onClose: () => void }) {
  const payload = useApi<Record<string, unknown>>(`/integrations/pfms/bills/${bill.id}`);
  const text = payload.data ? JSON.stringify(payload.data, null, 2) : "";
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `${String(payload.data?.bill_reference ?? "bill").replaceAll("/", "_")}.json` });
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Modal open onClose={onClose} size="lg" title={`PFMS export — RA bill ${bill.bill_no}`} footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={download} disabled={!payload.data}>Download JSON</Button></>}>
      {payload.loading ? <Loading /> : payload.error ? <ErrorLine error={payload.error} /> : <pre className="max-h-[50vh] overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{text}</pre>}
      <p className="mt-2 text-xs text-muted">Illustrative payment-system format; the export is logged under Administration → Integrations.</p>
    </Modal>
  );
}

export default function MeasurementBookPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const canExport = profile?.role === "HQ" || profile?.role === "EE";
  const book = useApi<MeasurementBook>(`/works/${id}/mb`);
  const [tab, setTab] = useState("boq");
  const [modal, setModal] = useState<null | { kind: "boq" | "measure" } | { kind: "check"; entry: Measurement; decision: "check" | "reject" } | { kind: "bill"; action: "create" | "approve" | "return" | "pay"; bill?: RunningBill } | { kind: "pfms"; bill: RunningBill }>(null);
  const close = () => setModal(null);
  const b = book.data;
  const pendingForMe = useMemo(() => b?.entries.filter((entry) => entry.actions.length).length ?? 0, [b]);

  if (book.loading && !b) return <AppShell title="Measurement book"><Loading /></AppShell>;
  if (book.error || !b) {
    return (
      <AppShell title="Measurement book">
        <ErrorState title={book.status === 403 ? "Outside your jurisdiction" : "Could not load the measurement book"} message={book.error ?? undefined} onRetry={book.status === 403 ? undefined : book.reload} />
      </AppShell>
    );
  }

  const measuredPct = b.totals.boq_amount ? Math.round((1000 * b.totals.measured_amount) / b.totals.boq_amount) / 10 : 0;
  const billedPct = b.work.contract_value ? Math.round((1000 * b.totals.billed_amount) / b.work.contract_value) / 10 : null;

  return (
    <AppShell title="Measurement book" subtitle={`${b.work.work_code} · ${b.work.org_unit_name}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/works/${b.work.id}`} className="text-sm text-accent-text hover:underline">← {b.work.work_code} work journey</Link>
          <h2 className="mt-1 text-lg font-semibold">{b.work.title}</h2>
          <p className="text-sm text-muted">
            {b.work.contractor_name ?? "No contractor yet"}
            {b.work.contract_value ? ` · contract ${formatRupees(b.work.contract_value)}` : ""} · <StatusBadge status={b.work.status} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {b.permissions.record && <Button onClick={() => setModal({ kind: "measure" })} disabled={!b.items.length}>Record measurement</Button>}
          {b.permissions.bill && <Button variant="secondary" onClick={() => setModal({ kind: "bill", action: "create" })}>Prepare RA bill · {formatRupees(b.totals.unbilled_amount)}</Button>}
        </div>
      </div>
      {b.permissions.reason && <p className="mb-4 rounded-xl bg-page px-4 py-2 text-sm text-muted">{b.permissions.reason}.</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="BoQ value" value={formatRupees(b.totals.boq_amount)} sub={`${b.items.length} items`} />
        <Tile label="Measured" value={formatRupees(b.totals.measured_amount)} sub={`${measuredPct}% of BoQ`} />
        <Tile label="Awaiting check" value={String(b.totals.pending_check)} sub={pendingForMe ? `${pendingForMe} for you` : "entries"} tone={pendingForMe ? "warning" : undefined} />
        <Tile label="Billed" value={formatRupees(b.totals.billed_amount)} sub={billedPct != null ? `${billedPct}% of contract` : undefined} />
        <Tile label="Paid" value={formatRupees(b.totals.paid_amount)} sub={b.totals.unbilled_entries ? `${b.totals.unbilled_entries} checked, not yet billed` : undefined} />
      </div>

      <div className="mb-4">
        <Tabs
          tabs={[
            { key: "boq", label: "Bill of quantities", count: b.items.length },
            { key: "mb", label: "Measurements", count: b.entries.length },
            { key: "bills", label: "Running bills", count: b.bills.length }
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === "boq" && (
        <Card title="Bill of quantities" actions={b.permissions.edit_boq ? <Button size="sm" onClick={() => setModal({ kind: "boq" })}>+ Item</Button> : undefined}>
          {!b.items.length ? (
            <EmptyState title="No BoQ yet" description="The EE enters the BoQ from the sanctioned estimate; measurements are recorded against it." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <tr><th className="py-2 pr-3">Item</th><th className="pr-3">Description</th><th className="pr-3 text-right">BoQ qty</th><th className="pr-3 text-right">Rate</th><th className="pr-3 text-right">Amount</th><th className="w-48">Measured</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {b.items.map((item: BoqItem) => (
                    <tr key={item.id}>
                      <td className="py-2.5 pr-3 font-mono text-xs">{item.item_no}</td>
                      <td className="pr-3">{item.description}</td>
                      <td className="whitespace-nowrap pr-3 text-right">{qty(item.quantity, item.unit)}</td>
                      <td className="whitespace-nowrap pr-3 text-right">{exact(item.rate)}</td>
                      <td className="whitespace-nowrap pr-3 text-right">{formatRupees(item.amount)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <ProgressBar value={item.measured_pct} className="flex-1" />
                          <span className={cn("w-12 text-right text-xs", item.excess && "font-semibold text-amber-700")}>{item.measured_pct}%</span>
                        </div>
                        <p className="text-[11px] text-muted">{qty(item.measured_qty, item.unit)}{item.excess && " · exceeds BoQ"}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "mb" && (
        <Card title="Measurement book" subtitle="Every entry is recorded, then checked by someone else before billing">
          {!b.entries.length ? (
            <EmptyState title="No measurements yet" description={b.permissions.record ? "Record the first measurement against a BoQ item." : "Measurements appear once work is executed."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <tr><th className="py-2 pr-3">#</th><th className="pr-3">Date · item · location</th><th className="pr-3">Dimensions</th><th className="pr-3 text-right">Quantity</th><th className="pr-3 text-right">Amount</th><th className="pr-3">Recorded / checked</th><th className="pr-3">Status</th><th /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {b.entries.map((entry) => (
                    <tr key={entry.id} className={cn(entry.status === "REJECTED" && "opacity-60")}>
                      <td className="py-2.5 pr-3 font-mono text-xs">{entry.entry_no}</td>
                      <td className="pr-3">
                        <p>{formatDate(entry.measured_on)} · <span className="font-mono text-xs">{entry.item_no}</span></p>
                        <p className="text-xs text-muted">{entry.location ?? "—"}</p>
                        {entry.remarks && <p className={cn("text-xs", entry.excess ? "text-amber-700" : "text-muted")}>{entry.excess && "Excess: "}{entry.remarks}</p>}
                      </td>
                      <td className="whitespace-nowrap pr-3 text-xs text-muted">{entry.length ? `${entry.nos} × ${[entry.length, entry.breadth, entry.depth].filter(Boolean).join(" × ")}` : "—"}</td>
                      <td className="whitespace-nowrap pr-3 text-right">{qty(entry.quantity, entry.unit)}</td>
                      <td className="whitespace-nowrap pr-3 text-right">{exact(entry.amount)}</td>
                      <td className="pr-3 text-xs">
                        <p>{entry.recorded_by_name} <span className="text-muted">({humanize(entry.recorded_by_role)})</span></p>
                        <p className="font-mono text-[11px] text-muted">{formatDateTime(entry.recorded_at)}</p>
                        {entry.checked_by_name && <p className="mt-0.5">✓ {entry.checked_by_name} <span className="font-mono text-[11px] text-muted">{formatDateTime(entry.checked_at)}</span></p>}
                        {entry.check_remarks && <p className="text-muted">{entry.check_remarks}</p>}
                      </td>
                      <td className="pr-3">
                        <StatusBadge status={entry.status} />
                        {entry.bill_no && <p className="mt-1 text-[11px] text-muted">RA bill {entry.bill_no}</p>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {entry.actions.includes("check") && <Button size="sm" onClick={() => setModal({ kind: "check", entry, decision: "check" })}>Check</Button>}
                        {entry.actions.includes("reject") && <Button size="sm" variant="ghost" onClick={() => setModal({ kind: "check", entry, decision: "reject" })}>Reject</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "bills" && (
        <Card title="Running (RA) bills" subtitle="Prepared from checked entries; approved by a second officer; cumulative billing cannot exceed the contract value">
          {!b.bills.length ? (
            <EmptyState title="No bills yet" description="Once measurements are checked, the EE prepares the first running bill." />
          ) : (
            <ul className="space-y-3">
              {b.bills.map((bill) => (
                <li key={bill.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
                  <div>
                    <p className="font-medium">
                      RA bill {bill.bill_no} · {exact(bill.amount)} <StatusBadge status={bill.status} className="ml-1" />
                    </p>
                    <p className="text-xs text-muted">
                      {bill.entries} entries · cumulative {formatRupees(bill.cumulative_amount)} · prepared by {bill.created_by_name} <span className="font-mono">{formatDateTime(bill.created_at)}</span>
                      {bill.decided_by_name && <> · {bill.status === "RETURNED" ? "returned" : "approved"} by {bill.decided_by_name} <span className="font-mono">{formatDateTime(bill.decided_at)}</span></>}
                    </p>
                    {bill.payment_ref && <p className="text-xs text-emerald-700">Paid · {bill.payment_ref} · {formatDate(bill.paid_at)}</p>}
                    {bill.remarks && <p className="text-xs text-muted">{bill.remarks}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {bill.actions.includes("approve") && <Button size="sm" onClick={() => setModal({ kind: "bill", action: "approve", bill })}>Approve</Button>}
                    {bill.actions.includes("return") && <Button size="sm" variant="secondary" onClick={() => setModal({ kind: "bill", action: "return", bill })}>Return</Button>}
                    {bill.actions.includes("pay") && <Button size="sm" onClick={() => setModal({ kind: "bill", action: "pay", bill })}>Record payment</Button>}
                    {["APPROVED", "PAID"].includes(bill.status) && canExport && (
                      <Button size="sm" variant="ghost" onClick={() => setModal({ kind: "pfms", bill })}>PFMS export</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {modal?.kind === "boq" && <BoqModal workId={b.work.id} onClose={close} onDone={book.reload} />}
      {modal?.kind === "measure" && <MeasureModal book={b} onClose={close} onDone={book.reload} />}
      {modal?.kind === "check" && <CheckModal entry={modal.entry} decision={modal.decision} onClose={close} onDone={book.reload} />}
      {modal?.kind === "bill" && <BillModal book={b} bill={modal.bill} action={modal.action} onClose={close} onDone={book.reload} />}
      {modal?.kind === "pfms" && <PfmsModal bill={modal.bill} onClose={close} />}
    </AppShell>
  );
}
