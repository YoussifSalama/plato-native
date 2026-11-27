import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOW_MEMORY_BYTES, memoryLow, readMachine, tabCap, tabsFor } from '../src/core/capacity';

const GB = 1024 ** 3;
afterEach(() => vi.unstubAllGlobals());

describe('capacity: how many jobs at once this computer can take', () => {
  it('a light computer (4 cores or 4 GB or less) gets 2, a strong one (8+ cores and 8+ GB) 8, the rest 4; unknown is standard', () => {
    expect(tabCap({ cores: 4, memoryGB: 16 }).tabs).toBe(2);
    expect(tabCap({ cores: 12, memoryGB: 4 }).tabs).toBe(2);
    expect(tabCap({ cores: 8, memoryGB: 16 }).tabs).toBe(8);
    expect(tabCap({ cores: 6, memoryGB: 16 }).tabs).toBe(4);
    expect(tabCap({ cores: 8, memoryGB: null }).tabs).toBe(4);
    expect(tabCap({ cores: null, memoryGB: null })).toMatchObject({ tabs: 4, label: 'standard' });
    expect(tabCap({ cores: 8, memoryGB: 16 }).why).toContain('8 processor cores and 16 GB of memory');
  });

  it('the Speed setting within it: Careful 2; Smart follows the computer; Fast 8, or 4 on a light one; never past the ceiling', () => {
    const light = tabCap({ cores: 2, memoryGB: 4 });
    const strong = tabCap({ cores: 16, memoryGB: 32 });
    expect(tabsFor('careful', strong, 10)).toBe(2);
    expect([tabsFor('smart', light, 10), tabsFor('smart', strong, 10), tabsFor(undefined, null, 10)]).toEqual([2, 8, 4]);
    expect([tabsFor('fast', light, 10), tabsFor('fast', strong, 10)]).toEqual([4, 8]);
    expect(tabsFor('fast', strong, 3)).toBe(3);
  });

  it('the server stays in charge when it asks for fewer than its Speed normally means; its usual value lets the computer decide', () => {
    const strong = tabCap({ cores: 16, memoryGB: 32 });
    expect(tabsFor('smart', strong, 10, 1)).toBe(1); // a limit set on purpose (the test server sends 1)
    expect(tabsFor('smart', strong, 10, 4)).toBe(8); // Smart's usual 4: the computer decides
    expect(tabsFor('fast', strong, 10, 3)).toBe(3);
    expect(tabsFor('careful', strong, 10, 2)).toBe(2);
  });

  it('reads chrome.system when it is there, the page’s navigator when not; low memory is under 1 GB free', async () => {
    vi.stubGlobal('chrome', { system: { cpu: { getInfo: async () => ({ numOfProcessors: 8 }) }, memory: { getInfo: async () => ({ capacity: 16 * GB, availableCapacity: LOW_MEMORY_BYTES / 2 }) } } });
    expect(await readMachine()).toEqual({ cores: 8, memoryGB: 16 });
    expect(await memoryLow()).toBe(true);
    vi.stubGlobal('chrome', {});
    vi.stubGlobal('navigator', { hardwareConcurrency: 4, deviceMemory: 8 });
    expect(await readMachine()).toEqual({ cores: 4, memoryGB: 8 });
    expect(await memoryLow()).toBe(false); // unknown is not low
  });
});
