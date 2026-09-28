"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import EmergencyBanner from "@/components/layout/EmergencyBanner";
import NotificationBell from "@/components/layout/NotificationBell";
import Avatar from "@/components/ui/Avatar";
import Icon from "@/components/ui/Icon";
import Loading from "@/components/ui/Loading";
import Navbar from "@/components/ui/Navbar";
import Sidebar from "@/components/ui/Sidebar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { roleLabels, type Role } from "@/types/auth";

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  headerRight?: ReactNode;
  allowedRoles?: Role[];
};

export { seenKey } from "./NotificationBell";

// Jump straight to an asset, work or request by its code.
function QuickFind() {
  const router = useRouter();
  const { token } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function go(event: FormEvent) {
    event.preventDefault();
    const code = value.trim().toUpperCase();
    if (!code) return;
    setError(null);
    try {
      if (code.startsWith("WK-")) {
        const { data } = await api<Array<{ id: string }>>("/works", { token, query: { q: code, limit: 1 } });
        if (!data[0]) throw new Error("No work with that code");
        router.push(`/works/${data[0].id}`);
      } else if (code.startsWith("MR-")) {
        const { data } = await api<Array<{ id: string }>>("/maintenance-requests", { token, query: { q: code, limit: 1 } });
        if (!data[0]) throw new Error("No request with that code");
        router.push(`/maintenance/${data[0].id}`);
      } else if (code.startsWith("CMP-")) {
        const { data } = await api<Array<{ id: string }>>("/complaints", { token, query: { q: code, limit: 1 } });
        if (!data[0]) throw new Error("No complaint with that number in your jurisdiction");
        router.push(`/complaints/${data[0].id}`);
      } else if (code.startsWith("EMG-")) {
        const { data } = await api<Array<{ id: string; emergency_code: string }>>("/emergencies", { token });
        const match = data.find((item) => item.emergency_code === code);
        if (!match) throw new Error("No emergency with that code");
        router.push(`/emergencies/${match.id}`);
      } else {
        const { data } = await api<{ id: string }>("/assets/lookup", { token, query: { code } });
        router.push(`/assets/${data.id}`);
      }
      setValue("");
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <form onSubmit={go} className="relative w-full max-w-md" role="search">
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        aria-label="Go to asset, work or request code"
        placeholder="Go to code — RDB-BR-000001, WK-…, MR-…, CMP-…"
        className="h-10 w-full rounded-xl border border-line bg-page pl-9 pr-3 font-mono text-[13px] placeholder:font-sans placeholder:text-muted focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      {error && <p className="absolute left-0 top-11 rounded-lg bg-surface px-3 py-1.5 text-xs text-red-700 shadow-lift">{error}</p>}
    </form>
  );
}

export default function AppShell({ title, subtitle, children, headerRight, allowedRoles }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (status === "signed-out" || status === "error") router.replace("/login");
  }, [status, router]);

  if (status !== "ready" || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading label="Checking your session…" />
      </div>
    );
  }

  const forbidden = allowedRoles && !allowedRoles.includes(profile.role);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        items={navFor(profile.role)}
        activeHref={pathname}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        footer={
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
            <Avatar name={profile.name} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-white">{profile.name}</p>
              <p className="truncate text-[11px] text-navy-text">{roleLabels[profile.role]} · {profile.orgUnit.name}</p>
            </div>
            <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="rounded-lg p-1.5 text-navy-text hover:bg-white/10 hover:text-white">
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </div>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          title={title}
          subtitle={subtitle ?? `${roleLabels[profile.role]} · ${profile.orgUnit.name}`}
          onMenuClick={() => setMenuOpen(true)}
          center={<QuickFind />}
          right={
            <>
              {headerRight}
              <NotificationBell userId={profile.id} />
            </>
          }
        />
        <EmergencyBanner />
        <main className="mx-auto w-full max-w-[1400px] flex-1 animate-fade-in p-4 md:p-6">
          {forbidden ? (
            <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-card">
              <p className="font-medium">You don&apos;t have access to this page</p>
              <p className="mt-1 text-sm text-muted">Your role ({roleLabels[profile.role]}) cannot view {title.toLowerCase()}.</p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
