import type { PolicyMap, ProviderPolicy } from '../core/types';
import { isAllowedPattern, matchesPattern } from './match';
import type { PageClassification, ProviderDefinition } from './types';

/** FILL_ONLY needs BOTH sides to say so. Unknown or missing = BLOCKED. */
export const effectivePolicy = (local: ProviderPolicy, server: ProviderPolicy | undefined): ProviderPolicy =>
  local === 'FILL_ONLY' && server === 'FILL_ONLY' ? 'FILL_ONLY' : 'BLOCKED';

export type UnsupportedReason =
  | 'invalid_url'
  | 'unknown_site'
  | 'outside_scope'
  | 'provider_blocked'
  | 'no_adapter'
  | 'apply_route_unknown';

export type RouteResult =
  | { status: 'supported'; provider: string; classification: PageClassification }
  | { status: 'blocked' | 'unsupported'; provider: string | null; reason: UnsupportedReason; classification?: PageClassification };

export function createRegistry(defs: ProviderDefinition[]) {
  const ids = new Set<string>();
  for (const d of defs) {
    if (ids.has(d.id)) throw new Error(`Duplicate provider ${d.id}`);
    ids.add(d.id);
    for (const p of d.urlPatterns)
      if (!isAllowedPattern(p)) throw new Error(`Provider ${d.id}: pattern not allowed: ${p}`);
  }
  const byId = new Map(defs.map((d) => [d.id, d]));

  const registry = {
    all: defs,
    get: (id: string) => byId.get(id),
    policyOf: (id: string, server?: PolicyMap): ProviderPolicy => {
      const d = byId.get(id);
      return d ? effectivePolicy(d.policy, server?.[id]) : 'BLOCKED';
    },
    /** Match patterns that may go into the manifest: FILL_ONLY providers only. */
    enabledMatches: () => defs.filter((d) => d.policy === 'FILL_ONLY').flatMap((d) => d.urlPatterns),

    /** Which provider (if any) owns this URL, then what the extension may do with it. */
    route(rawUrl: string, server?: PolicyMap): RouteResult {
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        return { status: 'unsupported', provider: null, reason: 'invalid_url' };
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:')
        return { status: 'unsupported', provider: null, reason: 'invalid_url' };
      const owner = defs.find((d) => d.urlPatterns.some((p) => matchesPattern(p, url)));
      if (!owner) {
        // A site we know but outside the provider's URL scope, or a stranger.
        const host = defs.find((d) => d.hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`)));
        return host
          ? { status: 'unsupported', provider: host.id, reason: 'outside_scope' }
          : { status: 'unsupported', provider: null, reason: 'unknown_site' };
      }
      const def = owner;
      const classification = def.classify(url);
      if (classification.page === 'other')
        return { status: 'unsupported', provider: def.id, reason: 'outside_scope', classification };
      if (registry.policyOf(def.id, server) !== 'FILL_ONLY')
        return { status: 'blocked', provider: def.id, reason: 'provider_blocked', classification };
      if (!def.adapter)
        return { status: 'unsupported', provider: def.id, reason: 'no_adapter', classification };
      if (classification.applyVia === 'unknown')
        return { status: 'unsupported', provider: def.id, reason: 'apply_route_unknown', classification };
      return { status: 'supported', provider: def.id, classification };
    },
  };
  return registry;
}
export type Registry = ReturnType<typeof createRegistry>;
