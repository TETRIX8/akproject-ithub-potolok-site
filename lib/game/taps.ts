import "server-only"
import { and, desc, eq, gt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { dailyStats, gameSessions, tapEvents, users } from "@/lib/db/schema"
import { GAME_CONFIG } from "./config"
import { logAntiCheat, raiseSuspicion, trustSnapshot } from "./anticheat"
import { playersCount, rankOf } from "./leaderboard"
import { questMetricsFromUser, syncQuests } from "./quests"
import { decideWindows, tapWindowUsage } from "./rate-limit"
import { requireActiveSession } from "./session"
import { todayIso } from "./state"
import type { TapBatchRequest, TapBatchResult } from "./types"
import { ApiError } from "@/lib/api/respond"

const BATCH_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

export function validateTapPayload(body: unknown): TapBatchRequest {
  if (!body || typeof body !== "object") throw new ApiError(400, "BAD_PAYLOAD", "Некорректный запрос")
  const b = body as Record<string, unknown>
  const sessionId = typeof b.sessionId === "string" ? b.sessionId : ""
  const batchId = typeof b.batchId === "string" ? b.batchId : ""
  const taps = typeof b.taps === "number" ? b.taps : Number.NaN
  const durationMs = typeof b.durationMs === "number" ? b.durationMs : 0

  if (!BATCH_ID_RE.test(sessionId) || !BATCH_ID_RE.test(batchId)) throw new ApiError(400, "BAD_PAYLOAD", "Некорректный идентификатор")
  if (!Number.isInteger(taps) || taps < 1 || taps > GAME_CONFIG.maxTapsPerBatch) {
    throw new ApiError(400, "BAD_TAP_COUNT", "Некорректное количество тапов")
  }
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 60_000) throw new ApiError(400, "BAD_PAYLOAD", "Некорректная длительность")
  return { sessionId, batchId, taps, durationMs: Math.round(durationMs) }
}

interface Meta {
  ipHash: string | null
  userAgent: string | null
}

/**
 * Processes one tap batch. Everything runs in a single transaction with the user row locked,
 * so concurrent requests (double clicks, parallel tabs, retries) serialize and can't double count.
 */
