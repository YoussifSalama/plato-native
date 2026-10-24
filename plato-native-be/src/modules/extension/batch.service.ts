/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { applicationNotification } from '../notifications/notification-factory';
import { NotificationsBus } from '../notifications/notifications.bus';
import { PrismaService } from '../prisma/prisma.service';
import {
  canMove,
  ItemState,
  LEASE_MS,
  PRE_ARMED,
  TERMINAL,
} from './batch-state';
import { limiter } from './extension-auth.guard';
import { ExtensionPrincipal } from './extension.service';
import { extensionProvider, policyFor, ProviderPolicy } from './provider-policy';

const OBJECT_ID = /^[0-9a-f]{24}$/;
const MAX_BATCH = 50;
// A job that already has an application in one of these may be tried again.
const RETRYABLE = ['FAILED', 'SKIPPED', 'EXPIRED'];
const LIVE: ItemState[] = [...PRE_ARMED, 'AWAITING_SUBMIT', 'VERIFY'];

type Detail = Record<string, any>;
const det = (d: unknown): Detail => (d as Detail | null) ?? {};
export interface TransitionInput {
  attempt_id: string;
  seq: number;
  to: ItemState;
  detail?: {
    failure_kind?: string;
    message?: string;
    marker?: string;
    reason?: string;
  };
}

const now = () => new Date();
const inMs = (ms: number) => new Date(Date.now() + ms);

