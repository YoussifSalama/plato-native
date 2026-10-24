import type { InteractionPolicy, InteractionMode } from './interaction.types';

export const INTERACTION_POLICIES: Record<InteractionMode, InteractionPolicy> =
  {
    fast: {
      mode: 'fast',
      actionDelay: {
        min: 100,
        max: 400,
      },
      typing: {
        minDuration: 300,
        maxDuration: 1000,
      },
      actionTimeout: 10_000,
    },

    normal: {
      mode: 'normal',
      actionDelay: {
        min: 400,
        max: 1200,
      },
      typing: {
        minDuration: 1000,
        maxDuration: 3000,
      },
      actionTimeout: 15_000,
    },

    slow: {
      mode: 'slow',
      actionDelay: {
        min: 800,
        max: 2000,
      },
      typing: {
        minDuration: 2000,
        maxDuration: 5000,
      },
      actionTimeout: 20_000,
    },
  };
