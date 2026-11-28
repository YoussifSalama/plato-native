import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ErrorLog, Prisma } from '@prisma/client';
import { AdminGuard, AdminPage } from '../admin/admin-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  ejId,
  num,
  OBJECT_ID,
  PAGE_SIZE,
  pageOf,
  parseRange,
  type Range,
  str,
} from '../usage/usage-stats';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The API shape of a row (camelCase). */
export const logOut = (r: ErrorLog) => ({
  id: r.id,
  platform: r.platform,
  source: r.source,
  module: r.module,
  page: r.page,
  method: r.method,
  path: r.path,
  status: r.status,
  code: r.code,
  message: r.message,
  explanation: r.explanation,
  data: r.data,
  userId: r.user_id,
  userEmail: r.user_email,
  ip: r.ip,
  userAgent: r.user_agent,
  createdAt: r.created_at,
});

type StopRow = {
  item: unknown;
  batch: unknown;
  job: unknown;
  seeker: unknown;
  provider?: string | null;
  state?: string;
  i: unknown;
  at: string;
  reason?: string;
  message?: string;
  code?: string;
  detail?: string;
};

// Admin panel, Logs page: failed requests (ErrorLog) and, in the extension
// views, the apply runs' stops (ApplyBatchItem.detail.stops) as source "apply".
@Controller('admin/logs')
@UseGuards(AdminGuard)
@AdminPage('logs')
export class AdminLogsController {
  constructor(private readonly prisma: PrismaService) {}

