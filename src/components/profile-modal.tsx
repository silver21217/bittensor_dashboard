"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import type { PublicUser } from "@/lib/auth/store";
import { Avatar } from "./user-menu";
import { useToast } from "./toast";

export function ProfileModal({
  user,
  onClose,
  onSaved,
}: {
  user: PublicUser;
  onClose: () => void;
  onSaved?: (u: PublicUser) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [username, setUsername] = useState(user.username);
  const [avatar, setAvatar] = useState<string | null>(user.avatar);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const pickFile = () => fileRef.current?.click();
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
    const body: Record<string, unknown> = {};
    if (username.trim() !== user.username) body.username = username.trim();
    if (avatar !== user.avatar) body.avatar = avatar;
    if (newPw) {
      body.current_password = curPw;
      body.new_password = newPw;
    }
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j?.error ?? `HTTP ${r.status}`);
      } else {
        toast.success("Profile updated.");
        setCurPw("");
        setNewPw("");
        if (j.user) onSaved?.(j.user);
        router.refresh();
      }
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        // Close only if the mousedown started on the backdrop itself,
        // so a drag that begins inside the form doesn't trigger close.
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: "rgba(8, 8, 12, 0.55)" }}
    >
      <form
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] overflow-hidden rounded-xl"
        style={{
          background: "var(--surface)",
          boxShadow:
            "0 24px 48px -12px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--border)",
        }}
      >
        <div className="flex items-start justify-between px-4 pt-4">
          <div>
            <div
              className="text-[14px] font-semibold"
              style={{ color: "var(--text)" }}
            >
              Your profile
            </div>
            <div
              className="text-[11px]"
              style={{ color: "var(--text-dim)" }}
            >
              Update your username, avatar or password.
            </div>
          </div>
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
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 p-4">
          <div className="flex items-center gap-3">
            <Avatar
              user={{ username, avatar, role: user.role }}
              size={56}
            />
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={pickFile}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-semibold"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--text)",
                }}
              >
                <Upload size={12} />
                Upload avatar
              </button>
              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar(null)}
                  className="text-left text-[10.5px]"
                  style={{ color: "var(--danger)" }}
                >
                  Remove avatar
                </button>
              )}
              <input
                ref={fileRef}
                onChange={onFile}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
              />
            </div>
          </div>

          <Field
            label="Username"
            value={username}
            onChange={setUsername}
            autoComplete="username"
          />

          <div
            className="mt-2 border-t pt-3 text-[10.5px] font-semibold uppercase"
            style={{
              borderColor: "var(--divider)",
              color: "var(--text-dim)",
              letterSpacing: "0.06em",
            }}
          >
            Change password (optional)
          </div>
          <Field
            label="Current password"
            type="password"
            value={curPw}
            onChange={setCurPw}
            autoComplete="current-password"
          />
          <Field
            label="New password"
            type="password"
            value={newPw}
            onChange={setNewPw}
            autoComplete="new-password"
          />

        </div>

        <div
          className="flex items-center justify-end gap-2 px-4 pb-4 pt-2"
        >
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
            {loading ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
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
        autoComplete={autoComplete}
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
