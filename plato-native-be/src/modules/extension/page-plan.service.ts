import { z } from 'zod';

// The page as the extension snapshots it, for the one-decision call (answers.service.ts). The page
// text and control labels are untrusted (any website): capped, typed, passed to the model as data,
// and the model's answer is re-validated against the same list (page-plan.guard.ts).
const t = (n: number) => z.string().max(n);
export const planBodySchema = z.object({
  snapshot: z.object({
    url: t(300),
    title: t(200),
    dialogOpen: z.boolean(),
    dialogTitle: t(200),
    elements: z.array(z.object({ ref: z.string().regex(/^e\d{1,3}$/), role: t(10), label: t(100) })).max(60),
    fields: z.object({ total: z.number().int().min(0).max(500), empty: z.number().int().min(0).max(500) }),
    alerts: z.array(t(240)).max(6),
    text: t(1600),
  }),
  history: z.array(z.object({ action: t(12), intent: t(12).nullable(), label: t(100) })).max(12),
  autoSubmit: z.boolean(),
});
export type PlanBody = z.infer<typeof planBodySchema>;
