import { assertSameOrigin, fail, handleError, json, readJson } from "@/lib/api/respond"
import { createAuthSession, hashIp, upsertUserFromLxp } from "@/lib/auth/session"
import { lxpSignIn } from "@/lib/lxp/client"
import { publicUser } from "@/lib/game/state"
import { checkLoginAttempts, recordLoginFailure } from "@/lib/auth/login-guard"

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
    const body = await readJson<{ email?: unknown; password?: unknown }>(req)
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
    const password = typeof body.password === "string" ? body.password : ""
    if (!email || !password || email.length > 254 || password.length > 256 || !email.includes("@")) {
      return fail(400, "BAD_CREDENTIALS", "Введите корректный email и пароль")
    }

    const ipHash = hashIp(req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip"))
    const gate = checkLoginAttempts(`${ipHash}:${email}`)
    if (!gate.allowed) return fail(429, "LOGIN_RATE_LIMITED", "Слишком много попыток входа. Попробуйте позже.", { retryAfterSeconds: gate.retryAfterSeconds })

    let signIn
    try {
      signIn = await lxpSignIn(email, password)
    } catch (err) {
      recordLoginFailure(`${ipHash}:${email}`)
      throw err
    }

    const user = await upsertUserFromLxp(signIn.user)
    await createAuthSession(user.id, signIn.accessToken)
    return json({ ok: true, user: publicUser(user) })
  } catch (err) {
    return handleError(err)
  }
}
