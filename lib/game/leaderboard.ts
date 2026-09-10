import "server-only"
import { asc, desc, eq, gt, sql } from "drizzle-orm"
import { db, type Tx } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { GAME_CONFIG } from "./config"
import type { LeaderboardEntry, LeaderboardResponse } from "./types"

type Executor = Tx | typeof db

/** Competition rank: 1 + number of players with strictly more taps. Ties share a rank. */
export async function rankOf(exec: Executor, totalTaps: number): Promise<number> {
  const [row] = await exec.select({ c: sql<number>`count(*)::int` }).from(users).where(gt(users.totalTaps, totalTaps))
  return (row?.c ?? 0) + 1
}

export async function playersCount(exec: Executor): Promise<number> {
  const [row] = await exec.select({ c: sql<number>`count(*)::int` }).from(users)
  return row?.c ?? 0
}

export async function leaderboard(meId: number | null, limit = GAME_CONFIG.leaderboard.pageSize): Promise<LeaderboardResponse> {
  const rows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      totalTaps: users.totalTaps,
      rank: sql<number>`rank() over (order by ${users.totalTaps} desc)::int`,
    })
    .from(users)
    .orderBy(desc(users.totalTaps), asc(users.id))
    .limit(limit)

  const entries: LeaderboardEntry[] = rows.map((r) => ({ ...r, isMe: r.userId === meId }))

  let me: LeaderboardEntry | null = entries.find((e) => e.isMe) ?? null
  if (!me && meId) {
    const [u] = await db
      .select({ userId: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl, totalTaps: users.totalTaps })
      .from(users)
      .where(eq(users.id, meId))
    if (u) me = { ...u, rank: await rankOf(db, u.totalTaps), isMe: true }
  }

  return { entries, me, playersCount: await playersCount(db), generatedAt: new Date().toISOString() }
}
