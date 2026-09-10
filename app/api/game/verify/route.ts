import { assertSameOrigin, fail, handleError, json, readJson } from "@/lib/api/respond"
import { requireAuth } from "@/lib/auth/session"
import { consumeApiRequest } from "@/lib/game/rate-limit"
import { answerChallenge, getOrCreateChallenge } from "@/lib/game/verification"

/** GET — fetch (or generate) the pending human-verification challenge. */
export async function GET() {
  try {
    const { user } = await requireAuth()
    await consumeApiRequest(user.id)
    return json({ ok: true, challenge: await getOrCreateChallenge(user.id) })
  } catch (err) {
    return handleError(err)
  }
}

/** POST — submit an answer. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
    const { user } = await requireAuth()
    await consumeApiRequest(user.id)
    const body = await readJson<{ challengeId?: unknown; answerIndex?: unknown }>(req)
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : ""
    const answerIndex = typeof body.answerIndex === "number" ? body.answerIndex : -1
    if (!challengeId) return fail(400, "BAD_PAYLOAD", "Нет идентификатора задания")
    const result = await answerChallenge(user.id, challengeId, answerIndex)
    if (!result.passed && result.attemptsLeft === 0) {
      result.next = await getOrCreateChallenge(user.id)
    }
    return json({ ok: true, result })
  } catch (err) {
    return handleError(err)
  }
}
