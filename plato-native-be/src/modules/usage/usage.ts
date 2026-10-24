import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Observable } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { llmCost } from './pricing';

// Request-scoped user id, so the 11 LLM call sites and the Apify client
// don't each need a userId threaded through.
// ponytail: background work with no request (apply worker) logs user_id null; pass it explicitly there if per-user numbers are needed.
const als = new AsyncLocalStorage<string>();
const logger = new Logger('Usage');

export function recordUsage(row: {
  feature: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  apify_usd?: number;
  cost_usd?: number | null;
  meta?: Prisma.InputJsonValue;
}) {
  const db = PrismaService.instance;
  if (!db) return;
  // Metering must never break the feature it measures.
  db.usageEvent
    .create({
      data: {
        ...row,
        cost_usd:
          row.cost_usd ??
          row.apify_usd ??
          llmCost(row.model, row.input_tokens, row.output_tokens),
        user_id: als.getStore() ?? null,
      },
    })
    .catch((e: Error) => logger.warn(`usage not recorded: ${e.message}`));
}

// Wrap a finished Agents SDK run: `metered('onboarding.extract', model, await run(...))`.
export function metered<
  R extends {
    rawResponses: { usage: { inputTokens: number; outputTokens: number } }[];
  },
>(feature: string, model: string, result: R): R {
  let input_tokens = 0;
  let output_tokens = 0;
  for (const r of result.rawResponses) {
    input_tokens += r.usage.inputTokens;
    output_tokens += r.usage.outputTokens;
  }
  recordUsage({ feature, model, input_tokens, output_tokens });
  return result;
}

@Injectable()
export class UsageContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const userId = ctx.switchToHttp().getRequest<{ userId?: string }>().userId;
    if (!userId) return next.handle();
    return new Observable((sub) =>
      als.run(userId, () => next.handle().subscribe(sub)),
    );
  }
}
