/**
 * Auth hardening tests (PR #122 curator-oauth).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { generatePkce, refreshCodexTokens, ensureFreshAccess } from '../src/auth/codex-oauth.ts'
import { buildCodexOAuthFetch, CODEX_API_ENDPOINT } from '../src/auth/codex-provider.ts'
import { TokenStore, type CodexOAuthTokens } from '../src/auth/token-store.ts'
import { decodeJwt, extractAccountId } from '../src/auth/jwt.ts'

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('PKCE invariant', () => {
  it('challenge === base64url(sha256(verifier))', () => {
    const pkce = generatePkce()
    const expected = base64Url(createHash('sha256').update(pkce.verifier).digest())
    expect(pkce.challenge).toBe(expected)
  })

  it('verifier and challenge are base64url and distinct', () => {
    const pkce = generatePkce()
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(pkce.challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(pkce.verifier).not.toBe(pkce.challenge)
  })

  it('each call produces a fresh verifier', () => {
    const a = generatePkce()
    const b = generatePkce()
    expect(a.verifier).not.toBe(b.verifier)
  })
})

describe('refreshCodexTokens', () => {
  it('POSTs to auth.openai.com/oauth/token with refresh_token grant and returns new tokens', async () => {
    const calls: string[] = []
    const original = globalThis.fetch
    try {
      globalThis.fetch = (async (url: URL | Request | string, init?: RequestInit) => {
        calls.push(typeof url === 'string' ? url : url.toString())
        const body = String(init?.body ?? '')
        expect(body).toContain('grant_type=refresh_token')
        expect(body).toContain('refresh_token=rt-old')
        expect(body).toContain('client_id=app_EMoamEEZ73f0CkXaXp7hrann')
        return new Response(
          JSON.stringify({
            access_token: 'at-new',
            refresh_token: 'rt-new',
            expires_in: 3600,
            id_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2N0IjoiYWNjZXNzLWNvZGUifQ.sig',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as typeof fetch
      const tokens = await refreshCodexTokens('rt-old')
      expect(tokens.access).toBe('at-new')
      expect(tokens.refresh).toBe('rt-new')
      expect(tokens.expires).toBeGreaterThan(Date.now())
      expect(calls[0]).toContain('auth.openai.com/oauth/token')
    } finally {
      globalThis.fetch = original
    }
  })

  it('throws when the refresh endpoint returns non-OK', async () => {
    const original = globalThis.fetch
    try {
      globalThis.fetch = (async () =>
        new Response('invalid_grant', { status: 400 })) as typeof fetch
      await expect(refreshCodexTokens('rt-bad')).rejects.toThrow(/refresh failed: 400/)
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('buildCodexOAuthFetch URL rewrite', () => {
  function makeStore(tokens: CodexOAuthTokens): TokenStore {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-auth-'))
    const store = new TokenStore({ configDir: dir })
    store.save(tokens)
    return store
  }

  it('rewrites /v1/responses to the Codex backend endpoint and injects required headers', async () => {
    const tokens: CodexOAuthTokens = {
      type: 'oauth',
      access: 'at-xyz',
      refresh: 'rt-xyz',
      expires: Date.now() + 10 * 60_000,
      accountId: 'acct-123',
    }
    const store = makeStore(tokens)
    const fetchFn = buildCodexOAuthFetch(store)

    let capturedUrl = ''
    let capturedHeaders: Headers | undefined
    let capturedBody: string | undefined
    const original = globalThis.fetch
    try {
      globalThis.fetch = (async (url: URL | Request | string, init?: RequestInit) => {
        capturedUrl = typeof url === 'string' ? url : url.toString()
        capturedHeaders = init?.headers as Headers
        capturedBody = typeof init?.body === 'string' ? init.body : undefined
        return new Response('{}', { status: 200 })
      }) as typeof fetch
      await fetchFn('https://api.openai.com/v1/responses', {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-5.4', input: 'hi' }),
      })
    } finally {
      globalThis.fetch = original
    }

    expect(capturedUrl).toBe(CODEX_API_ENDPOINT)
    expect(capturedHeaders?.get('Authorization')).toBe('Bearer at-xyz')
    expect(capturedHeaders?.get('ChatGPT-Account-ID')).toBe('acct-123')
    expect(capturedHeaders?.get('originator')).toBe('agentvisualcrazy')
    expect(capturedHeaders?.get('OpenAI-Beta')).toBe('responses=experimental')
    expect(capturedBody).toContain('"store":false')
  })

  it('rewrites /chat/completions to the Codex backend endpoint', async () => {
    const tokens: CodexOAuthTokens = {
      type: 'oauth',
      access: 'at-chat',
      refresh: 'rt-chat',
      expires: Date.now() + 10 * 60_000,
    }
    const store = makeStore(tokens)
    const fetchFn = buildCodexOAuthFetch(store)

    let capturedUrl = ''
    const original = globalThis.fetch
    try {
      globalThis.fetch = (async (url: URL | Request | string) => {
        capturedUrl = typeof url === 'string' ? url : url.toString()
        return new Response('{}', { status: 200 })
      }) as typeof fetch
      await fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-5.4', messages: [] }),
      })
    } finally {
      globalThis.fetch = original
    }
    expect(capturedUrl).toBe(CODEX_API_ENDPOINT)
  })

  it('does not rewrite unrelated URLs', async () => {
    const tokens: CodexOAuthTokens = {
      type: 'oauth',
      access: 'at-other',
      refresh: 'rt-other',
      expires: Date.now() + 10 * 60_000,
    }
    const store = makeStore(tokens)
    const fetchFn = buildCodexOAuthFetch(store)

    let capturedUrl = ''
    const original = globalThis.fetch
    try {
      globalThis.fetch = (async (url: URL | Request | string) => {
        capturedUrl = typeof url === 'string' ? url : url.toString()
        return new Response('{}', { status: 200 })
      }) as typeof fetch
      await fetchFn('https://example.com/some/other/path', { method: 'GET' })
    } finally {
      globalThis.fetch = original
    }
    expect(capturedUrl).toBe('https://example.com/some/other/path')
  })
})

describe('TokenStore negative cases', () => {
  it('returns null when the token file is corrupted JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-corrupt-'))
    const store = new TokenStore({ configDir: dir })
    store.ensureDir()
    fs.writeFileSync(path.join(dir, 'codex-oauth.json'), '{not valid json', 'utf8')
    expect(store.load()).toBeNull()
    expect(store.hasOAuth()).toBe(false)
  })

  it('returns null when the token file is missing required fields', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-missing-'))
    const store = new TokenStore({ configDir: dir })
    store.ensureDir()
    fs.writeFileSync(
      path.join(dir, 'codex-oauth.json'),
      JSON.stringify({ type: 'oauth', access: 'x' }),
      'utf8',
    )
    expect(store.load()).toBeNull()
    expect(store.hasOAuth()).toBe(false)
  })

  it('returns null when type is not "oauth"', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-wrongtype-'))
    const store = new TokenStore({ configDir: dir })
    store.ensureDir()
    fs.writeFileSync(
      path.join(dir, 'codex-oauth.json'),
      JSON.stringify({
        type: 'api-key',
        access: 'x',
        refresh: 'y',
        expires: Date.now() + 60_000,
      }),
      'utf8',
    )
    expect(store.load()).toBeNull()
    expect(store.hasOAuth()).toBe(false)
  })

  it('clear() removes both plain and encrypted token files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-clear-'))
    const store = new TokenStore({ configDir: dir })
    store.save({
      type: 'oauth',
      access: 'a',
      refresh: 'r',
      expires: Date.now() + 60_000,
    })
    expect(store.hasOAuth()).toBe(true)
    store.clear()
    expect(store.hasOAuth()).toBe(false)
    expect(fs.existsSync(path.join(dir, 'codex-oauth.json'))).toBe(false)
  })
})

describe('ensureFreshAccess', () => {
  it('returns current token without refresh when not near expiry', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-fresh-'))
    const store = new TokenStore({ configDir: dir })
    const tokens: CodexOAuthTokens = {
      type: 'oauth',
      access: 'at-good',
      refresh: 'rt-good',
      expires: Date.now() + 10 * 60_000,
      accountId: 'acct-fresh',
    }
    store.save(tokens)
    const result = await ensureFreshAccess(store)
    expect(result.access).toBe('at-good')
    expect(result.accountId).toBe('acct-fresh')
  })

  it('refreshes when token is expired and persists the new tokens', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-expired-'))
    const store = new TokenStore({ configDir: dir })
    const expired: CodexOAuthTokens = {
      type: 'oauth',
      access: 'at-old',
      refresh: 'rt-old',
      expires: Date.now() - 1000,
      accountId: 'acct-old',
    }
    store.save(expired)

    const original = globalThis.fetch
    try {
      globalThis.fetch = (async (url: URL | Request | string, init?: RequestInit) => {
        const u = typeof url === 'string' ? url : url.toString()
        expect(u).toContain('auth.openai.com/oauth/token')
        const body = String(init?.body ?? '')
        expect(body).toContain('refresh_token=rt-old')
        return new Response(
          JSON.stringify({
            access_token: 'at-new',
            refresh_token: 'rt-new',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as typeof fetch
      const result = await ensureFreshAccess(store)
      expect(result.access).toBe('at-new')
      expect(result.refresh).toBe('rt-new')
      // accountId preserved from expired token (refresh response omitted it)
      expect(result.accountId).toBe('acct-old')
      // Persisted to store
      const reloaded = store.load()
      expect(reloaded?.access).toBe('at-new')
    } finally {
      globalThis.fetch = original
    }
  })

  it('throws when no tokens are present', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-empty-'))
    const store = new TokenStore({ configDir: dir })
    await expect(ensureFreshAccess(store)).rejects.toThrow(/Not logged in/)
  })
})

