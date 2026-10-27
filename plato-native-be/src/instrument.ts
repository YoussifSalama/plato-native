import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent } from '@sentry/nestjs';

// Unexpected errors (5xx, crashes) go to Sentry when SENTRY_DSN is set; with
// no DSN nothing is sent anywhere. Loaded before the app so Sentry can hook in.
// What leaves the server is the error and its stack: never request bodies (CVs,
// passwords, answers), cookies or auth headers.
const SENSITIVE_HEADER = /^(cookie|authorization|x-admin-key|x-api-key)$/i;

export function scrub(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers)
      for (const h of Object.keys(event.request.headers))
        if (SENSITIVE_HEADER.test(h)) delete event.request.headers[h];
  }
  if (event.user) event.user = { id: event.user.id };
  return event;
}

if (process.env.SENTRY_DSN)
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    // Errors only, no performance tracing.
    tracesSampleRate: 0,
    beforeSend: scrub,
  });
