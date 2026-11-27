// How many jobs Plato works on at once on THIS computer. The seeker's Speed (set on the Plato website) says how
// hard to push; the computer says how hard it can be pushed: a weak laptop with 4 GB gets 2 tabs, a strong one 8.
// Before each new tab the free memory is checked too, so a busy machine waits for a tab to finish instead of
// slowing everything down. Read through chrome.system.* (no install warning), falling back to what the page knows.

import type { RunSettings } from './types';

export interface Machine {
  cores: number | null; // logical processors
  memoryGB: number | null; // total RAM
}
export interface Capacity {
  tabs: number; // the most this computer should run at once
  label: 'light' | 'standard' | 'strong';
  why: string; // for the seeker: what Plato saw
}

/** Below this much free memory, no new tab is opened while another job is still running. */
export const LOW_MEMORY_BYTES = 1024 ** 3;

const GB = 1024 ** 3;
const said = (m: Machine) => [m.cores ? `${m.cores} processor cores` : null, m.memoryGB ? `${m.memoryGB} GB of memory` : null].filter(Boolean).join(' and ') || 'its hardware';

/** The computer's ceiling: light (≤4 cores or ≤4 GB) → 2, strong (≥8 cores and ≥8 GB) → 8, else 4. Unknown counts as standard. */
export function tabCap(m: Machine): Capacity {
  const light = (m.cores !== null && m.cores <= 4) || (m.memoryGB !== null && m.memoryGB <= 4);
  const strong = m.cores !== null && m.cores >= 8 && m.memoryGB !== null && m.memoryGB >= 8;
  if (light) return { tabs: 2, label: 'light', why: `This computer has ${said(m)}, so Plato works on 2 jobs at once.` };
  if (strong) return { tabs: 8, label: 'strong', why: `This computer has ${said(m)}, so Plato can work on up to 8 jobs at once.` };
  return { tabs: 4, label: 'standard', why: `This computer has ${said(m)}, so Plato works on up to 4 jobs at once.` };
}

// What each Speed normally means on the server (plato-native-be extension/settings.ts SPEED_TABS).
const NOMINAL = { careful: 2, smart: 4, fast: 8 } as const;

/**
 * Tabs at once for this seeker on this computer. Careful: 2. Smart (the default): what the computer can take.
 * Fast: 8, or 4 on a light computer. The server stays in charge when it asks for fewer than its Speed normally
 * means (`serverTabs` below the nominal value: a limit it set on purpose). Never more than `max`.
 */
export function tabsFor(speed: RunSettings['speed'] | undefined, cap: Capacity | null, max: number, serverTabs?: number | null): number {
  const c = cap?.tabs ?? 4;
  let n = speed === 'careful' ? 2 : speed === 'fast' ? (c <= 2 ? 4 : 8) : c;
  if (serverTabs != null && serverTabs < NOMINAL[speed ?? 'smart']) n = Math.min(n, serverTabs);
  return Math.max(1, Math.min(n, max));
}

type SystemApi = {
  cpu?: { getInfo(): Promise<{ numOfProcessors: number }> };
  memory?: { getInfo(): Promise<{ capacity: number; availableCapacity: number }> };
};
const system = (): SystemApi | undefined => (globalThis as { chrome?: { system?: SystemApi } }).chrome?.system;

/** What this computer has. chrome.system first (exact); the page's navigator otherwise (memory rounded, at most 8). */
export async function readMachine(): Promise<Machine> {
  const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
  const [cpu, mem] = await Promise.all([system()?.cpu?.getInfo().catch(() => null), system()?.memory?.getInfo().catch(() => null)]);
  return {
    cores: cpu?.numOfProcessors ?? nav?.hardwareConcurrency ?? null,
    memoryGB: mem ? Math.round(mem.capacity / GB) : (nav?.deviceMemory ?? null),
  };
}

/** True when free memory is too low to open another tab now. Unknown (no chrome.system) = not low. */
export async function memoryLow(): Promise<boolean> {
  const mem = await system()?.memory?.getInfo().catch(() => null);
  return !!mem && mem.availableCapacity < LOW_MEMORY_BYTES;
}
