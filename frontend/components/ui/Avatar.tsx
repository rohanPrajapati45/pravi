import { cn } from "@/lib/cn";

const palette = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-800", "bg-violet-100 text-violet-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-800"];

export default function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md"; className?: string }) {
  const initials = name
    .replace(/\(.*\)/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const tone = palette[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs", tone, className)}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
