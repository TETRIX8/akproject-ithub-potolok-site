import {
  bigint,
  bigserial,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  lxpId: text("lxp_id").notNull().unique(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  totalTaps: bigint("total_taps", { mode: "number" }).notNull().default(0),
  bonusPoints: bigint("bonus_points", { mode: "number" }).notNull().default(0),
  bestDayTaps: integer("best_day_taps").notNull().default(0),
  bestRank: integer("best_rank"),
  streakDays: integer("streak_days").notNull().default(0),
  lastActiveDate: date("last_active_date"),
  verificationsPassed: integer("verifications_passed").notNull().default(0),
  trustLevel: text("trust_level").notNull().default("normal"),
  suspicionScore: real("suspicion_score").notNull().default(0),
  suspicionUpdatedAt: timestamp("suspicion_updated_at", { withTimezone: true }).notNull().defaultNow(),
  restrictedUntil: timestamp("restricted_until", { withTimezone: true }),
  blockedReason: text("blocked_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
})

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  lxpAccessToken: text("lxp_access_token"),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
})

export const gameSessions = pgTable("game_sessions", {
  id: text("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  authSessionId: text("auth_session_id").notNull(),
  deviceLabel: text("device_label"),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  endReason: text("end_reason"),
  tapsInSession: integer("taps_in_session").notNull().default(0),
  lastBatchSeq: bigint("last_batch_seq", { mode: "number" }).notNull().default(0),
})

export const tapEvents = pgTable(
  "tap_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    gameSessionId: text("game_session_id").notNull(),
    batchId: text("batch_id").notNull(),
    requestedTaps: integer("requested_taps").notNull(),
    acceptedTaps: integer("accepted_taps").notNull(),
    clientDurationMs: integer("client_duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("tap_events_batch_unique").on(t.gameSessionId, t.batchId)],
)

export const dailyStats = pgTable(
  "daily_stats",
  {
    userId: bigint("user_id", { mode: "number" }).notNull(),
    day: date("day").notNull(),
    taps: integer("taps").notNull().default(0),
    logins: integer("logins").notNull().default(0),
    verificationsPassed: integer("verifications_passed").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
)

export const rateLimits = pgTable(
  "rate_limits",
  {
    userId: bigint("user_id", { mode: "number" }).notNull(),
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.bucket, t.windowStart] })],
)

export const antiCheatEvents = pgTable("anti_cheat_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  gameSessionId: text("game_session_id"),
  eventType: text("event_type").notNull(),
  severity: integer("severity").notNull().default(1),
  requestsCount: integer("requests_count"),
  tapsPerSecond: real("taps_per_second"),
  suspicionScore: real("suspicion_score"),
  actionApplied: text("action_applied"),
  details: jsonb("details"),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const verificationChallenges = pgTable("verification_challenges", {
  id: text("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  kind: text("kind").notNull(),
  prompt: text("prompt").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  answerIndex: integer("answer_index").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
})

export const quests = pgTable("quests", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  metric: text("metric").notNull(),
  target: integer("target").notNull(),
  rewardPoints: integer("reward_points").notNull().default(0),
  category: text("category").notNull().default("general"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const userQuests = pgTable(
  "user_quests",
  {
    userId: bigint("user_id", { mode: "number" }).notNull(),
    questId: text("quest_id").notNull(),
    progress: integer("progress").notNull().default(0),
    status: text("status").notNull().default("available"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questId] })],
)

export type User = typeof users.$inferSelect
export type Quest = typeof quests.$inferSelect
export type UserQuest = typeof userQuests.$inferSelect
export type GameSession = typeof gameSessions.$inferSelect