export async function processTapBatch(userId: number, req: TapBatchRequest, meta: Meta): Promise<TapBatchResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update")
    if (!user) throw new ApiError(404, "USER_NOT_FOUND", "Пользователь не найден")
    const now = new Date()
    const today = todayIso(now)

    // 1. Active game session (also guards multi-tab / multi-device).
    const session = await requireActiveSession(tx, userId, req.sessionId)

    // 2. Idempotency: same (session, batchId) means a retry — return the recorded result without re-crediting.
    const [dup] = await tx
      .select()
      .from(tapEvents)
      .where(and(eq(tapEvents.gameSessionId, session.id), eq(tapEvents.batchId, req.batchId)))
    if (dup) {
      await logAntiCheat(tx, { userId, gameSessionId: session.id, eventType: "duplicate_batch", severity: 0, details: { batchId: req.batchId }, ...meta })
      return await buildResult(tx, user, session.id, today, { duplicate: true, accepted: dup.acceptedTaps, rejected: dup.requestedTaps - dup.acceptedTaps, newlyCompleted: [] })
    }

    // 3. Trust gate: blocked / paused / needs verification.
    let snap = trustSnapshot(user, now)
    if (snap.level === "blocked") throw new ApiError(423, "BLOCKED", snap.pauseReason ?? "Игровая функция заблокирована", { blockedReason: snap.blockedReason })
    if (snap.pausedUntil) throw new ApiError(429, "COOLDOWN", snap.pauseReason ?? "Слишком высокая активность", { pausedUntil: snap.pausedUntil.toISOString(), trustLevel: snap.level })
    if (snap.needsVerification) throw new ApiError(428, "VERIFICATION_REQUIRED", "Подтвердите, что вы человек", { trustLevel: snap.level })

    // 4. Per-batch plausibility (autoclicker / scripted requests).
    const tps = req.durationMs > 0 ? (req.taps - 1) / (req.durationMs / 1000) : req.taps > 3 ? 99 : 0
    let penalty = 0
    const reasons: string[] = []
    if (req.taps > 3 && tps > GAME_CONFIG.maxHumanTapsPerSecond) {
      penalty += GAME_CONFIG.suspicion.fastBatch
      reasons.push("fast_batch")
    }

    // Request frequency: batches per 10 s (client flushes at most every batchFlushMs).
    const [freq] = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(tapEvents)
      .where(and(eq(tapEvents.userId, userId), gt(tapEvents.createdAt, sql`now() - interval '10 seconds'`)))
    const maxBatchesPer10s = Math.ceil(10_000 / GAME_CONFIG.batchFlushMs) + 4
    if ((freq?.c ?? 0) >= maxBatchesPer10s) {
      penalty += GAME_CONFIG.suspicion.tooManyBatches
      reasons.push("too_many_batches")
    }

    // Robot rhythm: last N batches carry identical tap counts and near-identical durations.
    const recent = await tx
      .select({ taps: tapEvents.requestedTaps, dur: tapEvents.clientDurationMs })
      .from(tapEvents)
      .where(and(eq(tapEvents.userId, userId), eq(tapEvents.gameSessionId, session.id)))
      .orderBy(desc(tapEvents.createdAt))
      .limit(7)
    if (recent.length >= 7 && req.taps >= 4) {
      const sameCount = recent.every((r) => r.taps === req.taps)
      const durs = recent.map((r) => r.dur ?? 0).concat(req.durationMs)
      const mean = durs.reduce((a, b) => a + b, 0) / durs.length
      const variance = durs.reduce((a, b) => a + (b - mean) ** 2, 0) / durs.length
      if (sameCount && Math.sqrt(variance) < 6) {
        penalty += GAME_CONFIG.suspicion.robotRhythm
        reasons.push("robot_rhythm")
      }
    }

    // 5. Sliding-window limits (softened for suspicious players).
    const usage = await tapWindowUsage(tx, userId, today)
    const multiplier = snap.level === "suspicious" ? 0.6 : 1
    const decision = decideWindows(usage, multiplier)
    let accepted = Math.min(req.taps, decision.allowance)
    const rejected = req.taps - accepted

    if (decision.exhausted || rejected > 0) {
      const isDaily = decision.exhausted === "perDay" || usage.perDay + accepted >= GAME_CONFIG.limits.perDay
      if (!isDaily) {
        penalty += GAME_CONFIG.suspicion.windowExceeded
        reasons.push("window_exceeded")
        const until = new Date(now.getTime() + GAME_CONFIG.cooldown.windowExceededSeconds * 1000)
        if (!user.restrictedUntil || user.restrictedUntil < until) {
          await tx.update(users).set({ restrictedUntil: until }).where(eq(users.id, userId))
          user.restrictedUntil = until
        }
      }
    }

    // 6. Apply suspicion and log anomalies.
    if (penalty > 0) {
      const change = await raiseSuspicion(tx, user, penalty, now)
      await logAntiCheat(tx, {
        userId,
        gameSessionId: session.id,
        eventType: reasons.includes("window_exceeded") ? "window_exceeded" : reasons.includes("robot_rhythm") ? "robot_rhythm" : reasons.includes("too_many_batches") ? "too_many_batches" : "fast_batch",
        severity: Math.min(5, Math.ceil(penalty / 3)),
        requestsCount: freq?.c ?? 0,
        tapsPerSecond: Number(tps.toFixed(2)),
        suspicionScore: change.score,
        actionApplied: change.after !== change.before ? `trust:${change.after}` : "score_only",
        details: { reasons, requested: req.taps, accepted, durationMs: req.durationMs, usage },
        ...meta,
      })
      // If the new level pauses or requires verification, don't credit this batch.
      snap = trustSnapshot(user, now)
      if (snap.level === "cooldown" || snap.level === "restricted" || snap.level === "blocked" || snap.level === "verification") {
        accepted = 0
      }
    }

    // 7. Record the batch (even with accepted=0 — this is what makes retries idempotent).
    await tx.insert(tapEvents).values({
      userId,
      gameSessionId: session.id,
      batchId: req.batchId,
      requestedTaps: req.taps,
      acceptedTaps: accepted,
      clientDurationMs: req.durationMs,
      createdAt: now,
    })

    let newlyCompleted: TapBatchResult["newlyCompletedQuests"] = []
    if (accepted > 0) {
      const [day] = await tx
        .insert(dailyStats)
        .values({ userId, day: today, taps: accepted })
        .onConflictDoUpdate({ target: [dailyStats.userId, dailyStats.day], set: { taps: sql`${dailyStats.taps} + ${accepted}` } })
        .returning({ taps: dailyStats.taps })

      const [updated] = await tx
        .update(users)
        .set({
          totalTaps: sql`${users.totalTaps} + ${accepted}`,
          bestDayTaps: sql`greatest(${users.bestDayTaps}, ${day.taps})`,
          lastActiveDate: today,
          updatedAt: now,
        })
        .where(eq(users.id, userId))
        .returning({ totalTaps: users.totalTaps, bestDayTaps: users.bestDayTaps })
      user.totalTaps = updated.totalTaps
      user.bestDayTaps = updated.bestDayTaps

      await tx
        .update(gameSessions)
        .set({ tapsInSession: sql`${gameSessions.tapsInSession} + ${accepted}`, lastHeartbeatAt: now })
        .where(eq(gameSessions.id, session.id))

      const rank = await rankOf(tx, user.totalTaps)
      if (user.bestRank === null || rank < user.bestRank) {
        await tx.update(users).set({ bestRank: rank }).where(eq(users.id, userId))
        user.bestRank = rank
      }
      const synced = await syncQuests(tx, userId, questMetricsFromUser(user, day.taps, await playersCount(tx)))
      newlyCompleted = synced.newlyCompleted
    }

    return await buildResult(tx, user, session.id, today, { duplicate: false, accepted, rejected: req.taps - accepted, newlyCompleted })
  })
}

async function buildResult(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  user: typeof users.$inferSelect,
  _sessionId: string,
  today: string,
  partial: Pick<TapBatchResult, "duplicate" | "accepted" | "rejected"> & { newlyCompleted: TapBatchResult["newlyCompletedQuests"] },
): Promise<TapBatchResult> {
  const now = new Date()
  const usage = await tapWindowUsage(tx, user.id, today)
  const snap = trustSnapshot(user, now)
  return {
    ok: true,
    duplicate: partial.duplicate,
    accepted: partial.accepted,
    rejected: partial.rejected,
    totalTaps: user.totalTaps,
    todayTaps: usage.perDay,
    rank: await rankOf(tx, user.totalTaps),
    trustLevel: snap.level,
    pausedUntil: snap.pausedUntil?.toISOString() ?? null,
    pauseReason: snap.pauseReason,
    needsVerification: snap.needsVerification,
    limits: {
      dailyLimit: GAME_CONFIG.limits.perDay,
      dailyRemaining: Math.max(0, GAME_CONFIG.limits.perDay - usage.perDay),
      minuteLimit: GAME_CONFIG.limits.perMinute,
      minuteRemaining: decideWindows({ ...usage, perDay: 0 }).allowance,
    },
    newlyCompletedQuests: partial.newlyCompleted,
  }
}
