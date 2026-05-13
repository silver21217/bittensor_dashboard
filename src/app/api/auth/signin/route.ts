import { NextResponse } from "next/server";
import { findByUsername, toPublic } from "@/lib/auth/store";
import {
  createSessionJwt,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
    };
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    if (!username || !password) {
      return NextResponse.json(
        { error: "Missing credentials." },
        { status: 400 },
      );
    }
    const user = await findByUsername(username);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 },
      );
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 },
      );
    }
    const token = await createSessionJwt(user.id);
    await setSessionCookie(token);
    return NextResponse.json({ user: toPublic(user) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
