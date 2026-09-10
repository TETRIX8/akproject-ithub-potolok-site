import "server-only"
import { and, asc, eq, sql } from "drizzle-orm"
import type { Tx } from "@/lib/db"
import { quests, userQuests, users, type Quest, type User } from "@/lib/db/schema"
import type { QuestView } from "./types"
import { ApiError } from "@/lib/api/respond"

/**
 * Quest metrics are pluggable: add a key here + a row in `quests` and the rest of the
 * system (progress sync, UI, claiming) picks it up automatically.
 */
export interface QuestMetrics {
  total_taps: number
  daily_taps: number
  streak_days: number
  verifications_passed: number
  best_rank: number | null
  players_count: number
}

type MetricResolver = (m: QuestMetrics, quest: Quest) => number

const RESOLVERS: Record<string, MetricResolver> = {
  total_taps: (m) => m.total_taps,
  daily_taps: (m) => m.daily_taps,
  streak_days: (m) => m.streak_days,
  verifications_passed: (m) => m.verifications_passed,
  // Rank quests: "closeness" to the target rank, capped at target when achieved.
  // Only counts once the leaderboard has more players than the target, otherwise "top-10" is trivial.
  best_rank: (m, q) => {
    if (!m.best_rank || m.players_count <= q.target) return 0
    if (m.best_rank <= q.target) return q.target
    return Math.min(q.target - 1, Math.floor((q.target * q.target) / m.best_rank))
  },
}

export function questMetricsFromUser(user: User, todayTaps: number, playersCount: number): QuestMetrics {
  return {
    total_taps: user.totalTaps,
    daily_taps: todayTaps,
    streak_days: user.streakDays,
    verifications_passed: user.verificationsPassed,
    best_rank: user.bestRank,
    players_count: playersCount,
  }
}

function toView(q: Quest, uq: { progress: number; status: string } | undefined): QuestView {
  return {
    id: q.id,
    title: q.title,
    description: q.description,
    category: q.category,
    target: q.target,
    progress: uq?.progress ?? 0,
    rewardPoints: q.rewardPoints,
    status: (uq?.status as QuestView["status"]) ?? "available",
  }
}

/**
 * Recomputes progress for every active quest and persists changes.
 * Returns all quest views plus the ones that transitioned to `completed` in this call.
 * Never regresses a quest that is already completed/claimed (daily quests keep their achievement).
 */
export async function syncQuests(tx: Tx, userId: number, metrics: QuestMetrics): Promise<{ all: QuestView[]; newlyCompleted: QuestView[] }> {
  const defs = await tx.select().from(quests).where(eq(quests.isActive, true)).orderBy(asc(quests.sortOrder))
  const current = await tx.select().from(userQuests).where(eq(userQuests.userId, userId))
  const byId = new Map(current.map((r) => [r.questId, r]))

  const all: QuestView[] = []
  const newlyCompleted: QuestView[] = []
  const now = new Date()

  for (const q of defs) {
    const resolver = RESOLVERS[q.metric]
    const existing = byId.get(q.id)
    if (!resolver) {
      all.push(toView(q, existing))
      continue
    }
    if (existing && (existing.status === "completed" || existing.status === "claimed")) {
      all.push(toView(q, existing))
      continue
    }

    const raw = resolver(metrics, q)
    const progress = Math.max(existing?.progress ?? 0, Math.min(q.target, raw))
    const status: QuestView["status"] = progress >= q.target ? "completed" : progress > 0 ? "in_progress" : "available"

    if (!existing || existing.progress !== progress || existing.status !== status) {
      await tx
        .insert(userQuests)
        .values({ userId, questId: q.id, progress, status, completedAt: status === "completed" ? now : null, updatedAt: now })
        .onConflictDoUpdate({
          target: [userQuests.userId, userQuests.questId],
          set: { progress, status, completedAt: status === "completed" ? now : null, updatedAt: now },
        })
    }
    const view = toView(q, { progress, status })
    all.push(view)
    if (status === "completed" && existing?.status !== "completed") newlyCompleted.push(view)
  }

  return { all, newlyCompleted }
}

/** Marks a completed quest as claimed and credits its reward. Idempotent. */
export async function claimQuest(tx: Tx, userId: number, questId: string): Promise<{ quest: QuestView; bonusPoints: number }> {
  const [row] = await tx
    .select({ q: quests, uq: userQuests })
    .from(quests)
    .innerJoin(userQuests, and(eq(userQuests.questId, quests.id), eq(userQuests.userId, userId)))
    .where(eq(quests.id, questId))
    .for("update")

  if (!row) throw new ApiError(404, "QUEST_NOT_FOUND", "Квест не найден или ещё не начат")
  if (row.uq.status === "claimed") {
    const [u] = await tx.select({ bonusPoints: users.bonusPoints }).from(users).where(eq(users.id, userId))
    return { quest: toView(row.q, row.uq), bonusPoints: u?.bonusPoints ?? 0 }
  }
  if (row.uq.status !== "completed") throw new ApiError(409, "QUEST_NOT_COMPLETED", "Квест ещё не выполнен")

  const now = new Date()
  await tx
    .update(userQuests)
    .set({ status: "claimed", claimedAt: now, updatedAt: now })
    .where(and(eq(userQuests.userId, userId), eq(userQuests.questId, questId)))
  const [u] = await tx
    .update(users)
    .set({ bonusPoints: sql`${users.bonusPoints} + ${row.q.rewardPoints}`, updatedAt: now })
    .where(eq(users.id, userId))
    .returning({ bonusPoints: users.bonusPoints })

  return { quest: toView(row.q, { progress: row.uq.progress, status: "claimed" }), bonusPoints: u.bonusPoints }
}
