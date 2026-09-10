import "server-only"

/**
 * In-memory brute-force guard for the login endpoint (per ip+email). Best effort per
 * instance; NewLXP itself remains the authority for credential validation.
 */
const WINDOW_MS = 10 * 60_000
const MAX_FAILURES = 8

const failures = new Map<string, { count: number; first: number }>()

export function checkLoginAttempts(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const entry = failures.get(key)
  if (!entry) return { allowed: true }
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(key)
    return { allowed: true }
  }
  if (entry.count >= MAX_FAILURES) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.first + WINDOW_MS - Date.now()) / 1000) }
  }
  return { allowed: true }
}

export function recordLoginFailure(key: string) {
  const entry = failures.get(key)
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    failures.set(key, { count: 1, first: Date.now() })
  } else {
    entry.count += 1
  }
  if (failures.size > 5000) {
    const cutoff = Date.now() - WINDOW_MS
    for (const [k, v] of failures) if (v.first < cutoff) failures.delete(k)
  }
}
