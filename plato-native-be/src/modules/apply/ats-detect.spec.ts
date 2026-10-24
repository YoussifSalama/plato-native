import { JobSource } from '@prisma/client';
import { detectAtsHost, effectiveApplySource } from './ats-detect';

describe('detectAtsHost', () => {
  it('reads the ATS from real posting hosts', () => {
    expect(detectAtsHost('https://apply.workable.com/acme/j/123')).toBe(
      'WORKABLE',
    );
    expect(detectAtsHost('https://boards.greenhouse.io/acme/jobs/1')).toBe(
      'GREENHOUSE',
    );
    expect(detectAtsHost('https://job-boards.greenhouse.io/acme/jobs/1')).toBe(
      'GREENHOUSE',
    );
    expect(detectAtsHost('https://jobs.lever.co/acme/abc-123')).toBe('LEVER');
    expect(detectAtsHost('https://jobs.ashbyhq.com/acme/abc-123')).toBe(
      'ASHBY',
    );
  });

  it('returns null for a custom domain or a missing url', () => {
    expect(detectAtsHost('https://careers.acme.com/apply/42')).toBeNull();
    expect(detectAtsHost(null)).toBeNull();
    expect(detectAtsHost(undefined)).toBeNull();
    expect(detectAtsHost('not a url')).toBeNull();
  });
});

describe('effectiveApplySource', () => {
  const job = (
    source: JobSource,
    apply_url: string | null,
    url = 'https://example.com/job',
  ) => ({ source, apply_url, url });

  it('routes a board-discovered job to the ATS its real form is hosted on', () => {
    expect(
      effectiveApplySource(
        job(JobSource.DICE, 'https://boards.greenhouse.io/acme/jobs/1'),
      ),
    ).toBe('GREENHOUSE');
  });

  it('falls back to url when apply_url is null', () => {
    expect(
      effectiveApplySource(
        job(JobSource.GOOGLE_JOBS, null, 'https://jobs.lever.co/acme/2'),
      ),
    ).toBe('LEVER');
  });

  it('trusts a direct ATS source regardless of its URL shape', () => {
    expect(
      effectiveApplySource(
        job(JobSource.GREENHOUSE, 'https://careers.acme.com/positions/1'),
      ),
    ).toBe('GREENHOUSE');
  });

  it('never applies through LinkedIn, Indeed, Wuzzuf or Handshake, even if the URL matches an ATS', () => {
    const ghUrl = 'https://boards.greenhouse.io/acme/jobs/1';
    expect(effectiveApplySource(job(JobSource.LINKEDIN, ghUrl))).toBeNull();
    expect(effectiveApplySource(job(JobSource.INDEED, ghUrl))).toBeNull();
    expect(effectiveApplySource(job(JobSource.WUZZUF, ghUrl))).toBeNull();
    expect(effectiveApplySource(job(JobSource.HANDSHAKE, ghUrl))).toBeNull();
  });

  it('stays discovery-only when a board job has no recognisable ATS host', () => {
    expect(
      effectiveApplySource(
        job(JobSource.BUILTIN, 'https://careers.acme.com/apply/42'),
      ),
    ).toBeNull();
  });
});
