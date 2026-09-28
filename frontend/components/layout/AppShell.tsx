"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Loading from "@/components/ui/Loading";
import Navbar from "@/components/ui/Navbar";
import Sidebar from "@/components/ui/Sidebar";
import StatusBadge from "@/components/ui/StatusBadge";
import { useAuth } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { roleLabels, type Role } from "@/types/auth";

type AppShellProps = {
  title: string;
  children: ReactNode;
  headerRight?: ReactNode;
  allowedRoles?: Role[];
};

export default function AppShell({ title, children, headerRight, allowedRoles }: AppShellProps) {
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
      <Sidebar items={navFor(profile.role)} activeHref={pathname} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          title={title}
          onMenuClick={() => setMenuOpen(true)}
          right={
            <>
              {headerRight}
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-medium">{profile.name}</p>
                <p className="text-xs text-muted">{profile.orgUnit.name}</p>
              </div>
              <StatusBadge status={profile.role} label={roleLabels[profile.role]} tone="accent" className="hidden md:inline-flex" />
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          }
        />
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
          {forbidden ? (
            <div className="rounded-xl border border-line bg-surface p-8 text-center">
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
