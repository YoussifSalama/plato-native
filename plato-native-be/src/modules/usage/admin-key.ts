import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { IEnvParams } from '../../types/config/env.types';

const digest = (s: string) => createHash('sha256').update(s).digest();

// Internal admin routes: a wrong or missing x-admin-key looks like no route at
// all (404), and so does a server with no ADMIN_REPORT_KEY configured. Digests
// are compared, so neither the key nor its length leaks through timing.
export function assertAdminKey(config: ConfigService, key: string | undefined) {
  const expected = config.get<IEnvParams>('env')!.adminReportKey;
  const ok =
    !!expected && !!key && timingSafeEqual(digest(key), digest(expected));
  if (!ok) throw new NotFoundException();
}
