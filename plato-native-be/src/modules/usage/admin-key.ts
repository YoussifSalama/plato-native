import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { IEnvParams } from '../../types/config/env.types';

// Internal admin routes: a wrong or missing x-admin-key looks like no route at
// all (404), and so does a server with no ADMIN_REPORT_KEY configured.
export function assertAdminKey(config: ConfigService, key: string | undefined) {
  const expected = config.get<IEnvParams>('env')!.adminReportKey;
  const ok =
    !!expected &&
    !!key &&
    key.length === expected.length &&
    timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  if (!ok) throw new NotFoundException();
}