  private where(f: {
    platform?: string;
    module?: string;
    status?: string;
    q?: string;
    range?: Range;
  }): Prisma.ErrorLogWhereInput {
    const q = f.q?.trim();
    const status = f.status?.trim();
    // "404" exactly, or a class: "4xx" / "5xx"
    const cls = status && /^[1-5]xx$/i.test(status) ? Number(status[0]) * 100 : null;
    return {
      ...(f.platform && { platform: f.platform }),
      ...(f.module && { module: f.module }),
      ...(cls !== null
        ? { status: { gte: cls, lt: cls + 100 } }
        : status && Number.isFinite(Number(status)) && { status: Number(status) }),
      ...(f.range && { created_at: { gte: f.range.from, lt: f.range.to } }),
      ...(q && {
        OR: [
          { message: { contains: q, mode: 'insensitive' } },
          { path: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { user_email: { contains: q, mode: 'insensitive' } },
          { explanation: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };
  }

  @Get()
  async list(
    @Query('platform') platform?: string,
    @Query('module') module?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sort') sort = 'newest',
    @Query('page') page?: string,
  ) {
    const where = this.where({ platform, module, status, q, range: parseRange(from, to) });
    const p = pageOf(page);
    const [rows, total] = await Promise.all([
      this.prisma.errorLog.findMany({
        where,
        orderBy: { created_at: sort === 'oldest' ? 'asc' : 'desc' },
        skip: (p - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.errorLog.count({ where }),
    ]);
    return { items: rows.map(logOut), total };
  }

  @Get('facets')
  async facets(@Query('platform') platform?: string) {
    const where = this.where({ platform });
    const [modules, statuses] = await Promise.all([
      this.prisma.errorLog.groupBy({ by: ['module'], where, _count: { _all: true } }),
      this.prisma.errorLog.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);
    return {
      modules: modules
        .map((m) => ({ module: m.module, count: m._count._all }))
        .sort((a, b) => b.count - a.count),
      statuses: statuses
        .map((s) => ({ status: s.status, count: s._count._all }))
        .sort((a, b) => a.status - b.status),
    };
  }

  @Get('extension/all')
  extensionAll(
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
  ) {
    return this.extensionErrors({ q, range: parseRange(from, to) }, pageOf(page));
  }

  /** Seekers by their extension errors (server, client and apply stops), latest first. */
  @Get('extension/users')
  async extensionUsers(@Query('q') q?: string, @Query('page') page?: string) {
    const [logs, stops] = await Promise.all([
      this.prisma.errorLog.aggregateRaw({
        pipeline: [
          { $match: { platform: 'extension', user_id: { $ne: null } } },
          {
            $group: {
              _id: { user: '$user_id', code: { $ifNull: ['$code', { $toString: '$status' }] } },
              n: { $sum: 1 },
              last: { $max: '$created_at' },
            },
          },
        ],
      }) as unknown as Promise<{ _id: { user: unknown; code: unknown }; n: unknown; last: unknown }[]>,
      this.prisma.applyBatchItem.aggregateRaw({
        pipeline: [
          { $match: { 'detail.stops.0': { $exists: true } } },
          { $unwind: '$detail.stops' },
          {
            $group: {
              _id: { seeker: '$job_seeker_id', code: { $ifNull: ['$detail.stops.reason', 'unknown'] } },
              n: { $sum: 1 },
              last: { $max: '$detail.stops.at' },
            },
          },
        ],
      }) as unknown as Promise<{ _id: { seeker: unknown; code: unknown }; n: unknown; last: unknown }[]>,
    ]);
    const seekerIds = [...new Set(stops.map((s) => str(s._id.seeker)).filter((s): s is string => !!s))];
    const seekers = await this.prisma.jobSeeker.findMany({
      where: { id: { in: seekerIds } },
      select: { id: true, user_id: true },
    });
    const userOf = new Map(seekers.map((s) => [s.id, s.user_id]));
    const acc = new Map<string, { errors: number; lastAt: string; codes: Map<string, number> }>();
    const add = (user: string | null | undefined, code: string, n: number, last: string) => {
      if (!user) return;
      const a = acc.get(user) ?? { errors: 0, lastAt: '', codes: new Map() };
      a.errors += n;
      if (last > a.lastAt) a.lastAt = last;
      a.codes.set(code, (a.codes.get(code) ?? 0) + n);
      acc.set(user, a);
    };
    for (const l of logs) add(str(l._id.user), str(l._id.code) ?? '?', num(l.n), str(l.last) ?? '');
    for (const s of stops)
      add(userOf.get(str(s._id.seeker) ?? ''), str(s._id.code) ?? '?', num(s.n), str(s.last) ?? '');
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...acc.keys()] } },
      select: { id: true, email: true, full_name: true },
    });
    const needle = q?.trim().toLowerCase();
    const rows = users
      .filter((u) => !needle || u.email.toLowerCase().includes(needle) || u.full_name.toLowerCase().includes(needle))
      .map((u) => {
        const a = acc.get(u.id)!;
        return {
          userId: u.id,
          email: u.email,
          name: u.full_name,
          errors: a.errors,
          lastAt: a.lastAt ? new Date(a.lastAt) : null,
          topCodes: [...a.codes]
            .map(([code, count]) => ({ code, count }))
            .sort((x, y) => y.count - x.count)
            .slice(0, 5),
        };
      })
      .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
    const p = pageOf(page);
    return { items: rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), total: rows.length };
  }

  @Get('extension/users/:userId')
  async extensionUser(@Param('userId') userId: string, @Query('page') page?: string) {
    if (!OBJECT_ID.test(userId)) throw new NotFoundException('No such user');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, full_name: true, job_seeker: { select: { id: true } } },
    });
    if (!user) throw new NotFoundException('No such user');
    const r = await this.extensionErrors(
      { userId, seekerId: user.job_seeker?.id ?? null },
      pageOf(page),
    );
    return { user: { id: user.id, email: user.email, name: user.full_name }, ...r };
  }

  // after the fixed paths: "facets" and "extension/..." are not ids
  @Get(':id')
  async one(@Param('id') id: string) {
    const r = OBJECT_ID.test(id) ? await this.prisma.errorLog.findUnique({ where: { id } }) : null;
    if (!r) throw new NotFoundException('No such log');
    return logOut(r);
  }

