import "server-only"
import { randomInt } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { dailyStats, users, verificationChallenges, type User } from "@/lib/db/schema"
import { newId } from "@/lib/auth/session"
import { GAME_CONFIG } from "./config"
import { logAntiCheat, raiseSuspicion, relieveSuspicion, trustSnapshot } from "./anticheat"
import type { ChallengeView } from "./types"
import { ApiError } from "@/lib/api/respond"

interface GeneratedChallenge {
  kind: string
  prompt: string
  options: string[]
  answerIndex: number
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function withDistractors(correct: number, spread: number): { options: string[]; answerIndex: number } {
  const set = new Set<number>([correct])
  while (set.size < 4) {
    const delta = randomInt(1, spread + 1) * (randomInt(0, 2) ? 1 : -1)
    const candidate = correct + delta
    if (candidate >= 0) set.add(candidate)
  }
  const options = shuffle([...set]).map(String)
  return { options, answerIndex: options.indexOf(String(correct)) }
}

const GENERATORS: Array<() => GeneratedChallenge> = [
  () => {
    const a = randomInt(2, 13)
    const b = randomInt(2, 13)
    return { kind: "math_add", prompt: `Сколько будет ${a} + ${b}?`, ...withDistractors(a + b, 4) }
  },
  () => {
    const a = randomInt(10, 30)
    const b = randomInt(1, a)
    return { kind: "math_sub", prompt: `Сколько будет ${a} − ${b}?`, ...withDistractors(a - b, 4) }
  },
  () => {
    const a = randomInt(2, 10)
    const b = randomInt(2, 10)
    return { kind: "math_mul", prompt: `Сколько будет ${a} × ${b}?`, ...withDistractors(a * b, 6) }
  },
  () => {
    const start = randomInt(1, 10)
    const step = randomInt(2, 6)
    const seq = [start, start + step, start + 2 * step, start + 3 * step]
    return { kind: "sequence", prompt: `Продолжите последовательность: ${seq.join(", ")}, …`, ...withDistractors(start + 4 * step, 3) }
  },
  () => {
    const shapes = [
      ["круг", "●"],
      ["квадрат", "■"],
      ["треугольник", "▲"],
      ["ромб", "◆"],
    ]
    const idx = randomInt(0, shapes.length)
    const options = shuffle(shapes.map((s) => s[1]))
    return { kind: "shape", prompt: `Выберите ${shapes[idx][0]}`, options, answerIndex: options.indexOf(shapes[idx][1]) }
  },
  () => {
    const words = ["яблоко", "мяч", "книга", "стол", "окно", "река"]
    const count = randomInt(2, 6)
    const w = words[randomInt(0, words.length)]
    const list = Array.from({ length: count }, () => w).join(", ")
    return { kind: "count", prompt: `Сколько раз здесь встречается слово: ${list}?`, ...withDistractors(count, 2) }
  },
  () => {
    const n = randomInt(3, 40)
    const options = shuffle(["Чётное", "Нечётное", "Отрицательное", "Дробное"])
    const correct = n % 2 === 0 ? "Чётное" : "Нечётное"
    return { kind: "parity", prompt: `Число ${n} — какое?`, options, answerIndex: options.indexOf(correct) }
  },
]

function generate(): GeneratedChallenge {
  return GENERATORS[randomInt(0, GENERATORS.length)]()
}

function toView(c: typeof verificationChallenges.$inferSelect): ChallengeView {
  return {
    id: c.id,
    kind: c.kind,
    prompt: c.prompt,
    options: c.options,
    expiresAt: c.expiresAt.toISOString(),
    attemptsLeft: Math.max(0, GAME_CONFIG.verification.maxAttempts - c.attempts),
  }
}

/** Returns the pending challenge for the user or creates a fresh one. Never reuses a solved challenge. */
export async function getOrCreateChallenge(userId: number): Promise<ChallengeView> {
  const now = new Date()
  const [pending] = await db
    .select()
    .from(verificationChallenges)
    .where(and(eq(verificationChallenges.userId, userId), eq(verificationChallenges.status, "pending")))
    .limit(1)

  if (pending && pending.expiresAt > now && pending.attempts < GAME_CONFIG.verification.maxAttempts) return toView(pending)

  if (pending) {
    await db
      .update(verificationChallenges)
      .set({ status: "expired", resolvedAt: now })
      .where(eq(verificationChallenges.id, pending.id))
  }

  const g = generate()
  const [created] = await db
    .insert(verificationChallenges)
    .values({
      id: newId(12),
      userId,
      kind: g.kind,
      prompt: g.prompt,
      options: g.options,
      answerIndex: g.answerIndex,
      expiresAt: new Date(now.getTime() + GAME_CONFIG.verification.challengeTtlSeconds * 1000),
    })
    .returning()
  return toView(created)
}

export interface VerifyResult {
  passed: boolean
  attemptsLeft: number
  pausedUntil: string | null
  trustLevel: string
  next?: ChallengeView
}

export async function answerChallenge(userId: number, challengeId: string, answerIndex: number): Promise<VerifyResult> {
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 5) {
    throw new ApiError(400, "BAD_ANSWER", "Некорректный ответ")
  }

  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update")
    if (!user) throw new ApiError(404, "USER_NOT_FOUND", "Пользователь не найден")

