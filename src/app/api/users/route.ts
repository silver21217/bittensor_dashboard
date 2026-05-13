import { NextResponse } from "next/server";
import { listUsers, toPublic } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (me.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const all = await listUsers();
  return NextResponse.json({ users: all.map(toPublic) });
}
