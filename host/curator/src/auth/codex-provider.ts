/**
 * Codex OAuth LanguageModel + OPENAI_API_KEY fallback (M10, M11).
 * Pattern: createOpenAI + custom fetch rewriting to
 * https://chatgpt.com/backend-api/codex/responses + wrapLanguageModel middleware.
 * Adapted from Mastra Code openaiCodexProvider / OpenCode Codex plugin.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import { ensureFreshAccess } from './codex-oauth.ts'
import type { TokenStore } from './token-store.ts'

export const CODEX_API_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses'
export const CODEX_ORIGINATOR = 'agentvisualcrazy'
export const CODEX_USER_AGENT = 'agentvisualcrazy'

const CODEX_INSTRUCTIONS = `You are a read-only curator for AgentVisualCrazy. Investigate the session with tools and author exhibit artifacts. Be concise and evidence-grounded.`

export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'xhigh'

const GPT5_MODEL_RE = /^gpt-5(?:\.|-|$)/

export function getEffectiveThinkingLevel(modelId: string, level: ThinkingLevel): ThinkingLevel {
  if (GPT5_MODEL_RE.test(modelId) && level === 'off') return 'low'
  return level
}

export const THINKING_LEVEL_TO_REASONING_EFFORT: Record<ThinkingLevel, string | undefined> = {
  off: undefined,
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
}

export function createCodexMiddleware(reasoningEffort?: string): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      if (params.temperature !== undefined && params.temperature !== null) {
        delete params.topP
      }
      params.providerOptions = {
        ...params.providerOptions,
        openai: {
          ...(params.providerOptions?.openai ?? {}),
          instructions: CODEX_INSTRUCTIONS,
          store: false,
          ...(reasoningEffort ? { reasoningEffort } : {}),
        },
      } as typeof params.providerOptions
      return params
    },
  }
}

export function buildCodexOAuthFetch(store: TokenStore): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const cred = await ensureFreshAccess(store)

    const headers = new Headers()
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          if (key.toLowerCase() !== 'authorization') headers.set(key, value)
        })
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers) {
          if (key.toLowerCase() !== 'authorization' && value !== undefined) {
            headers.set(key, String(value))
          }
        }
      } else {
        for (const [key, value] of Object.entries(init.headers)) {
          if (key.toLowerCase() !== 'authorization' && value !== undefined) {
            headers.set(key, String(value))
          }
        }
      }
    }

    headers.set('Authorization', `Bearer ${cred.access}`)
    if (!headers.has('originator')) headers.set('originator', CODEX_ORIGINATOR)
    if (!headers.has('User-Agent')) headers.set('User-Agent', CODEX_USER_AGENT)
    if (cred.accountId) headers.set('ChatGPT-Account-ID', cred.accountId)
    if (!headers.has('OpenAI-Beta')) headers.set('OpenAI-Beta', 'responses=experimental')

    const parsed =
      url instanceof URL ? url : new URL(typeof url === 'string' ? url : (url as Request).url)
    const shouldRewrite =
      parsed.pathname.includes('/v1/responses') || parsed.pathname.includes('/chat/completions')
    const finalUrl = shouldRewrite ? new URL(CODEX_API_ENDPOINT) : parsed

    // Normalize body for Codex: store:false when JSON body is present.
    let body = init?.body
    if (typeof body === 'string' && shouldRewrite) {
      try {
        const json = JSON.parse(body) as Record<string, unknown>
        if (json.store === undefined) json.store = false
        delete json.max_output_tokens
        body = JSON.stringify(json)
      } catch {
        /* leave body as-is */
      }
    }

    return fetch(finalUrl, { ...init, headers, body })
  }) as typeof fetch
}

export type AuthMode = 'oauth' | 'api-key' | 'mock'

export interface ResolveModelOptions {
  modelId?: string
  thinkingLevel?: ThinkingLevel
  tokenStore?: TokenStore
  /** Force a mode (tests). Default: oauth if tokens present, else api-key if env set, else mock. */
  prefer?: AuthMode
  /** Override API key (defaults to process.env.OPENAI_API_KEY). */
  apiKey?: string
  /** Injected LanguageModel for mock/tests. */
  mockModel?: unknown
}

export function resolveAuthMode(options: {
  tokenStore?: TokenStore
  apiKey?: string
  prefer?: AuthMode
  mockModel?: unknown
}): AuthMode {
  if (options.prefer) return options.prefer
  if (options.mockModel) return 'mock'
  if (options.tokenStore?.hasOAuth()) return 'oauth'
  const key = options.apiKey ?? process.env.OPENAI_API_KEY
  if (key && key.length > 0) return 'api-key'
  return 'mock'
}

/**
 * Build a Mastra-compatible model config:
 * - oauth → Codex endpoint via wrapLanguageModel + OAuth fetch
 * - api-key → stock OpenAI provider
 * - mock → caller-supplied model (or throws if missing)
 */
export function createCuratorModel(options: ResolveModelOptions = {}): {
  mode: AuthMode
  model: unknown
} {
  const modelId = options.modelId ?? process.env.AVC_CURATOR_MODEL ?? 'gpt-5.4'
  const mode = resolveAuthMode(options)

  if (mode === 'mock') {
    if (!options.mockModel) {
      throw new Error(
        'No curator model credentials. Set OPENAI_API_KEY, complete Codex OAuth, or pass mockModel.',
      )
    }
    return { mode, model: options.mockModel }
  }

  const level = getEffectiveThinkingLevel(modelId, options.thinkingLevel ?? 'medium')
  const effort = THINKING_LEVEL_TO_REASONING_EFFORT[level]
  const middleware = createCodexMiddleware(effort)

  if (mode === 'api-key') {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY missing for api-key mode')
    const openai = createOpenAI({ apiKey })
    return {
      mode,
      model: wrapLanguageModel({
        model: openai.responses(modelId),
        middleware: [middleware],
      }),
    }
  }

  // oauth
  if (!options.tokenStore) {
    throw new Error('tokenStore required for Codex OAuth mode')
  }
  const openai = createOpenAI({
    apiKey: 'oauth-dummy-key',
    fetch: buildCodexOAuthFetch(options.tokenStore) as typeof fetch,
  })
  return {
    mode,
    model: wrapLanguageModel({
      model: openai.responses(modelId),
      middleware: [middleware],
    }),
  }
}
