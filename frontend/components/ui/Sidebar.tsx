"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import Icon, { type IconName } from "./Icon";

export type NavItem = {
  href: string;
  label: string;
  icon?: IconName;
  section?: string;
  disabled?: boolean;
  badge?: number;
};

type SidebarProps = {
  items: NavItem[];
  activeHref: string;
  open: boolean;
  onClose: () => void;
  footer?: ReactNode;
};

export default function Sidebar({ items, activeHref, open, onClose, footer }: SidebarProps) {
  const sections = items.reduce<Array<{ name: string; items: NavItem[] }>>((all, item) => {
    const name = item.section ?? "";
    const group = all.find((entry) => entry.name === name);
    if (group) group.items.push(item);
    else all.push({ name, items: [item] });
    return all;
  }, []);

  return (
    <>
      {open && <div className="fixed inset-0 z-30 animate-fade-in bg-ink/40 md:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-navy text-navy-text transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-3 px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 font-heading text-base font-bold text-white shadow-lg shadow-blue-900/40">
            G
          </span>
          <div className="leading-tight">
            <p className="font-heading text-[15px] font-semibold text-white">GujInfra 360</p>
            <p className="text-[11px] text-navy-text">R&amp;B asset lifecycle</p>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Main">
          {sections.map((section) => (
            <div key={section.name}>
              {section.name && <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{section.name}</p>}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = item.href === "/" ? activeHref === "/" : activeHref.startsWith(item.href);
                  const content = (
                    <>
                      {item.icon && <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />}
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{item.badge}</span> : null}
                    </>
                  );
                  if (item.disabled) {
                    return (
                      <span key={item.href} className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600" title="Coming in a later module">
                        {content}
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
                        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-blue-400" aria-hidden />}
                      {content}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {footer && <div className="border-t border-white/10 p-3">{footer}</div>}
      </aside>
    </>
  );
}
