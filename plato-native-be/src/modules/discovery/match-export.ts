import { Workbook } from 'exceljs';

// Shape returned by DiscoveryService.getMatches().items — only the fields
// the sheet needs.
export interface ExportRow {
  match_percent: number;
  match_label: string;
  saved: boolean;
  application_status: string | null;
  job: {
    title: string;
    company: string;
    location: string | null;
    remote_type: string;
    job_type: string | null;
    source: string;
    easy_apply: boolean;
    salary_min: number | null;
    salary_max: number | null;
    salary_currency: string | null;
    posted_at: Date | null;
    url: string;
    apply_url: string | null;
  };
}

const BRAND = 'FF4F3FF7';

const title = (s: string) =>
  s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const salary = (j: ExportRow['job']) => {
  if (j.salary_min == null && j.salary_max == null) return '';
  const range = [j.salary_min, j.salary_max]
    .filter((n): n is number => n != null)
    .map((n) => n.toLocaleString('en-US'))
    .join(' – ');
  return `${range} ${j.salary_currency ?? ''}`.trim();
};

export async function buildMatchesWorkbook(
  rows: ExportRow[],
  meta: { sheetName: string; generatedAt: Date },
): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = 'Plato';
  wb.created = meta.generatedAt;
  const ws = wb.addWorksheet(meta.sheetName.slice(0, 31) || 'Jobs', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: '#', key: 'n', width: 5 },
    { header: 'Match %', key: 'match', width: 10 },
    { header: 'Match', key: 'label', width: 16 },
    { header: 'Title', key: 'title', width: 40 },
    { header: 'Company', key: 'company', width: 26 },
    { header: 'Location', key: 'location', width: 26 },
    { header: 'Remote', key: 'remote', width: 10 },
    { header: 'Job type', key: 'jobType', width: 12 },
    { header: 'Source', key: 'source', width: 10 },
    { header: 'Easy apply', key: 'easy', width: 10 },
    { header: 'Salary', key: 'salary', width: 20 },
    { header: 'Posted', key: 'posted', width: 12 },
    { header: 'Saved', key: 'saved', width: 8 },
    { header: 'Application', key: 'application', width: 14 },
    { header: 'Job URL', key: 'url', width: 50 },
    { header: 'Apply URL', key: 'applyUrl', width: 50 },
  ];

  rows.forEach((m, i) => {
    const j = m.job;
    const row = ws.addRow({
      n: i + 1,
      match: m.match_percent / 100,
      label: m.match_label,
      title: j.title,
      company: j.company,
      location: j.location ?? '',
      remote: j.remote_type === 'UNKNOWN' ? '' : title(j.remote_type),
      jobType: j.job_type ? title(j.job_type) : '',
      source: title(j.source),
      easy: j.easy_apply ? 'Yes' : 'No',
      salary: salary(j),
      posted: j.posted_at ?? '',
      saved: m.saved ? 'Yes' : '',
      application: m.application_status ? title(m.application_status) : '',
      url: j.url,
      applyUrl: j.apply_url ?? '',
    });
    row.getCell('match').numFmt = '0%';
    row.getCell('posted').numFmt = 'yyyy-mm-dd';
    const links = { url: j.url, applyUrl: j.apply_url ?? '' };
    for (const [key, href] of Object.entries(links)) {
      if (!href) continue;
      const cell = row.getCell(key);
      cell.value = { text: href, hyperlink: href };
      cell.font = { color: { argb: BRAND }, underline: true };
    }
  });

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  ws.autoFilter = { from: 'A1', to: `P${Math.max(1, rows.length + 1)}` };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
