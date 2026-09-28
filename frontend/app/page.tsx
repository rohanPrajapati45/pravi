"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/ui/ErrorState";
import Loading from "@/components/ui/Loading";
import StatusBadge from "@/components/ui/StatusBadge";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { HealthData } from "@/types/api";
import { roleLabels, type Role } from "@/types/auth";

// Placeholder role landing until M6 builds the real dashboards.
const roleFocus: Record<Role, string[]> = {
  HQ: ["State-wide asset condition and risk", "Programmes and works pipeline by stage", "Approvals above division limits", "Audit trail across all offices"],
  EE: ["Division assets and active works", "Tasks and stage gates awaiting your evaluation", "Maintenance assignment and verification", "Approvals within your cost limit"],
  AE: ["Assets in your sub-division", "Field inspections with GPS and photos", "Assigned tasks and maintenance jobs", "Verification of work done by others"],
  CONTRACTOR: ["Your contracts and milestones", "Progress entry with photos", "Defects assigned to you (incl. DLP-liable)", "Your evaluation results"]
};

export default function HomePage() {
  const { profile } = useAuth();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api<HealthData>("/health");
      setHealth(data);
    } catch (caught) {
      setHealth(null);
      setError(caught instanceof ApiError ? `${caught.code}: ${caught.message}` : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <AppShell title="Dashboard">
      {profile && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card title={`Welcome, ${profile.name}`} subtitle={profile.designation ?? roleLabels[profile.role]} className="md:col-span-2">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">Role</dt>
                <dd className="mt-1">
                  <StatusBadge status={profile.role} label={roleLabels[profile.role]} tone="accent" />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Office</dt>
                <dd className="mt-1 text-sm font-medium">{profile.orgUnit.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Jurisdiction</dt>
                <dd className="mt-1 break-all font-mono text-xs">{profile.role === "HQ" ? "Entire state" : `${profile.orgUnit.path}*`}</dd>
              </div>
            </dl>
            <h3 className="mt-6 text-sm font-semibold">Your workspace will show</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {roleFocus[profile.role].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="System status"
            actions={
              <Button variant="secondary" size="sm" onClick={checkHealth} loading={loading}>
                Recheck
              </Button>
            }
          >
            {loading && !health && !error ? (
              <Loading label="Checking API…" />
            ) : error ? (
              <ErrorState title="Health check failed" message={error} onRetry={checkHealth} />
            ) : health ? (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">API</dt>
                  <dd>
                    <StatusBadge status="OK" label="OK" tone="success" />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Database</dt>
                  <dd>
                    <StatusBadge status={health.db} label={health.db.toUpperCase()} tone={health.db === "ok" ? "success" : "danger"} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">DB latency</dt>
                  <dd className="font-mono">{health.dbLatencyMs} ms</dd>
                </div>
              </dl>
            ) : null}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
