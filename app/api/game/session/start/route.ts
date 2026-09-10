import { assertSameOrigin, handleError, json, readJson } from "@/lib/api/respond"
import { requireAuth } from "@/lib/auth/session"
import { consumeApiRequest } from "@/lib/game/rate-limit"
import { SessionConflict, startGameSession } from "@/lib/game/session"
import { buildGameState } from "@/lib/game/state"

function deviceLabel(ua: string | null): string | null {
  if (!ua) return null
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Устройство"
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Браузер"
  return `${browser} · ${os}`
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
    const { user, sessionId } = await requireAuth()
    await consumeApiRequest(user.id)
    const body = await readJson<{ takeover?: unknown }>(req).catch(() => ({}) as { takeover?: unknown })
    const takeover = body.takeover === true

    try {
      const gs = await startGameSession({ userId: user.id, authSessionId: sessionId, deviceLabel: deviceLabel(req.headers.get("user-agent")), takeover })
      return json({ ok: true, sessionId: gs.id, state: await buildGameState(user.id) })
    } catch (err) {
      if (err instanceof SessionConflict) {
        return json(
          {
            ok: false,
            error: {
              code: "SESSION_ACTIVE",
              message: err.message,
              canTakeover: true,
              sameDevice: err.sameDevice,
              deviceLabel: err.existing.deviceLabel,
              lastHeartbeatAt: err.existing.lastHeartbeatAt.toISOString(),
            },
          },
          { status: 409 },
        )
      }
      throw err
    }
  } catch (err) {
    return handleError(err)
  }
}
