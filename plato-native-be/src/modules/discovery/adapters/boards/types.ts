import { JobSource } from '@prisma/client';
import { DiscoveryQuery, NormalizedJob } from '../types';

// ISO country code the board serves (see ../../countries).
export type Country = string;

// One Apify-backed job board: which actor, what to send it, how to read
// what comes back. Everything else (fan-out, budget, failures) is shared.
export interface BoardDef<T = unknown> {
  source: JobSource;
  countries: Country[];
  actorId: string;
  // A remote-work board with no country of its own: one run per search (not per
  // country), only for seekers who want remote work. `perTitle: false` for boards
  // that cannot filter by title: one run, then the title match is done here.
  anywhere?: boolean;
  perTitle?: boolean;
  // Extra say on who may apply, from the board's own fields (e.g. a list of accepted countries).
  accepts?: (item: unknown, countries: string[]) => boolean;
  input(args: {
    title: string;
    location: string;
    country: Country;
    limit: number;
    query: DiscoveryQuery;
  }): Record<string, unknown>;
  // null = item unusable (no url/title); dropped.
  map(item: T, country: Country): NormalizedJob | null;
}

export const defineBoard = <T>(def: BoardDef<T>) => def as unknown as BoardDef;
