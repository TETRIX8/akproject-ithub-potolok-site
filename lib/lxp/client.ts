/**
 * Server-only NewLXP GraphQL client.
 * Mirrors the SignIn / GetMe operations from the original Flask gateway (legacy/lxp_gateway.py).
 */
import "server-only"

const LXP_ENDPOINT = process.env.LXP_GRAPHQL_URL ?? "https://api.newlxp.ru/graphql"
const LXP_TIMEOUT_MS = 12_000

// NewLXP exposes signIn as a *query* (verified against the live API and the legacy gateway).
const SIGN_IN_QUERY = `
query SignIn($input: SignInInput!) {
  signIn(input: $input) {
    user { id isLead __typename }
    accessToken
    __typename
  }
}`

const GET_ME_QUERY = `
query GetMe {
  getMe {
    id
    email
    firstName
    lastName
    avatar
    isLead
    roles
    __typename
  }
}`

interface RawMe {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
  avatar?: string | null
  isLead?: boolean | null
  roles?: string[] | null
}

export interface LxpUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  isLead: boolean
  roles: string[]
}

function normalizeMe(raw: RawMe): LxpUser {
  return {
    id: String(raw.id),
    email: raw.email,
    firstName: raw.firstName ?? null,
    lastName: raw.lastName ?? null,
    avatarUrl: raw.avatar ?? null,
    isLead: Boolean(raw.isLead),
    roles: Array.isArray(raw.roles) ? raw.roles : [],
  }
}

export class LxpError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_CREDENTIALS" | "UNAVAILABLE" | "BAD_RESPONSE",
    public readonly status = 502,
  ) {
    super(message)
  }
}

async function gql<T>(query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LXP_TIMEOUT_MS)
  try {
    const res = await fetch(LXP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
      cache: "no-store",
    })
    // Apollo returns 400 for validation/auth errors with a JSON body; parse it before deciding.
    type Envelope = { data?: T; errors?: { message: string; extensions?: { code?: string } }[] }
    let json: Envelope | null = null
    try {
      json = (await res.json()) as Envelope
    } catch {
      json = null
    }
    if (!json) throw new LxpError(`NewLXP responded ${res.status}`, "UNAVAILABLE", 502)
    if (json.errors?.length) {
      const first = json.errors[0]
      const msg = first.message?.toLowerCase() ?? ""
      const code = first.extensions?.code?.toUpperCase() ?? ""
      const unauth =
        code.includes("UNAUTH") ||
        code.includes("FORBIDDEN") ||
        code.includes("BAD_USER_INPUT") ||
        msg.includes("password") ||
        msg.includes("парол") ||
        msg.includes("credential") ||
        msg.includes("not found") ||
        msg.includes("не найден") ||
        msg.includes("invalid") ||
        msg.includes("неверн")
      throw new LxpError(first.message, unauth ? "INVALID_CREDENTIALS" : "BAD_RESPONSE", unauth ? 401 : 502)
    }
    if (!res.ok) throw new LxpError(`NewLXP responded ${res.status}`, "UNAVAILABLE", 502)
    if (!json.data) throw new LxpError("Empty response from NewLXP", "BAD_RESPONSE", 502)
    return json.data
  } catch (err) {
    if (err instanceof LxpError) throw err
    throw new LxpError("NewLXP is unreachable", "UNAVAILABLE", 502)
  } finally {
    clearTimeout(timer)
  }
}

export async function lxpSignIn(email: string, password: string): Promise<{ accessToken: string; user: LxpUser }> {
  const data = await gql<{ signIn: { accessToken: string | null; user: { id: string } | null } | null }>(SIGN_IN_QUERY, {
    input: { email, password },
  })
  const token = data.signIn?.accessToken
  if (!token) throw new LxpError("Invalid email or password", "INVALID_CREDENTIALS", 401)

  // The authoritative profile comes from getMe (same behaviour as the legacy gateway).
  const user = await lxpGetMe(token)
  return { accessToken: token, user }
}

export async function lxpGetMe(token: string): Promise<LxpUser> {
  const data = await gql<{ getMe: RawMe | null }>(GET_ME_QUERY, {}, token)
  if (!data.getMe?.id) throw new LxpError("Unauthorized", "INVALID_CREDENTIALS", 401)
  return normalizeMe(data.getMe)
}
