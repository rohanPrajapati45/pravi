"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import StatusBadge from "@/components/ui/StatusBadge";
import { useAuth } from "@/lib/auth";
import { DEMO_PASSWORD, demoAccounts } from "@/lib/demoUsers";
import { roleLabels } from "@/types/auth";

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
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    login(email, password, "form");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent font-heading text-lg font-bold">G</span>
            <div>
              <h1 className="text-xl font-semibold">GujInfra 360</h1>
              <p className="text-sm text-muted">Roads &amp; Buildings asset lifecycle</p>
            </div>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {(error || (status === "error" && profileError)) && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error ?? profileError}
                {status === "error" && (
                  <button type="button" className="ml-2 underline" onClick={signOut}>
                    Sign out
                  </button>
                )}
              </p>
            )}
            <Button type="submit" fullWidth size="lg" loading={busy === "form"}>
              Sign in
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <h2 className="font-semibold">Demo accounts</h2>
          <p className="mt-1 text-sm text-muted">
            One click signs in. All fake, password <span className="font-mono text-ink">{DEMO_PASSWORD}</span>
          </p>
          <ul className="mt-4 divide-y divide-line">
            {demoAccounts.map((account) => (
              <li key={account.email} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{account.name}</p>
                  <p className="truncate text-xs text-muted">{account.scope}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={account.role} label={roleLabels[account.role]} tone="accent" className="hidden sm:inline-flex" />
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === account.email}
                    disabled={busy !== null}
                    onClick={() => login(account.email, DEMO_PASSWORD, account.email)}
                  >
                    Sign in
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
