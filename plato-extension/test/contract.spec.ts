import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canMove, LEASE_MS, PRE_ARMED, TERMINAL, TRANSITIONS } from '../src/core/contract';
import { ITEM_STATES } from '../src/core/types';

const ours = join(__dirname, '../src/core/extension-contract.json');
const contract = JSON.parse(readFileSync(ours, 'utf8'));

describe('state-machine contract with the backend (extension side)', () => {
  it('our types and tables equal the contract JSON', () => {
    expect([...ITEM_STATES]).toEqual(contract.states);
    expect(TRANSITIONS).toEqual(contract.transitions);
    expect(PRE_ARMED).toEqual(contract.preArmed);
    expect(TERMINAL).toEqual(contract.terminal);
    expect(LEASE_MS).toBe(contract.leaseMs);
  });

  it('safety properties we rely on hold in the contract', () => {
    // once armed there is no way to cancel, fail or skip without a person settling it
    expect(TRANSITIONS.AWAITING_SUBMIT).toEqual(['SUBMITTED_CONFIRMED', 'SUBMITTED_ATTESTED', 'VERIFY']);
    expect(canMove('AWAITING_SUBMIT', 'CANCELLED')).toBe(false);
    expect(canMove('VERIFY', 'AWAITING_SUBMIT')).toBe(false);
    for (const s of TERMINAL) expect(TRANSITIONS[s]).toEqual([]);
    // only /claim creates PENDING -> CLAIMED; nothing can move into either
    for (const targets of Object.values(TRANSITIONS)) expect(targets).not.toContain('PENDING');
    for (const targets of Object.values(TRANSITIONS)) expect(targets).not.toContain('CLAIMED');
    // nothing ever moves back to a pre-armed state from an armed or settled one
    for (const from of ['AWAITING_SUBMIT', 'VERIFY', ...TERMINAL] as const)
      for (const to of PRE_ARMED) expect(canMove(from, to)).toBe(false);
  });

  // Drift check against the backend's copy: side-by-side checkout, or a URL
  // (PLATO_CONTRACT_URL, e.g. the raw file on the backend's main branch) in CI.
  const sibling = join(__dirname, '../../plato-native-be/src/modules/extension/extension-contract.json');
  const url = process.env.PLATO_CONTRACT_URL;

  (existsSync(sibling) ? it : it.skip)('is byte-identical to the backend copy (sibling checkout)', () => {
    expect(readFileSync(ours, 'utf8')).toBe(readFileSync(sibling, 'utf8'));
  });

  (url ? it : it.skip)('is byte-identical to the backend copy (PLATO_CONTRACT_URL)', async () => {
    const res = await fetch(url!);
    expect(res.ok).toBe(true);
    expect(readFileSync(ours, 'utf8')).toBe(await res.text());
  });
});