@Injectable()
export class ExtensionBatchService {
  // ponytail: policy lookup is a field so tests can enable a fixture
  // provider; production always uses the real gate (provider-policy.ts).
  policy: (provider: string) => ProviderPolicy = policyFor;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsBus,
  ) {}

  // ---- web (cookie): create a batch ---------------------------------

  async createBatch(jobSeekerId: string, jobIds: string[], searchId?: string) {
    const ids = [...new Set(jobIds)];
    if (
      !ids.length ||
      ids.length > MAX_BATCH ||
      ids.some((i) => !OBJECT_ID.test(i))
    )
      throw new BadRequestException(`Send 1 to ${MAX_BATCH} valid job ids`);
    const jobs = await this.prisma.job.findMany({
      where: { id: { in: ids } },
      select: { id: true, source: true, apply_url: true, url: true },
    });
    const apps = await this.prisma.jobApplication.findMany({
      where: { job_seeker_id: jobSeekerId, job_id: { in: ids } },
      select: { job_id: true, status: true },
    });
    const liveItems = await this.prisma.applyBatchItem.findMany({
      where: {
        job_seeker_id: jobSeekerId,
        job_id: { in: ids },
        state: { in: ['PENDING', ...LIVE] },
      },
      select: { job_id: true },
    });
    const accepted: { job_id: string; provider: string }[] = [];
    const rejected: { job_id: string; reason: string }[] = [];
    for (const id of ids) {
      const job = jobs.find((j) => j.id === id);
      const app = apps.find((a) => a.job_id === id);
      const source = job && extensionProvider(job);
      if (!job) rejected.push({ job_id: id, reason: 'unknown_job' });
      else if (!source) rejected.push({ job_id: id, reason: 'no_provider' });
      else if (this.policy(source) !== 'FILL_ONLY')
        rejected.push({ job_id: id, reason: 'provider_blocked' });
      else if (
        (app && !RETRYABLE.includes(app.status)) ||
        liveItems.some((i) => i.job_id === id)
      )
        rejected.push({ job_id: id, reason: 'duplicate' });
      else accepted.push({ job_id: id, provider: source });
    }
    if (!accepted.length) return { batch_id: null, items: [], rejected };
    // Name the batch after the search it came from (only the seeker's own search).
    const run = searchId && OBJECT_ID.test(searchId)
      ? await this.prisma.discoveryRun?.findFirst({ where: { id: searchId, job_seeker_id: jobSeekerId }, select: { id: true, query: true } })
      : null;
    const q = (run?.query ?? {}) as { requestedTitles?: string[]; titles?: string[] };
    const batch = await this.prisma.applyBatch.create({
      data: { job_seeker_id: jobSeekerId, ...(run && { search_id: run.id, label: q.requestedTitles?.[0] ?? q.titles?.[0] ?? null }) },
    });
    // Queued from the web means "waiting for the extension": once a batch exists, the tag is spent.
    await this.prisma.jobSeekerJobMatch?.updateMany({
      where: { job_seeker_id: jobSeekerId, job_id: { in: accepted.map((a) => a.job_id) } },
      data: { extension_queued: false },
    });
    const items: any[] = [];
    for (const a of accepted)
      items.push(
        await this.prisma.applyBatchItem.create({
          data: { batch_id: batch.id, job_seeker_id: jobSeekerId, ...a },
        }),
      );
    return { batch_id: batch.id, items: items.map(dto), rejected };
  }

  // ---- token API ------------------------------------------------------

  /** Items that still need attention. Sweeps expired leases first. */
  async list(p: ExtensionPrincipal) {
    await this.recover(p.jobSeekerId);
    const rows = await this.prisma.applyBatchItem.findMany({
      where: { job_seeker_id: p.jobSeekerId, state: { notIn: TERMINAL } },
      orderBy: { created_at: 'asc' },
      take: 100,
    });
    const jobs = await this.prisma.job.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.job_id))] } },
      select: { id: true, title: true, company: true, url: true, apply_url: true },
    });
    // Which batch (and search) each job came from, so old and new runs are never mixed up on screen.
    const batches: any[] = (await this.prisma.applyBatch.findMany?.({
      where: { id: { in: [...new Set(rows.map((r) => r.batch_id))] } },
      select: { id: true, created_at: true, label: true },
    })) ?? [];
    return rows.map((r) => {
      const j = jobs.find((x) => x.id === r.job_id);
      const bt = batches.find((x) => x.id === r.batch_id);
      return {
        ...dto(r),
        // false = another linked browser is working on it right now: never take it over from here
        mine: !r.device_id || r.device_id === p.deviceId,
        batch: bt ? { label: bt.label ?? null, created_at: bt.created_at } : null,
        job: j
          ? { title: j.title, company: j.company, url: j.url, apply_url: j.apply_url }
          : null,
      };
    });
  }

  /**
   * Where Plato stopped and asked the seeker, kept on the item (newest 20) without changing its
   * state: the run carries on when the seeker answers. Read back by stopReport().
   */
  async recordStop(p: ExtensionPrincipal, itemId: string, stop: { reason: string; message: string }) {
    const item = await this.item(p, itemId);
    const prev = (item.detail ?? {}) as Detail & { stops?: unknown[] };
    const stops = [...(prev.stops ?? []), { at: new Date().toISOString(), ...stop }].slice(-20);
    await this.prisma.applyBatchItem.update({ where: { id: item.id }, data: { detail: { ...prev, stops } as object } });
  }

  /** Every stop for this seeker, grouped by site and reason, most frequent first. */
  async stopReport(jobSeekerId: string) {
    const items = await this.prisma.applyBatchItem.findMany({
      where: { job_seeker_id: jobSeekerId },
      select: { id: true, provider: true, detail: true, job_id: true },
      orderBy: { updated_at: 'desc' },
      take: 500,
    });
    const groups = new Map<string, { site: string; reason: string; count: number; examples: { item_id: string; job_id: string; message: string; at: string }[] }>();
    for (const i of items)
      for (const st of ((i.detail as { stops?: { at: string; reason: string; message: string }[] } | null)?.stops ?? [])) {
        const site = i.provider ?? 'unknown';
        const key = `${site}|${st.reason}`;
        const g = groups.get(key) ?? { site, reason: st.reason, count: 0, examples: [] };
        g.count++;
        if (g.examples.length < 5) g.examples.push({ item_id: i.id, job_id: i.job_id, message: st.message, at: st.at });
        groups.set(key, g);
      }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }

  private async item(p: ExtensionPrincipal, id: string) {
    if (!OBJECT_ID.test(id)) throw new NotFoundException('Item not found');
    const row = await this.prisma.applyBatchItem.findFirst({
      where: { id, job_seeker_id: p.jobSeekerId },
    });
    if (!row) throw new NotFoundException('Item not found');
    return row;
  }

  /**
   * One winner per item and per job:
   *  1. atomically claim the item (PENDING -> CLAIMED, new attempt, lease);
   *  2. take the duplicate lock: the job's JobApplication row becomes
   *     EXTENSION_ACTIVE. If someone else holds the job, undo step 1.
   */
  async claim(p: ExtensionPrincipal, itemId: string) {
    await this.recover(p.jobSeekerId);
    const item = await this.item(p, itemId);
    if (item.state !== 'PENDING')
      throw new ConflictException(`Item is ${item.state}`);
    if (!item.provider || this.policy(item.provider) !== 'FILL_ONLY')
      throw new ForbiddenException('This provider is blocked');

    const app = await this.prisma.jobApplication.findUnique({
      where: {
        job_seeker_id_job_id: {
          job_seeker_id: p.jobSeekerId,
          job_id: item.job_id,
        },
      },
      select: { id: true, status: true, engine: true },
    });
    if (app && !RETRYABLE.includes(app.status))
      throw new ConflictException('This job already has an application');

    // Written with the claim, so a crash right after still knows how to undo.
    const lock = {
      created: !app,
      prior_status: app?.status ?? null,
      prior_engine: app?.engine ?? null,
    };
    const attempt_id = randomUUID();
    const claimed = await this.prisma.applyBatchItem.updateMany({
      where: { id: item.id, state: 'PENDING' },
      data: {
        state: 'CLAIMED',
        attempt_id,
        seq: 0,
        device_id: p.deviceId,
        lease_expires_at: inMs(LEASE_MS),
        detail: { lock },
      },
    });
    if (claimed.count !== 1)
      throw new ConflictException('Item was just claimed');

    if (!(await this.takeLock(p.jobSeekerId, item.job_id, app))) {
      await this.prisma.applyBatchItem.updateMany({
        where: { id: item.id, attempt_id },
        data: {
          state: 'SKIPPED',
          lease_expires_at: null,
          detail: { reason: 'duplicate' },
        },
      });
      throw new ConflictException('This job already has an application');
    }
    return dto(await this.item(p, itemId));
  }

  private async takeLock(
    jobSeekerId: string,
    jobId: string,
    app: { id: string; status: string } | null,
  ) {
    if (!app) {
      try {
        await this.prisma.jobApplication.create({
          data: {
            job_seeker_id: jobSeekerId,
            job_id: jobId,
            status: 'EXTENSION_ACTIVE',
            engine: 'EXTENSION',
            verify_attempt: null,
          },
        });
        return true;
      } catch (e: any) {
        if (e?.code === 'P2002') return false; // someone else created it first
        throw e;
      }
    }
    const r = await this.prisma.jobApplication.updateMany({
      where: { id: app.id, status: app.status as any },
      data: {
        status: 'EXTENSION_ACTIVE',
        engine: 'EXTENSION',
        failure_kind: null,
        error: null,
        next_attempt_at: null,
        needs_input: null,
        verify_attempt: null,
      },
    });
    return r.count === 1;
  }

  async heartbeat(p: ExtensionPrincipal, itemId: string, attemptId: string) {
    if (!limiter.hit(`hb:${itemId}`, 6, 60_000))
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const item = await this.item(p, itemId);
    const r = await this.prisma.applyBatchItem.updateMany({
      where: {
        id: item.id,
        attempt_id: attemptId,
        device_id: p.deviceId,
        state: { in: [...PRE_ARMED, 'AWAITING_SUBMIT'] },
      },
      data: { lease_expires_at: inMs(LEASE_MS) },
    });
    if (r.count !== 1) throw new ConflictException('Not the active attempt');
    return { ok: true, lease_ms: LEASE_MS };
  }

  /** Idempotent by (attempt_id, seq). Replays return the stored result. */
  async transition(p: ExtensionPrincipal, itemId: string, t: TransitionInput) {
    await this.recover(p.jobSeekerId);
    const item = await this.item(p, itemId);
    const state = item.state;
    if (item.attempt_id !== t.attempt_id)
      throw new ConflictException('Stale attempt');

    // Replay of the transition we already applied: same answer, and make sure
    // the application row caught up (a crash may have skipped it).
    const last = (item.detail as Detail | null)?.last;
    if (t.seq <= item.seq) {
      if (t.seq === item.seq && last?.to === t.to && state === t.to) {
        await this.mirror(item, t.to);
        return dto(item);
      }
      throw new ConflictException('Out of order');
    }
    if (t.seq !== item.seq + 1) throw new ConflictException('Out of order');
    if (!canMove(state, t.to))
      throw new ConflictException(`Cannot move ${state} -> ${t.to}`);
    // Pre-armed work belongs to the claiming device; once armed, any paired
    // device of the seeker may settle it (the panel may be a new window).
    if (PRE_ARMED.includes(state) && item.device_id !== p.deviceId)
      throw new ConflictException('Claimed by another device');
    const d = t.detail ?? {};
    if (t.to === 'SUBMITTED_CONFIRMED' && !d.marker)
      throw new BadRequestException(
        'Machine confirmation needs the evidence it saw (marker)',
      );
    if (t.to === 'VERIFY' && !d.reason)
      throw new BadRequestException('VERIFY needs a reason');

    const prev = (item.detail ?? {}) as Detail;
    const next: Detail = {
      ...prev,
      last: { seq: t.seq, to: t.to, at: new Date().toISOString(), ...d },
      ...(t.to === 'AWAITING_SUBMIT' && {
        armed: true,
        armed_at: new Date().toISOString(),
      }),
    };
    const done = (TERMINAL as string[]).includes(t.to);
    const r = await this.prisma.applyBatchItem.updateMany({
      where: {
        id: item.id,
        attempt_id: t.attempt_id,
        state: state as any,
        seq: item.seq,
      },
      data: {
        state: t.to as any,
        seq: t.seq,
        detail: next,
        lease_expires_at: done || t.to === 'VERIFY' ? null : inMs(LEASE_MS),
        ...(item.device_id !== p.deviceId &&
          !PRE_ARMED.includes(state) && { device_id: p.deviceId }),
      },
    });
    if (r.count !== 1) throw new ConflictException('Item changed; reload it');
    const updated = await this.item(p, itemId);
    await this.mirror(updated, t.to);
    return dto(updated);
  }

  /** Candidate data only while this device holds a live attempt. */
  async assertWorking(p: ExtensionPrincipal, itemId: string) {
    const item = await this.item(p, itemId);
    const st = item.state;
    if (
      !(PRE_ARMED.includes(st) || st === 'AWAITING_SUBMIT') ||
      item.device_id !== p.deviceId
    )
      throw new ConflictException('Not the active attempt');
    return item;
  }

  // ---- web (cookie): release before anything could have been sent --------

  async release(jobSeekerId: string, itemId: string) {
    if (!OBJECT_ID.test(itemId)) throw new NotFoundException('Item not found');
    const item = await this.prisma.applyBatchItem.findFirst({
      where: { id: itemId, job_seeker_id: jobSeekerId },
    });
    if (!item) throw new NotFoundException('Item not found');
    const st = item.state;
    if (st === 'PENDING' || PRE_ARMED.includes(st)) {
      const r = await this.prisma.applyBatchItem.updateMany({
        where: { id: item.id, state: st as any, attempt_id: item.attempt_id },
        data: { state: 'CANCELLED', lease_expires_at: null },
      });
      if (r.count !== 1) throw new ConflictException('Item changed; try again');
      if (st !== 'PENDING') await this.releaseLock(item);
      return { released: true };
    }
    throw new ConflictException(
      st === 'AWAITING_SUBMIT' || st === 'VERIFY'
        ? 'This may already be submitted: settle it in the extension'
        : `Item is ${st}`,
    );
  }

  /** Drop every job still waiting (nothing was opened or sent for them). Started jobs are untouched. */
  async clearPending(jobSeekerId: string) {
    const r = await this.prisma.applyBatchItem.updateMany({
      where: { job_seeker_id: jobSeekerId, state: 'PENDING' },
      data: { state: 'CANCELLED', lease_expires_at: null },
    });
    return { cleared: r.count };
  }

  // ---- recovery ---------------------------------------------------------

  /**
   * Lazy sweep (no timers; runs on list/claim/transition):
   *  - lease lost BEFORE the page was armed: nothing could be sent -> release
   *    the item and the duplicate lock;
   *  - lease lost AFTER arming: the outcome is unknown -> VERIFY, lock kept.
   * Never resubmits anything.
   */
  async recover(jobSeekerId: string) {
    // A job held by a browser that was unlinked (or whose link expired) can never be finished by it:
    // treat it like a lost lease, so the browser linked now can take it over instead of fighting it.
    const devices: { id: string; revoked_at: Date | null; expires_at: Date; idle_expires_at: Date }[] =
      (await this.prisma.extensionDevice?.findMany({ where: { job_seeker_id: jobSeekerId }, select: { id: true, revoked_at: true, expires_at: true, idle_expires_at: true } })) ?? [];
    const deadIds = devices.filter((d) => d.revoked_at || d.expires_at < now() || d.idle_expires_at < now()).map((d) => d.id);
    const expired = await this.prisma.applyBatchItem.findMany({
      where: {
        job_seeker_id: jobSeekerId,
        state: { in: [...PRE_ARMED, 'AWAITING_SUBMIT'] },
        OR: [
          { lease_expires_at: { lt: now() } },
          ...(deadIds.length ? [{ device_id: { in: deadIds } }] : []),
        ],
      },
    });
    for (const item of expired) {
      const st = item.state;
      if (st === 'AWAITING_SUBMIT') {
        const detail = {
          ...((item.detail ?? {}) as Detail),
          verify_reason: 'lease_expired_after_ready',
        };
        const r = await this.prisma.applyBatchItem.updateMany({
          where: { id: item.id, state: 'AWAITING_SUBMIT', device_id: item.device_id },
          data: { state: 'VERIFY', lease_expires_at: null, detail },
        });
        // The seeker has to hear about it even though nobody called us.
        if (r.count === 1) await this.mirror({ ...item, detail }, 'VERIFY');
        continue;
      }
      const r = await this.prisma.applyBatchItem.updateMany({
        where: { id: item.id, state: st as any, device_id: item.device_id, attempt_id: item.attempt_id },
        data: {
          state: 'PENDING',
          attempt_id: null,
          device_id: null,
          seq: 0,
          lease_expires_at: null,
        },
      });
      if (r.count === 1) await this.releaseLock(item);
    }
  }

  /**
   * Tell the seeker an application needs them (once per attempt). The
   * conditional update is the dedupe: retries, replays and reconciliation all
   * come through here again but only the first one flips verify_attempt.
   */
  private async markVerify(item: {
    job_seeker_id: string;
    job_id: string;
    attempt_id?: string | null;
  }) {
    if (!item.attempt_id) return;
    const r = await this.prisma.jobApplication.updateMany({
      where: {
        job_seeker_id: item.job_seeker_id,
        job_id: item.job_id,
        engine: 'EXTENSION',
        status: 'EXTENSION_ACTIVE',
        // never told (missing or null) or another attempt. On Mongo `null`/`not` do not match a MISSING field
        OR: [
          { verify_attempt: { isSet: false } },
          { verify_attempt: null },
          { verify_attempt: { not: item.attempt_id } },
        ],
      },
      data: {
        verify_attempt: item.attempt_id,
        needs_input: {
          reason: 'verify_submission',
          questions: [],
          message:
            'Plato cannot tell whether this was sent. Check the site or your email before applying again.',
        },
      },
    });
    if (r.count !== 1) return; // already told for this attempt
    const app = await this.prisma.jobApplication.findUnique({
      where: {
        job_seeker_id_job_id: {
          job_seeker_id: item.job_seeker_id,
          job_id: item.job_id,
        },
      },
      include: { job: { select: { title: true, company: true } } },
    });
    if (app)
      this.notifications.publish(
        item.job_seeker_id,
        applicationNotification(app),
      );
  }

  // ---- application row (the duplicate lock) -------------------------------

  private async releaseLock(item: {
    job_seeker_id: string;
    job_id: string;
    detail: unknown;
  }) {
    const lock = det(item.detail).lock as
      | {
          created: boolean;
          prior_status: string | null;
          prior_engine: string | null;
        }
      | undefined;
    const where = {
      job_seeker_id: item.job_seeker_id,
      job_id: item.job_id,
      engine: 'EXTENSION' as const,
      status: 'EXTENSION_ACTIVE' as const,
    };
    if (!lock || lock.created) {
      await this.prisma.jobApplication.deleteMany({ where });
      return;
    }
    await this.prisma.jobApplication.updateMany({
      where,
      data: {
        status: (lock.prior_status ?? 'FAILED') as any,
        engine: (lock.prior_engine ?? null) as any,
      },
    });
  }

  // Reflect a settled item on its application row. Idempotent.
  private async mirror(
    item: { job_seeker_id: string; job_id: string; detail: unknown },
    to: ItemState,
  ) {
    const last = (det(item.detail).last ?? {}) as Detail;
    const where = {
      job_seeker_id: item.job_seeker_id,
      job_id: item.job_id,
      engine: 'EXTENSION' as const,
      status: 'EXTENSION_ACTIVE' as const,
    };
    if (to === 'SUBMITTED_CONFIRMED' || to === 'SUBMITTED_ATTESTED')
      await this.prisma.jobApplication.updateMany({
        where,
        data: {
          status: 'SUBMITTED',
          submitted_at: new Date(),
          needs_input: null,
          // Machine evidence and the person's word stay distinguishable.
          evidence: {
            source: 'extension',
            confirmed_by:
              to === 'SUBMITTED_CONFIRMED' ? 'page_marker' : 'user_attestation',
            marker: last.marker ?? null,
            at: new Date().toISOString(),
          },
        },
      });
    else if (to === 'FAILED')
      await this.prisma.jobApplication.updateMany({
        where,
        data: {
          status: 'FAILED',
          failure_kind: String(last.failure_kind ?? 'site_error'),
          error: last.message ? String(last.message) : null,
          needs_input: null,
          verify_attempt: null,
        },
      });
    else if (to === 'SKIPPED')
      await this.prisma.jobApplication.updateMany({
        where,
        data: {
          status: 'SKIPPED',
          error: last.message ? String(last.message) : null,
          needs_input: null,
          verify_attempt: null,
        },
      });
    else if (to === 'VERIFY') await this.markVerify(item);
    else if (to === 'CANCELLED') await this.releaseLock(item);
  }
}

const dto = (i: any) => ({
  id: i.id,
  batch_id: i.batch_id,
  job_id: i.job_id,
  provider: i.provider,
  state: i.state,
  attempt_id: i.attempt_id,
  seq: i.seq,
  lease_expires_at: i.lease_expires_at,
  detail: i.detail?.last ?? null,
  resume_choice: i.resume_choice ?? i.detail?.resume_choice ?? null, // which resume this application uploads (asked once; older rows kept it in detail)
  verify_reason:
    i.detail?.verify_reason ??
    (i.state === 'VERIFY' ? (i.detail?.last?.reason ?? null) : null),
});
