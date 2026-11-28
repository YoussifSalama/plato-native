import { Prisma } from '@prisma/client';
import { AdminAlertsService } from './admin-alerts.service';

const item = (kind: string) => ({
  kind,
  severity: 'high' as const,
  title: `${kind} title`,
  detail: 'd',
  link: '/',
});

function setup(items: ReturnType<typeof item>[], mailOk = true) {
  const sent = new Set<string>();
  const prisma = {
    adminAlert: {
      create: jest.fn(({ data }: { data: { kind: string; day: string } }) => {
        const k = `${data.kind}|${data.day}`;
        if (sent.has(k))
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('dup', {
              code: 'P2002',
              clientVersion: 't',
            }),
          );
        sent.add(k);
        return Promise.resolve({});
      }),
      deleteMany: jest.fn(
        ({ where }: { where: { day: string; kind: { in: string[] } } }) => {
          for (const k of where.kind.in) sent.delete(`${k}|${where.day}`);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
  };
  const mail = {
    send: jest
      .fn<Promise<boolean>, [{ subject: string }]>()
      .mockResolvedValue(mailOk),
  };
  const insights = { attention: jest.fn().mockResolvedValue(items) };
  return {
    svc: new AdminAlertsService(
      prisma as never,
      insights as never,
      mail as never,
    ),
    mail,
    insights,
  };
}

describe('admin email alerts', () => {
  const env = process.env.SUPER_ADMIN_EMAIL;
  beforeAll(() => (process.env.SUPER_ADMIN_EMAIL = 'owner@plato.test'));
  afterAll(() => (process.env.SUPER_ADMIN_EMAIL = env));

  it('emails what needs attention once, and nothing more that day', async () => {
    const { svc, mail } = setup([item('errors'), item('stuck')]);
    expect(await svc.run()).toEqual({ sent: 2 });
    expect(mail.send.mock.calls[0][0].subject).toBe(
      'Plato: 2 things need your attention',
    );
    expect(await svc.run()).toEqual({ sent: 0 });
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('a failed email frees the day so the next pass tries again', async () => {
    const { svc, mail } = setup([item('spend')], false);
    expect(await svc.run()).toEqual({ sent: 0 });
    mail.send.mockResolvedValue(true);
    expect(await svc.run()).toEqual({ sent: 1 });
  });

  it('nothing to say, nothing sent; a failure never throws', async () => {
    const { svc, mail, insights } = setup([]);
    expect(await svc.run()).toEqual({ sent: 0 });
    expect(mail.send).not.toHaveBeenCalled();
    insights.attention.mockRejectedValue(new Error('db down'));
    await expect(svc.run()).resolves.toEqual({ sent: 0 });
  });
});
