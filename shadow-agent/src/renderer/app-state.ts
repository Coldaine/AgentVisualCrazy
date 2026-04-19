/**
 * Pure App state machine for the Shadow Agent renderer.
 *
 * Extracted from App.tsx so that state transitions are independently testable
 * without React Testing Library or jsdom.  App.tsx should use
 * `useReducer(appReducer, initialAppState())` to consume this.
 */
import type { SnapshotPayload } from '../shared/schema';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type BusyKind = 'booting' | 'loading' | 'exporting';

export interface AppState {
  /** Non-null while an async operation is in flight. */
  busy: BusyKind | null;
  /** Last error message, or null when the previous operation succeeded. */
  error: string | null;
  /** The current snapshot loaded from a fixture, replay, or transcript. */
  snapshot: SnapshotPayload | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type AppAction =
  | { type: 'BOOT_START' }
  | { type: 'BOOT_SUCCESS'; snapshot: SnapshotPayload }
  | { type: 'BOOT_ERROR'; message: string }
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; snapshot: SnapshotPayload }
  | { type: 'LOAD_CANCELLED' }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'EXPORT_START' }
  | { type: 'EXPORT_SUCCESS' }
  | { type: 'EXPORT_ERROR'; message: string };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function initialAppState(): AppState {
  return { busy: 'booting', error: null, snapshot: null };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'BOOT_START':
      return { ...state, busy: 'booting', error: null };

    case 'BOOT_SUCCESS':
      return { busy: null, error: null, snapshot: action.snapshot };

    case 'BOOT_ERROR':
      return { ...state, busy: null, error: action.message };

    case 'LOAD_START':
      return { ...state, busy: 'loading', error: null };

    case 'LOAD_SUCCESS':
      return { busy: null, error: null, snapshot: action.snapshot };

    case 'LOAD_CANCELLED':
      return { ...state, busy: null };

    case 'LOAD_ERROR':
      return { ...state, busy: null, error: action.message };

    case 'EXPORT_START':
      return { ...state, busy: 'exporting', error: null };

    case 'EXPORT_SUCCESS':
      return { ...state, busy: null, error: null };

    case 'EXPORT_ERROR':
      return { ...state, busy: null, error: action.message };

    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}
