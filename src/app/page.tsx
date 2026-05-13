import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { getCurrentPublicUser, getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await getCurrentUser();
  if (!me) redirect("/signin");
  if (me.status !== "approved") redirect("/pending");
  const pub = await getCurrentPublicUser();
  return <Dashboard me={pub} />;
}
