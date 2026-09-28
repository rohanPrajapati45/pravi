"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Emergency } from "@/types/operations";

// Shown on every page while an emergency covering the user's jurisdiction is active.
export default function EmergencyBanner() {
  const { token, profile } = useAuth();
  const [active, setActive] = useState<Emergency[]>([]);

  useEffect(() => {
    if (!token || !profile || profile.role === "CONTRACTOR") return;
    let stopped = false;
    const load = () =>
      api<Emergency[]>("/emergencies", { token, query: { status: "ACTIVE" } })
        .then((result) => !stopped && setActive(result.data))
        .catch(() => null);
    load();
    const timer = setInterval(load, 60000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [token, profile]);

  if (!active.length) return null;
  return (
    <div className="border-b border-red-200 bg-red-600 text-white" role="alert">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm md:px-6">
        <span className="flex items-center gap-2 font-semibold">
          <Icon name="siren" className="h-4 w-4" /> Emergency mode
        </span>
        {active.map((emergency) => (
          <Link key={emergency.id} href={`/emergencies/${emergency.id}`} className="underline-offset-2 hover:underline">
            {emergency.emergency_code} · {emergency.title} · {emergency.area_name}
            {emergency.assets_closed > 0 && ` · ${emergency.assets_closed} closed to traffic`}
          </Link>
        ))}
      </div>
    </div>
  );
}
