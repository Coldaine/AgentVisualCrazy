const JWT_CLAIM_PATH = 'https://api.openai.com/auth'

export type JwtPayload = {
  chatgpt_account_id?: string
  [JWT_CLAIM_PATH]?: { chatgpt_account_id?: string }
  organizations?: Array<{ id: string }>
  [key: string]: unknown
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1] ?? ''
    const padded = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

export function extractAccountIdFromClaims(payload: JwtPayload | null | undefined): string | undefined {
  if (!payload) return undefined
  const fromClaim =
    payload.chatgpt_account_id ??
    payload[JWT_CLAIM_PATH]?.chatgpt_account_id ??
    payload.organizations?.[0]?.id
  return typeof fromClaim === 'string' && fromClaim.length > 0 ? fromClaim : undefined
}

export function extractAccountId(tokens: {
  id_token?: string
  access_token?: string
}): string | undefined {
  if (tokens.id_token) {
    const id = extractAccountIdFromClaims(decodeJwt(tokens.id_token))
    if (id) return id
  }
  if (tokens.access_token) {
    return extractAccountIdFromClaims(decodeJwt(tokens.access_token))
  }
  return undefined
}
