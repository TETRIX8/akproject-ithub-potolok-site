/**
 * Central game tuning. Every number an operator might want to change lives here.
 * Env overrides use the GAME_ prefix (e.g. GAME_DAILY_TAP_LIMIT=5000).
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[`GAME_${name}`]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[`GAME_${name}`]
  if (!raw) return fallback
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const GAME_CONFIG = {
  /** Client groups taps into a batch and flushes every N ms. */
  batchFlushMs: envInt("BATCH_FLUSH_MS", 350),
  /** Hard ceiling on taps a single batch may carry. Anything above is rejected outright. */
  maxTapsPerBatch: envInt("MAX_TAPS_PER_BATCH", 25),
  /** Physical human ceiling used for per-batch plausibility (taps / second). */
  maxHumanTapsPerSecond: envFloat("MAX_HUMAN_TPS", 14),

  limits: {
    /** Sliding windows — bucket size in seconds -> max taps in that window. */
    per10s: envInt("LIMIT_10S", 90),
    perMinute: envInt("LIMIT_1M", 420),
    per5Minutes: envInt("LIMIT_5M", 1800),
    perDay: envInt("DAILY_TAP_LIMIT", 20000),
    /** API requests (any endpoint) per minute per user. */
    apiRequestsPerMinute: envInt("API_RPM", 240),
  },

  cooldown: {
    /** Seconds the tapper is paused when a sliding window is exhausted. */
    windowExceededSeconds: envInt("COOLDOWN_WINDOW_SEC", 30),
    /** Seconds after a failed verification. */
    failedVerificationSeconds: envInt("COOLDOWN_VERIFY_FAIL_SEC", 60),
    /** Seconds applied when entering the restricted state. */
    restrictedSeconds: envInt("RESTRICTED_SEC", 600),
  },

  suspicion: {
    /** Score points added per detected anomaly. */
    fastBatch: 4,
    tooManyBatches: 3,
    robotRhythm: 6,
    windowExceeded: 5,
    verificationFailed: 12,
    duplicateBatch: 1,
    /** Points removed per minute of clean play. */
    decayPerMinute: envFloat("SUSPICION_DECAY", 2),
    /** Score thresholds for trust-level transitions. */
    thresholds: {
      suspicious: 8,
      verification: 16,
      cooldown: 30,
      restricted: 50,
      blocked: 90,
    },
    /** Score reset applied after a passed verification. */
    verificationPassReduction: 14,
  },

  verification: {
    challengeTtlSeconds: envInt("VERIFY_TTL_SEC", 120),
    maxAttempts: 2,
  },

  session: {
    authSessionDays: envInt("AUTH_SESSION_DAYS", 14),
    heartbeatIntervalMs: envInt("HEARTBEAT_MS", 15000),
    /** A game session is considered abandoned after this many seconds without a heartbeat. */
    gameSessionTtlSeconds: envInt("GAME_SESSION_TTL_SEC", 45),
  },

  leaderboard: {
    pageSize: envInt("LEADERBOARD_PAGE", 50),
  },
} as const

export type TrustLevel = "normal" | "suspicious" | "verification" | "cooldown" | "restricted" | "blocked"

export const TRUST_ORDER: TrustLevel[] = ["normal", "suspicious", "verification", "cooldown", "restricted", "blocked"]

export function trustLevelForScore(score: number): TrustLevel {
  const t = GAME_CONFIG.suspicion.thresholds
  if (score >= t.blocked) return "blocked"
  if (score >= t.restricted) return "restricted"
  if (score >= t.cooldown) return "cooldown"
  if (score >= t.verification) return "verification"
  if (score >= t.suspicious) return "suspicious"
  return "normal"
}

/** Public subset of the config safe to ship to the browser. */
export function publicGameConfig() {
  return {
    batchFlushMs: GAME_CONFIG.batchFlushMs,
    maxTapsPerBatch: GAME_CONFIG.maxTapsPerBatch,
    heartbeatIntervalMs: GAME_CONFIG.session.heartbeatIntervalMs,
    dailyLimit: GAME_CONFIG.limits.perDay,
    perMinuteLimit: GAME_CONFIG.limits.perMinute,
  }
}
