import { Link, useParams } from 'react-router';
import { Ban, CheckCheck, Eraser, LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../../components/ConfirmDialog';
import { BarList } from '../../components/charts';
import { DateRange } from '../../components/DateRange';
import { Empty, ErrorNote, Grid2, KeyValues, PageSkeleton, PageHeader, Section, Stat, StatGrid } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { date, dateTime, money, num, num1 } from '../../lib/format';
import { useRange } from '../../lib/searchState';
import type { UserAnalytics } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { UserEngagement } from './UserEngagement';
import { UserStatusChip } from './UsersList';

const entries = (o: Record<string, number> | undefined) =>
  Object.entries(o ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: k, value: v }));

export default function UserDetail() {
  const { id = '' } = useParams();
  const { from, to, setRange } = useRange();
  const { data, error, loading, reload } = useApi<UserAnalytics>(`/admin/users/${id}/analytics`, { from, to });
  const confirm = useConfirm();
  const u = data?.user;

  const run = async (path: string, done: string, body?: unknown) => {
    try {
      const r = await api<{ cleared?: number }>(`/admin/users/${id}/${path}`, { method: 'POST', body: body ?? {} });
      toast.success(typeof r?.cleared === 'number' ? `${done} (${r.cleared})` : done);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const block = async () => {
    const reason = await confirm({
      title: `Block ${u?.email}?`,
      body: 'They are signed out everywhere and cannot sign in until unblocked.',
      input: { label: 'Reason (kept on the account)', required: true, minLength: 3 },
      confirmLabel: 'Block',
      danger: true,
    });
    if (reason) await run('block', 'Blocked', { reason });
  };
  const simple = async (path: string, title: string, body: string, done: string, danger = false) => {
    if (await confirm({ title, body, confirmLabel: 'Confirm', danger })) await run(path, done);
  };

  return (
    <>
      <PageHeader
        title={u ? (u.name || u.email) : 'User'}
        description={
          u && (
            <span className="flex flex-wrap items-center gap-2">
              {u.email} <UserStatusChip u={u} /> <span className="chip-neutral">{u.plan}</span>
              <Link className="text-primary hover:underline" to={`/credits?user=${u.id}`}>
                Credits
              </Link>
            </span>
          )
        }
        actions={
          u && (
            <>
          {u.blocked ? (
            <button type="button" className="btn-outline" onClick={() => void simple('unblock', `Unblock ${u.email}?`, 'They can sign in again.', 'Unblocked')}>
              <ShieldCheck className="size-4" /> Unblock
            </button>
          ) : (
            <button type="button" className="btn-outline text-destructive" onClick={() => void block()}>
              <Ban className="size-4" /> Block
            </button>
          )}
          {!u.verified && (
            <button type="button" className="btn-outline" onClick={() => void simple('verify-email', 'Mark the email as verified?', `${u.email} will count as confirmed (and get the free grant).`, 'Email verified')}>
              <CheckCheck className="size-4" /> Verify email
            </button>
          )}
          <button type="button" className="btn-outline" onClick={() => void simple('logout-all', 'Log out everywhere?', 'Every session of this seeker ends now.', 'Logged out everywhere')}>
            <LogOut className="size-4" /> Log out all
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => void simple('clear-rate-limits', 'Clear rate limits?', "Every limiter key tied to this seeker, their email and last IPs is reset.", 'Rate limits cleared')}
          >
            <Eraser className="size-4" /> Clear rate limits
          </button>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-text-secondary">Activity</h2>
        <DateRange from={from} to={to} onChange={setRange} />
      </div>
      <ErrorNote error={error} onRetry={reload} />
      {!data ? (
        loading && <PageSkeleton />
      ) : (
        <>
          {data.user.blocked && data.user.blockedReason && (
            <p className="mb-4 rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-sm text-destructive">Blocked: {data.user.blockedReason}</p>
          )}
          <StatGrid>
            <Stat label="Active days" value={num(data.activity.activeDays)} hint={`Last active ${date(data.activity.lastActiveAt)}`} />
            <Stat label="Applications" value={num(data.applications.total)} hint={`${num(data.applications.byStatus.SUBMITTED ?? 0)} went through`} />
            <Stat label="Tokens spent" value={num1(data.spentTokens)} hint={`Balance ${num1(data.user.balance)}`} />
            <Stat label="Our cost" value={money(data.costUsd)} hint="This range" />
          </StatGrid>
          <Grid2>
            <Section title="Features used">
              <BarList
                items={[...data.features].sort((a, b) => b.costUsd - a.costUsd).map((f) => ({ key: f.feature, label: f.feature, value: f.costUsd, sub: `${num(f.events)} ev.` }))}
              />
            </Section>
            <Section title={`Applications · ${num(data.applications.total)}`}>
              {data.applications.total === 0 ? (
                <Empty>No applications in this range.</Empty>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="label">By status</p>
                    <BarList format={num} items={entries(data.applications.byStatus)} />
                  </div>
                  <div>
                    <p className="label">By engine</p>
                    <BarList format={num} items={entries(data.applications.byEngine)} />
                  </div>
                </div>
              )}
            </Section>
            <Section title="Account" wide>
              <KeyValues
                rows={[
                  ['Joined', dateTime(data.user.createdAt)],
                  ['Chat', `${num(data.chat.threads)} threads · ${num(data.chat.messages)} messages`],
                  ['Interviews', num(data.interviews)],
                  ['Headline', data.profile.headline || '—'],
                  ['Experience', data.profile.yearsExperience != null ? `${num1(data.profile.yearsExperience)} years` : '—'],
                  ['CV', data.profile.cvFile || '—'],
                ]}
              />
            </Section>
          </Grid2>
          <UserEngagement id={id} from={from} to={to} />
        </>
      )}
    </>
  );
}
