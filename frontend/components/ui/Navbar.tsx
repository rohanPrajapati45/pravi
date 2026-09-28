"use client";

import type { ReactNode } from "react";
import Icon from "./Icon";

type NavbarProps = {
  title: string;
  subtitle?: string;
  onMenuClick: () => void;
  center?: ReactNode;
  right?: ReactNode;
};

export default function Navbar({ title, subtitle, onMenuClick, center, right }: NavbarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <button type="button" onClick={onMenuClick} aria-label="Open navigation" className="rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-ink md:hidden">
          <Icon name="menu" className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 md:flex-none">
          <h1 className="truncate text-[17px] font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="hidden truncate text-xs text-muted sm:block">{subtitle}</p>}
        </div>
        {center && <div className="hidden flex-1 justify-center md:flex">{center}</div>}
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}
