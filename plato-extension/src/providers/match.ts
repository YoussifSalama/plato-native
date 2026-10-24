// Chrome match patterns, the subset we allow: scheme://host/path with `*` in
// the path, and an optional leading `*.` on the host. No <all_urls>, no `*://`,
// no bare `*` host.
const PATTERN = /^(https?):\/\/((?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+|127\.0\.0\.1:\d+)(\/.*)$/;

export function isAllowedPattern(p: string) {
  return PATTERN.test(p);
}

export function matchesPattern(pattern: string, url: URL) {
  const m = PATTERN.exec(pattern);
  if (!m) return false;
  const [, scheme, host, path] = m as unknown as [string, string, string, string];
  if (url.protocol !== `${scheme}:`) return false;
  const h = url.host;
  const hostOk = host.startsWith('*.') ? h === host.slice(2) || h.endsWith(host.slice(1)) : h === host;
  if (!hostOk) return false;
  const re = new RegExp('^' + path.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(url.pathname + url.search);
}
