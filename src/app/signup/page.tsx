import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const me = await getCurrentUser();
  if (me) {
    if (me.status !== "approved") redirect("/pending");
    redirect("/");
  }
  return (
    <AuthShell
      title="Create your account"
      subtitle="First account becomes admin automatically. Later signups must be approved by an admin."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/signin"
            style={{ color: "var(--brand)", fontWeight: 600 }}
          >
            Sign in
          </Link>
        </>
      }
    >
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
