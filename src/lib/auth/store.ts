import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export type UserRole = "admin" | "user";
export type UserStatus = "pending" | "approved" | "rejected";

export type User = {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  avatar: string | null; // data URL
  created_at: string;
  approved_at: string | null;
};

export type PublicUser = Omit<User, "password_hash">;

type Store = { users: User[] };

const STORE_PATH =
  process.env.USERS_STORE_PATH ??
  path.join(process.cwd(), ".data", "users.json");

async function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  await fs.mkdir(dir, { recursive: true });
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || !Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "ENOENT"
    ) {
      return { users: [] };
    }
    throw e;
  }
}

async function writeStore(s: Store): Promise<void> {
  await ensureDir();
  const tmp = STORE_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(s, null, 2), "utf-8");
  await fs.rename(tmp, STORE_PATH);
}

export function toPublic(u: User): PublicUser {
  const { password_hash, ...rest } = u;
  void password_hash;
  return rest;
}

export async function listUsers(): Promise<User[]> {
  const s = await readStore();
  return s.users.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function findByUsername(username: string): Promise<User | null> {
  const s = await readStore();
  const lower = username.toLowerCase();
  return s.users.find((u) => u.username.toLowerCase() === lower) ?? null;
}

export async function findById(id: string): Promise<User | null> {
  const s = await readStore();
  return s.users.find((u) => u.id === id) ?? null;
}

export async function createUser(
  input: Omit<User, "id" | "created_at" | "approved_at">,
): Promise<User> {
  const s = await readStore();
  const now = new Date().toISOString();
  const user: User = {
    id: crypto.randomUUID(),
    created_at: now,
    approved_at: input.status === "approved" ? now : null,
    ...input,
  };
  s.users.push(user);
  await writeStore(s);
  return user;
}

export async function updateUser(
  id: string,
  patch: Partial<Omit<User, "id" | "created_at">>,
): Promise<User | null> {
  const s = await readStore();
  const i = s.users.findIndex((u) => u.id === id);
  if (i === -1) return null;
  const prev = s.users[i];
  const next: User = { ...prev, ...patch };
  if (prev.status !== "approved" && next.status === "approved") {
    next.approved_at = new Date().toISOString();
  }
  s.users[i] = next;
  await writeStore(s);
  return next;
}

export async function deleteUser(id: string): Promise<boolean> {
  const s = await readStore();
  const before = s.users.length;
  s.users = s.users.filter((u) => u.id !== id);
  if (s.users.length === before) return false;
  await writeStore(s);
  return true;
}

/**
 * True when the store has no admin users. The first signup becomes admin
 * automatically so the system is bootstrappable without a seed script.
 */
export async function hasNoAdmin(): Promise<boolean> {
  const s = await readStore();
  return !s.users.some((u) => u.role === "admin");
}
