import { cn } from "@/lib/cn";

export default function Loading({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex items-center justify-center gap-3 py-10 text-sm text-muted", className)}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
      {label}
    </div>
  );
}
