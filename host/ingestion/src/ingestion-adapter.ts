import type { AgentEvent } from './protocol.ts'
import {
  ObservationStore,
  type ObservationQuery,
  type ObservationStoreOptions,
  type StoredObservation,
} from './observation-store.ts'
import type {
  HarnessDriver,
  HarnessDriverStartOptions,
} from './harness-driver.ts'
import { HarnessDriverRegistry } from './harness-driver.ts'
import { createDefaultDriverRegistry } from './drivers/index.ts'

/** Injectable main→renderer push (Electron `webContents.send` shape). */
export type IpcEmitter = (channel: string, ...args: unknown[]) => void

export const DEFAULT_IPC_CHANNEL = 'agentvisual:agent-event'

export interface IngestionAdapterOptions {
  store?: ObservationStore
  storeOptions?: ObservationStoreOptions
  registry?: HarnessDriverRegistry
  /** Forward each ingested event over IPC (no-op when omitted). */
  emitIpc?: IpcEmitter
  ipcChannel?: string
  defaultHarnessId?: string
}

/**
 * Wires HarnessDrivers → ObservationStore → optional Electron IPC callback.
 *
 * The store's {@link ObservationQuery} surface is what the Mastra curator
 * will call for lookbacks (M3). The adapter owns mutation + IPC fan-out.
 */
export class IngestionAdapter {
  readonly store: ObservationStore
  readonly registry: HarnessDriverRegistry
  private readonly emitIpc: IpcEmitter | undefined
  private readonly ipcChannel: string
  private activeHarnessId: string
  private readonly attached = new Set<string>()

  constructor(options: IngestionAdapterOptions = {}) {
    this.store = options.store ?? new ObservationStore(options.storeOptions)
    this.registry = options.registry ?? createDefaultDriverRegistry()
    this.emitIpc = options.emitIpc
    this.ipcChannel = options.ipcChannel ?? DEFAULT_IPC_CHANNEL
    this.activeHarnessId = options.defaultHarnessId ?? this.registry.getDefault().id
  }

  /** Read-only query handle for curator tools. */
  get query(): ObservationQuery {
    return this.store.asQuery()
  }

  /**
   * Attach a driver so its emit sink pushes into the store (+ IPC).
   * Idempotent per driver id.
   */
  attachDriver(driver: HarnessDriver): void {
    if (this.attached.has(driver.id)) return
    driver.attach({
      emit: (event) => {
        this.push(event, driver.id)
      },
    })
    if (!this.registry.get(driver.id)) {
      this.registry.register(driver)
    }
    this.attached.add(driver.id)
  }

  /** Attach every driver currently in the registry. */
  attachAllRegistered(): void {
    for (const id of this.registry.registeredIds) {
      const driver = this.registry.get(id)
      if (driver) this.attachDriver(driver)
    }
  }

  async startDriver(
    driverId: string,
    options?: HarnessDriverStartOptions,
  ): Promise<void> {
    const driver = this.registry.get(driverId)
    if (!driver) {
      throw new Error(`Unknown harness driver: ${driverId}`)
    }
    this.attachDriver(driver)
    this.activeHarnessId = driverId
    await driver.start(options)
  }

  stopDriver(driverId: string): void {
    this.registry.get(driverId)?.stop()
  }

  stopAll(): void {
    for (const id of this.registry.registeredIds) {
      this.registry.get(id)?.stop()
    }
  }

  /** Direct push (tests, replay fixtures, future transports). */
  push(event: AgentEvent, harnessId?: string): StoredObservation {
    const id = harnessId ?? this.activeHarnessId
    const observation = this.store.append(event, id)
    this.emitIpc?.(this.ipcChannel, {
      type: 'agent-event',
      observationId: observation.id,
      harnessId: observation.harnessId,
      event: observation.event,
    })
    return observation
  }

  pushMany(events: AgentEvent[], harnessId?: string): StoredObservation[] {
    return events.map((event) => this.push(event, harnessId))
  }
}

export function createIngestionAdapter(
  options?: IngestionAdapterOptions,
): IngestionAdapter {
  const adapter = new IngestionAdapter(options)
  adapter.attachAllRegistered()
  return adapter
}
