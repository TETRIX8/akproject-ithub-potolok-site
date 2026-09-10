import "server-only"
import { and, eq, gt, sql } from "drizzle-orm"
import { db, type Tx } from "@/lib/db"
import { dailyStats, rateLimits, tapEvents } from "@/lib/db/schema"
import { GAME_CONFIG } from "./config"
import { ApiError } from "@/lib/api/respond"

/**
 * Fixed-window API request counter (per user, per minute). Uses an upsert so concurrent
 * requests are counted atomically by Postgres.
 */
export async function consumeApiRequest(userId: number, bucket = "api"): Promise<void> {
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000)
  const [row] = await db
    .insert(rateLimits)
    .values({ userId, bucket, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.userId, rateLimits.bucket, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count })

  if (row.count > GAME_CONFIG.limits.apiRequestsPerMinute) {
    const retryAfter = Math.ceil((windowStart.getTime() + 60_000 - Date.now()) / 1000)
    throw new ApiError(429, "API_RATE_LIMITED", "Слишком много запросов. Попробуйте позже.", { retryAfterSeconds: retryAfter })
  }

  // Opportunistic cleanup of old windows (cheap; runs occasionally).
  if (Math.random() < 0.02) {
    void db
      .delete(rateLimits)
      .where(sql`${rateLimits.windowStart} < now() - interval '1 day'`)
      .catch(() => {})
  }
}

export interface WindowUsage {
  per10s: number
  perMinute: number
  per5Minutes: number
  perDay: number
}

export async function tapWindowUsage(tx: Tx, userId: number, today: string): Promise<WindowUsage> {
  const [win] = await tx
    .select({
      per10s: sql<number>`coalesce(sum(case when ${tapEvents.createdAt} > now() - interval '10 seconds' then ${tapEvents.acceptedTaps} else 0 end), 0)::int`,
      perMinute: sql<number>`coalesce(sum(case when ${tapEvents.createdAt} > now() - interval '60 seconds' then ${tapEvents.acceptedTaps} else 0 end), 0)::int`,
      per5Minutes: sql<number>`coalesce(sum(${tapEvents.acceptedTaps}), 0)::int`,
    })
    .from(tapEvents)
    .where(and(eq(tapEvents.userId, userId), gt(tapEvents.createdAt, sql`now() - interval '5 minutes'`)))

  const [day] = await tx
    .select({ taps: dailyStats.taps })
    .from(dailyStats)
    .where(and(eq(dailyStats.userId, userId), eq(dailyStats.day, today)))

  return {
    per10s: win?.per10s ?? 0,
    perMinute: win?.perMinute ?? 0,
    per5Minutes: win?.per5Minutes ?? 0,
    perDay: day?.taps ?? 0,
  }
}

export interface WindowDecision {
  /** How many taps the sliding windows still allow right now. */
  allowance: number
  /** Which window is the binding constraint (null when none are exhausted). */
  exhausted: keyof WindowUsage | null
}

export function decideWindows(usage: WindowUsage, multiplier = 1): WindowDecision {
  const L = GAME_CONFIG.limits
  const caps: Record<keyof WindowUsage, number> = {
    per10s: Math.floor(L.per10s * multiplier),
    perMinute: Math.floor(L.perMinute * multiplier),
    per5Minutes: Math.floor(L.per5Minutes * multiplier),
    perDay: L.perDay,
  }
  let allowance = Number.POSITIVE_INFINITY
  let exhausted: keyof WindowUsage | null = null
  for (const key of Object.keys(caps) as (keyof WindowUsage)[]) {
    const left = caps[key] - usage[key]
    if (left < allowance) {
      allowance = left
      exhausted = left <= 0 ? key : exhausted
    }
  }
  return { allowance: Math.max(0, allowance), exhausted: allowance <= 0 ? exhausted : null }
}
