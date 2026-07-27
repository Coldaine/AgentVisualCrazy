/**
 * IPC channel contract test (PR #119 substrate).
 *
 * The IPC channel names are the wire protocol between the Electron main process
 * and the renderer (preload). Renaming a channel silently breaks the bridge.
 * This test pins the channel names so any rename requires a deliberate update.
 */
import { describe, it, expect } from 'vitest'
import { IPC } from '../electron/ipc-channels.ts'

describe('IPC channel contract', () => {
  it('exposes the two substrate channels with stable names', () => {
    expect(IPC.RENDERER_MESSAGE).toBe('avc:renderer-message')
    expect(IPC.HOST_MESSAGE).toBe('avc:host-message')
  })

  it('channels are unique', () => {
    const names = Object.values(IPC)
    expect(new Set(names).size).toBe(names.length)
  })

  it('channels use the avc: namespace (not shadow: or vscode:)', () => {
    for (const name of Object.values(IPC)) {
      expect(name).toMatch(/^avc:/)
      expect(name).not.toMatch(/^(shadow|vscode):/)
    }
  })

  it('IPC is frozen (no accidental mutation)', () => {
    expect(Object.isFrozen(IPC)).toBe(true)
  })
})
