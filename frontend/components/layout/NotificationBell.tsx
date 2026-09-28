"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { Notification } from "@/types/operations";

export const seenKey = (userId: string) => `gujinfra.activity-seen.${userId}`;

const severityDot = { CRITICAL: "bg-red-500", WARNING: "bg-amber-500", INFO: "bg-sky-500" };

function readSeen(userId: string) {
  try {
    return localStorage.getItem(seenKey(userId));
  } catch {
    return null;
  }
}

// One bell for both streams: system alerts (read state kept on the server) and person-to-person hand-offs (activity).
export default function NotificationBell({ userId }: { userId: string }) {
  const { token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Notification[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [handoffs, setHandoffs] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [count, activity] = await Promise.all([
        api<{ unread: number }>("/notifications/count", { token }),
        api<{ unread: number }>("/activity/unread", { token, query: { since: readSeen(userId) } })
      ]);
      setUnreadAlerts(count.data.unread);
      setHandoffs(activity.data.unread);
    } catch {
      // The bell is a convenience; failures stay silent.
    }
  }, [token, userId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 20000);
    return () => clearInterval(timer);
  }, [refresh, pathname]);

  useEffect(() => {
    if (!open || !token) return;
    api<Notification[]>("/notifications", { token, query: { limit: 8 } })
      .then((result) => setAlerts(result.data))
      .catch(() => setAlerts([]));
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !panel.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, token]);

  async function openAlert(alert: Notification) {
    setOpen(false);
    if (!alert.read_at) {
      await api(`/notifications/${alert.id}/read`, { method: "POST", token }).catch(() => null);
      refresh();
    }
    if (alert.link) router.push(alert.link);
  }

  async function readAll() {
    await api("/notifications/read-all", { method: "POST", token }).catch(() => null);
    setAlerts((current) => current.map((alert) => ({ ...alert, read_at: alert.read_at ?? new Date().toISOString() })));
    refresh();
  }

  const total = unreadAlerts + handoffs;
  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${total ? `, ${total} new` : ""}`}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-ink"
      >
        <Icon name="bell" className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold">Alerts</p>
            {unreadAlerts > 0 && (
              <button type="button" onClick={readAll} className="text-xs font-medium text-accent-text hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <button type="button" onClick={() => openAlert(alert)} className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-page", !alert.read_at && "bg-accent-soft/40")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", alert.read_at ? "bg-slate-300" : severityDot[alert.severity])} aria-hidden />
                  <span className="min-w-0">
                    <span className={cn("block text-sm", !alert.read_at && "font-medium")}>{alert.title}</span>
                    {alert.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{alert.body}</span>}
                    <span className="mt-0.5 block font-mono text-[11px] text-muted">{formatDateTime(alert.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
            {!alerts.length && <li className="px-4 py-6 text-center text-sm text-muted">No alerts yet. Daily checks and emergencies appear here.</li>}
          </ul>
          <Link href="/activity" onClick={() => setOpen(false)} className="flex items-center justify-between border-t border-line bg-page px-4 py-2.5 text-sm hover:bg-slate-100">
            <span>
              Hand-offs to you{handoffs > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{handoffs} new</span>}
            </span>
            <Icon name="arrow" className="h-4 w-4 text-muted" />
          </Link>
        </div>
      )}
    </div>
  );
}
