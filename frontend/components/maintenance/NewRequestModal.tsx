"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

export default function NewRequestModal({ assetId, assetName, inDlp, onClose }: { assetId: string; assetName: string; inDlp: boolean; onClose: () => void }) {
  const router = useRouter();
  const { token } = useAuth();
  const { notify } = useToast();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api<{ id: string; request_code: string }>("/maintenance-requests", { method: "POST", token, body: { asset_id: assetId, title, severity, description: description || undefined } });
      notify({ title: `${data.request_code} raised`, description: "The division EE has it on their desk" });
      router.push(`/maintenance/${data.id}`);
    } catch (caught) {
      setError((caught as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Request repair"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={title.trim().length < 5}>
            Raise request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">{assetName}</p>
        <Input label="What needs fixing?" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Replace broken railing panel" />
        <Select
          label="Severity"
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
          options={[
            { value: "HIGH", label: "High — safety risk, 7-day target" },
            { value: "MEDIUM", label: "Medium — 15-day target" },
            { value: "LOW", label: "Low — 30-day target" }
          ]}
        />
        <Textarea label="Details" value={description} onChange={(event) => setDescription(event.target.value)} />
        {inDlp && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-text">Asset is in its defect liability period — the request will be flagged contractor-liable.</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
