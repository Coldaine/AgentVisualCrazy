import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { TokenStore } from '../src/auth/token-store.ts'
import { resolveAuthMode, CODEX_API_ENDPOINT } from '../src/auth/codex-provider.ts'
import { buildCodexOAuthFetch } from '../src/auth/codex-provider.ts'
import { extractAccountId } from '../src/auth/jwt.ts'
import { CuratorRunner } from '../src/runner.ts'
import { parseExhibitArtifacts } from '../src/parse-artifacts.ts'
import type { ObservationQuery } from '../src/observation.ts'
import { generatePkce } from '../src/auth/codex-oauth.ts'

function emptyQuery(size = 3): ObservationQuery {
  return {
    size,
    getById: () => undefined,
    recent: () => [],
    byType: () => [],
    searchTranscript: () => [],
    getAll: () => [],
  }
}

describe('parseExhibitArtifacts', () => {
  it('parses fenced JSON arrays', () => {
    const text = '```json\n[{"id":"x","exhibitType":"live_graph","title":"G","narrative":"why","relevance":0.9,"decayClass":"slow","payload":{}}]\n```'
    const arts = parseExhibitArtifacts(text, 7)
    expect(arts).toHaveLength(1)
    expect(arts[0].exhibitType).toBe('live_graph')
    expect(arts[0].createdAtEvent).toBe(7)
  })
})

describe('TokenStore file fallback', () => {
  it('round-trips oauth tokens without safeStorage', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-tokens-'))
    const store = new TokenStore({ configDir: dir })
    store.save({
      type: 'oauth',
      access: 'access-1',
      refresh: 'refresh-1',
      expires: Date.now() + 60_000,
      accountId: 'acct',
    })
    const loaded = store.load()
    expect(loaded?.access).toBe('access-1')
    expect(loaded?.accountId).toBe('acct')
    expect(store.hasOAuth()).toBe(true)
    store.clear()
    expect(store.hasOAuth()).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('auth mode resolution', () => {
  it('uses oauth only when tokens exist; never Platform API key', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-auth-'))
    const store = new TokenStore({ configDir: dir })
    store.save({
      type: 'oauth',
      access: 'a',
      refresh: 'r',
      expires: Date.now() + 10_000,
    })
    expect(resolveAuthMode({ tokenStore: store })).toBe('oauth')
    expect(resolveAuthMode({ prefer: 'mock' })).toBe('mock')
    expect(resolveAuthMode({})).toBe('mock')
    // OPENAI_API_KEY must not enable a live auth mode.
    const prev = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'sk-must-not-unlock-api-key-mode'
    try {
      expect(resolveAuthMode({})).toBe('mock')
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = prev
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('Codex OAuth fetch rewrite', () => {
  it('rewrites /v1/responses to Codex endpoint and injects headers', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-fetch-'))
    const store = new TokenStore({ configDir: dir })
    store.save({
      type: 'oauth',
      access: 'tok',
      refresh: 'ref',
      expires: Date.now() + 120_000,
      accountId: 'acc-1',
    })

    let seenUrl = ''
    let seenAuth = ''
    let seenAccount = ''
    const fetchImpl = buildCodexOAuthFetch(store)
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url, init) => {
      seenUrl = String(url)
      const headers = new Headers(init?.headers)
      seenAuth = headers.get('Authorization') ?? ''
      seenAccount = headers.get('ChatGPT-Account-ID') ?? ''
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-5.4' }),
      })
      expect(seenUrl).toBe(CODEX_API_ENDPOINT)
      expect(seenAuth).toBe('Bearer tok')
      expect(seenAccount).toBe('acc-1')
    } finally {
      globalThis.fetch = originalFetch
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('jwt account extraction', () => {
  it('reads chatgpt_account_id claim', () => {
    const payload = Buffer.from(
      JSON.stringify({
        'https://api.openai.com/auth': { chatgpt_account_id: 'acct-xyz' },
      }),
    ).toString('base64url')
    const jwt = `hdr.${payload}.sig`
    expect(extractAccountId({ access_token: jwt })).toBe('acct-xyz')
  })
})

describe('PKCE scaffolding', () => {
  it('generates verifier/challenge satisfying challenge === base64url(sha256(verifier))', () => {
    const pkce = generatePkce()
    expect(pkce.verifier.length).toBeGreaterThan(20)
    expect(pkce.challenge.length).toBeGreaterThan(20)
    const expected = createHash('sha256')
      .update(pkce.verifier)
      .digest()
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(pkce.challenge).toBe(expected)
    expect(pkce.verifier).not.toBe(pkce.challenge)
  })
})

describe('CuratorRunner single-flight + mock path', () => {
  it('publishes mock artifacts and skips overlapping triggers', async () => {
    const runner = new CuratorRunner({
      query: emptyQuery(4),
      forceMock: true,
    })

    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })

    const slow = new CuratorRunner({
      query: emptyQuery(4),
      forceMock: false,
      investigateFn: async () => {
        await gate
        return {
          text: JSON.stringify([
            {
              id: 'slow',
              exhibitType: 'live_graph',
              title: 'S',
              narrative: 'slow',
              relevance: 1,
              decayClass: 'slow',
              payload: {},
            },
          ]),
        }
      },
    })

    const p1 = slow.trigger('first')
    const skipped = await slow.trigger('second')
    expect(skipped.skipped).toBe(true)
    release()
    const done = await p1
    expect(done.skipped).toBe(false)
    expect(done.artifacts[0].id).toBe('slow')

    const mock = await runner.trigger('unit')
    expect(mock.mode).toBe('mock')
    expect(mock.artifacts.length).toBeGreaterThan(0)
    expect(mock.artifacts.every((a) => a.narrative.length > 0)).toBe(true)
  })
})
