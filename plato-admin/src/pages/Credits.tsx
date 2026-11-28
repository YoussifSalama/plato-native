import { useState } from 'react';
import { ArrowLeft, Coins, PackagePlus, Repeat } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useConfirm } from '../components/ConfirmDialog';
import { DataTable } from '../components/DataTable';
import { Dialog } from '../components/Dialog';
import { ErrorNote, PageSkeleton, PageHeader, SearchInput, Section, Spinner, Stat, StatGrid, StatusChip } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { date, dateTime, num, num1 } from '../lib/format';
import { useSearchState } from '../lib/searchState';
import type { CreditLedger, CreditView, Paged, Plan, PlansResponse, UserRow } from '../lib/types';
import { useApi } from '../lib/useApi';

/** Credits: pick a seeker (the users list), then see the account and move tokens. */
export default function Credits() {
  const [s, set] = useSearchState({ user: '', q: '', page: '1' });
  return s.user ? <Account user={s.user} onBack={() => set({ user: '' })} /> : <Pick q={s.q} page={Number(s.page) || 1} set={set} />;
}

function Pick({ q, page, set }: { q: string; page: number; set: (p: { q?: string; page?: string; user?: string }) => void }) {
  const { data, error, loading, reload } = useApi<Paged<UserRow>>('/admin/users', { q, page, status: 'all' });
  return (
    <>
      <PageHeader title="Credits" description="Find a seeker to see their balance and ledger, adjust tokens, record a top-up or change the plan." />
      <Section title="Seekers" actions={<SearchInput value={q} onChange={(v) => set({ q: v })} placeholder="Search email or name" />}>
        <ErrorNote error={error} onRetry={reload} />
        <DataTable
          rows={data?.items}
          total={data?.total}
          page={page}
          onPage={(p) => set({ page: String(p) })}
          loading={loading}
          rowKey={(r) => r.id}
          onRowClick={(r) => set({ user: r.id })}
          empty="No seekers match."
          columns={[
            {
              key: 'user',
              header: 'Seeker',
              render: (r) => (
                <span className="block min-w-0">
                  <span className="block truncate font-medium text-primary">{r.email}</span>
                  {r.name && <span className="block truncate text-xs text-text-tertiary">{r.name}</span>}
                </span>
              ),
            },
            { key: 'plan', header: 'Plan', render: (r) => <span className="chip-neutral">{r.plan}</span> },
            { key: 'balance', header: 'Balance', align: 'right', render: (r) => num1(r.balance) },
            { key: 'last', header: 'Last active', hideOnMobile: true, render: (r) => date(r.lastActiveAt) },
          ]}
        />
      </Section>
    </>
  );
}

type Action = 'adjust' | 'topup' | 'plan' | null;

