"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type NavItem = {
  href: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type SidebarProps = {
  items: NavItem[];
  activeHref: string;
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({ items, activeHref, open, onClose }: SidebarProps) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink/30 md:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-line bg-surface transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-heading text-sm font-bold text-ink">
            G
          </span>
          <div className="leading-tight">
            <p className="font-heading text-sm font-semibold">GujInfra 360</p>
            <p className="text-[11px] text-muted">R&amp;B Asset Lifecycle</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
          {items.map((item) => {
            const active = item.href === "/" ? activeHref === "/" : activeHref.startsWith(item.href);
            if (item.disabled) {
              return (
                <span
                  key={item.href}
                  className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted/60"
                  title="Coming in a later module"
                >
                  {item.icon}
                  {item.label}
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-page hover:text-ink"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
