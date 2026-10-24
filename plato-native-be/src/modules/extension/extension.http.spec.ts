/* eslint-disable */
jest.mock('@nestjs/jwt', () => {
  // @nestjs/jwt is ESM-only and jest can't load it; a signed-by-JSON stand-in
  // is enough to exercise JwtAuthGuard's cookie path.
  class JwtService {
    sign(p: object) { return Buffer.from(JSON.stringify(p)).toString('base64url'); }
    async verifyAsync(t: string) { return JSON.parse(Buffer.from(t, 'base64url').toString()); }
  }
  return { JwtService, JwtModule: { register: () => ({ module: class {}, providers: [JwtService], exports: [JwtService], global: true }) } };
});
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobSeekerService } from '../user/job-seeker.service';
import { ExtensionAuthGuard, limiter } from './extension-auth.guard';
import {
  ExtensionApiController,
  ExtensionPairingController,
  ExtensionWebController,
} from './extension.controllers';
import { ExtensionBatchService } from './batch.service';
import { CandidateService } from './candidate.service';
import { ExtensionService } from './extension.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnswersService } from './answers.service';
import { ResumeFileService } from './resume-file.service';
import { QueueService } from './queue.service';
import { ExtensionSettingsService } from './settings';
import { OrchestratorService } from './orchestrator.service';
import { SearchesService } from './searches.service';

const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const GOOD = `plx_${'a'.repeat(43)}`;
const WRITER = `plx_${'c'.repeat(43)}`;
const NOSCOPE = `plx_${'b'.repeat(43)}`;

// An existing cookie-only route, standing in for "any other API route".
@Controller('other')
@UseGuards(JwtAuthGuard)
class OtherController {
  @Get() ok() {
    return { ok: true };
  }
}

