import {
  Controller,
  Get,
  NotFoundException,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { map } from 'rxjs';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { JobSeekerService } from '../user/job-seeker.service';
import {
  alertNotification,
  applicationNotification,
  NOTIFY_APPLICATION_STATUSES,
  runNotification,
} from './notification-factory';
import { NotificationsBus } from './notifications.bus';

const FEED_LIMIT = 60;

@Controller('job-seeker/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: NotificationsBus,
    private readonly jobSeekerService: JobSeekerService,
  ) {}

  private async requireJobSeekerId(userId: string) {
    const jobSeeker = await this.jobSeekerService.getByUserId(userId);
    if (!jobSeeker) throw new NotFoundException('Job seeker profile not found');
    return jobSeeker.id;
  }

  // The feed is derived from runs, applications and job-alert digests, not stored separately:
  // ponytail: no notifications collection — add one when a notification needs to outlive its source row or be dismissed server-side.
  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const job_seeker_id = await this.requireJobSeekerId(req.userId);
    const [runs, applications, digests] = await Promise.all([
      this.prisma.discoveryRun.findMany({
        where: { job_seeker_id },
        orderBy: { started_at: 'desc' },
        take: FEED_LIMIT,
      }),
      this.prisma.jobApplication.findMany({
        where: {
          job_seeker_id,
          OR: [
            { status: { in: NOTIFY_APPLICATION_STATUSES as never } },
            // Extension engine, waiting for the seeker to settle a VERIFY.
            { status: 'EXTENSION_ACTIVE', verify_attempt: { not: null } },
          ],
        },
        include: { job: { select: { title: true, company: true } } },
        orderBy: { updated_at: 'desc' },
        take: FEED_LIMIT,
      }),
      this.prisma.alertDigest.findMany({
        where: { job_seeker_id },
        orderBy: { created_at: 'desc' },
        take: FEED_LIMIT,
      }),
    ]);
    return [
      ...runs.map(runNotification),
      ...applications
        // Sites Plato can't apply on are listed on the Applications page;
        // one bell entry each would just be noise.
        .filter(
          (a) =>
            (a.needs_input as { reason?: string } | null)?.reason !==
            'unsupported',
        )
        .map(applicationNotification),
      ...digests.map(alertNotification),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, FEED_LIMIT);
  }

  @Sse('events')
  async events(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.bus.stream(jobSeekerId).pipe(map((data) => ({ data })));
  }
}
