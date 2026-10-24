import contract from './extension-contract.json';
import type { ItemState } from './types';

// The state machine the backend enforces (plato-native-be batch-state.ts),
// shared as JSON. test/contract.spec.ts pins this copy to our types and,
// when the backend is available, to the backend's copy.
export const TRANSITIONS = contract.transitions as Record<ItemState, ItemState[]>;
export const PRE_ARMED = contract.preArmed as ItemState[];
export const TERMINAL = contract.terminal as ItemState[];
export const LEASE_MS = contract.leaseMs;
export const HEARTBEAT_MS_CONTRACT = contract.heartbeatMs;
export const canMove = (from: ItemState, to: ItemState) => TRANSITIONS[from].includes(to);
