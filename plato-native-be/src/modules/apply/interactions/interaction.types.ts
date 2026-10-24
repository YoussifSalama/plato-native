export type InteractionMode = 'fast' | 'normal' | 'slow';

export interface InteractionPolicy {
  mode: InteractionMode;

  actionDelay: {
    min: number;
    max: number;
  };

  typing: {
    minDuration: number;
    maxDuration: number;
  };

  actionTimeout: number;
}
