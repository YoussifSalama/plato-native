import { DIGEST_TOP } from './alert-rules';

export interface DigestJob {
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  posted_at: Date | null;
  url: string;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

const ago = (d: Date | null, now: Date) => {
  if (!d) return '';
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

const where = (j: DigestJob) =>
  [j.remote ? 'Remote' : null, j.location].filter(Boolean).join(' · ');

// One digest email: the newest jobs first, at most DIGEST_TOP listed, the rest
// counted with a link to see them all in Plato. Plain table layout, inline
// styles: what email clients actually render.
export function digestEmail(input: {
  name: string;
  headline: string;
  jobs: DigestJob[];
  appUrl: string;
  unsubscribeUrl: string;
  cadenceLabel: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const shown = input.jobs.slice(0, DIGEST_TOP);
  const more = input.jobs.length - shown.length;
  const allUrl = `${input.appUrl}/insights`;
  const first = input.name.split(' ')[0] || 'there';
  const subject =
    input.jobs.length === 1
      ? `New job: ${input.jobs[0].title} at ${input.jobs[0].company}`
      : `${input.jobs.length} new jobs: ${input.headline}`;

  const rows = shown
    .map(
      (j) => `
      <tr><td style="padding:14px 0;border-bottom:1px solid #ece9fb">
        <a href="${esc(j.url)}" style="font-size:16px;font-weight:700;color:#1b1340;text-decoration:none">${esc(j.title)}</a>
        <div style="font-size:14px;color:#4b4668;margin-top:2px">${esc(j.company)}${where(j) ? ` · ${esc(where(j))}` : ''}</div>
        <div style="font-size:12px;color:#8a85a6;margin-top:2px">Posted ${esc(ago(j.posted_at, now))}</div>
      </td></tr>`,
    )
    .join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ff;font-family:'Plus Jakarta Sans',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
      <tr><td style="font-size:13px;font-weight:700;color:#4f3ff7;letter-spacing:.04em;text-transform:uppercase">Plato job alerts</td></tr>
      <tr><td style="padding-top:8px;font-size:22px;font-weight:800;color:#1b1340">Hi ${esc(first)}, ${input.jobs.length === 1 ? 'a new job' : `${input.jobs.length} new jobs`} for you</td></tr>
      <tr><td style="padding-top:6px;font-size:14px;color:#4b4668">${esc(input.headline)}. All still open when we checked.</td></tr>
      <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
      <tr><td style="padding-top:20px"><a href="${esc(allUrl)}" style="display:inline-block;background:#4f3ff7;color:#ffffff;font-weight:700;font-size:14px;padding:12px 20px;border-radius:12px;text-decoration:none">${more > 0 ? `See all ${input.jobs.length} jobs` : 'Open your alerts'}</a></td></tr>
      <tr><td style="padding-top:24px;font-size:12px;color:#8a85a6;line-height:1.6">You get this ${esc(input.cadenceLabel)} because you set up job alerts on Plato.
        <a href="${esc(allUrl)}" style="color:#8a85a6">Change alerts</a> · <a href="${esc(input.unsubscribeUrl)}" style="color:#8a85a6">Stop these emails</a></td></tr>
    </table>
  </td></tr></table></body></html>`;

  const text = [
    `Hi ${first}, ${input.jobs.length} new job${input.jobs.length === 1 ? '' : 's'} for you.`,
    `${input.headline}.`,
    '',
    ...shown.map(
      (j) =>
        `- ${j.title} at ${j.company}${where(j) ? ` (${where(j)})` : ''}\n  ${j.url}`,
    ),
    '',
    more > 0 ? `${more} more: ${allUrl}` : `Your alerts: ${allUrl}`,
    `Stop these emails: ${input.unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
}
