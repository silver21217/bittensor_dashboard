import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SigninPage() {
  const me = await getCurrentUser();
  if (me) {
    if (me.status !== "approved") redirect("/pending");
    redirect("/");
  }
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to view live subnet intelligence."
      footer={
        <>
          New here?{" "}
          <Link
            href="/signup"
            style={{ color: "var(--brand)", fontWeight: 600 }}
          >
            Create an account
          </Link>
        </>
      }
    >
      <AuthForm mode="signin" />
    </AuthShell>
  );
}
