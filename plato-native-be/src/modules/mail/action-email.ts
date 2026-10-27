// One branded email with a single button: confirm an address, reset a
// password. Plain table layout and inline styles, what email clients render.

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

export function actionEmail(input: {
  subject: string;
  name: string;
  lines: string[];
  button: string;
  url: string;
  footer: string;
}) {
  const first = input.name.trim().split(/\s+/)[0] || 'there';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ff;font-family:'Plus Jakarta Sans',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px">
      <tr><td style="font-size:13px;font-weight:700;color:#4f3ff7;letter-spacing:.04em;text-transform:uppercase">Plato</td></tr>
      <tr><td style="padding-top:8px;font-size:22px;font-weight:800;color:#1b1340">Hi ${esc(first)},</td></tr>
      ${input.lines.map((l) => `<tr><td style="padding-top:10px;font-size:15px;line-height:1.6;color:#4b4668">${esc(l)}</td></tr>`).join('')}
      <tr><td style="padding-top:22px"><a href="${esc(input.url)}" style="display:inline-block;background:#4f3ff7;color:#ffffff;font-weight:700;font-size:15px;padding:13px 22px;border-radius:12px;text-decoration:none">${esc(input.button)}</a></td></tr>
      <tr><td style="padding-top:18px;font-size:12px;color:#8a85a6;line-height:1.6;word-break:break-all">If the button doesn't work, open this link: ${esc(input.url)}</td></tr>
      <tr><td style="padding-top:18px;font-size:12px;color:#8a85a6;line-height:1.6">${esc(input.footer)}</td></tr>
    </table>
  </td></tr></table></body></html>`;
  const text = [
    `Hi ${first},`,
    '',
    ...input.lines,
    '',
    `${input.button}: ${input.url}`,
    '',
    input.footer,
  ].join('\n');
  return { subject: input.subject, html, text };
}
