import { NextResponse } from "next/server";
import {
  createUser,
  findByUsername,
  hasNoAdmin,
  toPublic,
} from "@/lib/auth/store";
import {
  createSessionJwt,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function validUsername(u: string): boolean {
  return /^[A-Za-z0-9_.-]{3,32}$/.test(u);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
    };
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    if (!validUsername(username)) {
      return NextResponse.json(
        {
          error:
            "Username must be 3–32 chars, letters/numbers/underscore/hyphen/dot.",
        },
        { status: 400 },
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }
    const existing = await findByUsername(username);
    if (existing) {
      return NextResponse.json(
        { error: "Username is already taken." },
        { status: 409 },
      );
    }
    const isBootstrap = await hasNoAdmin();
    const password_hash = await hashPassword(password);
    const user = await createUser({
      username,
      password_hash,
      role: isBootstrap ? "admin" : "user",
      status: isBootstrap ? "approved" : "pending",
      avatar: null,
    });
    const token = await createSessionJwt(user.id);
    await setSessionCookie(token);
    return NextResponse.json({ user: toPublic(user), bootstrap: isBootstrap });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
