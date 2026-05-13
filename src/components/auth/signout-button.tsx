"use client";

import { useRouter } from "next/navigation";

export function SignoutButton() {
  const router = useRouter();
  const signout = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/signin");
    router.refresh();
  };
  return (
    <button
      onClick={signout}
      className="rounded-md border px-3 py-1.5 text-[12px] font-semibold"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        color: "var(--text)",
      }}
    >
      Sign out
    </button>
  );
}