function Account({ user, onBack }: { user: string; onBack: () => void }) {
  const view = useApi<CreditView>(`/admin/credits/${encodeURIComponent(user)}`);
  const plans = useApi<PlansResponse>('/admin/plans');
  const [page, setPage] = useState(1);
  const ledger = useApi<Paged<CreditLedger>>(`/admin/credits/${encodeURIComponent(user)}/ledger`, { page });
  const [action, setAction] = useState<Action>(null);
  const acc = view.data?.account;
  const reload = () => {
    view.reload();
    ledger.reload();
  };

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <button type="button" className="btn-ghost -ml-2 px-2" onClick={onBack} aria-label="Back to seekers">
              <ArrowLeft className="size-5" />
            </button>
            Credits
          </span>
        }
        description={
          <Link to={`/users/${acc?.user_id ?? user}`} className="text-primary hover:underline">
            Open the seeker's page
          </Link>
        }
        actions={
          <>
            <button type="button" className="btn-outline" disabled={!acc} onClick={() => setAction('adjust')}>
              <Coins className="size-4" /> Adjust
            </button>
            <button type="button" className="btn-outline" disabled={!acc} onClick={() => setAction('topup')}>
              <PackagePlus className="size-4" /> Top-up
            </button>
            <button type="button" className="btn-primary" disabled={!acc} onClick={() => setAction('plan')}>
              <Repeat className="size-4" /> Change plan
            </button>
          </>
        }
      />
      <ErrorNote error={view.error} onRetry={view.reload} />
      {!acc ? (
        view.loading && <PageSkeleton />
      ) : (
        <>
          <StatGrid>
            <Stat label="Balance" value={num1(acc.balance)} hint={`${num1(Math.min(acc.topup, acc.balance))} from top-ups (never expire)`} tone={acc.balance < 0 ? 'danger' : undefined} />
            <Stat label="Plan" value={acc.plan} hint={acc.unverified ? 'Grant waits for a confirmed email' : undefined} />
            <Stat label="Paid until" value={acc.paid_until ? date(acc.paid_until) : '—'} hint={acc.plan === 'free' ? 'Free plan' : 'Lapses to Free after'} />
            <Stat label="Period resets" value={date(acc.period_end)} hint={`Started ${date(acc.period_start)}`} />
          </StatGrid>
          <div className="mt-4">
            <Section title="Ledger">
              <ErrorNote error={ledger.error} onRetry={ledger.reload} />
              <DataTable
                rows={ledger.data?.items}
                total={ledger.data?.total}
                page={page}
                onPage={setPage}
                loading={ledger.loading}
                rowKey={(r) => r.id}
                empty="No movements yet."
                columns={[
                  { key: 'at', header: 'When', render: (r) => <span className="whitespace-nowrap">{dateTime(r.created_at)}</span> },
                  { key: 'kind', header: 'Kind', render: (r) => <span className="chip-neutral">{r.kind}</span> },
                  {
                    key: 'amount',
                    header: 'Amount',
                    align: 'right',
                    render: (r) => <span className={r.amount < 0 ? 'text-text-secondary' : 'font-semibold'}>{r.amount > 0 ? '+' : ''}{num1(r.amount)}</span>,
                  },
                  { key: 'after', header: 'Balance after', align: 'right', hideOnMobile: true, render: (r) => num1(r.balance_after) },
                  { key: 'what', header: 'Detail', hideOnMobile: true, render: (r) => <LedgerDetail row={r} /> },
                ]}
              />
            </Section>
          </div>
        </>
      )}
      <Dialog open={action !== null} onClose={() => setAction(null)} title={action === 'adjust' ? 'Adjust tokens' : action === 'topup' ? 'Record a top-up' : 'Change plan'}>
        {action && acc && (
          <ActionForm
            action={action}
            user={user}
            currentPlan={acc.plan}
            plans={plans.data?.items ?? []}
            onDone={() => {
              setAction(null);
              reload();
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function LedgerDetail({ row }: { row: CreditLedger }) {
  const m = (row.meta ?? {}) as Record<string, unknown>;
  const parts = [row.feature, m.reason, m.plan && `plan ${String(m.plan)}`, m.pack && `pack ${String(m.pack)}`, m.ref && `ref ${String(m.ref)}`, m.admin && 'by admin'].filter(Boolean);
  return <span className="text-xs text-text-secondary">{parts.map(String).join(' · ') || '—'}</span>;
}

function ActionForm({
  action,
  user,
  currentPlan,
  plans,
  onDone,
}: {
  action: Exclude<Action, null>;
  user: string;
  currentPlan: string;
  plans: Plan[];
  onDone: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ amount: '', reason: '', pack: '', ref: '', plan: '', months: '1' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const packs = plans.filter((p) => p.kind === 'topup' && p.active);
  const planList = plans.filter((p) => p.kind === 'plan' && p.active);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(f.amount);
    const { path, body, summary } =
      action === 'adjust'
        ? { path: 'adjust', body: { amount, reason: f.reason.trim() }, summary: `${amount > 0 ? 'Add' : 'Take away'} ${num1(Math.abs(amount))} tokens: “${f.reason.trim()}”.` }
        : action === 'topup'
          ? { path: 'topup', body: { pack: f.pack, ref: f.ref.trim() }, summary: `Add the ${f.pack} pack (${num(packs.find((p) => p.key === f.pack)?.tokens)} tokens), payment ref ${f.ref.trim()}.` }
          : {
              path: 'plan',
              body: { plan: f.plan, months: Number(f.months) },
              summary: `Move from ${currentPlan} to ${f.plan}${f.plan === 'free' ? '' : ` for ${f.months} month(s)`}. A new period starts now with the plan's full grant.`,
            };
    if (!(await confirm({ title: 'Confirm', body: summary, confirmLabel: 'Apply' }))) return;
    setBusy(true);
    try {
      await api(`/admin/credits/${encodeURIComponent(user)}/${path}`, { body });
      toast.success('Done');
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {action === 'adjust' && (
        <>
          <label>
            <span className="label">Tokens (negative to take away)</span>
            <input className="input" type="number" step="any" required autoFocus value={f.amount} onChange={set('amount')} placeholder="500 or -200" />
          </label>
          <label>
            <span className="label">Reason</span>
            <input className="input" required minLength={3} maxLength={200} value={f.reason} onChange={set('reason')} placeholder="Refund for a failed apply" />
          </label>
        </>
      )}
      {action === 'topup' && (
        <>
          <label>
            <span className="label">Pack</span>
            <select className="input" required value={f.pack} onChange={set('pack')}>
              <option value="">Choose a pack</option>
              {packs.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} · {num(p.tokens)} tokens · ${p.priceUsd}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Payment reference</span>
            <input className="input" required minLength={3} maxLength={120} value={f.ref} onChange={set('ref')} placeholder="Bank transfer 12345" />
          </label>
        </>
      )}
      {action === 'plan' && (
        <>
          <label>
            <span className="label">Plan</span>
            <select className="input" required value={f.plan} onChange={set('plan')}>
              <option value="">Choose a plan</option>
              {planList.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} · {num(p.tokens)} tokens / month · ${p.priceUsd}
                  {p.key === currentPlan ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </label>
          {f.plan !== 'free' && (
            <label>
              <span className="label">Months paid</span>
              <input className="input" type="number" min={1} max={24} step={1} required value={f.months} onChange={set('months')} />
            </label>
          )}
        </>
      )}
      <div className="flex justify-end pt-1">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy && <Spinner className="text-white" />} Continue
        </button>
      </div>
      {action === 'adjust' && Number(f.amount) < 0 && <StatusChip tone="warning">This takes tokens away.</StatusChip>}
    </form>
  );
}
