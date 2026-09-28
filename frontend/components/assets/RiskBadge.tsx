"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { RiskBand, RiskFactor } from "@/types/assets";

const bandStyles: Record<RiskBand, string> = {
  LOW: "bg-green-50 text-green-700 border-green-200",
  MEDIUM: "bg-amber-50 text-amber-800 border-amber-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-50 text-red-700 border-red-200"
};

const barColour: Record<RiskBand, string> = {
  LOW: "bg-condition-excellent",
  MEDIUM: "bg-condition-moderate",
  HIGH: "bg-condition-poor",
  CRITICAL: "bg-condition-critical"
};

export function RiskBadge({ score, band, className }: { score: number; band: RiskBand; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold", bandStyles[band], className)}>
      <span className="font-mono">{Math.round(score)}</span>
      {band.charAt(0) + band.slice(1).toLowerCase()}
    </span>
  );
}

export function RiskExplain({ factors, band }: { factors: RiskFactor[]; band: RiskBand }) {
  const sorted = [...factors].sort((a, b) => b.points - a.points);
  return (
    <ul className="space-y-2">
      {sorted.map((factor) => (
        <li key={factor.key}>
          <div className="flex justify-between gap-3 text-sm">
            <span className={factor.points > 0 ? "text-ink" : "text-muted"}>{factor.label}</span>
            <span className="shrink-0 font-mono text-xs">
              +{factor.points} <span className="text-muted">/ {factor.max}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-page">
            <div className={cn("h-1.5 rounded-full", barColour[band])} style={{ width: `${(factor.points / factor.max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Score badge with a "why?" disclosure listing each factor's contribution.
export function RiskWithWhy({ score, band, factors, align = "right" }: { score: number; band: RiskBand; factors: RiskFactor[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const top = [...factors].filter((factor) => factor.points > 0).sort((a, b) => b.points - a.points).slice(0, 3);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full focus-visible:ring-2"
      >
        <RiskBadge score={score} band={band} />
        <span className="text-xs font-medium text-accent-text underline">why?</span>
      </button>
      {open && (
        <div
          className={cn(
            "absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 text-left shadow-xl",
            align === "right" && "sm:left-auto sm:right-0"
          )}
        >
          <p className="mb-1 text-sm font-semibold">
            Risk {Math.round(score)} / 100 — {band.toLowerCase()}
          </p>
          <p className="mb-3 text-xs text-muted">
            {top.length ? top.map((factor) => `${factor.label} (+${factor.points})`).join(", ") : "No significant risk factors"}
          </p>
          <RiskExplain factors={factors} band={band} />
          <p className="mt-3 text-[11px] text-muted">Illustrative, configurable weights (PRD §9). Supports prioritisation; the officer decides.</p>
        </div>
      )}
    </div>
  );
}
