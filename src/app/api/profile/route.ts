import { NextResponse } from "next/server";
import {
  findByUsername,
  toPublic,
  updateUser,
  type User,
} from "@/lib/auth/store";
import {
  getCurrentUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function validUsername(u: string): boolean {
  return /^[A-Za-z0-9_.-]{3,32}$/.test(u);
}

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    username?: string;
    avatar?: string | null;
    current_password?: string;
    new_password?: string;
  };

  const patch: Partial<User> = {};
  if (body.username !== undefined && body.username !== me.username) {
    if (!validUsername(body.username)) {
      return NextResponse.json(
        { error: "Invalid username." },
        { status: 400 },
      );
    }
    const conflict = await findByUsername(body.username);
    if (conflict && conflict.id !== me.id) {
      return NextResponse.json(
        { error: "Username is taken." },
        { status: 409 },
      );
    }
    patch.username = body.username;
  }
  if (body.avatar !== undefined) patch.avatar = body.avatar;
  if (body.new_password) {
    if (!body.current_password) {
      return NextResponse.json(
        { error: "Current password required to change password." },
        { status: 400 },
      );
    }
    const ok = await verifyPassword(body.current_password, me.password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 },
      );
    }
    if (body.new_password.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters." },
        { status: 400 },
      );
    }
    patch.password_hash = await hashPassword(body.new_password);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ user: toPublic(me) });
  }

  const updated = await updateUser(me.id, patch);
  if (!updated)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ user: toPublic(updated) });
}
