"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Toast = { id: number; title: string; description?: string; tone: "success" | "error" | "info"; at: Date };
type ToastContext = { notify: (toast: Omit<Toast, "id" | "at" | "tone"> & { tone?: Toast["tone"] }) => void };

const Context = createContext<ToastContext>({ notify: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback<ToastContext["notify"]>((toast) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-3), { id, tone: "success", at: new Date(), ...toast }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 5000);
  }, []);

  return (
    <Context.Provider value={{ notify }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm animate-slide-in items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-lift"
          >
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                toast.tone === "success" ? "bg-emerald-50 text-emerald-600" : toast.tone === "error" ? "bg-red-50 text-red-600" : "bg-accent-soft text-accent"
              )}
            >
              <Icon name={toast.tone === "error" ? "alert" : "check"} className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-[13px] text-muted">{toast.description}</p>}
              <p className="mt-0.5 font-mono text-[11px] text-muted">{toast.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
            </div>
            <button type="button" aria-label="Dismiss" className="text-muted hover:text-ink" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Context.Provider>
  );
}

export function useToast() {
  return useContext(Context);
}
