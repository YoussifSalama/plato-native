/**
 * Same input, same answer: temperature 0 for the model calls a search is built from (CV reading, preference
 * suggestion, title planning). QC 2026-11-26: one CV read three times gave 42, 32 and 44 skills and three different
 * work modes. Reasoning models (o-series, gpt-5) refuse the setting, so they get none.
 */
export const steady = (model: string) =>
  /^(o\d|gpt-5)/i.test(model) ? {} : { modelSettings: { temperature: 0 } };
