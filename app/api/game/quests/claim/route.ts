import { assertSameOrigin, fail, handleError, json, readJson } from "@/lib/api/respond"
import { requireAuth } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { claimQuest } from "@/lib/game/quests"
import { consumeApiRequest } from "@/lib/game/rate-limit"

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
    const { user } = await requireAuth()
    await consumeApiRequest(user.id)
    const body = await readJson<{ questId?: unknown }>(req)
    const questId = typeof body.questId === "string" && /^[a-z0-9_]{1,64}$/.test(body.questId) ? body.questId : ""
    if (!questId) return fail(400, "BAD_PAYLOAD", "Некорректный квест")
    const result = await db.transaction((tx) => claimQuest(tx, user.id, questId))
    return json({ ok: true, ...result })
  } catch (err) {
    return handleError(err)
  }
}
