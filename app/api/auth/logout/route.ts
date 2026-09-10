import { and, eq } from "drizzle-orm"
import { assertSameOrigin, handleError, json } from "@/lib/api/respond"
import { destroyAuthSession, getAuth } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { gameSessions } from "@/lib/db/schema"

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
    const ctx = await getAuth()
    if (ctx) {
      await db
        .update(gameSessions)
        .set({ status: "ended", endedAt: new Date(), endReason: "logout" })
        .where(and(eq(gameSessions.authSessionId, ctx.sessionId), eq(gameSessions.status, "active")))
    }
    await destroyAuthSession()
    return json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
