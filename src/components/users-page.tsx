"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Trash2,
  Check,
  X as XIcon,
  ShieldCheck,
  Shield,
  ChevronDown,
} from "lucide-react";
import type { PublicUser, UserRole, UserStatus } from "@/lib/auth/store";
import { Avatar } from "./user-menu";
import { useToast } from "./toast";
import { BrandSpinner } from "./brand-spinner";

const STATUS_COLORS: Record<UserStatus, { fg: string; bg: string }> = {
  pending: { fg: "#9a6400", bg: "var(--warning-soft)" },
  approved: { fg: "var(--success)", bg: "var(--success-soft)" },
  rejected: { fg: "var(--danger)", bg: "var(--danger-soft)" },
};

export function UsersPage({ me }: { me: PublicUser | null }) {
  const toast = useToast();
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/users", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setUsers(j.users ?? []);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
    return j.user as PublicUser;
  };

  const onStatus = async (u: PublicUser, status: UserStatus) => {
    try {
      const updated = await patch(u.id, { status });
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? updated : x)) ?? null);
      toast.success(`${u.username} → ${status}`);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    }
  };

  const onRole = async (u: PublicUser, role: UserRole) => {
    try {
      const updated = await patch(u.id, { role });
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? updated : x)) ?? null);
      toast.success(`${u.username} is now ${role}`);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    }
  };

  const onDelete = async (u: PublicUser) => {
    if (!confirm(`Delete user "${u.username}"? This can't be undone.`)) return;
    try {
      const r = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      setUsers((prev) => prev?.filter((x) => x.id !== u.id) ?? null);
      toast.success(`Deleted ${u.username}`);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div
      className="px-4 pb-6"
      style={{
        height:
          "calc(100vh - var(--sticky-top-1, 172px) - var(--sticky-tab, 40px))",
        minHeight: 0,
      }}
    >
      <div
        className="m-card h-full overflow-y-scroll"
        style={{ minHeight: 0 }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--divider)" }}
        >
          <div className="flex flex-col">
            <span
              className="text-[14px] font-semibold"
              style={{ color: "var(--text)" }}
            >
              Users
            </span>
            <span
              className="text-[11px]"
              style={{ color: "var(--text-dim)" }}
            >
              {users?.length ?? 0} accounts ·{" "}
              {users?.filter((u) => u.status === "pending").length ?? 0}{" "}
              pending approval
            </span>
          </div>
          <button
            onClick={load}
            className="rounded-md border px-2.5 py-1 text-[11.5px] font-semibold"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {users === null && loading ? (
          <BrandSpinner
            size={112}
            minHeight="calc(100vh - var(--sticky-top-1, 172px) - var(--sticky-tab, 40px) - 120px)"
          />
        ) : (
        <table
          className="w-full text-[12px]"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => {
              const isSelf = me?.id === u.id;
              const st = STATUS_COLORS[u.status];
              return (
                <tr
                  key={u.id}
                  className="m-row"
                  style={{ borderTop: "1px solid var(--divider)" }}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={u} size={28} />
                      <div className="flex flex-col">
                        <span
                          className="text-[12.5px] font-semibold"
                          style={{ color: "var(--text)" }}
                        >
                          {u.username}
                          {isSelf && (
                            <span
                              className="ml-1.5 text-[10.5px]"
                              style={{ color: "var(--text-dim)" }}
                            >
                              (you)
                            </span>
                          )}
                        </span>
                        <span
                          className="mono text-[10.5px]"
                          style={{ color: "var(--text-dim)" }}
                          title={u.id}
                        >
                          {u.id.slice(0, 8)}…
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="m-badge"
                      style={{
                        background:
                          u.role === "admin"
                            ? "var(--brand-soft)"
                            : "var(--surface-2)",
                        color:
                          u.role === "admin"
                            ? "var(--brand)"
                            : "var(--text-dim)",
                      }}
                    >
                      {u.role === "admin" ? (
                        <ShieldCheck size={10} strokeWidth={2.2} />
                      ) : (
                        <Shield size={10} strokeWidth={2.2} />
                      )}
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="m-badge"
                      style={{ color: st.fg, background: st.bg }}
                    >
                      {u.status.toUpperCase()}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2.5 text-[11px]"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {u.status === "pending" && (
                        <>
                          <Btn
                            onClick={() => onStatus(u, "approved")}
                            tone="success"
                            icon={<Check size={12} />}
                            label="Approve"
                          />
                          <Btn
                            onClick={() => onStatus(u, "rejected")}
                            tone="danger"
                            icon={<XIcon size={12} />}
                            label="Reject"
                          />
                        </>
                      )}
                      {u.status === "approved" && u.role === "user" && (
                        <Btn
                          onClick={() => onRole(u, "admin")}
                          tone="ghost"
                          icon={<ShieldCheck size={12} />}
                          label="Make admin"
                        />
                      )}
                      {u.status === "approved" &&
                        u.role === "admin" &&
                        !isSelf && (
                          <Btn
                            onClick={() => onRole(u, "user")}
                            tone="ghost"
                            icon={<Shield size={12} />}
                            label="Demote"
                          />
                        )}
                      <Btn
                        onClick={() => setEditing(u)}
                        tone="ghost"
                        label="Edit"
                      />
                      {!isSelf && (
                        <Btn
                          onClick={() => onDelete(u)}
                          tone="danger"
                          icon={<Trash2 size={12} />}
                          label="Delete"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            setUsers((prev) =>
              prev?.map((x) => (x.id === u.id ? u : x)) ?? null,
            );
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Th({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: boolean;
}) {
  return (
    <th
      className="px-3 py-2 text-[10.5px] font-semibold uppercase"
      style={{
        color: "var(--text-dim)",
        textAlign: right ? "right" : "left",
        letterSpacing: "0.06em",
      }}
    >
      {children}
    </th>
  );
}

function Btn({
  onClick,
  label,
  icon,
  tone,
}: {
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  tone: "success" | "danger" | "ghost";
}) {
  const style: React.CSSProperties =
    tone === "success"
      ? {
          background: "var(--success)",
          color: "#fff",
          borderColor: "var(--success)",
        }
      : tone === "danger"
        ? {
            background: "var(--surface)",
            color: "var(--danger)",
            borderColor: "var(--danger)",
          }
        : {
            background: "var(--surface)",
            color: "var(--text)",
            borderColor: "var(--border)",
          };
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-semibold"
      style={style}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: PublicUser;
  onClose: () => void;
  onSaved: (u: PublicUser) => void;
}) {
  const toast = useToast();
  const [username, setUsername] = useState(user.username);
  const [avatar, setAvatar] = useState<string | null>(user.avatar);
  const [newPw, setNewPw] = useState("");
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [role, setRole] = useState<UserRole>(user.role);
  const [loading, setLoading] = useState(false);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1024 * 1024) {
      toast.error("Avatar must be under 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result ?? ""));
    reader.readAsDataURL(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const body: Record<string, unknown> = {
      username,
      avatar,
      status,
      role,
    };
    if (newPw) body.password = newPw;
    try {
      const r = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      toast.success(`${user.username} updated.`);
      onSaved(j.user as PublicUser);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: "rgba(8, 8, 12, 0.55)" }}
    >
      <form
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-[400px] overflow-hidden rounded-xl"
        style={{
          background: "var(--surface)",
          boxShadow:
            "0 24px 48px -12px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--border)",
        }}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <span
            className="text-[14px] font-semibold"
            style={{ color: "var(--text)" }}
          >
            Edit {user.username}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="-m-1 rounded-md p-1 transition-colors"
            style={{ color: "var(--text-dim)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--surface-hover)";
              (e.currentTarget as HTMLElement).style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--text-dim)";
            }}
            aria-label="Close"
          >
            <XIcon size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 p-4">
          <div className="flex items-center gap-3">
            <Avatar user={{ username, avatar, role }} size={48} />
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-semibold"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface-2)",
                color: "var(--text)",
              }}
            >
              Upload avatar
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={onFile}
                className="hidden"
              />
            </label>
            {avatar && (
              <button
                type="button"
                onClick={() => setAvatar(null)}
                className="text-[10.5px]"
                style={{ color: "var(--danger)" }}
              >
                Remove
              </button>
            )}
          </div>

          <TextField label="Username" value={username} onChange={setUsername} />

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Role"
              value={role}
              onChange={(v) => setRole(v as UserRole)}
              options={[
                { v: "user", label: "User" },
                { v: "admin", label: "Admin" },
              ]}
            />
            <SelectField
              label="Status"
              value={status}
              onChange={(v) => setStatus(v as UserStatus)}
              options={[
                { v: "pending", label: "Pending" },
                { v: "approved", label: "Approved" },
                { v: "rejected", label: "Rejected" },
              ]}
            />
          </div>
          <TextField
            label="Reset password (optional, min 8)"
            type="password"
            value={newPw}
            onChange={setNewPw}
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-[12px] font-semibold"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md px-3 py-1.5 text-[12px] font-semibold"
            style={{
              background: "var(--brand)",
              color: "#fff",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[10.5px] font-semibold uppercase"
        style={{ color: "var(--text-dim)", letterSpacing: "0.06em" }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[color:var(--brand)]"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text)",
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.v === value);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10.5px] font-semibold uppercase"
        style={{ color: "var(--text-dim)", letterSpacing: "0.06em" }}
      >
        {label}
      </span>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors"
          style={{
            background: "var(--surface)",
            borderColor: open ? "var(--brand)" : "var(--border)",
            color: "var(--text)",
          }}
        >
          <span>{current?.label ?? "Select…"}</span>
          <ChevronDown
            size={14}
            strokeWidth={2}
            style={{
              color: "var(--text-dim)",
              transform: open ? "rotate(180deg)" : undefined,
              transition: "transform 120ms",
            }}
          />
        </button>
        {open && (
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border shadow-lg"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              boxShadow:
                "0 4px 14px 0 rgba(0, 0, 0, 0.12), 0 0 0 1px var(--border)",
            }}
          >
            {options.map((o) => {
              const active = o.v === value;
              return (
                <button
                  key={o.v}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(o.v);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors"
                  style={{
                    background: active ? "var(--brand-soft)" : "transparent",
                    color: active ? "var(--brand)" : "var(--text)",
                  }}
                  onMouseEnter={(e) => {
                    if (!active)
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active)
                      (e.currentTarget as HTMLElement).style.background =
                        "transparent";
                  }}
                >
                  <span>{o.label}</span>
                  {active && (
                    <Check
                      size={12}
                      strokeWidth={2.4}
                      style={{ color: "var(--brand)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
