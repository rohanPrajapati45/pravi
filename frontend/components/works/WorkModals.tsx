"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/format";
import { uploadEvidence } from "@/lib/storage";
import { useToast } from "@/lib/toast";
import { useApi } from "@/lib/useApi";
import type { WorkJourney, WorkStage, WorkTask } from "@/types/works";

type Done = { onClose: () => void; onDone: () => void };
type Person = { id: string; name: string; role: string; designation: string | null; org_unit_name: string; contractor_name: string | null };

function useSubmit(onDone: () => void, onClose: () => void) {
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>, message?: { title: string; description?: string }) {
    setSaving(true);
    setError(null);
    try {
      await action();
      if (message) notify(message);
      onDone();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : (caught as Error).message);
      setSaving(false);
    }
  }
  return { saving, error, run };
}

const ErrorLine = ({ error }: { error: string | null }) => (error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null);

export function AssignTaskModal({ work, task, onClose, onDone }: Done & { work: WorkJourney; task: WorkTask }) {
  const { token } = useAuth();
  const people = useApi<Person[]>(`/works/${work.id}/assignees`);
  const [assignee, setAssignee] = useState(task.assigned_to ?? "");
  const [due, setDue] = useState(task.due_date ?? "");
  const { saving, error, run } = useSubmit(onDone, onClose);
  const contractorTask = task.default_assignee_role === "CONTRACTOR";
  const options = (people.data ?? [])
    .filter((person) => (contractorTask ? person.role === "CONTRACTOR" : person.role !== "CONTRACTOR"))
    .map((person) => ({
      value: person.id,
      label: person.role === "CONTRACTOR" ? `${person.contractor_name} (${person.name})` : `${person.name} · ${person.designation ?? person.role}, ${person.org_unit_name}${person.role === task.default_assignee_role ? " ★" : ""}`
    }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Assign task"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={saving}
            disabled={!assignee}
            onClick={() =>
              run(() => api(`/tasks/${task.id}/assign`, { method: "POST", token, body: { assigned_to: assignee, due_date: due || undefined } }), {
                title: `Assigned to ${(people.data ?? []).find((person) => person.id === assignee)?.name ?? "assignee"}`,
                description: task.title
              })
            }
          >
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm font-medium">{task.title}</p>
        {contractorTask && !work.contractor_name ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Contractor tasks can be assigned once the work is awarded.</p>
        ) : (
          <Select
            label={`Assign to (usually ${task.default_assignee_role === "CONTRACTOR" ? "the contractor" : task.default_assignee_role})`}
            placeholder={people.loading ? "Loading…" : "Select a person"}
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            options={options}
          />
        )}
        <Input label="Due date" type="date" value={due} onChange={(event) => setDue(event.target.value)} />
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}

export function SubmitTaskModal({ task, onClose, onDone }: Done & { task: WorkTask }) {
  const { token } = useAuth();
  const photoLabels = task.required_deliverables.filter((label) => /photo/i.test(label));
  const referenceLabels = task.required_deliverables.filter((label) => !/photo/i.test(label));
  const [refs, setRefs] = useState<Record<string, string>>(Object.fromEntries(task.deliverables.map((item) => [item.label, item.reference])));
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState(task.submission_note ?? "");
  const [progress, setProgress] = useState(task.is_milestone ? "100" : "");
  const { saving, error, run } = useSubmit(onDone, onClose);
  const complete = referenceLabels.every((label) => refs[label]?.trim()) && (!photoLabels.length || files.length > 0);

  async function submit() {
    const photo_paths = [];
    for (const file of files) photo_paths.push(await uploadEvidence(file, { purpose: "progress", ownerId: task.id, token }));
    await api(`/tasks/${task.id}/submit`, {
      method: "POST",
      token,
      body: {
        note: note || undefined,
        deliverables: referenceLabels.map((label) => ({ label, reference: refs[label] ?? "" })),
        photo_paths,
        progress_pct: progress ? Number(progress) : undefined
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Submit task"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={!complete} onClick={() => run(submit, { title: "Submitted for review", description: task.title })}>
            Submit for review
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm font-medium">{task.title}</p>
        {task.status === "RETURNED" && task.review_remarks && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <strong>Returned for rework:</strong> {task.review_remarks}
          </p>
        )}
        {referenceLabels.map((label) => (
          <Input
            key={label}
            label={label}
            required
            value={refs[label] ?? ""}
            onChange={(event) => setRefs((current) => ({ ...current, [label]: event.target.value }))}
            placeholder="Document / file number, or link"
          />
        ))}
        {(photoLabels.length > 0 || task.is_milestone) && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line p-4 text-sm text-muted hover:border-accent">
            {files.length ? `${files.length} photo(s) selected` : `Add ${photoLabels[0]?.toLowerCase() ?? "progress photos"}${photoLabels.length ? " (required)" : ""}`}
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 6))} />
          </label>
        )}
        {task.is_milestone && <Input label="Milestone completion (%)" inputMode="numeric" value={progress} onChange={(event) => setProgress(event.target.value)} />}
        <Textarea label="Note" value={note} onChange={(event) => setNote(event.target.value)} />
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}

