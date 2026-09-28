"use client";

import { cn } from "@/lib/cn";

type Tab = { key: string; label: string; count?: number };

export default function Tabs({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (key: string) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          type="button"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === tab.key ? "border-accent text-accent-text" : "border-transparent text-muted hover:text-ink"
          )}
        >
          {tab.label}
          {tab.count !== undefined && <span className="rounded-full bg-page px-1.5 text-xs text-muted">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
