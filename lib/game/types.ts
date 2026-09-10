import type { TrustLevel } from "./config"

export interface PublicUser {
  id: number
  displayName: string
  email: string
  avatarUrl: string | null
}

export interface QuestView {
  id: string
  title: string
  description: string
  category: string
  target: number
  progress: number
  rewardPoints: number
  status: "available" | "in_progress" | "completed" | "claimed"
}

export interface GameState {
  user: PublicUser
  totalTaps: number
  todayTaps: number
  bonusPoints: number
  rank: number
  bestRank: number | null
  playersCount: number
  trustLevel: TrustLevel
  /** ISO timestamp until which taps are paused (cooldown/restricted). */
  pausedUntil: string | null
  pauseReason: string | null
  needsVerification: boolean
  blockedReason: string | null
  limits: {
    dailyLimit: number
    dailyRemaining: number
    minuteLimit: number
    minuteRemaining: number
  }
  streakDays: number
  verificationsPassed: number
  bestDayTaps: number
  questsCompleted: number
  questsTotal: number
  quests: QuestView[]
  config: {
    batchFlushMs: number
    maxTapsPerBatch: number
    heartbeatIntervalMs: number
  }
}

export interface TapBatchRequest {
  sessionId: string
  batchId: string
  taps: number
  /** Milliseconds between first and last tap in this batch as measured by the client. */
  durationMs: number
}

export interface TapBatchResult {
  ok: true
  duplicate: boolean
  accepted: number
  rejected: number
  totalTaps: number
  todayTaps: number
  rank: number
  trustLevel: TrustLevel
  pausedUntil: string | null
  pauseReason: string | null
  needsVerification: boolean
  limits: GameState["limits"]
  newlyCompletedQuests: QuestView[]
}

export interface ChallengeView {
  id: string
  kind: string
  prompt: string
  options: string[]
  expiresAt: string
  attemptsLeft: number
}

export interface LeaderboardEntry {
  rank: number
  userId: number
  displayName: string
  avatarUrl: string | null
  totalTaps: number
  isMe: boolean
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  me: LeaderboardEntry | null
  playersCount: number
  generatedAt: string
}

export type SessionStartResponse =
  | { ok: true; sessionId: string; state: GameState }
  | {
      ok: false
      error: {
        code: "SESSION_ACTIVE"
        message: string
        canTakeover: boolean
        sameDevice: boolean
        deviceLabel: string | null
        lastHeartbeatAt: string
      }
    }
