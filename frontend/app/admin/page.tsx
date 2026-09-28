"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AssetTypesTab from "@/components/admin/AssetTypesTab";
import ContractorsTab from "@/components/admin/ContractorsTab";
import OfficesTab from "@/components/admin/OfficesTab";
import { LimitsTab, SystemTab, TemplatesTab } from "@/components/admin/SettingsTabs";
import UsersTab from "@/components/admin/UsersTab";
import AppShell from "@/components/layout/AppShell";
import Loading from "@/components/ui/Loading";
import Tabs from "@/components/ui/Tabs";

const tabs = [
  { key: "users", label: "Users" },
  { key: "offices", label: "Offices" },
  { key: "asset-types", label: "Asset types" },
  { key: "limits", label: "Approval limits" },
  { key: "contractors", label: "Contractors" },
  { key: "templates", label: "Work templates" },
  { key: "system", label: "System" }
];

function AdminConsole() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = tabs.some((item) => item.key === params.get("tab")) ? params.get("tab")! : "users";

  return (
    <AppShell title="Administration" subtitle="Users, offices and configuration — every change is audited" allowedRoles={["HQ"]}>
      <div className="mb-5">
        <Tabs tabs={tabs} active={tab} onChange={(key) => router.replace(`/admin?tab=${key}`)} />
      </div>
      {tab === "users" && <UsersTab />}
      {tab === "offices" && <OfficesTab />}
      {tab === "asset-types" && <AssetTypesTab />}
      {tab === "limits" && <LimitsTab />}
      {tab === "contractors" && <ContractorsTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "system" && <SystemTab />}
    </AppShell>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminConsole />
    </Suspense>
  );
}
