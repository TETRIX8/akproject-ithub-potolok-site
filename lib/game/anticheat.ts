import "server-only"
import { eq } from "drizzle-orm"
import type { Tx } from "@/lib/db"
import { antiCheatEvents, users, type User } from "@/lib/db/schema"
import { GAME_CONFIG, trustLevelForScore, type TrustLevel } from "./config"

export type AntiCheatEventType =
  | "fast_batch"
  | "too_many_batches"
  | "robot_rhythm"
  | "window_exceeded"
  | "verification_failed"
  | "verification_passed"
  | "duplicate_batch"
  | "invalid_payload"
  | "session_conflict"
  | "trust_level_changed"
  | "api_rate_limited"

export interface AntiCheatLog {
  userId: number
  gameSessionId?: string | null
  eventType: AntiCheatEventType
  severity?: number
  requestsCount?: number
  tapsPerSecond?: number
  suspicionScore?: number
  actionApplied?: string
  details?: Record<string, unknown>
  ipHash?: string | null
  userAgent?: string | null
}

export async function logAntiCheat(tx: Tx, e: AntiCheatLog) {
  await tx.insert(antiCheatEvents).values({
    userId: e.userId,
    gameSessionId: e.gameSessionId ?? null,
    eventType: e.eventType,
    severity: e.severity ?? 1,
    requestsCount: e.requestsCount ?? null,
    tapsPerSecond: e.tapsPerSecond ?? null,
    suspicionScore: e.suspicionScore ?? null,
    actionApplied: e.actionApplied ?? null,
    details: e.details ?? null,
    ipHash: e.ipHash ?? null,
    userAgent: e.userAgent ?? null,
  })
}

/** Applies linear decay to the stored suspicion score. */
export function decayedScore(user: Pick<User, "suspicionScore" | "suspicionUpdatedAt">, now = new Date()): number {
  const minutes = Math.max(0, (now.getTime() - user.suspicionUpdatedAt.getTime()) / 60_000)
  return Math.max(0, user.suspicionScore - minutes * GAME_CONFIG.suspicion.decayPerMinute)
}

export interface TrustSnapshot {
  score: number
  level: TrustLevel
  pausedUntil: Date | null
  pauseReason: string | null
  needsVerification: boolean
  blockedReason: string | null
}

/**
 * Derives the effective trust snapshot for a user at `now`.
 * - blocked: permanent until an operator clears blocked_reason.
 * - restricted / cooldown: taps paused until restricted_until, then verification is required.
 * - verification: taps paused until a challenge is passed.
 * - suspicious / normal: taps allowed.
 */
export function trustSnapshot(user: User, now = new Date()): TrustSnapshot {
  if (user.blockedReason) {
    return { score: user.suspicionScore, level: "blocked", pausedUntil: null, pauseReason: user.blockedReason, needsVerification: false, blockedReason: user.blockedReason }
  }
  const score = decayedScore(user, now)
  const level = trustLevelForScore(score)
  const paused = user.restrictedUntil && user.restrictedUntil > now ? user.restrictedUntil : null

  if (level === "blocked") {
    return { score, level, pausedUntil: null, pauseReason: "Игровая функция заблокирована из-за многократных нарушений.", needsVerification: false, blockedReason: "auto" }
  }
  if (paused) {
    const reason =
      level === "restricted"
        ? "Усиленное ограничение из-за подозрительной активности."
        : "Слишком высокая активность. Подождите немного."
    return { score, level, pausedUntil: paused, pauseReason: reason, needsVerification: false, blockedReason: null }
  }
  const needsVerification = level === "verification" || level === "cooldown" || level === "restricted"
  return { score, level, pausedUntil: null, pauseReason: null, needsVerification, blockedReason: null }
}

export interface SuspicionChange {
  before: TrustLevel
  after: TrustLevel
  score: number
}

/**
 * Adds suspicion points and persists the resulting trust level, cooldowns and (if reached) a block.
 * Must run inside the transaction that holds the user row lock.
 */
export async function raiseSuspicion(tx: Tx, user: User, points: number, now = new Date()): Promise<SuspicionChange> {
  const before = trustLevelForScore(decayedScore(user, now))
  const score = Math.min(200, decayedScore(user, now) + points)
  const after = trustLevelForScore(score)

  const patch: Partial<typeof users.$inferInsert> = {
    suspicionScore: score,
    suspicionUpdatedAt: now,
    trustLevel: after,
    updatedAt: now,
  }

  if (after !== before) {
    if (after === "cooldown") {
      patch.restrictedUntil = new Date(now.getTime() + GAME_CONFIG.cooldown.windowExceededSeconds * 1000)
    } else if (after === "restricted") {
      patch.restrictedUntil = new Date(now.getTime() + GAME_CONFIG.cooldown.restrictedSeconds * 1000)
    } else if (after === "blocked") {
      patch.blockedReason = "Автоматическая блокировка: многократные нарушения правил игры."
    }
  }

  await tx.update(users).set(patch).where(eq(users.id, user.id))
  // Mutate the in-memory copy so later steps in the same transaction see the new values.
  Object.assign(user, patch)

  if (after !== before) {
    await logAntiCheat(tx, {
      userId: user.id,
      eventType: "trust_level_changed",
      severity: Math.max(1, ["normal", "suspicious", "verification", "cooldown", "restricted", "blocked"].indexOf(after)),
      suspicionScore: score,
      actionApplied: after,
      details: { from: before, to: after },
    })
  }
  return { before, after, score }
}

/** Lowers suspicion after a successful human verification. */
export async function relieveSuspicion(tx: Tx, user: User, now = new Date()): Promise<SuspicionChange> {
  const before = trustLevelForScore(decayedScore(user, now))
  const score = Math.max(0, decayedScore(user, now) - GAME_CONFIG.suspicion.verificationPassReduction)
  // A passed verification always drops the player out of the verification tier.
  const capped = Math.min(score, GAME_CONFIG.suspicion.thresholds.verification - 1)
  const after = trustLevelForScore(capped)
  const patch = { suspicionScore: capped, suspicionUpdatedAt: now, trustLevel: after, restrictedUntil: null, updatedAt: now }
  await tx.update(users).set(patch).where(eq(users.id, user.id))
  Object.assign(user, patch)
  return { before, after, score: capped }
}
