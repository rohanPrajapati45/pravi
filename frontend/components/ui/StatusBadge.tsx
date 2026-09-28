import { cn } from "@/lib/cn";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  accent: "bg-accent-soft text-accent-text border-cyan-200"
};

const statusTones: Record<string, Tone> = {
  OPERATIONAL: "success",
  PLANNED: "neutral",
  UNDER_CONSTRUCTION: "info",
  UNDER_MAINTENANCE: "warning",
  UNDER_REHABILITATION: "warning",
  CLOSED_TEMPORARILY: "danger",
  RETIRED: "neutral",
  OPEN: "info",
  ASSIGNED: "accent",
  IN_PROGRESS: "warning",
  COMPLETED: "accent",
  VERIFIED: "success",
  CLOSED: "neutral",
  CANCELLED: "neutral",
  REJECTED: "danger",
  OVERDUE: "danger",
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "danger",
  CRITICAL: "danger"
};

export function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type StatusBadgeProps = {
  status: string;
  label?: string;
  tone?: Tone;
  className?: string;
};

export default function StatusBadge({ status, label, tone, className }: StatusBadgeProps) {
  const resolved = tone ?? statusTones[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[resolved],
        className
      )}
    >
      {label ?? humanize(status)}
    </span>
  );
}

const conditionScale: Record<number, { label: string; className: string }> = {
  5: { label: "Excellent", className: "bg-condition-excellent" },
  4: { label: "Good", className: "bg-condition-good" },
  3: { label: "Moderate", className: "bg-condition-moderate" },
  2: { label: "Poor", className: "bg-condition-poor" },
  1: { label: "Critical", className: "bg-condition-critical" }
};

export function ConditionBadge({ rating, className }: { rating: number | null | undefined; className?: string }) {
  if (!rating || !conditionScale[rating]) {
    return <StatusBadge status="UNRATED" label="Not rated" className={className} />;
  }
  const { label, className: dot } = conditionScale[rating];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink",
        className
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />
      {rating} · {label}
    </span>
  );
}
