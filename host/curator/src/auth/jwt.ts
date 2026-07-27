const JWT_CLAIM_PATH = 'https://api.openai.com/auth'

/**
 * Algorithms permitted by decodeJwt. `none` is explicitly rejected as
 * defense-in-depth even though this function only extracts claims (it does
 * not verify signatures) — the token source is trusted (auth.openai.com), but
 * decodeJwt is exported and could be reused on untrusted input.
 */
const ALLOWED_ALGS = new Set(['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA'])

export type JwtPayload = {
  chatgpt_account_id?: string
  [JWT_CLAIM_PATH]?: { chatgpt_account_id?: string }
  organizations?: Array<{ id: string }>
  [key: string]: unknown
}

/**
 * Decode a JWT's payload WITHOUT verifying its signature.
 *
 * SECURITY ASSUMPTION: callers must only pass tokens from a trusted source
 * (e.g. auth.openai.com). This function does NOT verify the signature — it
 * only base64-decodes the payload for claim extraction. If you need to make an
 * authorization decision based on the claims, verify the signature against
 * the issuer's JWKS first. As defense-in-depth, `alg: none` is rejected.
 */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // Defense-in-depth: reject `alg: none` even though we don't verify sigs.
    // Only apply when the header is valid JSON with an alg field; an unparseable
    // header (e.g. a bare string) falls through to payload decoding for back-compat.
    try {
      const headerJson = Buffer.from(
        (parts[0] ?? '').replace(/-/g, '+').replace(/_/g, '/').padEnd(4, '='),
        'base64',
      ).toString('utf8')
      const header = JSON.parse(headerJson) as { alg?: string }
      if (header.alg && !ALLOWED_ALGS.has(header.alg)) return null
    } catch {
      /* unparseable header — ignore, continue to payload */
    }

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
