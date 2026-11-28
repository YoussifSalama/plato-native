import { useState } from 'react';
import { Coins, PackagePlus, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from './ConfirmDialog';
import { DataTable } from './DataTable';
import { Dialog } from './Dialog';
import { ErrorNote, Section, Skeleton, Spinner, Stat, StatGrid, StatusChip } from './ui';
import { api, errorMessage } from '../lib/api';
import { date, dateTime, num, num1 } from '../lib/format';
import type { CreditLedger, CreditView, Paged, Plan, PlansResponse } from '../lib/types';
import { useApi } from '../lib/useApi';

type Action = 'adjust' | 'topup' | 'plan' | null;

/**
 * A seeker's tokens, on their own page: balance, plan, period, every movement, and the three
 * support actions (adjust, record a top-up, change the plan). Each action is confirmed and lands in
 * the audit log and the ledger (meta.admin).
 */
export function UserCredits({ user, onChanged }: { user: string; onChanged?: () => void }) {
  const view = useApi<CreditView>(`/admin/credits/${encodeURIComponent(user)}`);
  const plans = useApi<PlansResponse>('/admin/plans');
  const [page, setPage] = useState(1);
  const ledger = useApi<Paged<CreditLedger>>(`/admin/credits/${encodeURIComponent(user)}/ledger`, { page });
  const [action, setAction] = useState<Action>(null);
  // the latest ten keep the user page short; the rest, paged, on request
  const [all, setAll] = useState(false);
  const acc = view.data?.account;
  const reload = () => {
    view.reload();
    ledger.reload();
    onChanged?.();
  };

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-text-secondary">Tokens</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" disabled={!acc} onClick={() => setAction('adjust')}>
            <Coins className="size-4" /> Adjust
          </button>
          <button type="button" className="btn-outline" disabled={!acc} onClick={() => setAction('topup')}>
            <PackagePlus className="size-4" /> Top-up
          </button>
          <button type="button" className="btn-primary" disabled={!acc} onClick={() => setAction('plan')}>
            <Repeat className="size-4" /> Change plan
          </button>
        </div>
      </div>
      <ErrorNote error={view.error} onRetry={view.reload} />
      {!acc ? (
        view.loading && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-2xl" />
            ))}
          </div>
        )
      ) : (
        <>
          <StatGrid>
            <Stat label="Balance" value={num1(acc.balance)} hint={`${num1(Math.min(acc.topup, acc.balance))} from top-ups (never expire)`} tone={acc.balance < 0 ? 'danger' : undefined} />
            <Stat label="Plan" value={acc.plan} hint={acc.unverified ? 'Grant waits for a confirmed email' : undefined} />
            <Stat label="Paid until" value={acc.paid_until ? date(acc.paid_until) : '—'} hint={acc.plan === 'free' ? 'Free plan' : 'Lapses to Free after'} />
            <Stat label="Period resets" value={date(acc.period_end)} hint={`Started ${date(acc.period_start)}`} />
          </StatGrid>
          <div className="mt-4">
            <Section
              title="Token movements"
              actions={
                (ledger.data?.total ?? 0) > 10 && (
                  <button type="button" className="btn-ghost h-8 text-xs" onClick={() => setAll((a) => !a)}>
                    {all ? 'Show the latest 10' : `Show all ${num(ledger.data?.total)}`}
                  </button>
                )
              }
            >
              <ErrorNote error={ledger.error} onRetry={ledger.reload} />
              <DataTable
                rows={all ? ledger.data?.items : ledger.data?.items.slice(0, 10)}
                total={all ? ledger.data?.total : undefined}
                page={all ? page : undefined}
                onPage={all ? setPage : undefined}
                loading={ledger.loading}
                rowKey={(r) => r.id}
                empty="No movements yet."
                renderCard={(r) => (
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="chip-neutral">{r.kind}</span>
                      <span className="ml-2 text-xs text-text-tertiary">{dateTime(r.created_at)}</span>
                      <span className="mt-1 block"><LedgerDetail row={r} /></span>
                    </span>
                    <Amount value={r.amount} />
                  </span>
                )}
                columns={[
                  { key: 'at', header: 'When', render: (r) => <span className="whitespace-nowrap">{dateTime(r.created_at)}</span> },
                  { key: 'kind', header: 'Kind', render: (r) => <span className="chip-neutral">{r.kind}</span> },
                  { key: 'amount', header: 'Amount', align: 'right', render: (r) => <Amount value={r.amount} /> },
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
    </div>
  );
}

/** "+500" in bold, "-12.5" quieter: money in vs money out. */
export function Amount({ value }: { value: number }) {
  return (
    <span className={`tabular-nums ${value < 0 ? 'text-text-secondary' : 'font-semibold'}`}>
      {value > 0 ? '+' : ''}
      {num1(value)}
    </span>
  );
}

export function LedgerDetail({ row }: { row: CreditLedger }) {
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
