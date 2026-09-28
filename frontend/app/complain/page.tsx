"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import PublicShell from "@/components/public/PublicShell";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import Textarea from "@/components/ui/Textarea";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { uploadComplaintPhoto } from "@/lib/storage";
import { COMPLAINT_CATEGORIES } from "@/types/operations";

type Filed = { complaint_code: string; status: string; routed: boolean; duplicate_of: string | null };

function ComplaintForm() {
  const params = useSearchParams();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [assetCode, setAssetCode] = useState(params.get("asset") ?? "");
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<Filed | null>(null);

  function locate() {
    if (!navigator.geolocation) return setError("Location is not available on this device — describe the place instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setPosition({ lat: result.coords.latitude, lng: result.coords.longitude, accuracy: result.coords.accuracy });
        setLocating(false);
      },
      () => {
        setError("Could not get your location — allow location access or describe the place.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const photo_paths = [];
      for (const file of files) photo_paths.push(await uploadComplaintPhoto(file));
      const { data } = await api<Filed>("/public/complaints", {
        method: "POST",
        body: {
          category,
          description,
          location_text: locationText || undefined,
          lat: position?.lat,
          lng: position?.lng,
          asset_code: assetCode || undefined,
          citizen_name: name || undefined,
          citizen_phone: phone || undefined,
          photo_paths
        }
      });
      setFiled(data);
    } catch (caught) {
      const details = caught instanceof ApiError && Array.isArray(caught.details) ? (caught.details as Array<{ message: string }>).map((detail) => detail.message).join(" · ") : null;
      setError(details || (caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (filed) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Icon name="check" className="h-6 w-6" />
        </span>
        <h2 className="mt-3 text-xl font-semibold">Complaint registered</h2>
        <p className="mt-1 text-sm text-muted">Your complaint number</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-accent-text">{filed.complaint_code}</p>
        <p className="mx-auto mt-3 max-w-md text-sm">
          {filed.duplicate_of
            ? `This problem was already reported as ${filed.duplicate_of} and is being handled — your complaint is linked to it.`
            : filed.routed
              ? "It has been sent to the engineer responsible for this location."
              : "Our headquarters team will route it to the right office."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href={`/complain/track?code=${filed.complaint_code}`} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">Track status</Link>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-line px-4 py-2 text-sm">Report another problem</button>
        </div>
        {phone && <p className="mt-3 text-xs text-muted">To track, you will need the last 4 digits of the phone number you gave.</p>}
      </div>
    );
  }

  const ready = category && description.trim().length >= 10 && (position || locationText.trim() || assetCode.trim());
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Report a road or bridge problem</h1>
        <p className="mt-1 text-sm text-muted">No login needed. Your complaint goes straight to the engineer responsible for that stretch, and you can track it.</p>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <p className="mb-2 text-sm font-medium">1. What is the problem?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {COMPLAINT_CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategory(item.value)}
              aria-pressed={category === item.value}
              className={cn("rounded-xl border px-3 py-2.5 text-left text-sm transition", category === item.value ? "border-accent bg-accent-soft font-medium" : "border-line hover:border-accent")}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Textarea label="Describe it" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Deep potholes on the left lane for about 100 m after the canal bridge" />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <p className="mb-2 text-sm font-medium">2. Where is it?</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={position ? "secondary" : "primary"} onClick={locate} loading={locating}>
            <Icon name="locate" className="h-4 w-4" /> {position ? "Update my location" : "Use my current location"}
          </Button>
          {position && <span className="text-sm text-emerald-700">Location captured (±{Math.round(position.accuracy)} m)</span>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_200px]">
          <Input label="Or describe the place" value={locationText} onChange={(event) => setLocationText(event.target.value)} placeholder="Sanand–Dholka road, near Bhayla village turn" />
          <Input label="Asset code (optional)" value={assetCode} onChange={(event) => setAssetCode(event.target.value)} placeholder="RDB-BR-000001" hint="Printed on the board / QR" className="font-mono" />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <p className="mb-2 text-sm font-medium">3. Photos and contact (optional)</p>
        <input type="file" accept="image/*" capture="environment" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))} className="block w-full text-sm" />
        {files.length > 0 && <p className="mt-1 text-xs text-muted">{files.length} photo(s) will be attached</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input label="Your name" value={name} onChange={(event) => setName(event.target.value)} />
          <Input label="Mobile number" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} hint="Only to track your complaint — never shown publicly" />
        </div>
      </section>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <Button className="w-full" size="lg" onClick={submit} loading={saving} disabled={!ready}>Submit complaint</Button>
      {!ready && <p className="text-center text-xs text-muted">Choose the problem, describe it in a sentence, and share your location or describe the place.</p>}
    </div>
  );
}

export default function ComplainPage() {
  return (
    <PublicShell>
      <Suspense fallback={<Loading />}>
        <ComplaintForm />
      </Suspense>
    </PublicShell>
  );
}
