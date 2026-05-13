import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignoutButton } from "@/components/auth/signout-button";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/signin");
  if (me.status === "approved") redirect("/");
  const rejected = me.status === "rejected";
  return (
    <AuthShell
      title={rejected ? "Access denied" : "Awaiting approval"}
      subtitle={
        rejected
          ? "Your account was rejected by an administrator."
          : "An administrator needs to approve your account before you can use the dashboard."
      }
      footer={<SignoutButton />}
    >
      <div
        className="rounded-md border px-4 py-3 text-[12.5px]"
        style={{
          borderColor: rejected ? "var(--danger)" : "var(--border)",
          background: rejected ? "var(--danger-soft)" : "var(--surface-2)",
          color: rejected ? "var(--danger)" : "var(--text-dim)",
        }}
      >
        <div className="font-semibold" style={{ color: "var(--text)" }}>
          Signed in as {me.username}
        </div>
        <div className="mt-1">
          {rejected
            ? "Contact an administrator if you believe this is a mistake."
            : "You'll be able to access the dashboard as soon as your account is approved. No need to sign up again — just check back later."}
        </div>
      </div>
    </AuthShell>
  );
}
