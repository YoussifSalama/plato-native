export type IEnvType = 'development' | 'test' | 'production';

export interface IEnvParams {
  nodeEnv: IEnvType;
  dbUri: string;
  jwtSecret: string;
  frontendUrl: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Endpoint: string;
  r2BucketName: string;
  openaiApiKey: string;
  profileExtractionModel: string;
  chatModel: string;
  careerModel: string;
  careerSearchModel: string;
  realtimeModel: string;
  adminReportKey: string;
  apifyToken: string;
  // Apply worker. ON and always submitting. APPLY_WORKER_ENABLED=false pauses
  // it; APPLY_DRY_RUN=true is a developer-only rehearsal switch.
  applyWorkerEnabled: boolean;
  applyDryRun: boolean;
  applyConfirmAnswers: boolean;
  applyMaxAttempts: number;
  applyBrowserChannel: string;
  applyHeadless: boolean;
  applyVerificationWaitSec: number;
  applyAnswerModel: string;
  applyResumeModel: string;
  applyTailorResume: boolean;
}
