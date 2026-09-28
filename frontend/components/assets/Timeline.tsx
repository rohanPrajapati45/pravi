"use client";

import { humanize } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/format";
import type { TimelineEvent } from "@/types/assets";

const dotColour: Record<string, string> = {
  ASSET_REGISTERED: "bg-accent",
  STATUS_CHANGED: "bg-condition-moderate",
  ASSET_UPDATED: "bg-slate-400",
  COMPONENT_ADDED: "bg-sky-500",
  INSPECTION_RECORDED: "bg-condition-good",
  MAINTENANCE_RAISED: "bg-condition-poor",
  MAINTENANCE_VERIFIED: "bg-condition-excellent",
  HANDED_OVER: "bg-accent"
};

function describeChange(event: TimelineEvent) {
  if (event.from_status || event.to_status) {
    return event.from_status ? `${humanize(event.from_status)} → ${humanize(event.to_status ?? "")}` : `Status: ${humanize(event.to_status ?? "")}`;
  }
  if (event.after && event.before) {
    return Object.keys(event.after)
      .filter((key) => key !== "attributes")
      .map((key) => `${humanize(key)}: ${String(event.before?.[key] ?? "—")} → ${String(event.after?.[key] ?? "—")}`)
      .concat(event.after.attributes ? ["Attributes updated"] : [])
      .join(" · ");
  }
  return null;
}

export default function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative ml-2 border-l border-line">
      {events.map((event) => {
        const change = describeChange(event);
        return (
          <li key={event.id} className="mb-5 ml-5">
            <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${dotColour[event.event_type] ?? "bg-slate-400"}`} aria-hidden />
            <p className="text-sm font-medium">{humanize(event.event_type)}</p>
            <p className="text-xs text-muted">
              {formatDateTime(event.at)} · {event.actor_name ?? (event.actor_role === "SYSTEM" ? "System" : event.actor_role)}
            </p>
            {change && <p className="mt-1 text-sm text-ink">{change}</p>}
            {event.remarks && <p className="mt-1 text-sm text-muted">{event.remarks}</p>}
          </li>
        );
      })}
    </ol>
  );
}
