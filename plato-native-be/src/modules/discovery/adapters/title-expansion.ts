const ROLE_SUFFIX =
  /\s+(developer|engineer|programmer|specialist|lead|manager|analyst|designer|architect|consultant)$/i;

// The ATS actor phrase-matches titles and supports `:*` prefixes.
// "Full Stack Developer" → ["Full Stack Developer", "Full Stack:*", "Full-Stack:*"]
// so "Full Stack Engineer" and "Full-stack Software Engineer" match too.
export function expandTitle(title: string): string[] {
  const clean = title.trim().replace(/\s+/g, ' ');
  const stem = clean.replace(ROLE_SUFFIX, '');
  const out = [clean];
  if (stem && stem !== clean) {
    out.push(`${stem}:*`);
    if (stem.includes(' ')) out.push(`${stem.replace(/\s+/g, '-')}:*`);
  }
  return [...new Set(out)];
}
