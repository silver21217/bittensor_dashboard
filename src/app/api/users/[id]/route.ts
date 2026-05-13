import { NextResponse } from "next/server";
import {
  deleteUser,
  findById,
  findByUsername,
  toPublic,
  updateUser,
  type User,
} from "@/lib/auth/store";
import { getCurrentUser, hashPassword } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function validUsername(u: string): boolean {
  return /^[A-Za-z0-9_.-]{3,32}$/.test(u);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const target = await findById(id);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json()) as Partial<
    Pick<User, "username" | "role" | "status" | "avatar"> & { password?: string }
  >;
  const patch: Partial<User> = {};

  if (body.username !== undefined) {
    if (!validUsername(body.username)) {
      return NextResponse.json(
        { error: "Invalid username." },
        { status: 400 },
      );
    }
    const conflict = await findByUsername(body.username);
    if (conflict && conflict.id !== id) {
      return NextResponse.json(
        { error: "Username is taken." },
        { status: 409 },
      );
    }
    patch.username = body.username;
  }
  if (body.role !== undefined) {
    if (body.role !== "admin" && body.role !== "user") {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    patch.role = body.role;
  }
  if (body.status !== undefined) {
    if (!["pending", "approved", "rejected"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body.avatar !== undefined) patch.avatar = body.avatar;
  if (body.password) {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }
    patch.password_hash = await hashPassword(body.password);
  }

  const updated = await updateUser(id, patch);
  if (!updated)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ user: toPublic(updated) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (me.id === id) {
    return NextResponse.json(
      { error: "You can't delete your own account." },
      { status: 400 },
    );
  }
  const ok = await deleteUser(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
