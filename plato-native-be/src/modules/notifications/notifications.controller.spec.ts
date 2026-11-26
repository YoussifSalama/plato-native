jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import { NotificationsController } from './notifications.controller';

describe('notification feed', () => {
  const digest = {
    id: 'd1',
    job_ids: ['j1'],
    headline: '1 new React job',
    created_at: new Date('2026-11-01T10:00:00Z'),
  };
  const feed = (in_app: boolean | null) =>
    new NotificationsController(
      {
        alertSettings: {
          findUnique: async () => (in_app === null ? null : { in_app }),
        },
        discoveryRun: { findMany: async () => [] },
        jobApplication: { findMany: async () => [] },
        alertDigest: { findMany: async () => [digest] },
      } as never,
      {} as never,
      { getByUserId: async () => ({ id: 's1' }) } as never,
    ).list({ userId: 'u1' } as never);

  it('leaves job-alert digests out when "In Plato" is off', async () => {
    expect(await feed(false)).toEqual([]);
    expect((await feed(true)).map((n) => n.id)).toEqual(['alert:d1']);
    expect((await feed(null)).map((n) => n.id)).toEqual(['alert:d1']);
  });
});
