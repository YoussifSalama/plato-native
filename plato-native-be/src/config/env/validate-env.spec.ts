import { envProblems, validateEnv } from './validate-env';

const good = {
  NODE_ENV: 'production',
  DB_URI: 'mongodb://db/plato',
  JWT_SECRET: 'x'.repeat(40),
  OPENAI_API_KEY: 'sk-test',
  CLOUDFLARE_ACCESS_KEY_ID: 'a',
  CLOUDFLARE_SECRET_ACCESS_KEY: 'b',
  CLOUDFLARE_S3_CLIENT_API: 'https://acc.r2.cloudflarestorage.com',
  CLOUDFLARE_BUCKET_NAME: 'plato',
  FRONTEND_URL: 'https://app.plato.ai',
};

describe('settings checked at boot', () => {
  it('a complete production setup starts', () => {
    expect(envProblems(good)).toEqual([]);
    expect(validateEnv(good)).toBe(good);
  });

  it('names every problem at once, never a value', () => {
    const env = {
      ...good,
      DB_URI: '',
      JWT_SECRET: 'short-secret-value',
      SENDGRID_API_KEY: 'SG.secret-value',
      FRONTEND_URL: 'app.plato.ai',
      CREDITS_PRO_MONTHLY: 'lots',
    };
    const problems = envProblems(env);
    expect(problems).toEqual([
      'DB_URI is missing',
      'JWT_SECRET must be at least 32 characters in production',
      'SENDGRID_API_KEY and MAIL_FROM go together (email): set both or neither',
      'FRONTEND_URL must be a full URL (https://...)',
      'CREDITS_PRO_MONTHLY must be a positive number',
    ]);
    let message = '';
    try {
      validateEnv(env);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('DB_URI is missing');
    expect(message).not.toContain('short-secret-value');
    expect(message).not.toContain('SG.secret-value');
  });

  it('development is lenient about the frontend URL and secret length', () => {
    expect(
      envProblems({
        ...good,
        NODE_ENV: 'development',
        FRONTEND_URL: '',
        JWT_SECRET: 'dev',
      }),
    ).toEqual([]);
  });

  it('the extension origin may be a chrome-extension:// URL', () => {
    expect(
      envProblems({
        ...good,
        EXTENSION_ORIGIN: 'chrome-extension://abcdefghijklmnop',
      }),
    ).toEqual([]);
  });
});
