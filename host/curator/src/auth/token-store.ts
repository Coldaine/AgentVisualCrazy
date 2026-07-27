import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/**
 * OAuth token persistence under ~/.agentvisualcrazy/ (M10, M13).
 * Prefers Electron safeStorage when available; file fallback for tests/CI.
 */

export interface CodexOAuthTokens {
  type: 'oauth'
  access: string
  refresh: string
  /** Epoch ms when access expires. */
  expires: number
  accountId?: string
  idToken?: string
}

export interface TokenStoreOptions {
  /** Override config directory (tests). */
  configDir?: string
  /**
   * Optional Electron safeStorage bridge.
   * When encryptString/decryptString work, tokens are stored encrypted.
   */
  safeStorage?: {
    isEncryptionAvailable: () => boolean
    encryptString: (plain: string) => Buffer
    decryptString: (encrypted: Buffer) => string
  }
}

const TOKEN_FILE = 'codex-oauth.json'
const TOKEN_FILE_ENC = 'codex-oauth.enc'

export function defaultConfigDir(): string {
  return path.join(os.homedir(), '.agentvisualcrazy')
}

export class TokenStore {
  readonly configDir: string
  private readonly safeStorage: TokenStoreOptions['safeStorage']

  constructor(options: TokenStoreOptions = {}) {
    this.configDir = options.configDir ?? defaultConfigDir()
    this.safeStorage = options.safeStorage
  }

  ensureDir(): void {
    fs.mkdirSync(this.configDir, { recursive: true, mode: 0o700 })
    // Tighten an existing dir's permissions if it already existed.
    try {
      fs.chmodSync(this.configDir, 0o700)
    } catch {
      /* ignore */
    }
  }

  private plainPath(): string {
    return path.join(this.configDir, TOKEN_FILE)
  }

  private encPath(): string {
    return path.join(this.configDir, TOKEN_FILE_ENC)
  }

  private canEncrypt(): boolean {
    try {
      return Boolean(this.safeStorage?.isEncryptionAvailable())
    } catch {
      return false
    }
  }

  save(tokens: CodexOAuthTokens): void {
    this.ensureDir()
    const json = JSON.stringify(tokens, null, 2)
    if (this.canEncrypt() && this.safeStorage) {
      const buf = this.safeStorage.encryptString(json)
      fs.writeFileSync(this.encPath(), buf)
      // Remove plaintext if we upgraded to encrypted storage.
      if (fs.existsSync(this.plainPath())) {
        try {
          fs.unlinkSync(this.plainPath())
        } catch {
          /* ignore */
        }
      }
      return
    }
    fs.writeFileSync(this.plainPath(), json, { mode: 0o600, encoding: 'utf8' })
    // Re-tighten in case the file already existed with looser bits.
    try {
      fs.chmodSync(this.plainPath(), 0o600)
    } catch {
      /* ignore */
    }
  }

  load(): CodexOAuthTokens | null {
    if (this.canEncrypt() && this.safeStorage && fs.existsSync(this.encPath())) {
      try {
        const buf = fs.readFileSync(this.encPath())
        const json = this.safeStorage.decryptString(buf)
        return parseTokens(json)
      } catch {
        return null
      }
    }
    if (!fs.existsSync(this.plainPath())) return null
    try {
      return parseTokens(fs.readFileSync(this.plainPath(), 'utf8'))
    } catch {
      return null
    }
  }

  clear(): void {
    for (const p of [this.plainPath(), this.encPath()]) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p)
        } catch {
          /* ignore */
        }
      }
    }
  }

  hasOAuth(): boolean {
    const t = this.load()
    return Boolean(t?.access && t?.refresh)
  }
}

function parseTokens(json: string): CodexOAuthTokens | null {
  const raw = JSON.parse(json) as Partial<CodexOAuthTokens>
  if (raw.type !== 'oauth' || !raw.access || !raw.refresh || typeof raw.expires !== 'number') {
    return null
  }
  return {
    type: 'oauth',
    access: raw.access,
    refresh: raw.refresh,
    expires: raw.expires,
    accountId: raw.accountId,
    idToken: raw.idToken,
  }
}
