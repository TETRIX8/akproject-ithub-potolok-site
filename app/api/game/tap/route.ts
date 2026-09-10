import { assertSameOrigin, handleError, json, readJson } from "@/lib/api/respond"
import { requestMeta, requireAuth } from "@/lib/auth/session"
import { consumeApiRequest } from "@/lib/game/rate-limit"
import { processTapBatch, validateTapPayload } from "@/lib/game/taps"

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
    const { user } = await requireAuth()
    await consumeApiRequest(user.id, "tap")
    const payload = validateTapPayload(await readJson(req, 1024))
    const meta = await requestMeta()
    const result = await processTapBatch(user.id, payload, meta)
    return json(result)
  } catch (err) {
    return handleError(err)
  }
}
