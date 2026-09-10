import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { cookies, headers } from "next/headers"
import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { authSessions, dailyStats, users, type User } from "@/lib/db/schema"
import { GAME_CONFIG } from "@/lib/game/config"
import type { LxpUser } from "@/lib/lxp/client"

export const SESSION_COOKIE = "tap_session"

export function newId(bytes = 24): string {
  return randomBytes(bytes).toString("base64url")
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const salt = process.env.IP_HASH_SALT ?? "tap-game"
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)
}

export async function requestMeta() {
  const h = await headers()
  const forwarded = h.get("x-forwarded-for")
  const ip = forwarded ? forwarded.split(",")[0].trim() : h.get("x-real-ip")
  return { ipHash: hashIp(ip), userAgent: (h.get("user-agent") ?? "").slice(0, 255) }
}

function isSecureContext(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.VERCEL || !!process.env.V0_RUNTIME_URL
}

/** Cookie attributes: the v0 preview runs inside a cross-site iframe, so SameSite=None is required there. */
function cookieOptions(expires: Date) {
  const secure = isSecureContext()
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    path: "/",
    expires,
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayIso(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Upsert the NewLXP profile into our users table and update login streak. */
export async function upsertUserFromLxp(profile: LxpUser): Promise<User> {
  const displayName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || profile.email.split("@")[0] || "Player"
  const today = todayIso()
  const yesterday = yesterdayIso()

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.lxpId, profile.id)).for("update")

    let user: User
    if (!existing) {
      const [created] = await tx
        .insert(users)
        .values({
          lxpId: profile.id,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          displayName,
          avatarUrl: profile.avatarUrl ?? null,
          streakDays: 1,
          lastActiveDate: today,
          lastLoginAt: new Date(),
        })
        .returning()
      user = created
    } else {
      let streak = existing.streakDays
      if (existing.lastActiveDate === today) {
        // same day — keep streak
      } else if (existing.lastActiveDate === yesterday) {
        streak += 1
      } else {
        streak = 1
      }
      const [updated] = await tx
        .update(users)
        .set({
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          displayName,
          avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
          streakDays: streak,
          lastActiveDate: today,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning()
      user = updated
    }

    await tx
      .insert(dailyStats)
      .values({ userId: user.id, day: today, logins: 1 })
      .onConflictDoUpdate({
        target: [dailyStats.userId, dailyStats.day],
        set: { logins: sql`${dailyStats.logins} + 1` },
      })

    return user
  })
}

export async function createAuthSession(userId: number, lxpAccessToken: string): Promise<string> {
  const id = newId(32)
  const meta = await requestMeta()
  const expires = new Date(Date.now() + GAME_CONFIG.session.authSessionDays * 86_400_000)
  await db.insert(authSessions).values({
    id,
    userId,
    lxpAccessToken,
    userAgent: meta.userAgent,
    ipHash: meta.ipHash,
    expiresAt: expires,
  })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, id, cookieOptions(expires))
  return id
}

export interface AuthContext {
  sessionId: string
  user: User
}

/** Validates the session cookie against the database. Returns null when unauthenticated. */
export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies()
  const sessionId = jar.get(SESSION_COOKIE)?.value
  if (!sessionId) return null

  const rows = await db
    .select({ session: authSessions, user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date())))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  // Touch last_seen at most once a minute to keep writes cheap.
  if (Date.now() - row.session.lastSeenAt.getTime() > 60_000) {
    void db.update(authSessions).set({ lastSeenAt: new Date() }).where(eq(authSessions.id, sessionId)).catch(() => {})
  }

  return { sessionId, user: row.user }
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuth()
  if (!ctx) throw new AuthError()
  return ctx
}

export class AuthError extends Error {
  status = 401
  constructor() {
    super("Unauthorized")
  }
}

export async function destroyAuthSession(): Promise<void> {
  const jar = await cookies()
  const sessionId = jar.get(SESSION_COOKIE)?.value
  if (sessionId) {
    await db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, sessionId))
  }
  jar.set(SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 })
}
