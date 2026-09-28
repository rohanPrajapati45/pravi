"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import StatusBadge, { humanize } from "@/components/ui/StatusBadge";
import Textarea from "@/components/ui/Textarea";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { DOCUMENT_ACCEPT, uploadDocument } from "@/lib/storage";
import { useToast } from "@/lib/toast";
import { useApi } from "@/lib/useApi";

type DocumentRow = {
  id: string;
  asset_id: string | null;
  work_id: string | null;
  work_code: string | null;
  doc_type: string;
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  uploaded_by_name: string | null;
  url: string | null;
  source: "asset" | "work";
  can_delete: boolean;
};

const DOC_TYPES = ["DPR", "DRAWING", "AS_BUILT", "CONTRACT", "COMPLETION_CERTIFICATE", "INSPECTION_REPORT", "TEST_REPORT", "INVOICE", "WARRANTY", "PHOTO", "OTHER"];
const TYPE_LABEL: Record<string, string> = { DPR: "DPR", AS_BUILT: "As-built" };
const label = (type: string) => TYPE_LABEL[type] ?? humanize(type);

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function UploadModal({ ownerType, ownerId, onClose, onDone }: { ownerType: "asset" | "work"; ownerId: string; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const { notify } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState(ownerType === "asset" ? "INSPECTION_REPORT" : "DPR");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const uploaded = await uploadDocument(file, { ownerType, ownerId, token });
      await api("/documents", { method: "POST", token, body: { owner_type: ownerType, owner_id: ownerId, doc_type: docType, title: title.trim(), description: description || undefined, ...uploaded } });
      notify({ title: "Document uploaded", description: `${label(docType)} · ${title.trim()}` });
      onDone();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : (caught as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload document"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!file || title.trim().length < 3}>Upload</Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line p-5 text-center text-sm text-muted hover:border-accent">
          <Icon name="plus" className="h-5 w-5" />
          {file ? (
            <span className="text-ink">
              {file.name} <span className="text-muted">· {size(file.size)}</span>
            </span>
          ) : (
            "Choose a file — PDF, image, Word or Excel, up to 20 MB"
          )}
          <input
            type="file"
            accept={DOCUMENT_ACCEPT}
            className="sr-only"
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null;
              setFile(chosen);
              if (chosen && !title) setTitle(chosen.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
            }}
          />
        </label>
        <Select label="Document type" value={docType} onChange={(event) => setDocType(event.target.value)} options={DOC_TYPES.map((type) => ({ value: type, label: label(type) }))} />
        <Input label="Title" required value={title} onChange={(event) => setTitle(event.target.value)} />
        <Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <p className="text-xs text-muted">Stored in private storage; links expire after an hour. Removing a document hides it but keeps it in the archive.</p>
      </div>
    </Modal>
  );
}

export default function DocumentsPanel({ ownerType, ownerId, canUpload }: { ownerType: "asset" | "work"; ownerId: string; canUpload: boolean }) {
  const { token } = useAuth();
  const { notify } = useToast();
  const docs = useApi<DocumentRow[]>("/documents", ownerType === "asset" ? { asset_id: ownerId } : { work_id: ownerId });
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(doc: DocumentRow) {
    if (!window.confirm(`Remove “${doc.title}”? It is hidden from lists but kept in the archive.`)) return;
    setRemoving(doc.id);
    try {
      await api(`/documents/${doc.id}`, { method: "DELETE", token });
      notify({ title: "Document removed", description: doc.title });
      docs.reload();
    } catch (caught) {
      notify({ title: "Could not remove", description: (caught as Error).message, tone: "error" });
    } finally {
      setRemoving(null);
    }
  }

  const groups = (docs.data ?? []).reduce<Record<string, DocumentRow[]>>((all, doc) => {
    (all[doc.doc_type] ??= []).push(doc);
    return all;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{ownerType === "asset" ? "This asset's documents plus those of the work that built it." : "Documents for this work — they also appear on the assets it creates."}</p>
        {canUpload && (
          <Button size="sm" onClick={() => setUploading(true)}>
            + Upload
          </Button>
        )}
      </div>
      {docs.loading && !docs.data ? (
        <Loading />
      ) : docs.error ? (
        <ErrorState message={docs.error} onRetry={docs.reload} />
      ) : !docs.data?.length ? (
        <EmptyState title="No documents attached" description="DPRs, drawings, contracts, as-built drawings and certificates appear here." />
      ) : (
        <div className="space-y-4">
          {DOC_TYPES.filter((type) => groups[type]).map((type) => (
            <section key={type}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{label(type)}</p>
              <ul className="space-y-2">
                {groups[type].map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-mono text-[10px] font-bold uppercase text-accent-text">
                      {doc.file_name.split(".").pop()?.slice(0, 4)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <p className="truncate text-[11px] text-muted">
                        {doc.file_name} · {size(doc.size_bytes)} · <span className="font-mono">{formatDateTime(doc.created_at)}</span>
                        {doc.uploaded_by_name && ` · ${doc.uploaded_by_name}`}
                      </p>
                      {doc.description && <p className="mt-0.5 truncate text-xs text-muted">{doc.description}</p>}
                    </div>
                    {ownerType === "asset" && doc.source === "work" && <StatusBadge status="WORK" label={`from ${doc.work_code}`} tone="neutral" className="hidden sm:inline-flex" />}
                    <div className="flex shrink-0 gap-1">
                      {doc.url && (
                        <a href={doc.url} target="_blank" rel="noreferrer" className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-soft">
                          Open
                        </a>
                      )}
                      {doc.can_delete && (
                        <Button size="sm" variant="ghost" loading={removing === doc.id} onClick={() => remove(doc)} aria-label={`Remove ${doc.title}`}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {uploading && <UploadModal ownerType={ownerType} ownerId={ownerId} onClose={() => setUploading(false)} onDone={docs.reload} />}
    </div>
  );
}
