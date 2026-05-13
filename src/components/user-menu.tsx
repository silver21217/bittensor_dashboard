"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings, User as UserIcon } from "lucide-react";
import type { PublicUser } from "@/lib/auth/store";
import { cn } from "@/lib/cn";

export function UserMenu({
  user,
  onOpenProfile,
}: {
  user: PublicUser;
  onOpenProfile: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const signout = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/signin");
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 items-center gap-1.5 rounded-md border pl-1 pr-2 transition-colors"
        style={{
          borderColor: "var(--border)",
          background: open ? "var(--surface-hover)" : "var(--surface)",
        }}
        title="Account"
      >
        <Avatar user={user} size={20} />
        <span
          className="max-w-[120px] truncate text-[11.5px] font-semibold"
          style={{ color: "var(--text)" }}
        >
          {user.username}
        </span>
        {user.role === "admin" && (
          <span
            className="inline-flex items-center rounded px-1 text-[9px] font-semibold"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-dim)",
              letterSpacing: "0.06em",
              lineHeight: "14px",
              height: 14,
            }}
          >
            ADMIN
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-md border shadow-lg"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
          }}
        >
          <div
            className="flex items-center gap-2.5 border-b px-3 py-2.5"
            style={{ borderColor: "var(--divider)" }}
          >
            <Avatar user={user} size={32} />
            <div className="flex flex-col overflow-hidden">
              <span
                className="truncate text-[12.5px] font-semibold"
                style={{ color: "var(--text)" }}
              >
                {user.username}
              </span>
              <span
                className="text-[10.5px]"
                style={{ color: "var(--text-dim)" }}
              >
                {user.role === "admin" ? "Administrator" : "Member"}
              </span>
            </div>
          </div>
          <MenuItem
            icon={UserIcon}
            label="Profile"
            onClick={() => {
              setOpen(false);
              onOpenProfile();
            }}
          />
          <MenuItem icon={Settings} label="Settings" disabled />
          <div
            style={{ borderTop: "1px solid var(--divider)" }}
          />
          <MenuItem
            icon={LogOut}
            label="Sign out"
            onClick={signout}
            danger
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition-colors",
      )}
      style={{
        color: danger
          ? "var(--danger)"
          : disabled
            ? "var(--text-faint)"
            : "var(--text)",
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLElement).style.background =
          "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <Icon size={14} strokeWidth={1.9} />
      {label}
    </button>
  );
}

export function Avatar({
  user,
  size = 28,
}: {
  user: { username: string; avatar: string | null; role?: string };
  size?: number;
}) {
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.username}
        width={size}
        height={size}
        style={{ borderRadius: size * 0.25 }}
      />
    );
  }
  // Deterministic color from username
  let h = 0;
  for (let i = 0; i < user.username.length; i++) {
    h = (h * 31 + user.username.charCodeAt(i)) >>> 0;
  }
  const palette = [
    "#ed2939",
    "#ff8b1a",
    "#ffbf48",
    "#16a34a",
    "#0ea5e9",
    "#6366f1",
    "#a855f7",
    "#ec4899",
    "#14b8a6",
  ];
  const color = palette[h % palette.length];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        background: color,
        color: "#fff",
        fontSize: Math.round(size * 0.45),
        lineHeight: 1,
        borderRadius: size * 0.25,
      }}
    >
      {user.username.slice(0, 1).toUpperCase()}
    </span>
  );
}
