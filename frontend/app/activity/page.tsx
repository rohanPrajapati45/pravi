"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell, { seenKey } from "@/components/layout/AppShell";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Icon from "@/components/ui/Icon";
import Loading from "@/components/ui/Loading";
import Tabs from "@/components/ui/Tabs";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/useApi";

type ActivityItem = {
  id: string;
  at: string;
  action: string;
  verb: string;
  actor: { id: string | null; name: string; role: string };
  target: { id: string; name: string } | null;
  subject: string | null;
  details: string[];
  link: string | null;
};

const LIMIT = 40;

function tone(action: string) {
  if (/RETURNED|REJECTED|CANCELLED/.test(action)) return "bg-orange-500";
  if (/ACCEPTED|VERIFIED|PASSED|CLOSED/.test(action)) return "bg-emerald-500";
  if (/ASSIGNED|INITIATED|RAISED/.test(action)) return "bg-accent";
  return "bg-slate-400";
}

function relative(value: string, now: number) {
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export default function ActivityPage() {
  const { profile } = useAuth();
  const [scope, setScope] = useState("all");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(Date.now());
  const feed = useApi<ActivityItem[]>("/activity", { scope, page, limit: LIMIT });

  useEffect(() => {
    if (!profile) return;
    try {
      localStorage.setItem(seenKey(profile.id), new Date().toISOString());
    } catch {
      // Private mode: the bell simply keeps its count.
    }
  }, [profile, feed.data]);

  const reload = feed.reload;
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (page === 1) reload();
    }, 15000);
    return () => clearInterval(timer);
  }, [reload, page]);

  const groups = (feed.data ?? []).reduce<Array<{ day: string; items: ActivityItem[] }>>((all, item) => {
    const day = new Date(item.at).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const group = all.find((entry) => entry.day === day);
    if (group) group.items.push(item);
    else all.push({ day, items: [item] });
    return all;
  }, []);
  const total = feed.meta?.total ?? 0;

  return (
    <AppShell title="Activity" subtitle="Every hand-off between people, with exact timestamps — refreshes automatically">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Tabs
          active={scope}
          onChange={(key) => {
            setScope(key);
            setPage(1);
          }}
          tabs={[
            { key: "all", label: profile?.role === "HQ" || profile?.role === "EE" ? "All in my jurisdiction" : "Involving me" },
            { key: "for_me", label: "Sent to me" },
            { key: "by_me", label: "Done by me" }
          ]}
        />
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden /> Live
        </span>
      </div>

      {feed.loading && !feed.data ? (
        <Loading />
      ) : feed.error ? (
        <ErrorState message={feed.error} onRetry={feed.reload} />
      ) : !groups.length ? (
        <EmptyState title="No activity yet" description="Assign a task, submit an inspection or pass a gate — it appears here instantly for everyone involved." />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.day}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{group.day}</h2>
              <ol className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                {group.items.map((item) => {
                  const toMe = item.target?.id === profile?.id;
                  return (
                    <li key={item.id} className={cn("flex gap-3 border-b border-line px-4 py-3 last:border-0", toMe && "bg-accent-soft/50")}>
                      <div className="relative">
                        <Avatar name={item.actor.name} />
                        <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-surface", tone(item.action))} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-semibold">{item.actor.name}</span> <span className="text-muted">{item.verb}</span>
                          {item.target && (
                            <>
                              {" "}
                              <Icon name="arrow" className="inline h-3.5 w-3.5 text-muted" />{" "}
                              <span className="font-semibold">{toMe ? "you" : item.target.name}</span>
                            </>
                          )}
                        </p>
                        {item.subject &&
                          (item.link ? (
                            <Link href={item.link} className="mt-0.5 block truncate text-sm text-accent-text hover:underline">
                              {item.subject}
                            </Link>
                          ) : (
                            <p className="mt-0.5 truncate text-sm">{item.subject}</p>
                          ))}
                        {item.details.length > 0 && <p className="mt-0.5 text-[13px] text-muted">{item.details.join(" · ")}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-xs text-ink">{new Date(item.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
                        <p className="text-[11px] text-muted">{relative(item.at, now)}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {total > LIMIT && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>
                {total} events · page {page} of {Math.ceil(total / LIMIT)}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Newer
                </Button>
                <Button size="sm" variant="secondary" disabled={page * LIMIT >= total} onClick={() => setPage(page + 1)}>
                  Older
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
