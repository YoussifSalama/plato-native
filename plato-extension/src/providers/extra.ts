import type { ProviderDefinition } from './types';

// Production: no extra providers. The fixtures build swaps this module for
// extra.fixtures.ts (scripts/build.mjs), so fixture code is never bundled here.
export const extraProviders: ProviderDefinition[] = [];
