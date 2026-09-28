"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { DEMO_PASSWORD, demoAccounts } from "@/lib/demoUsers";
import { roleLabels, type Role } from "@/types/auth";

const roleOrder: Role[] = ["HQ", "EE", "AE", "CONTRACTOR"];
const roleBlurb: Record<Role, string> = {
  HQ: "State view · approvals above ₹2 Cr · award & handover gates",
  EE: "Division · assigns work · verifies · gates up to ₹2 Cr",
  AE: "Field · inspections with GPS & photos · tasks",
  CONTRACTOR: "Own contracts · milestones · DLP defects"
};

const highlights = [
  "One identity and one timeline for every road, bridge and building",
  "Works run stage → task → gate, from government mandate to contractor closure",
  "Poor inspections raise repairs automatically; DLP defects go to the contractor",
  "Explainable risk ranking — every priority shows its reason"
];

export default function LoginPage() {
  const router = useRouter();
  const { status, signIn, error: profileError, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "ready") router.replace("/");
  }, [status, router]);

  async function login(loginEmail: string, loginPassword: string, key: string) {
    setBusy(key);
    setError(null);
    try {
      await signIn(loginEmail, loginPassword);
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    login(email, password, "form");
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-600/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 font-heading text-lg font-bold shadow-lg shadow-blue-900/50">G</span>
          <div>
            <p className="font-heading text-lg font-semibold">GujInfra 360</p>
            <p className="text-xs text-navy-text">Roads &amp; Buildings · Asset lifecycle platform</p>
          </div>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight">One digital identity for every public asset.</h1>
          <p className="mt-3 text-navy-text">From the government&apos;s decision to build, through construction and handover, to every inspection and repair after — on one timeline.</p>
          <ul className="mt-8 space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex gap-3 text-sm text-slate-200">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-300">
                  <Icon name="check" className="h-3 w-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Hackathon prototype · all data is fictitious · an integration layer over existing systems, not a replacement</p>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 font-heading font-bold text-white">G</span>
            <p className="font-heading text-lg font-semibold">GujInfra 360</p>
          </div>
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use a demo account below — one click, no typing.</p>
          <Link href="/complain" className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-sm hover:border-accent">
            <span>
              <span className="font-medium">Citizen?</span> <span className="text-muted">Report a road or bridge problem — no login needed</span>
            </span>
            <Icon name="arrow" className="h-4 w-4 text-muted" />
          </Link>

          <div className="mt-6 space-y-4">
            {roleOrder.map((role) => (
              <div key={role}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">{roleLabels[role]}</p>
                  <p className="hidden truncate text-[11px] text-muted sm:block">{roleBlurb[role]}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {demoAccounts
                    .filter((account) => account.role === role)
                    .map((account) => (
                      <button
                        key={account.email}
                        type="button"
                        disabled={busy !== null}
                        onClick={() => login(account.email, DEMO_PASSWORD, account.email)}
                        className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 text-left shadow-card transition hover:border-accent hover:shadow-lift disabled:opacity-60"
                      >
                        <Avatar name={account.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{account.name}</span>
                          <span className="block truncate text-[11px] text-muted">{account.scope}</span>
                        </span>
                        {busy === account.email ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                        ) : (
                          <Icon name="arrow" className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
                        )}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <details className="mt-6 rounded-xl border border-line bg-surface p-4">
            <summary className="cursor-pointer text-sm font-medium">Sign in with email</summary>
            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <Input label="Email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <Button type="submit" fullWidth loading={busy === "form"}>
                Sign in
              </Button>
              <p className="text-xs text-muted">
                Demo password: <span className="font-mono text-ink">{DEMO_PASSWORD}</span>
              </p>
            </form>
          </details>

          {(error || (status === "error" && profileError)) && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error ?? profileError}
              {status === "error" && (
                <button type="button" className="ml-2 underline" onClick={signOut}>
                  Sign out
                </button>
              )}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
