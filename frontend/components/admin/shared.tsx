"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";

export type Office = { id: string; code: string; type: "STATE" | "CIRCLE" | "DIVISION" | "SUBDIVISION"; name: string; parent_id: string | null; path: string; district: string | null; users: number; assets: number };
export type Firm = { id: string; code: string; name: string; class: string | null; contact_name: string | null; contact_phone: string | null; contact_email: string | null; is_active: boolean; logins: number; active_works: number; total_works: number; avg_score: number | null; open_dlp_defects: number };

export const ROLE_LEVELS: Record<string, Office["type"][]> = { HQ: ["STATE", "CIRCLE"], EE: ["DIVISION"], AE: ["SUBDIVISION"], CONTRACTOR: ["STATE", "CIRCLE", "DIVISION", "SUBDIVISION"] };

export function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return `${Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("")}@1`;
}

// Save helper: runs the request, toasts on success, keeps the error text for the form.
export function useSave() {
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  async function save(action: () => Promise<unknown>, message: { title: string; description?: string }) {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await action();
      notify(message);
      return true;
    } catch (caught) {
      if (caught instanceof ApiError && Array.isArray(caught.details)) {
        setFieldErrors(Object.fromEntries((caught.details as Array<{ field: string; message: string }>).map((detail) => [detail.field, detail.message])));
      }
      setError(caught instanceof Error ? caught.message : "Could not save");
      return false;
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, fieldErrors, save, setError };
}

export function FormError({ error, fieldErrors }: { error: string | null; fieldErrors?: Record<string, string> }) {
  if (!error) return null;
  const details = Object.entries(fieldErrors ?? {});
  return (
    <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
      {details.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {details.map(([field, message]) => (
            <li key={field}>
              {field}: {message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const officeLabel = (office: Office) => `${office.name}${office.type === "SUBDIVISION" || office.type === "DIVISION" ? ` · ${office.district ?? ""}` : ""}`;
