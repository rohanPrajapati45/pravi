"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import StatusBadge from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { roleLabels, type Role } from "@/types/auth";
import { FormError, generatePassword, officeLabel, ROLE_LEVELS, useSave, type Firm, type Office } from "./shared";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  designation: string | null;
  is_active: boolean;
  org_unit_id: string;
  contractor_id: string | null;
  org_unit_name: string;
  org_unit_type: string;
  contractor_name: string | null;
  last_action_at: string | null;
  open_tasks: number;
};

const LIMIT = 25;
const roleOptions = (Object.keys(roleLabels) as Role[]).map((role) => ({ value: role, label: roleLabels[role] }));

function UserForm({ user, offices, firms, onClose, onSaved }: { user: AdminUser | null; offices: Office[]; firms: Firm[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const { saving, error, fieldErrors, save } = useSave();
  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    designation: user?.designation ?? "",
    role: (user?.role ?? "AE") as Role,
    org_unit_id: user?.org_unit_id ?? "",
    contractor_id: user?.contractor_id ?? "",
    password: user ? "" : generatePassword()
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const allowed = offices.filter((office) => ROLE_LEVELS[form.role].includes(office.type));
  const officeValid = allowed.some((office) => office.id === form.org_unit_id);

  async function submit() {
    const ok = user
      ? await save(
          () =>
            api(`/admin/users/${user.id}`, {
              method: "PATCH",
              token,
              body: {
                name: form.name,
                phone: form.phone || null,
                designation: form.designation || null,
                role: form.role,
                org_unit_id: form.org_unit_id,
                contractor_id: form.role === "CONTRACTOR" ? form.contractor_id || null : null
              }
            }),
          { title: "User updated", description: `${form.name} · changes apply on their next click` }
        )
      : await save(
          () =>
            api("/users", {
              method: "POST",
              token,
              body: {
                name: form.name,
                email: form.email,
                password: form.password,
                phone: form.phone || undefined,
                designation: form.designation || undefined,
                role: form.role,
                org_unit_id: form.org_unit_id,
                contractor_id: form.role === "CONTRACTOR" ? form.contractor_id : undefined
              }
            }),
          { title: "User created", description: `${form.email} can sign in now` }
        );
    if (ok) {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={user ? `Edit ${user.name}` : "New user"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!form.name || (!user && (!form.email || form.password.length < 8)) || !officeValid || (form.role === "CONTRACTOR" && !form.contractor_id)}>
            {user ? "Save changes" : "Create user"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Full name" required value={form.name} onChange={set("name")} />
        <Input label="Email (login)" type="email" required value={form.email} onChange={set("email")} disabled={Boolean(user)} hint={user ? "Email cannot be changed" : undefined} />
        <Select
          label="Role"
          value={form.role}
          onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as Role, org_unit_id: "" }))}
          options={roleOptions}
          hint={`Sits at: ${ROLE_LEVELS[form.role].map((level) => level.toLowerCase()).join(" / ")} level`}
        />
        <Select label="Office" required placeholder="Select office" value={form.org_unit_id} onChange={set("org_unit_id")} options={allowed.map((office) => ({ value: office.id, label: officeLabel(office) }))} error={fieldErrors.org_unit_id} />
        {form.role === "CONTRACTOR" && (
          <Select
            label="Contractor firm"
            required
            placeholder="Select firm"
            value={form.contractor_id}
            onChange={set("contractor_id")}
            options={firms.filter((firm) => firm.is_active).map((firm) => ({ value: firm.id, label: firm.name }))}
          />
        )}
        <Input label="Designation" value={form.designation} onChange={set("designation")} placeholder="e.g. Deputy Executive Engineer" />
        <Input label="Phone" value={form.phone} onChange={set("phone")} />
        {!user && (
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Input label="Temporary password" required value={form.password} onChange={set("password")} className="font-mono" hint="Share securely; the user should change it" />
            <Button variant="secondary" onClick={() => setForm((current) => ({ ...current, password: generatePassword() }))}>Generate</Button>
          </div>
        )}
      </div>
      <div className="mt-3">
        <FormError error={error} fieldErrors={fieldErrors} />
      </div>
    </Modal>
  );
}

function PasswordModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { token } = useAuth();
  const { saving, error, save } = useSave();
  const [password, setPassword] = useState(generatePassword());
  return (
    <Modal
      open
      onClose={onClose}
      title="Reset password"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={saving}
            disabled={password.length < 8}
            onClick={async () => {
              if (await save(() => api(`/admin/users/${user.id}/reset-password`, { method: "POST", token, body: { password } }), { title: "Password reset", description: user.email })) onClose();
            }}
          >
            Reset
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          New password for <strong>{user.name}</strong> ({user.email}). Copy it before closing.
        </p>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Input aria-label="New password" value={password} onChange={(event) => setPassword(event.target.value)} className="font-mono" />
          <Button variant="secondary" onClick={() => setPassword(generatePassword())}>Generate</Button>
        </div>
        <FormError error={error} />
      </div>
    </Modal>
  );
}

export default function UsersTab() {
  const { token, profile } = useAuth();
  const { save } = useSave();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [active, setActive] = useState("true");
  const [editing, setEditing] = useState<AdminUser | null | undefined>(undefined);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const offices = useApi<Office[]>("/admin/org-units");
  const firms = useApi<Firm[]>("/admin/contractors");
  const users = useApi<AdminUser[]>("/admin/users", { page, limit: LIMIT, q, role, active });

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function toggleActive(user: AdminUser) {
    const verb = user.is_active ? "Deactivate" : "Reactivate";
    if (user.is_active && !window.confirm(`Deactivate ${user.name}? They are signed out immediately and cannot log in. Their history is kept.`)) return;
    if (await save(() => api(`/admin/users/${user.id}`, { method: "PATCH", token, body: { is_active: !user.is_active } }), { title: `${verb}d ${user.name}` })) users.reload();
  }

  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      header: "User",
      render: (user) => (
        <div className="flex items-center gap-3">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {user.name} {user.id === profile?.id && <span className="text-xs text-muted">(you)</span>}
            </p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
      )
    },
    {
      key: "role",
      header: "Role",
      render: (user) => (
        <div>
          <StatusBadge status={user.role} label={roleLabels[user.role]} tone="accent" />
          {user.designation && <p className="mt-0.5 text-xs text-muted">{user.designation}</p>}
        </div>
      )
    },
    { key: "office", header: "Office", render: (user) => <span className="text-sm">{user.contractor_name ?? user.org_unit_name}</span> },
    {
      key: "activity",
      header: "Last action",
      render: (user) => (
        <div className="text-xs">
          <p className="font-mono">{user.last_action_at ? formatDateTime(user.last_action_at) : "—"}</p>
          {user.open_tasks > 0 && <p className="text-muted">{user.open_tasks} open task(s)</p>}
        </div>
      )
    },
    { key: "status", header: "Status", render: (user) => <StatusBadge status={user.is_active ? "ACTIVE" : "INACTIVE"} label={user.is_active ? "Active" : "Deactivated"} tone={user.is_active ? "success" : "neutral"} /> },
    {
      key: "actions",
      header: "",
      render: (user) => (
        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => setEditing(user)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => setResetting(user)}>Password</Button>
          {user.id !== profile?.id && (
            <Button size="sm" variant={user.is_active ? "ghost" : "secondary"} onClick={() => toggleActive(user)}>
              {user.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-72">
          <Input aria-label="Search users" placeholder="Search name, email or designation…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="w-44">
          <Select aria-label="Role" placeholder="All roles" value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }} options={roleOptions} />
        </div>
        <div className="w-40">
          <Select aria-label="Status" value={active} onChange={(event) => { setActive(event.target.value); setPage(1); }} options={[{ value: "true", label: "Active" }, { value: "false", label: "Deactivated" }, { value: "", label: "All" }]} />
        </div>
        <div className="flex-1" />
        <Button onClick={() => setEditing(null)} disabled={!offices.data || !firms.data}>+ New user</Button>
      </div>
      <Table
        columns={columns}
        rows={users.data ?? []}
        rowKey={(user) => user.id}
        loading={users.loading}
        error={users.error}
        onRetry={users.reload}
        emptyTitle="No users match"
        pagination={{ page, limit: LIMIT, total: users.meta?.total ?? 0, onPageChange: setPage }}
      />
      {editing !== undefined && offices.data && firms.data && <UserForm user={editing} offices={offices.data} firms={firms.data} onClose={() => setEditing(undefined)} onSaved={users.reload} />}
      {resetting && <PasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}
