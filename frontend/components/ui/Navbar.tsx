"use client";

import type { ReactNode } from "react";

type NavbarProps = {
  title: string;
  onMenuClick: () => void;
  right?: ReactNode;
};

export default function Navbar({ title, onMenuClick, right }: NavbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="rounded-md p-1.5 text-muted hover:bg-page hover:text-ink md:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}
