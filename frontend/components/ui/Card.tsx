import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export default function Card({ title, subtitle, actions, children, className, bodyClassName }: CardProps) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface shadow-card", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("px-5 pb-5 pt-3", !(title || actions) && "pt-5", bodyClassName)}>{children}</div>
    </section>
  );
}
