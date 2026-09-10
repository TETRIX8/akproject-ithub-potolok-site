import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { dailyStats, users, type User } from "@/lib/db/schema"
import { GAME_CONFIG, publicGameConfig } from "./config"
import { trustSnapshot } from "./anticheat"
import { playersCount, rankOf } from "./leaderboard"
import { collectQuestMetrics, syncQuests } from "./quests"
import { decideWindows, tapWindowUsage } from "./rate-limit"
import type { GameState, PublicUser } from "./types"

export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

export function publicUser(u: User): PublicUser {
  return { id: u.id, displayName: u.displayName, email: u.email, avatarUrl: u.avatarUrl }
}

/** Builds the full client-facing state. Runs quest sync so login/day-streak based quests update. */
export async function buildGameState(userId: number): Promise<GameState> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update")
    if (!user) throw new Error("User vanished")
    const now = new Date()
    const today = todayIso(now)

    const [day] = await tx.select({ taps: dailyStats.taps }).from(dailyStats).where(and(eq(dailyStats.userId, userId), eq(dailyStats.day, today)))
    const todayTaps = day?.taps ?? 0

    const rank = await rankOf(tx, user.totalTaps)
    if (user.bestRank === null || rank < user.bestRank) {
      await tx.update(users).set({ bestRank: rank }).where(eq(users.id, userId))
      user.bestRank = rank
    }

    const players = await playersCount(tx)
    const { all } = await syncQuests(tx, userId, await collectQuestMetrics(tx, user, todayTaps, players))
    const usage = await tapWindowUsage(tx, userId, today)
    const snap = trustSnapshot(user, now)
    const config = publicGameConfig()

    return {
      user: publicUser(user),
      totalTaps: user.totalTaps,
      todayTaps,
      bonusPoints: user.bonusPoints,
      rank,
      bestRank: user.bestRank,
      playersCount: players,
      trustLevel: snap.level,
      pausedUntil: snap.pausedUntil?.toISOString() ?? null,
      pauseReason: snap.pauseReason,
      needsVerification: snap.needsVerification,
      blockedReason: snap.blockedReason,
      limits: {
        dailyLimit: GAME_CONFIG.limits.perDay,
        dailyRemaining: Math.max(0, GAME_CONFIG.limits.perDay - usage.perDay),
        minuteLimit: GAME_CONFIG.limits.perMinute,
        minuteRemaining: Math.max(0, decideWindows({ ...usage, perDay: 0 }).allowance),
      },
      streakDays: user.streakDays,
      verificationsPassed: user.verificationsPassed,
      bestDayTaps: user.bestDayTaps,
      questsCompleted: all.filter((q) => q.status === "completed" || q.status === "claimed").length,
      questsTotal: all.length,
      quests: all,
      config: { batchFlushMs: config.batchFlushMs, maxTapsPerBatch: config.maxTapsPerBatch, heartbeatIntervalMs: config.heartbeatIntervalMs },
    }
  })
}
