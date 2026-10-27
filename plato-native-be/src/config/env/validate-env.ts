// Checked once at boot (ConfigModule's validate): a missing or malformed
// setting stops the API with one message listing every problem, instead of a
// failure deep inside the first request that needs it. Values are never
// printed, only names: some are secrets.

type Env = Record<string, unknown>;

// Without these nothing works: database, sessions, AI, file storage.
const REQUIRED = [
  'DB_URI',
  'JWT_SECRET',
  'OPENAI_API_KEY',
  'CLOUDFLARE_ACCESS_KEY_ID',
  'CLOUDFLARE_SECRET_ACCESS_KEY',
  'CLOUDFLARE_S3_CLIENT_API',
  'CLOUDFLARE_BUCKET_NAME',
];

// Settings that only work as a pair: one without the other is a mistake.
const PAIRS: [string, string, string][] = [
  ['SENDGRID_API_KEY', 'MAIL_FROM', 'email'],
  ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY', 'the Adzuna feed'],
];

const URLS = [
  'FRONTEND_URL',
  'API_PUBLIC_URL',
  'EXTENSION_ORIGIN',
  'CLOUDFLARE_S3_CLIENT_API',
];

const POSITIVE_NUMBERS = [
  'PORT',
  'MAX_POSTING_AGE_DAYS',
  'APPLY_MAX_ATTEMPTS',
  'APPLY_VERIFICATION_WAIT_SEC',
  'CREDITS_USD_PER_TOKEN',
  'CREDITS_VOICE_USD_PER_MINUTE',
  'CREDITS_FREE_MONTHLY',
  'CREDITS_PRO_MONTHLY',
  'CREDITS_MAX_MONTHLY',
  'CREDITS_PRO_PRICE_USD',
  'CREDITS_MAX_PRICE_USD',
  'CREDITS_TOPUP_SMALL_USD',
  'CREDITS_TOPUP_MEDIUM_USD',
  'CREDITS_TOPUP_LARGE_USD',
];

const set = (env: Env, k: string) =>
  typeof env[k] === 'string' && env[k].trim() !== '';

export function envProblems(env: Env): string[] {
  const out: string[] = [];
  const prod = env.NODE_ENV === 'production';

  for (const k of REQUIRED) if (!set(env, k)) out.push(`${k} is missing`);

  if (prod) {
    if (!set(env, 'FRONTEND_URL'))
      out.push(
        'FRONTEND_URL is missing (needed in production for CORS and email links)',
      );
    // A short secret can be guessed offline from any session cookie.
    if (set(env, 'JWT_SECRET') && (env.JWT_SECRET as string).length < 32)
      out.push('JWT_SECRET must be at least 32 characters in production');
  }

  for (const [a, b, what] of PAIRS)
    if (set(env, a) !== set(env, b))
      out.push(`${a} and ${b} go together (${what}): set both or neither`);

  if (
    set(env, 'MAIL_FROM') &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.MAIL_FROM as string)
  )
    out.push('MAIL_FROM must be an email address');

  for (const k of URLS) {
    if (!set(env, k)) continue;
    try {
      const u = new URL(env[k] as string);
      if (!/^(https?|chrome-extension):$/.test(u.protocol)) throw new Error();
    } catch {
      out.push(`${k} must be a full URL (https://...)`);
    }
  }

  for (const k of POSITIVE_NUMBERS) {
    if (!set(env, k)) continue;
    const n = Number(env[k]);
    if (!Number.isFinite(n) || n <= 0)
      out.push(`${k} must be a positive number`);
  }

  return out;
}

export function validateEnv(env: Env): Env {
  const problems = envProblems(env);
  if (problems.length)
    throw new Error(
      `The API can't start, its settings need attention:\n${problems.map((p) => `  - ${p}`).join('\n')}\nSee the README (Deployment) and .env.example.`,
    );
  return env;
}