    const [challenge] = await tx
      .select()
      .from(verificationChallenges)
      .where(and(eq(verificationChallenges.id, challengeId), eq(verificationChallenges.userId, userId)))
      .for("update")
    if (!challenge || challenge.status !== "pending") throw new ApiError(410, "CHALLENGE_GONE", "Задание устарело. Запросите новое.")

    const now = new Date()
    if (challenge.expiresAt <= now) {
      await tx.update(verificationChallenges).set({ status: "expired", resolvedAt: now }).where(eq(verificationChallenges.id, challenge.id))
      throw new ApiError(410, "CHALLENGE_EXPIRED", "Время на ответ истекло. Запросите новое задание.")
    }

    const attempts = challenge.attempts + 1
    const passed = challenge.answerIndex === answerIndex

    if (passed) {
      await tx
        .update(verificationChallenges)
        .set({ status: "passed", attempts, resolvedAt: now })
        .where(eq(verificationChallenges.id, challenge.id))
      await tx
        .update(users)
        .set({ verificationsPassed: sql`${users.verificationsPassed} + 1`, updatedAt: now })
        .where(eq(users.id, userId))
      const today = now.toISOString().slice(0, 10)
      await tx
        .insert(dailyStats)
        .values({ userId, day: today, verificationsPassed: 1 })
        .onConflictDoUpdate({ target: [dailyStats.userId, dailyStats.day], set: { verificationsPassed: sql`${dailyStats.verificationsPassed} + 1` } })
      const change = await relieveSuspicion(tx, user, now)
      await logAntiCheat(tx, { userId, eventType: "verification_passed", severity: 0, suspicionScore: change.score, actionApplied: change.after, details: { challengeId, kind: challenge.kind, attempts } })
      const snap = trustSnapshot({ ...user, verificationsPassed: user.verificationsPassed + 1 } as User, now)
      return { passed: true, attemptsLeft: 0, pausedUntil: snap.pausedUntil?.toISOString() ?? null, trustLevel: snap.level }
    }

    const exhausted = attempts >= GAME_CONFIG.verification.maxAttempts
    await tx
      .update(verificationChallenges)
      .set({ status: exhausted ? "failed" : "pending", attempts, resolvedAt: exhausted ? now : null })
      .where(eq(verificationChallenges.id, challenge.id))

    const change = await raiseSuspicion(tx, user, GAME_CONFIG.suspicion.verificationFailed, now)
    // Always apply at least the failed-verification cooldown.
    const cooldownUntil = new Date(now.getTime() + GAME_CONFIG.cooldown.failedVerificationSeconds * 1000)
    if (!user.restrictedUntil || user.restrictedUntil < cooldownUntil) {
      await tx.update(users).set({ restrictedUntil: cooldownUntil }).where(eq(users.id, userId))
      user.restrictedUntil = cooldownUntil
    }
    await logAntiCheat(tx, { userId, eventType: "verification_failed", severity: 3, suspicionScore: change.score, actionApplied: `cooldown:${GAME_CONFIG.cooldown.failedVerificationSeconds}s`, details: { challengeId, kind: challenge.kind, attempts } })

    const snap = trustSnapshot(user, now)
    return {
      passed: false,
      attemptsLeft: Math.max(0, GAME_CONFIG.verification.maxAttempts - attempts),
      pausedUntil: snap.pausedUntil?.toISOString() ?? null,
      trustLevel: snap.level,
    }
  })
}
