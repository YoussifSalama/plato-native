import { registerAs } from '@nestjs/config';
import { IEnvParams, IEnvType } from '../../types/config/env.types';

export default registerAs('env', (): IEnvParams => ({
  nodeEnv: (process.env.NODE_ENV as IEnvType) ?? 'development',
  dbUri: process.env.DB_URI ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
  r2AccessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID ?? '',
  r2SecretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY ?? '',
  r2Endpoint: process.env.CLOUDFLARE_S3_CLIENT_API ?? '',
  r2BucketName: process.env.CLOUDFLARE_BUCKET_NAME ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  profileExtractionModel: process.env.PROFILE_EXTRACTION_MODEL ?? 'gpt-4o',
  // gpt-4.1-nano: OpenAI's cheapest text model — plenty for a short FAQ/chat assistant.
  chatModel: process.env.CHAT_MODEL ?? 'gpt-4.1-nano',
  // Tool use and instruction following matter more than cost here.
  careerModel: process.env.CAREER_MODEL ?? 'gpt-4.1',
  // Reads the live web for the Career assistant (needs a model with web search).
  careerSearchModel: process.env.CAREER_SEARCH_MODEL ?? 'gpt-4.1-mini',
  // Voice interviews (WebRTC from the browser). Mini keeps a 15-minute session in the cents.
  // Header key for the internal usage report (/admin/usage/summary). Unset = report disabled.
  adminReportKey: process.env.ADMIN_REPORT_KEY ?? '',
  realtimeModel: process.env.REALTIME_MODEL ?? 'gpt-realtime-mini',
  apifyToken: process.env.APIFY_TOKEN ?? '',
  // Apply worker: runs by default and REALLY SUBMITS (product decision,
  // 2026-09-19: "no dry run any more, submit always"). What protects
  // employers and the seeker is in the pipeline, not in a rehearsal mode:
  // eligibility check, typed answers, the pre-send validator, and
  // "SUBMITTED only on the site's own confirmation".
  // APPLY_DRY_RUN=true remains only as a developer switch for building a
  // new adapter without sending anything.
  applyWorkerEnabled: process.env.APPLY_WORKER_ENABLED !== 'false',
  applyDryRun: process.env.APPLY_DRY_RUN === 'true',
  // Auto-apply answers screening questions itself. 'true' parks each
  // application for the seeker to review the drafts first.
  applyConfirmAnswers: process.env.APPLY_CONFIRM_ANSWERS === 'true',
  applyMaxAttempts: Number(process.env.APPLY_MAX_ATTEMPTS) || 3,
  // Playwright drives the installed browser; no bundled download.
  applyBrowserChannel: process.env.APPLY_BROWSER_CHANNEL ?? 'chrome',
  applyHeadless: process.env.APPLY_HEADLESS !== 'false',
  // With a visible browser: how long the window stays open for a person
  // to complete a human-verification step before Plato gives up waiting.
  applyVerificationWaitSec:
    Number(process.env.APPLY_VERIFICATION_WAIT_SEC) || 300,
  applyAnswerModel: process.env.APPLY_ANSWER_MODEL ?? 'gpt-4.1-mini',
  applyResumeModel: process.env.APPLY_RESUME_MODEL ?? 'gpt-4.1-mini',
  // Write a resume for each job instead of attaching the uploaded CV.
  applyTailorResume: process.env.APPLY_TAILOR_RESUME !== 'false',
}));
