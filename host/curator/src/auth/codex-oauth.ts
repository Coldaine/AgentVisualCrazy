/**
 * ChatGPT Pro / Plus Codex OAuth (M10).
 * Adapted from Mastra Code / OpenCode openaiCodex patterns:
 * - Browser callback on localhost (scaffolded; see TODOs)
 * - Device-code (headless) flow
 *
 * Tokens land in TokenStore (~/.agentvisualcrazy/).
 */

import { createServer, type Server } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { extractAccountId } from './jwt.ts'
import type { CodexOAuthTokens, TokenStore } from './token-store.ts'

export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const CODEX_ISSUER = 'https://auth.openai.com'
export const CODEX_AUTHORIZE_URL = `${CODEX_ISSUER}/oauth/authorize`
export const CODEX_TOKEN_URL = `${CODEX_ISSUER}/oauth/token`
export const CODEX_DEVICE_USER_CODE_URL = `${CODEX_ISSUER}/api/accounts/deviceauth/usercode`
export const CODEX_DEVICE_TOKEN_URL = `${CODEX_ISSUER}/api/accounts/deviceauth/token`
export const CODEX_DEVICE_AUTHORIZE_URL = `${CODEX_ISSUER}/codex/device`
export const CODEX_DEVICE_REDIRECT_URI = `${CODEX_ISSUER}/deviceauth/callback`
export const CODEX_SCOPE = 'openid profile email offline_access'

const DEFAULT_CALLBACK_PORT = 1455
const DEFAULT_EXPIRES_IN = 3600
const DEVICE_POLL_SAFETY_MS = 3000
const ORIGINATOR = 'agentvisualcrazy'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const CALLBACK_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'",
} as const

export type CodexAuthMode = 'browser' | 'device'

export interface DeviceCodeStart {
  verificationUrl: string
  userCode: string
  deviceAuthId: string
  intervalMs: number
  instructions: string
}

export interface BrowserLoginStart {
  authorizeUrl: string
  redirectUri: string
  instructions: string
  /** Completes when the local callback receives the code (or rejects). */
  waitForCallback: () => Promise<CodexOAuthTokens>
  /** Stop the local callback server. */
  cancel: () => void
}

interface Pkce {
  verifier: string
  challenge: string
}