describe('route protection over HTTP', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const service = {
    authenticate: jest.fn(async (t: string) =>
      t === GOOD
        ? { deviceId: 'd1', jobSeekerId: 'js1', scopes: ['apply:read'] }
        : t === WRITER
          ? { deviceId: 'd3', jobSeekerId: 'js1', scopes: ['apply:read', 'apply:write'] }
        : t === NOSCOPE
          ? { deviceId: 'd2', jobSeekerId: 'js1', scopes: [] }
          : null,
    ),
    startPairing: jest.fn(async () => ({ code: 'ABCD-EFGH' })),
    listDevices: jest.fn(async () => []),
    revokeAll: jest.fn(async () => ({ revoked: 0 })),
    revoke: jest.fn(async () => ({ revoked: true })),
    exchange: jest.fn(async (code: string) => {
      if (code !== 'ABCD-EFGH') {
        const { UnauthorizedException } = await import('@nestjs/common');
        throw new UnauthorizedException('Invalid or expired code');
      }
      return { token: GOOD };
    }),
  };

  const batches = {
    createBatch: jest.fn(async () => ({ batch_id: 'b1', items: [], rejected: [] })),
    release: jest.fn(async () => ({ released: true })),
    list: jest.fn(async () => []),
    claim: jest.fn(async () => ({ id: 'i1' })),
    heartbeat: jest.fn(async () => ({ ok: true })),
    transition: jest.fn(async () => ({ id: 'i1' })),
    assertWorking: jest.fn(async () => ({})),
  };
  const candidates = { load: jest.fn(async () => ({ fullName: 'Y' })) };

  beforeAll(async () => {
    process.env.EXTENSION_ORIGIN = ORIGIN;
    const mod = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [
        ExtensionWebController,
        ExtensionPairingController,
        ExtensionApiController,
        OtherController,
      ],
      providers: [
        ExtensionAuthGuard,
        JwtAuthGuard,
        { provide: ExtensionService, useValue: service },
        { provide: ExtensionBatchService, useValue: batches },
        { provide: CandidateService, useValue: candidates },
        { provide: SearchesService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: QueueService, useValue: {} },
        { provide: ExtensionSettingsService, useValue: {} },
        { provide: AnswersService, useValue: { draft: async () => [] } },
        { provide: ResumeFileService, useValue: {} },
        { provide: OrchestratorService, useValue: { turn: async () => ({ reply: 'ok', events: [] }) } },
        {
          provide: JobSeekerService,
          useValue: { getByUserId: async () => ({ id: 'js1' }) },
        },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    await app.init();
    jwt = mod.get(JwtService);
  });
  afterAll(() => app.close());
  beforeEach(() => limiter['hits'].clear());

  const cookie = () => `access_token=${jwt.sign({ sub: 'u1' })}`;
  const http = () => request(app.getHttpServer());
  const bearer = (t = GOOD) => ({
    Authorization: `Bearer ${t}`,
    Origin: ORIGIN,
  });

  it('token API: valid token + origin works', async () => {
    await http().get('/extension/v1/me').set(bearer()).expect(200);
    const r = await http()
      .get('/extension/v1/policy')
      .set(bearer())
      .expect(200);
    expect(r.body.matches).toContain('https://boards.greenhouse.io/*');
    expect(r.body.providers.greenhouse).toBe('FILL_ONLY');
    expect(r.body.providers.linkedin).toBe('FILL_ONLY');
    expect(r.body.auto_submit).toContain('greenhouse');
    expect(r.body.auto_submit).toContain('linkedin');
    expect(r.body.auto_submit).not.toContain('indeed');
  });

  it('token API: web cookie alone is rejected', async () => {
    await http()
      .get('/extension/v1/me')
      .set('Cookie', cookie())
      .set('Origin', ORIGIN)
      .expect(401);
  });

  it('token API: cookie next to a bad token is still rejected', async () => {
    await http()
      .get('/extension/v1/me')
      .set('Cookie', cookie())
      .set(bearer(`plx_${'z'.repeat(43)}`))
      .expect(401);
  });

  it('token API: wrong, missing or unconfigured origin is forbidden', async () => {
    await http()
      .get('/extension/v1/me')
      .set({ Authorization: `Bearer ${GOOD}`, Origin: 'https://evil.example' })
      .expect(403);
    await http()
      .get('/extension/v1/me')
      .set({ Authorization: `Bearer ${GOOD}` })
      .expect(403);
    delete process.env.EXTENSION_ORIGIN;
    await http().get('/extension/v1/me').set(bearer()).expect(403);
    process.env.EXTENSION_ORIGIN = ORIGIN;
  });

  it('token API: missing scope is forbidden; no token is 401', async () => {
    await http().get('/extension/v1/me').set(bearer(NOSCOPE)).expect(403);
    await http().get('/extension/v1/me').set('Origin', ORIGIN).expect(401);
  });

  it('token API: 121st request in a minute is 429', async () => {
    for (let i = 0; i < 120; i++)
      await http().get('/extension/v1/me').set(bearer()).expect(200);
    await http().get('/extension/v1/me').set(bearer()).expect(429);
  });

  it('token is rejected on web device routes and other routes', async () => {
    for (const [m, url] of [
      ['post', '/extension/pairing/start'],
      ['get', '/extension/devices'],
      ['post', '/extension/devices/revoke-all'],
      ['delete', '/extension/devices/x'],
      ['get', '/other'],
    ] as const)
      await (http() as any)[m](url).set(bearer()).expect(401);
  });

  it('web routes work with the cookie and are rate limited', async () => {
    await http().get('/extension/devices').set('Cookie', cookie()).expect(200);
    for (let i = 0; i < 5; i++)
      await http()
        .post('/extension/pairing/start')
        .set('Cookie', cookie())
        .expect(201);
    await http()
      .post('/extension/pairing/start')
      .set('Cookie', cookie())
      .expect(429);
  });

  it('exchange: needs extension origin, validates body, throttles per caller', async () => {
    const body = { code: 'ABCD-EFGH', device_label: 'Laptop' };
    await http().post('/extension/pairing/exchange').send(body).expect(403);
    await http()
      .post('/extension/pairing/exchange')
      .set('Origin', 'https://evil.example')
      .send(body)
      .expect(403);
    await http()
      .post('/extension/pairing/exchange')
      .set('Origin', ORIGIN)
      .send({ code: 1 })
      .expect(400);
    await http()
      .post('/extension/pairing/exchange')
      .set('Origin', ORIGIN)
      .send(body)
      .expect(201);
    limiter['hits'].clear();
    for (let i = 0; i < 5; i++)
      await http()
        .post('/extension/pairing/exchange')
        .set('Origin', ORIGIN)
        .send({ ...body, code: 'WRONG' })
        .expect(401);
    await http()
      .post('/extension/pairing/exchange')
      .set('Origin', ORIGIN)
      .send(body)
      .expect(429);
  });

  it('exchange: global failure breaker blocks everyone after 50 wrong codes', async () => {
    for (let i = 0; i < 50; i++) limiter.hit('xchg-fail', Infinity, 600_000);
    await http()
      .post('/extension/pairing/exchange')
      .set('Origin', ORIGIN)
      .send({ code: 'ABCD-EFGH', device_label: 'Laptop' })
      .expect(429);
  });

  it('unpair revokes the calling device only', async () => {
    await http().delete('/extension/v1/device').set(bearer()).expect(200);
    expect(service.revoke).toHaveBeenCalledWith('js1', 'd1');
  });

  describe('batch / item routes', () => {
    const ID = '0'.repeat(24);
    const write = () => bearer(WRITER);
    const body = { attempt_id: 'a1', seq: 1, to: 'PREPARING' };

    it('need apply:write (read-only token is 403, cookie is 401)', async () => {
      for (const [m, url, b] of [
        ['post', `/extension/v1/items/${ID}/claim`, {}],
        ['post', `/extension/v1/items/${ID}/heartbeat`, { attempt_id: 'a1' }],
        ['post', `/extension/v1/items/${ID}/transition`, body],
      ] as const) {
        await (http() as any)[m](url).set(bearer()).send(b).expect(403);
        await (http() as any)[m](url).set('Cookie', cookie()).set('Origin', ORIGIN).send(b).expect(401);
        await (http() as any)[m](url).set(write()).send(b).expect(201);
      }
      await http().get('/extension/v1/batches').set(bearer()).expect(200);
    });

    it('validate the transition body strictly', async () => {
      const t = (b: object) => http().post(`/extension/v1/items/${ID}/transition`).set(write()).send(b);
      await t({ ...body, to: 'CLAIMED' }).expect(400);
      await t({ ...body, to: 'PENDING' }).expect(400);
      await t({ ...body, seq: 0 }).expect(400);
      await t({ ...body, detail: { failure_kind: 'Bad Kind!' } }).expect(400);
      await t({ ...body, detail: { cookie: 'x' } }).expect(400);
      await t({ ...body, detail: { marker: 'x'.repeat(201) } }).expect(400);
      await t({ ...body, detail: { failure_kind: 'blocked_by_site' } }).expect(201);
    });

    it('candidate: only through assertWorking', async () => {
      await http().get(`/extension/v1/items/${ID}/candidate`).set(bearer()).expect(200);
      expect(batches.assertWorking).toHaveBeenCalled();
      const { ConflictException } = await import('@nestjs/common');
      batches.assertWorking.mockRejectedValueOnce(new ConflictException('Not the active attempt') as never);
      await http().get(`/extension/v1/items/${ID}/candidate`).set(bearer()).expect(409);
    });

    it('creating a batch and releasing are web-only (cookie), never the token', async () => {
      await http().post('/extension/apply-batches').set(bearer()).send({ jobIds: [ID] }).expect(401);
      await http().post(`/extension/items/${ID}/release`).set(bearer()).expect(401);
      await http().post('/extension/apply-batches').set('Cookie', cookie()).send({ jobIds: [ID] }).expect(201);
      await http().post('/extension/apply-batches').set('Cookie', cookie()).send({ jobIds: [] }).expect(400);
      await http().post(`/extension/items/${ID}/release`).set('Cookie', cookie()).expect(201);
    });
  });
});
