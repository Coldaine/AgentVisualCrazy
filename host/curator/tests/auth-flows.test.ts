/**
 * Browser + device login flow tests (PR fix: OAuth coverage).
 * Exercises startBrowserLogin's local callback server and pollDeviceCodeLogin's
 * retry/timeout behavior with mocked fetch.
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as net from 'node:net'
import {
  startBrowserLogin,
  pollDeviceCodeLogin,
  CODEX_CLIENT_ID,
  CODEX_AUTHORIZE_URL,
} from '../src/auth/codex-oauth.ts'

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        srv.close()
        reject(new Error('could not determine free port'))
      }
    })
  })
}

async function readBody(res: Response): Promise<string> {
  return res.text()
}

async function waitForPortReady(port: number, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(100)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        resolve(false)
      })
      socket.once('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.connect(port, '127.0.0.1')
    })
    if (ok) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`port ${port} not ready within ${timeoutMs}ms`)
}

describe('startBrowserLogin', () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    while (cleanups.length) {
      try {
        cleanups.pop()?.()
      } catch {
        /* ignore */
      }
    }
  })

  it('produces an authorize URL with PKCE, state, client_id, redirect_uri, scope', async () => {
    const port = await freePort()
    const start = await startBrowserLogin({ port })
    cleanups.push(start.cancel)

    const url = new URL(start.authorizeUrl)
    expect(url.origin + url.pathname).toBe(CODEX_AUTHORIZE_URL)
    expect(url.searchParams.get('client_id')).toBe(CODEX_CLIENT_ID)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')?.length).toBeGreaterThan(20)
    expect(url.searchParams.get('state')?.length).toBeGreaterThan(10)
    expect(url.searchParams.get('scope')).toContain('openid')
    expect(url.searchParams.get('scope')).toContain('offline_access')
    expect(start.redirectUri).toBe(`http://localhost:${port}/auth/callback`)
  })

  it('rejects a callback with a bad state (400 + rejection)', async () => {
    const port = await freePort()
    const start = await startBrowserLogin({ port })
    cleanups.push(start.cancel)

    // Convert to a never-rejecting promise so the rejection isn't flagged unhandled.
    const settled = start.waitForCallback().then(
      () => 'resolved',
      (e: unknown) => e as Error,
    )
    await waitForPortReady(port)
    const res = await fetch(
      `http://localhost:${port}/auth/callback?code=abc&state=wrong-state`,
    )
    expect(res.status).toBe(400)
    const result = await settled
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toMatch(/Invalid OAuth callback/)
  })

  it('resolves tokens on a valid code + state (mocked token exchange)', async () => {
    const port = await freePort()
    const start = await startBrowserLogin({ port })
    cleanups.push(start.cancel)

    const state = new URL(start.authorizeUrl).searchParams.get('state')!
    const original = globalThis.fetch
    let tokenExchangeCalled = false
    globalThis.fetch = (async (url: URL | Request | string, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString()
      // The callback-server-internal token exchange hits auth.openai.com/oauth/token.
      if (u.includes('auth.openai.com/oauth/token')) {
        tokenExchangeCalled = true
        return new Response(
          JSON.stringify({
            access_token: 'at-real',
            refresh_token: 'rt-real',
            expires_in: 3600,
            id_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4In0.sig',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      // Otherwise it's the callback server itself — use real fetch.
      return original(url as Parameters<typeof original>[0], init)
    }) as typeof fetch

    try {
      // Start the callback server.
      const tokensPromise = start.waitForCallback()
      await waitForPortReady(port)
      // Fire the callback request.
      const cb = fetch(
        `http://localhost:${port}/auth/callback?code=valid-code&state=${state}`,
      )
      const tokens = await tokensPromise
      await cb
      expect(tokenExchangeCalled).toBe(true)
      expect(tokens.access).toBe('at-real')
      expect(tokens.refresh).toBe('rt-real')
      expect(tokens.expires).toBeGreaterThan(Date.now())
    } finally {
      globalThis.fetch = original
    }
  })

  it('HTML-escapes the error param in the callback error page (XSS fix)', async () => {
    const port = await freePort()
    const start = await startBrowserLogin({ port })
    cleanups.push(start.cancel)

    const settled = start.waitForCallback().then(
      () => 'resolved',
      (e: unknown) => e as Error,
    )
    await waitForPortReady(port)
    const res = await fetch(
      `http://localhost:${port}/auth/callback?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E`,
    )
    expect(res.status).toBe(200)
    const body = await readBody(res)
    expect(body).not.toContain('<script>')
    expect(body).toContain('&lt;script&gt;')
    const result = await settled
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toMatch(/<script>alert\(1\)<\/script>/)
  })

  it('rejects non-GET methods with 405', async () => {
    const port = await freePort()
    const start = await startBrowserLogin({ port })
    cleanups.push(start.cancel)

    start.waitForCallback() // start the server
    await waitForPortReady(port)
    const res = await fetch(`http://localhost:${port}/auth/callback?code=x`, {
      method: 'POST',
    })
    expect(res.status).toBe(405)
  })

  it('cancel() closes the callback server', async () => {
    const port = await freePort()
    const start = await startBrowserLogin({ port })
    start.cancel()

    // After cancel, a request to the callback should fail to connect.
    await expect(
      fetch(`http://localhost:${port}/auth/callback?code=x&state=y`).catch(() => {
        throw new Error('connection refused')
      }),
    ).rejects.toThrow()
  })
})

describe('pollDeviceCodeLogin', () => {
  it('retries on 403 then succeeds with token exchange', async () => {
    let pollCalls = 0
    let tokenExchangeCalled = false
    const original = globalThis.fetch
    globalThis.fetch = (async (url: URL | Request | string) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('deviceauth/token')) {
        pollCalls++
        if (pollCalls === 1) {
          return new Response('pending', { status: 403 })
        }
        return new Response(
          JSON.stringify({
            authorization_code: 'auth-code-123',
            code_verifier: 'verifier-123',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (u.includes('auth.openai.com/oauth/token')) {
        tokenExchangeCalled = true
        return new Response(
          JSON.stringify({
            access_token: 'at-device',
            refresh_token: 'rt-device',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      const start = {
        verificationUrl: 'https://auth.openai.com/codex/device',
        userCode: 'ABC123',
        deviceAuthId: 'dev-id',
        intervalMs: 1,
        instructions: '',
      }
      const tokens = await pollDeviceCodeLogin(start, { maxWaitMs: 5000 })
      expect(pollCalls).toBe(2)
      expect(tokenExchangeCalled).toBe(true)
      expect(tokens.access).toBe('at-device')
      expect(tokens.refresh).toBe('rt-device')
    } finally {
      globalThis.fetch = original
    }
  })

  it('succeeds immediately on 200', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async (url: URL | Request | string) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('deviceauth/token')) {
        return new Response(
          JSON.stringify({ authorization_code: 'ac', code_verifier: 'cv' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (u.includes('auth.openai.com/oauth/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'at-fast',
            refresh_token: 'rt-fast',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      const start = {
        verificationUrl: '',
        userCode: 'X',
        deviceAuthId: 'D',
        intervalMs: 1,
        instructions: '',
      }
      const tokens = await pollDeviceCodeLogin(start, { maxWaitMs: 5000 })
      expect(tokens.access).toBe('at-fast')
    } finally {
      globalThis.fetch = original
    }
  })

  it('throws on a non-403/404 error status', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async (url: URL | Request | string) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('deviceauth/token')) {
        return new Response('server error', { status: 500 })
      }
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      const start = {
        verificationUrl: '',
        userCode: 'X',
        deviceAuthId: 'D',
        intervalMs: 1,
        instructions: '',
      }
      await expect(pollDeviceCodeLogin(start, { maxWaitMs: 5000 })).rejects.toThrow(
        /poll failed: 500/,
      )
    } finally {
      globalThis.fetch = original
    }
  })

  it('times out when the user never approves', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async (url: URL | Request | string) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('deviceauth/token')) {
        return new Response('pending', { status: 403 })
      }
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      const start = {
        verificationUrl: '',
        userCode: 'X',
        deviceAuthId: 'D',
        intervalMs: 1,
        instructions: '',
      }
      await expect(pollDeviceCodeLogin(start, { maxWaitMs: 50 })).rejects.toThrow(
        /timed out/,
      )
    } finally {
      globalThis.fetch = original
    }
  })
})
