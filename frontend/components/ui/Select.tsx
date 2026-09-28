"use client";

import { useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type SelectOption = { value: string; label: string };

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
};

export default function Select({ label, hint, error, options, placeholder, id, className, required, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-condition-critical">*</span>}
        </label>
      )}
      <select
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(
          "h-10 rounded-lg border bg-surface px-3 text-sm text-ink",
          "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40",
          error ? "border-condition-critical" : "border-line",
          className
        )}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-xs text-condition-critical">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
