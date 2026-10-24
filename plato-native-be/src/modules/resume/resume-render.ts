import { chromium } from 'playwright-core';
import { SECTION_TITLES } from './resume-checks';
import { ResumeDoc } from './resume.types';

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const month = (d: string | null) => (d ? d.slice(0, 7) : '');

// Both templates are parser-safe by construction: one column, real text,
// standard headings, no tables, images or header/footer content. They differ
// only in typography and one accent colour.
const STYLE = {
  classic: { font: 'Arial,Helvetica,sans-serif', accent: '#111', rule: '#999' },
  modern: {
    font: '"Segoe UI",Calibri,Arial,sans-serif',
    accent: '#1f3a8a',
    rule: '#1f3a8a',
  },
} as const;

export function resumeHtml(d: ResumeDoc): string {
  const s = STYLE[d.template];
  const size = d.compact ? '10pt' : '11pt';
  const section = (key: (typeof d.sections)[number], body: string) =>
    body ? `<h2>${SECTION_TITLES[key]}</h2>${body}` : '';
  const list = (bullets: string[]) =>
    bullets.length
      ? `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
      : '';

  const body: Record<(typeof d.sections)[number], string> = {
    summary: d.summary ? `<p>${esc(d.summary)}</p>` : '',
    skills:
      (d.skills.length ? `<p>${d.skills.map(esc).join(' · ')}</p>` : '') +
      (d.learning.length
        ? `<p>Currently learning: ${d.learning.map(esc).join(', ')}</p>`
        : ''),
    experience: d.experiences
      .map(
        (e) =>
          `<div class="row"><span><b>${esc(e.title)}</b>, ${esc(e.company)}</span><span>${month(e.start)} – ${e.end ? month(e.end) : 'Present'}</span></div>${list(e.bullets)}`,
      )
      .join(''),
    projects: d.projects
      .map(
        (p) =>
          `<div class="row"><span><b>${esc(p.name)}</b>${p.role ? `, ${esc(p.role)}` : ''}</span>${p.url ? `<span>${esc(p.url)}</span>` : ''}</div>${list(p.bullets)}`,
      )
      .join(''),
    education: d.educations
      .map(
        (e) =>
          `<div class="row"><span><b>${esc(e.degree)}${e.field ? `, ${esc(e.field)}` : ''}</b>, ${esc(e.institution)}</span><span>${month(e.end)}</span></div>`,
      )
      .join(''),
    certifications: d.certifications
      .map(
        (c) =>
          `<div>${esc(c.name)}${c.issuer ? `, ${esc(c.issuer)}` : ''}</div>`,
      )
      .join(''),
    languages: d.languages.length
      ? `<p>${d.languages.map((l) => `${esc(l.language)}${l.proficiency ? ` (${esc(l.proficiency)})` : ''}`).join(' · ')}</p>`
      : '',
  };
  const contact = [
    ...d.contact,
    ...(d.nationality ? [`Nationality: ${d.nationality}`] : []),
  ];

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.name)} Resume</title><style>
body{font:${size}/1.4 ${s.font};color:#111;margin:0}
h1{font-size:20pt;margin:0;color:${s.accent}}
h2{font-size:11pt;text-transform:uppercase;letter-spacing:.04em;color:${s.accent};border-bottom:1px solid ${s.rule};margin:${d.compact ? '10px' : '14px'} 0 6px}
.h{font-size:12pt;font-weight:600;margin:2px 0}.c{color:#444;font-size:10pt}.row{display:flex;justify-content:space-between;gap:12px;margin-top:6px}
ul{margin:4px 0 0 18px;padding:0}p{margin:0}
</style></head><body>
<h1>${esc(d.name)}</h1>${d.headline ? `<div class="h">${esc(d.headline)}</div>` : ''}<div class="c">${contact.map(esc).join(' · ')}</div>
${d.sections.map((k) => section(k, body[k])).join('')}
</body></html>`;
}

export async function resumePdf(
  d: ResumeDoc,
  browserChannel: string,
): Promise<Buffer> {
  const browser = await chromium.launch({
    channel: browserChannel,
    headless: true,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(resumeHtml(d));
    const m = d.compact ? '11mm' : '16mm';
    return await page.pdf({
      format: 'A4',
      margin: { top: m, bottom: m, left: m, right: m },
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}
