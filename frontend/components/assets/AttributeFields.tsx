"use client";

import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import type { AttributeField } from "@/types/assets";

type Props = {
  schema: AttributeField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  errors?: Record<string, string>;
};

// Form fields generated from asset_types.attribute_schema — no per-type code.
export default function AttributeFields({ schema, values, onChange, errors = {} }: Props) {
  if (!schema.length) return <p className="text-sm text-muted">This asset type has no extra attributes.</p>;
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {schema.map((field) => {
        const error = errors[`attributes.${field.key}`];
        const label = field.unit ? `${field.label} (${field.unit})` : field.label;
        const value = values[field.key];
        if (field.type === "select") {
          return (
            <Select
              key={field.key}
              label={label}
              required={field.required}
              placeholder="Select…"
              value={(value as string) ?? ""}
              onChange={(event) => set(field.key, event.target.value)}
              options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
              error={error}
            />
          );
        }
        if (field.type === "boolean") {
          return (
            <label key={field.key} className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" checked={value === true} onChange={(event) => set(field.key, event.target.checked)} />
              {label}
            </label>
          );
        }
        return (
          <Input
            key={field.key}
            label={label}
            required={field.required}
            type={field.type === "number" ? "number" : "text"}
            inputMode={field.type === "number" ? "decimal" : undefined}
            step="any"
            min={field.type === "number" ? 0 : undefined}
            value={(value as string | number | undefined) ?? ""}
            onChange={(event) => set(field.key, event.target.value)}
            error={error}
          />
        );
      })}
    </div>
  );
}
