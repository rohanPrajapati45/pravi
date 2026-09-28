import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
};

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-sm hover:bg-accent-hover border border-transparent",
  secondary: "bg-surface text-ink border border-line shadow-sm hover:border-slate-300 hover:bg-slate-50",
  ghost: "bg-transparent text-muted hover:bg-slate-100 hover:text-ink border border-transparent",
  danger: "bg-condition-critical text-white shadow-sm hover:bg-red-700 border border-transparent"
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]"
};

export function buttonClass({ variant = "primary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors", variants[variant], sizes[size], className);
}

// A link styled as a button — avoids nesting <button> inside <a>.
export function ButtonLink({ href, variant, size, className, children }: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClass({ variant, size, className })}>
      {children}
    </Link>
  );
}

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
