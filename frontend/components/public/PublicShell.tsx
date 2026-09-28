import Link from "next/link";
import type { ReactNode } from "react";

// Citizen-facing frame: no login, no sidebar, readable on a phone.
export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/complain" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 font-heading font-bold">G</span>
            <span className="leading-tight">
              <span className="block font-heading font-semibold">GujInfra 360</span>
              <span className="block text-[11px] text-navy-text">Roads &amp; Buildings · Citizen services</span>
            </span>
          </Link>
          <nav className="flex gap-1 text-sm">
            <Link href="/complain" className="rounded-lg px-2.5 py-1.5 hover:bg-white/10">Report</Link>
            <Link href="/complain/track" className="rounded-lg px-2.5 py-1.5 hover:bg-white/10">Track</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-muted">
        Hackathon prototype · fictitious data · your phone number is used only to let you track your complaint and is never shown publicly.
      </footer>
    </div>
  );
}
