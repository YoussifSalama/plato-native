/* eslint-disable */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} })); // ESM-only; the controllers only need the token
import { ApplyItemState } from '@prisma/client';
import { transitionSchema } from './extension.controllers';
import {
  ITEM_STATES,
  LEASE_MS,
  PRE_ARMED,
  TERMINAL,
  TRANSITION_TARGETS,
  TRANSITIONS,
} from './batch-state';

// The backend half of the contract with the browser extension. The extension
// repo runs the mirror of this test against its own copy of the JSON.
const here = join(__dirname, 'extension-contract.json');
const contract = JSON.parse(readFileSync(here, 'utf8'));

describe('extension contract (backend side)', () => {
  it('batch-state.ts equals the contract JSON', () => {
    expect([...ITEM_STATES]).toEqual(contract.states);
    expect(TRANSITIONS).toEqual(contract.transitions);
    expect(PRE_ARMED).toEqual(contract.preArmed);
    expect(TERMINAL).toEqual(contract.terminal);
    expect([...TRANSITION_TARGETS]).toEqual(contract.transitionTargets);
    expect(LEASE_MS).toBe(contract.leaseMs);
  });

  it('the Prisma enum has exactly these states', () => {
    expect(Object.keys(ApplyItemState).sort()).toEqual([...contract.states].sort());
  });

  it('the transition body schema takes exactly the contract targets and detail keys', () => {
    const detail = transitionSchema.shape.detail.unwrap();
    expect([...detail.keyof().options].sort()).toEqual([...contract.detailKeys].sort());
    const ok = (to: string) => transitionSchema.safeParse({ attempt_id: 'a', seq: 1, to }).success;
    for (const to of contract.states)
      expect(ok(to)).toBe(contract.transitionTargets.includes(to));
  });

  it('internal consistency: terminal states have no exits, targets are reachable', () => {
    for (const t of contract.terminal) expect(contract.transitions[t]).toEqual([]);
    const reachable = new Set(Object.values(contract.transitions).flat());
    for (const t of contract.transitionTargets) expect(reachable.has(t)).toBe(true);
  });

  // Local dev (repos side by side): the two copies must not drift. In a
  // standalone checkout this only checks the backend against its own copy.
  const sibling = join(__dirname, '../../../../plato-extension/src/core/extension-contract.json');
  (existsSync(sibling) ? it : it.skip)('is byte-identical to the extension copy', () => {
    expect(readFileSync(sibling, 'utf8')).toBe(readFileSync(here, 'utf8'));
  });
});
