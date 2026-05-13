"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

type Mode = "signin" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const body = await r.json();
      if (!r.ok) {
        toast.error(body?.error ?? `HTTP ${r.status}`);
        setLoading(false);
        return;
      }
      toast.success(
        mode === "signin"
          ? `Welcome back, ${body?.user?.username ?? username.trim()}.`
          : "Account created.",
      );
      router.push("/");
      router.refresh();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Username"
        value={username}
        onChange={setUsername}
        autoComplete="username"
      />
      <Field
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
      />
      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-md px-3 py-2.5 text-[13px] font-semibold transition-opacity"
        style={{
          background: "var(--brand)",
          color: "#fff",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading
          ? mode === "signin"
            ? "Signing in…"
            : "Creating account…"
          : mode === "signin"
            ? "Sign in"
            : "Create account"}
      </button>
    </form>
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
    <label className="flex flex-col gap-1.5">
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
        className="rounded-md border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[color:var(--brand)]"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text)",
        }}
      />
    </label>
  );
}