interface TokenResponseJson {
  id_token?: string
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generatePkce(): Pkce {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

function tokensFromResponse(json: TokenResponseJson): CodexOAuthTokens {
  if (!json.access_token || !json.refresh_token) {
    throw new Error('Codex token response missing access_token or refresh_token')
  }
  const accountId = extractAccountId({
    id_token: json.id_token,
    access_token: json.access_token,
  })
  return {
    type: 'oauth',
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + (json.expires_in ?? DEFAULT_EXPIRES_IN) * 1000,
    accountId,
    idToken: json.id_token,
  }
}

export async function refreshCodexTokens(refreshToken: string): Promise<CodexOAuthTokens> {
  const response = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CODEX_CLIENT_ID,
    }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Codex token refresh failed: ${response.status} ${text}`)
  }
  return tokensFromResponse((await response.json()) as TokenResponseJson)
}

/**
 * Ensure access token is valid, refreshing via TokenStore when needed.
 * Concurrent callers within the refresh window await the same in-flight refresh
 * (per-store memoization) to avoid racing the refresh_token when OpenAI rotates it.
 */
export async function ensureFreshAccess(store: TokenStore): Promise<CodexOAuthTokens> {
  const current = store.load()
  if (!current) {
    throw new Error('Not logged in to ChatGPT Codex. Run OAuth login first.')
  }
  if (Date.now() < current.expires - 60_000) {
    return current
  }
  // Dedup concurrent refreshes against the same refresh_token so a rotated
  // refresh_token isn't used twice. Keyed by the token value in case the store
  // was reloaded with a different refresh token between calls.
  const key = current.refresh
  const existing = inflightRefreshes.get(key)
  if (existing) return existing
  const p = (async () => {
    try {
      const refreshed = await refreshCodexTokens(current.refresh)
      // Preserve accountId if refresh response omits it.
      if (!refreshed.accountId && current.accountId) {
        refreshed.accountId = current.accountId
      }
      store.save(refreshed)
      return refreshed
    } finally {
      inflightRefreshes.delete(key)
    }
  })()
  inflightRefreshes.set(key, p)
  return p
}

const inflightRefreshes = new Map<string, Promise<CodexOAuthTokens>>()

/** Start device-code login (headless). Call pollDeviceCodeLogin to finish. */
export async function startDeviceCodeLogin(): Promise<DeviceCodeStart> {
  const response = await fetch(CODEX_DEVICE_USER_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ORIGINATOR,
    },
    body: JSON.stringify({ client_id: CODEX_CLIENT_ID }),
  })
  if (!response.ok) {
    throw new Error(`Device authorization failed: ${response.status}`)
  }
  const data = (await response.json()) as {
    device_auth_id?: string
    user_code?: string
    interval?: string | number
  }
  if (!data.device_auth_id || !data.user_code) {
    throw new Error('Device authorization response missing device_auth_id or user_code')
  }
  const intervalSec =
    typeof data.interval === 'number'
      ? data.interval
      : parseInt(String(data.interval ?? '5'), 10) || 5
  return {
    verificationUrl: CODEX_DEVICE_AUTHORIZE_URL,
    userCode: data.user_code,
    deviceAuthId: data.device_auth_id,
    intervalMs: Math.max(intervalSec, 1) * 1000,
    instructions: `Open ${CODEX_DEVICE_AUTHORIZE_URL} and enter code: ${data.user_code}`,
  }
}

/** Poll until the user approves the device code, then exchange for tokens. */
export async function pollDeviceCodeLogin(
  start: DeviceCodeStart,
  options?: { signal?: AbortSignal; maxWaitMs?: number },
): Promise<CodexOAuthTokens> {
  const maxWait = options?.maxWaitMs ?? 15 * 60 * 1000
  const deadline = Date.now() + maxWait

  while (Date.now() < deadline) {
    if (options?.signal?.aborted) {
      throw new Error('Device-code login aborted')
    }
    const response = await fetch(CODEX_DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ORIGINATOR,
      },
      body: JSON.stringify({
        device_auth_id: start.deviceAuthId,
        user_code: start.userCode,
      }),
      signal: options?.signal,
    })

    if (response.ok) {
      const data = (await response.json()) as {
        authorization_code?: string
        code_verifier?: string
      }
      if (!data.authorization_code || !data.code_verifier) {
        throw new Error('Device token response missing authorization_code or code_verifier')
      }
      const tokenResponse = await fetch(CODEX_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: data.authorization_code,
          redirect_uri: CODEX_DEVICE_REDIRECT_URI,
          client_id: CODEX_CLIENT_ID,
          code_verifier: data.code_verifier,
        }),
      })
      if (!tokenResponse.ok) {
        throw new Error(`Device code token exchange failed: ${tokenResponse.status}`)
      }
      return tokensFromResponse((await tokenResponse.json()) as TokenResponseJson)
    }

    if (response.status !== 403 && response.status !== 404) {
      const text = await response.text().catch(() => '')
      throw new Error(`Device-code poll failed: ${response.status} ${text}`)
    }

    await sleep(start.intervalMs + DEVICE_POLL_SAFETY_MS)
  }

  throw new Error('Device-code login timed out')
}

/**
 * Browser OAuth scaffolding: local callback server + authorize URL.
 *
 * TODO(M10): Wire Electron shell.openExternal(authorizeUrl) and surface
 * progress in the UI. The callback server + PKCE exchange are implemented;
 * product UX (menu item / settings) is still stubbed.
 */
export async function startBrowserLogin(options?: {
  port?: number
}): Promise<BrowserLoginStart> {
  const port = options?.port ?? DEFAULT_CALLBACK_PORT
  const redirectUri = `http://localhost:${port}/auth/callback`
  const pkce = generatePkce()
  const state = base64Url(randomBytes(16))

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: CODEX_SCOPE,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: ORIGINATOR,
  })
  const authorizeUrl = `${CODEX_AUTHORIZE_URL}?${params.toString()}`

  let server: Server | undefined
  let settled = false

  const waitForCallback = () =>
    new Promise<CodexOAuthTokens>((resolve, reject) => {
      const timeout = setTimeout(
        () => {
          if (!settled) {
            settled = true
            server?.close()
            reject(new Error('OAuth callback timeout'))
          }
        },
        5 * 60 * 1000,
      )

      server = createServer((req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${port}`)
        if (req.method !== 'GET') {
          res.writeHead(405, { Allow: 'GET' })
          res.end('Method Not Allowed')
          return
        }
        if (url.pathname !== '/auth/callback') {
          res.writeHead(404)
          res.end('Not found')
          return
        }

        const error = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        const returnedState = url.searchParams.get('state')

        if (error) {
          res.writeHead(200, CALLBACK_HEADERS)
          res.end(
            `<html><body><h1>Login failed</h1><p>${escapeHtml(error)}</p></body></html>`,
          )
          if (!settled) {
            settled = true
            clearTimeout(timeout)
            server?.close()
            reject(new Error(error))
          }
          return
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, CALLBACK_HEADERS)
          res.end('<html><body><h1>Invalid OAuth callback</h1></body></html>')
          if (!settled) {
            settled = true
            clearTimeout(timeout)
            server?.close()
            reject(new Error('Invalid OAuth callback (missing code or bad state)'))
          }
          return
        }

        res.writeHead(200, CALLBACK_HEADERS)
        res.end(
          '<html><body><h1>Authentication successful</h1><p>Return to AgentVisualCrazy.</p></body></html>',
        )

        void (async () => {
          try {
            const tokenResponse = await fetch(CODEX_TOKEN_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                client_id: CODEX_CLIENT_ID,
                code_verifier: pkce.verifier,
              }),
            })
            if (!tokenResponse.ok) {
              throw new Error(`Token exchange failed: ${tokenResponse.status}`)
            }
            const tokens = tokensFromResponse(
              (await tokenResponse.json()) as TokenResponseJson,
            )
            if (!settled) {
              settled = true
              clearTimeout(timeout)
              server?.close()
              resolve(tokens)
            }
          } catch (err) {
            if (!settled) {
              settled = true
              clearTimeout(timeout)
              server?.close()
              reject(err instanceof Error ? err : new Error(String(err)))
            }
          }
        })()
      })

      server.listen(port, '127.0.0.1', () => {
        /* ready */
      })
      server.on('error', (err) => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          reject(err)
        }
      })
    })

  return {
    authorizeUrl,
    redirectUri,
    instructions:
      'Open the authorize URL in a browser, complete ChatGPT login, then return here. (TODO: Electron shell.openExternal)',
    waitForCallback,
    cancel: () => {
      server?.close()
    },
  }
}

/** Convenience: device-code login end-to-end and persist tokens. */
export async function loginWithDeviceCode(
  store: TokenStore,
  options?: { signal?: AbortSignal; onStart?: (start: DeviceCodeStart) => void },
): Promise<CodexOAuthTokens> {
  const start = await startDeviceCodeLogin()
  options?.onStart?.(start)
  const tokens = await pollDeviceCodeLogin(start, { signal: options?.signal })
  store.save(tokens)
  return tokens
}
