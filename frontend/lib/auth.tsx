"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { missingConfig, supabase } from "@/lib/supabase";
import type { Profile } from "@/types/auth";

type Status = "loading" | "signed-out" | "ready" | "error";

type AuthContextValue = {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  token: string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next) {
      setProfile(null);
      setStatus("signed-out");
      return;
    }
    try {
      const { data } = await api<Profile>("/me", { token: next.access_token });
      setProfile(data);
      setError(null);
      setStatus("ready");
    } catch (caught) {
      setProfile(null);
      setError(caught instanceof ApiError ? caught.message : "Could not load your profile");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (missingConfig.length) {
      setError(`The frontend is missing ${missingConfig.join(", ")} — check frontend/.env.local (local) or the Vercel environment variables, then restart / redeploy.`);
      setStatus("error");
      return;
    }
    supabase.auth.getSession().then(({ data }) => loadProfile(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      // Token refreshes only swap the token; the profile is unchanged.
      if (event === "TOKEN_REFRESHED") setSession(next);
      else if (event === "SIGNED_IN" || event === "SIGNED_OUT") loadProfile(next);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(signInError.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, profile, token: session?.access_token ?? null, error, signIn, signOut }),
    [status, session, profile, error, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
