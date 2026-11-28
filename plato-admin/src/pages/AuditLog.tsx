import { useState } from 'react';
import { Link } from 'react-router';
import { DataTable } from '../components/DataTable';
import { ErrorNote, KeyValues, SearchInput, Section } from '../components/ui';
import { dateTime } from '../lib/format';
import { useSearchState } from '../lib/searchState';
import type { AuditRow, Paged } from '../lib/types';
import { useApi } from '../lib/useApi';

// The route as a sentence the owner reads ("POST /admin/users/:id/block" -> "Blocked a user").
const ACTIONS: [RegExp, string][] = [
  [/^POST \/admin\/auth\/totp\/verify$/, 'Signed in'],
  [/^POST \/admin\/auth\/super-reset$/, 'Reset the super admin’s 2FA with the key'],
  [/^POST \/admin\/users\/:id\/block$/, 'Blocked a user'],
  [/^POST \/admin\/users\/:id\/unblock$/, 'Unblocked a user'],
  [/^POST \/admin\/users\/:id\/verify-email$/, 'Marked a user’s email verified'],
  [/^POST \/admin\/users\/:id\/logout-all$/, 'Signed a user out everywhere'],
  [/^POST \/admin\/users\/:id\/clear-rate-limits$/, 'Cleared a user’s rate limits'],
  [/^DELETE \/admin\/rate-limits$/, 'Cleared a rate limit'],
  [/^POST \/admin\/credits\/:\w+\/adjust$/, 'Adjusted a user’s tokens'],
  [/^POST \/admin\/credits\/:\w+\/plan$/, 'Changed a user’s plan'],
  [/^POST \/admin\/credits\/:\w+\/topup$/, 'Recorded a top-up'],
  [/^POST \/admin\/plans$/, 'Created a plan'],
  [/^PATCH \/admin\/plans\/:key$/, 'Edited a plan'],
  [/^DELETE \/admin\/plans\/:key$/, 'Turned a plan off'],
  [/^PATCH \/admin\/admins\/:id$/, 'Changed an admin'],
  [/^POST \/admin\/admins\/:id\/reset-2fa$/, 'Reset an admin’s 2FA'],
  [/^POST \/admin\/roles$/, 'Created a role'],
  [/^PATCH \/admin\/roles\/:id$/, 'Edited a role'],
  [/^DELETE \/admin\/roles\/:id$/, 'Deleted a role'],
  [/^POST \/admin\/invites$/, 'Invited an admin'],
  [/^POST \/admin\/invites\/:id\/resend$/, 'Resent an invite'],
  [/^DELETE \/admin\/invites\/:id$/, 'Revoked an invite'],
];
export const actionLabel = (a: string) => ACTIONS.find(([re]) => re.test(a))?.[1] ?? a;

/** Where the action pointed, as a link when it is a seeker. */
function Target({ row }: { row: AuditRow }) {
  const t = row.target as Record<string, string> | null;
  if (!t) return <>—</>;
  const id = t.id ?? t.user;
  if (id && /\/admin\/(users|credits)\//.test(row.action) && /^[a-f0-9]{24}$/i.test(id))
    return (
      <Link to={`/users/${id}`} className="font-mono text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
        {id}
      </Link>
    );
  return <span className="font-mono text-xs break-all">{Object.values(t).join(', ')}</span>;
}

/** Who did what in the panel, newest first (super admin only). */
export function AuditLog() {
  const [s, set] = useSearchState({ q: '', page: '1' });
  const page = Number(s.page) || 1;
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Paged<AuditRow>>('/admin/audit', { q: s.q, page });
  return (
    <Section actions={<SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Search admin email or action" />}>
      <ErrorNote error={error} onRetry={reload} />
      <DataTable
        rows={data?.items}
        total={data?.total}
        page={page}
        onPage={(p) => set({ page: String(p) })}
        loading={loading}
        rowKey={(r) => r.id}
        onRowClick={(r) => setOpen(open === r.id ? null : r.id)}
        expanded={open}
        renderExpanded={(r) => (
          <div className="pt-3">
            <KeyValues
              rows={[
                ['Route', <span className="font-mono text-xs">{r.action}</span>],
                ['IP', r.ip ?? '—'],
                ['Sent', <pre className="max-h-60 overflow-auto rounded-lg border border-divider bg-card p-2 text-xs whitespace-pre-wrap">{JSON.stringify(r.detail, null, 2)}</pre>],
              ]}
            />
          </div>
        )}
        empty="Nothing recorded yet."
        columns={[
          { key: 'when', header: 'When', render: (r) => <span className="whitespace-nowrap">{dateTime(r.createdAt)}</span> },
          { key: 'who', header: 'Admin', render: (r) => <span className="text-xs break-all">{r.adminEmail ?? '—'}</span> },
          { key: 'what', header: 'What', render: (r) => <span className="font-medium">{actionLabel(r.action)}</span> },
          { key: 'target', header: 'On', hideOnMobile: true, render: (r) => <Target row={r} /> },
        ]}
      />
    </Section>
  );
}