  /**
   * Extension ErrorLog rows and apply stops, newest first, one page. Both lists are
   * read sorted up to the page's end and merged.
   * ponytail: page n reads n*50 rows of each; capped at page 100.
   */
  private async extensionErrors(
    f: { q?: string; range?: Range; userId?: string; seekerId?: string | null },
    page: number,
  ) {
    const p = Math.min(page, 100);
    const upTo = p * PAGE_SIZE;
    const where: Prisma.ErrorLogWhereInput = {
      ...this.where({ platform: 'extension', q: f.q, range: f.range }),
      ...(f.userId && { user_id: f.userId }),
    };
    const q = f.q?.trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stopMatch: Record<string, any> = {
      at: f.range
        ? { $gte: f.range.from.toISOString(), $lt: f.range.to.toISOString() }
        : { $type: 'string' },
      ...(q && {
        $or: ['message', 'reason', 'code', 'detail'].map((k) => ({
          [k]: { $regex: escape(q), $options: 'i' },
        })),
      }),
    };
    const noStops = f.userId !== undefined && !f.seekerId;
    const [logs, logTotal, stopPage] = await Promise.all([
      this.prisma.errorLog.findMany({ where, orderBy: { created_at: 'desc' }, take: upTo }),
      this.prisma.errorLog.count({ where }),
      noStops
        ? Promise.resolve([{ items: [], total: [] }])
        : (this.prisma.applyBatchItem.aggregateRaw({
            pipeline: [
              {
                $match: {
                  'detail.stops.0': { $exists: true },
                  ...(f.seekerId && { job_seeker_id: ejId(f.seekerId) }),
                },
              },
              { $unwind: { path: '$detail.stops', includeArrayIndex: 'i' } },
              {
                $project: {
                  _id: 0,
                  item: '$_id',
                  batch: '$batch_id',
                  job: '$job_id',
                  seeker: '$job_seeker_id',
                  provider: 1,
                  state: 1,
                  i: 1,
                  at: '$detail.stops.at',
                  reason: '$detail.stops.reason',
                  message: '$detail.stops.message',
                  code: '$detail.stops.code',
                  detail: '$detail.stops.detail',
                },
              },
              { $match: stopMatch },
              { $sort: { at: -1 } },
              { $facet: { items: [{ $limit: upTo }], total: [{ $count: 'n' }] } },
            ],
          }) as unknown as Promise<{ items: StopRow[]; total: { n: unknown }[] }[]>),
    ]);
    const stops = stopPage[0]?.items ?? [];
    const stopTotal = num(stopPage[0]?.total[0]?.n);
    // who each stop belongs to
    const seekerIds = [...new Set(stops.map((s) => str(s.seeker)).filter((s): s is string => !!s))];
    const seekers = seekerIds.length
      ? await this.prisma.jobSeeker.findMany({
          where: { id: { in: seekerIds } },
          select: { id: true, user: { select: { id: true, email: true } } },
        })
      : [];
    const owner = new Map(seekers.map((s) => [s.id, s.user]));
    const merged = [
      ...logs.map((l) => ({ ...logOut(l), source: l.source === 'client' ? 'client' : 'server' })),
      ...stops.map((s) => {
        const u = owner.get(str(s.seeker) ?? '');
        return {
          id: `${str(s.item)}:${num(s.i)}`,
          platform: 'extension',
          source: 'apply',
          module: 'apply',
          page: null,
          method: 'APPLY',
          path: s.provider ?? '',
          status: 0,
          code: s.code ?? s.reason ?? null,
          message: s.message ?? s.reason ?? '',
          explanation: s.detail ?? (s.reason ? `The apply run stopped: ${s.reason}.` : null),
          data: {
            reason: s.reason,
            detail: s.detail,
            itemId: str(s.item),
            batchId: str(s.batch),
            jobId: str(s.job),
            provider: s.provider,
            state: s.state,
          },
          userId: u?.id ?? null,
          userEmail: u?.email ?? null,
          ip: null,
          userAgent: null,
          createdAt: new Date(s.at),
        };
      }),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      items: merged.slice((p - 1) * PAGE_SIZE, upTo),
      total: logTotal + stopTotal,
    };
  }
}
