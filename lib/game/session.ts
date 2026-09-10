import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { db, type Tx } from "@/lib/db"
import { gameSessions, type GameSession } from "@/lib/db/schema"
import { newId } from "@/lib/auth/session"
import { GAME_CONFIG } from "./config"
import { logAntiCheat } from "./anticheat"
import { ApiError } from "@/lib/api/respond"

function ttlMs() {
  return GAME_CONFIG.session.gameSessionTtlSeconds * 1000
}

export function isStale(s: Pick<GameSession, "lastHeartbeatAt">, now = new Date()) {
  return now.getTime() - s.lastHeartbeatAt.getTime() > ttlMs()
}

export class SessionConflict extends Error {
  status = 409
  constructor(public readonly existing: GameSession, public readonly sameDevice: boolean) {
    super("Игровая сессия уже активна в другом окне.")
  }
}

/**
 * Starts a game session for the user. Exactly one `active` session may exist per user
 * (enforced by a partial unique index). A stale session (no heartbeat within TTL) is
 * expired automatically; a live one raises SessionConflict unless `takeover` is set.
 */
export async function startGameSession(opts: {
  userId: number
  authSessionId: string
  deviceLabel: string | null
  takeover: boolean
}): Promise<GameSession> {
  return db.transaction(async (tx) => {
    // Serialize per user: lock all of this user's session rows.
    const active = await tx
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.userId, opts.userId), eq(gameSessions.status, "active")))
      .for("update")

    const now = new Date()
    for (const s of active) {
      if (isStale(s, now)) {
        await endSession(tx, s.id, "expired", now)
        continue
      }
      const sameDevice = s.authSessionId === opts.authSessionId
      if (!opts.takeover) throw new SessionConflict(s, sameDevice)
      await endSession(tx, s.id, sameDevice ? "takeover_tab" : "takeover_device", now)
      await logAntiCheat(tx, {
        userId: opts.userId,
        gameSessionId: s.id,
        eventType: "session_conflict",
        severity: 1,
        actionApplied: "takeover",
        details: { sameDevice, previousSession: s.id },
      })
    }

    const [created] = await tx
      .insert(gameSessions)
      .values({
        id: newId(18),
        userId: opts.userId,
        authSessionId: opts.authSessionId,
        deviceLabel: opts.deviceLabel,
        status: "active",
        startedAt: now,
        lastHeartbeatAt: now,
      })
      .returning()
    return created
  })
}

async function endSession(tx: Tx, id: string, reason: string, now: Date) {
  await tx
    .update(gameSessions)
    .set({ status: "ended", endedAt: now, endReason: reason })
    .where(and(eq(gameSessions.id, id), eq(gameSessions.status, "active")))
}

/** Locks and returns the caller's active session, or throws a typed error. */
export async function requireActiveSession(tx: Tx, userId: number, sessionId: string): Promise<GameSession> {
  const [s] = await tx
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId)))
    .for("update")

  if (!s) throw new ApiError(404, "SESSION_NOT_FOUND", "Игровая сессия не найдена. Обновите страницу.")
  if (s.status !== "active") {
    const code = s.endReason?.startsWith("takeover") ? "SESSION_TAKEN_OVER" : "SESSION_ENDED"
    const msg = code === "SESSION_TAKEN_OVER" ? "Игровая сессия была перехвачена в другом окне." : "Игровая сессия завершена."
    throw new ApiError(409, code, msg, { endReason: s.endReason })
  }
  if (isStale(s)) {
    await endSession(tx, s.id, "expired", new Date())
    throw new ApiError(409, "SESSION_EXPIRED", "Игровая сессия истекла из-за отсутствия связи. Переподключитесь.")
  }
  return s
}

export async function heartbeat(userId: number, sessionId: string): Promise<{ ok: true } | { ok: false; code: string }> {
  const res = await db
    .update(gameSessions)
    .set({ lastHeartbeatAt: new Date() })
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId), eq(gameSessions.status, "active"), sql`${gameSessions.lastHeartbeatAt} > now() - make_interval(secs => ${GAME_CONFIG.session.gameSessionTtlSeconds})`))
    .returning({ id: gameSessions.id })
  if (res.length) return { ok: true }

  const [s] = await db.select({ status: gameSessions.status, endReason: gameSessions.endReason }).from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId)))
  if (!s) return { ok: false, code: "SESSION_NOT_FOUND" }
  if (s.status === "active") {
    await db.update(gameSessions).set({ status: "ended", endedAt: new Date(), endReason: "expired" }).where(eq(gameSessions.id, sessionId))
    return { ok: false, code: "SESSION_EXPIRED" }
  }
  return { ok: false, code: s.endReason?.startsWith("takeover") ? "SESSION_TAKEN_OVER" : "SESSION_ENDED" }
}

export async function endGameSession(userId: number, sessionId: string, reason = "closed") {
  await db
    .update(gameSessions)
    .set({ status: "ended", endedAt: new Date(), endReason: reason })
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId), eq(gameSessions.status, "active")))
}
