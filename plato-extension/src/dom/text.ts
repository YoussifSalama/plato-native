export const norm = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const clean = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\(\s*required\s*\)/gi, '')
    .replace(/[\s*:]+$/g, '')
    .trim()
    .slice(0, 200);