export function ReviewTaskModal({ task, decision, onClose, onDone }: Done & { task: WorkTask; decision: "accept" | "return" }) {
  const { token } = useAuth();
  const [remarks, setRemarks] = useState("");
  const { saving, error, run } = useSubmit(onDone, onClose);
  const accept = decision === "accept";
  return (
    <Modal
      open
      onClose={onClose}
      title={accept ? (task.is_milestone ? "Accept milestone (quality check passed)" : "Accept submission") : "Return for rework"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant={accept ? "primary" : "danger"}
            loading={saving}
            disabled={!accept && remarks.trim().length < 3}
            onClick={() =>
              run(() => api(`/tasks/${task.id}/${decision}`, { method: "POST", token, body: { remarks: remarks || undefined } }), {
                title: accept ? `Accepted — ${task.submitted_by_name ?? "submitter"} notified` : `Returned to ${task.submitted_by_name ?? "submitter"} for rework`,
                description: task.title
              })
            }
          >
            {accept ? "Accept" : "Return"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm font-medium">{task.title}</p>
        <p className="text-xs text-muted">Submitted by {task.submitted_by_name}</p>
        {task.deliverables.length > 0 && (
          <ul className="rounded-lg bg-page p-3 text-sm">
            {task.deliverables.map((item) => (
              <li key={item.label}>
                <span className="text-muted">{item.label}:</span> <span className="font-mono text-xs">{item.reference}</span>
              </li>
            ))}
          </ul>
        )}
        {task.submission_note && <p className="text-sm text-muted">&ldquo;{task.submission_note}&rdquo;</p>}
        <Textarea label={accept ? "Remarks (optional)" : "What needs rework? (required)"} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}

const outcomes = [
  { value: "PASSED", label: "Passed", hint: "Every checklist item satisfied" },
  { value: "PASSED_WITH_OBSERVATIONS", label: "Passed with observations", hint: "Proceed; remarks recorded" },
  { value: "RETURNED", label: "Returned", hint: "Send tasks back for rework" },
  { value: "REJECTED", label: "Rejected", hint: "Stop this work" }
] as const;

export function GateModal({ work, stage, onClose, onDone }: Done & { work: WorkJourney; stage: WorkStage }) {
  const { token } = useAuth();
  const contractors = useApi<Array<{ id: string; name: string }>>(stage.kind === "AWARD" ? "/contractors" : null);
  const [outcome, setOutcome] = useState<(typeof outcomes)[number]["value"]>("PASSED");
  const [checks, setChecks] = useState<Record<string, boolean>>(Object.fromEntries(stage.gate_checklist.map((item) => [item, true])));
  const [remarks, setRemarks] = useState("");
  const [returnIds, setReturnIds] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, string>>({
    technical_sanction_amount: String(work.estimated_cost ?? ""),
    sanctioned_amount: String(work.sanctioned_amount ?? work.estimated_cost ?? ""),
    contract_value: String(work.sanctioned_amount ?? ""),
    dlp_months: "24",
    start_date: new Date().toISOString().slice(0, 10)
  });
  const { saving, error, run } = useSubmit(onDone, onClose);
  const set = (key: string) => (event: { target: { value: string } }) => setData((current) => ({ ...current, [key]: event.target.value }));
  const passing = outcome === "PASSED" || outcome === "PASSED_WITH_OBSERVATIONS";

  function body() {
    const payload: Record<string, unknown> = {
      outcome,
      remarks: remarks || undefined,
      checklist: stage.gate_checklist.map((item) => ({ item, ok: Boolean(checks[item]) })),
      return_task_ids: outcome === "RETURNED" ? returnIds : []
    };
    if (passing) {
      const numeric = ["technical_sanction_amount", "sanctioned_amount", "contract_value", "dlp_months", "condition_after"];
      const keys =
        stage.kind === "APPROVAL" ? ["technical_sanction_amount", "sanctioned_amount", "ts_ref", "aa_ref"]
        : stage.kind === "AWARD" ? ["tender_ref", "contractor_id", "contract_value", "start_date", "planned_end", "dlp_months"]
        : stage.kind === "HANDOVER" ? (work.asset_type_code ? ["completion_certificate_ref"] : ["condition_after"])
        : [];
      payload.data = Object.fromEntries(keys.filter((key) => data[key] !== undefined && data[key] !== "").map((key) => [key, numeric.includes(key) ? Number(data[key]) : data[key]]));
    }
    return payload;
  }

  const allChecked = stage.gate_checklist.every((item) => checks[item]);
  const invalid = (outcome === "PASSED" && !allChecked) || (outcome !== "PASSED" && remarks.trim().length < 3) || (outcome === "RETURNED" && !returnIds.length);

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Gate: ${stage.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant={outcome === "REJECTED" ? "danger" : "primary"}
            loading={saving}
            disabled={invalid}
            onClick={() =>
              run(
                async () => {
                  const { data: result } = await api<{ next_stage: string | null; effects: Record<string, unknown> }>(`/work-stages/${stage.id}/evaluate`, { method: "POST", token, body: body() });
                  return result;
                },
                {
                  title: `${stage.name}: ${outcomes.find((item) => item.value === outcome)?.label.toLowerCase()}`,
                  description: passing ? "Next stage unlocked — assignees can start" : outcome === "RETURNED" ? "Selected tasks sent back for rework" : "Work stopped"
                }
              )
            }
          >
            Record evaluation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {outcomes.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setOutcome(item.value)}
              aria-pressed={outcome === item.value}
              className={cn("rounded-xl border p-2 text-left", outcome === item.value ? "border-accent bg-accent-soft" : "border-line")}
            >
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-[11px] text-muted">{item.hint}</p>
            </button>
          ))}
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Checklist</legend>
          {stage.gate_checklist.map((item) => (
            <label key={item} className="flex items-start gap-2 py-1 text-sm">
              <input type="checkbox" className="mt-0.5" checked={Boolean(checks[item])} onChange={(event) => setChecks((current) => ({ ...current, [item]: event.target.checked }))} />
              {item}
            </label>
          ))}
          {outcome === "PASSED" && !allChecked && <p className="text-xs text-condition-critical">Unchecked items — choose &ldquo;Passed with observations&rdquo; and explain.</p>}
        </fieldset>

        {passing && stage.kind === "APPROVAL" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Technical sanction (₹)" inputMode="numeric" value={data.technical_sanction_amount ?? ""} onChange={set("technical_sanction_amount")} hint={formatRupees(Number(data.technical_sanction_amount || 0))} />
            <Input label="Administrative approval (₹)" inputMode="numeric" value={data.sanctioned_amount ?? ""} onChange={set("sanctioned_amount")} hint={formatRupees(Number(data.sanctioned_amount || 0))} />
            <Input label="TS reference" value={data.ts_ref ?? ""} onChange={set("ts_ref")} />
            <Input label="AA reference" value={data.aa_ref ?? ""} onChange={set("aa_ref")} />
            {stage.gate?.limit && <p className="text-xs text-muted sm:col-span-2">Your delegation: {stage.gate.limit}. Amounts above it are rejected and must be escalated.</p>}
          </div>
        )}
        {passing && stage.kind === "AWARD" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Tender reference (e-procurement)" value={data.tender_ref ?? ""} onChange={set("tender_ref")} />
            <Select label="Contractor" placeholder="Select contractor" value={data.contractor_id ?? ""} onChange={set("contractor_id")} options={(contractors.data ?? []).map((item) => ({ value: item.id, label: item.name }))} />
            <Input label="Contract value (₹)" inputMode="numeric" value={data.contract_value ?? ""} onChange={set("contract_value")} hint={formatRupees(Number(data.contract_value || 0))} />
            <Input label="Defect liability period (months)" inputMode="numeric" value={data.dlp_months ?? ""} onChange={set("dlp_months")} />
            <Input label="Start date" type="date" value={data.start_date ?? ""} onChange={set("start_date")} />
            <Input label="Planned completion" type="date" value={data.planned_end ?? ""} onChange={set("planned_end")} />
          </div>
        )}
        {passing && stage.kind === "HANDOVER" && (
          work.asset_type_code ? (
            <Input label="Completion certificate reference" value={data.completion_certificate_ref ?? ""} onChange={set("completion_certificate_ref")} hint="Passing this gate activates the asset and starts its DLP." />
          ) : (
            <Select
              label="Asset condition after repair"
              placeholder="Select"
              value={data.condition_after ?? ""}
              onChange={set("condition_after")}
              options={[5, 4, 3].map((rating) => ({ value: String(rating), label: `${rating}` }))}
            />
          )
        )}
        {outcome === "RETURNED" && (
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Tasks needing rework</legend>
            {stage.tasks.map((task) => (
              <label key={task.id} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={returnIds.includes(task.id)}
                  onChange={(event) => setReturnIds((current) => (event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id)))}
                />
                {task.title}
              </label>
            ))}
          </fieldset>
        )}
        <Textarea label={outcome === "PASSED" ? "Remarks (optional)" : "Remarks (required)"} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}
