"use client";

import { useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string; error?: string };

export default function Textarea({ label, hint, error, id, className, required, rows = 3, ...rest }: TextareaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-condition-critical">*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(
          "rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted",
          "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40",
          error ? "border-condition-critical" : "border-line",
          className
        )}
        {...rest}
      />
      {error ? <p className="text-xs text-condition-critical">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
