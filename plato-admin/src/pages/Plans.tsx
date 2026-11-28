import { useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../components/ConfirmDialog';
import { DataTable } from '../components/DataTable';
import { DateRange } from '../components/DateRange';
import { Dialog } from '../components/Dialog';
import { ErrorNote, Grid2, Loading, PageHeader, Section, Spinner, StatusChip } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { calculate, type Margin } from '../lib/calculator';
import { money, num, num1, pct } from '../lib/format';
import { useRange } from '../lib/searchState';
import type { CalculatorData, Plan, PlansResponse } from '../lib/types';
import { useApi } from '../lib/useApi';

type Draft = { key: string; kind: Plan['kind']; label: string; tokens: string; priceUsd: string; active: boolean };
const blank: Draft = { key: '', kind: 'plan', label: '', tokens: '', priceUsd: '', active: true };

export default function Plans() {
  const { from, to, setRange } = useRange();
  const plans = useApi<PlansResponse>('/admin/plans');
  const calc = useApi<CalculatorData>('/admin/plans/calculator', { from, to });
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ draft: Draft; isNew: boolean } | null>(null);

  const open = (p?: Plan) =>
    setEditing(
      p
        ? { isNew: false, draft: { key: p.key, kind: p.kind, label: p.label, tokens: String(p.tokens), priceUsd: String(p.priceUsd), active: p.active } }
        : { isNew: true, draft: blank },
    );

  const setActive = async (p: Plan, active: boolean) => {
    const ok = await confirm({
      title: active ? `Reactivate ${p.label}?` : `Deactivate ${p.label}?`,
      body: active ? 'It can be chosen again.' : 'New seekers can no longer pick it. Accounts already on it keep working.',
      confirmLabel: active ? 'Reactivate' : 'Deactivate',
      danger: !active,
    });
    if (!ok) return;
    try {
      if (active) await api(`/admin/plans/${p.key}`, { method: 'PATCH', body: { active: true } });
      else await api(`/admin/plans/${p.key}`, { method: 'DELETE' });
      toast.success(active ? 'Reactivated' : 'Deactivated');
      plans.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const table = (kind: Plan['kind']) => (
    <DataTable<Plan>
      rows={plans.data?.items.filter((p) => p.kind === kind)}
      rowKey={(p) => p.key}
      empty={kind === 'plan' ? 'No plans yet.' : 'No top-ups yet.'}
      columns={[
        {
          key: 'label',
          header: 'Name',
          render: (p) => (
            <span>
              <span className="font-medium">{p.label}</span> <span className="text-xs text-text-tertiary">{p.key}</span>
            </span>
          ),
        },
        { key: 'tokens', header: kind === 'plan' ? 'Tokens / month' : 'Tokens', align: 'right', render: (p) => num(p.tokens) },
        { key: 'price', header: 'Price', align: 'right', render: (p) => money(p.priceUsd) },
        {
          key: 'cost',
          header: 'Cost if fully used',
          align: 'right',
          hideOnMobile: true,
          render: (p) => (plans.data ? money(p.tokens * plans.data.usdPerToken) : '—'),
        },
        {
          key: 'active',
          header: 'Status',
          render: (p) => (p.active ? <StatusChip tone="success">Active</StatusChip> : <StatusChip tone="neutral">Inactive</StatusChip>),
        },
        {
          key: 'actions',
          header: '',
          align: 'right',
          render: (p) => (
            <div className="flex justify-end gap-1">
              <button type="button" className="btn-ghost h-8 px-2" onClick={() => open(p)} aria-label={`Edit ${p.label}`}>
                <Pencil className="size-4" />
              </button>
              {p.key !== 'free' && (
                <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => void setActive(p, !p.active)}>
                  {p.active ? 'Deactivate' : 'Reactivate'}
                </button>
              )}
            </div>
          ),
        },
      ]}
    />
  );

  return (
    <>
      <PageHeader
        title="Plans"
        description="Plans, top-ups and what they cost us. The calculator reads real usage from the selected range."
        actions={
          <>
            <DateRange from={from} to={to} onChange={setRange} />
            <button type="button" className="btn-primary" onClick={() => open()}>
              <Plus className="size-4" /> New plan
            </button>
          </>
        }
      />
      <ErrorNote error={plans.error} onRetry={plans.reload} />
      {!plans.data && plans.loading ? (
        <Loading />
      ) : (
        <Grid2>
          <Section title="Plans" wide>
            {table('plan')}
          </Section>
          <Section title="Top-ups" wide>
            {table('topup')}
          </Section>
        </Grid2>
      )}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.isNew ? 'New plan or top-up' : `Edit ${editing?.draft.label}`} wide>
        {editing && (
          <PlanForm
            initial={editing.draft}
            isNew={editing.isNew}
            plans={plans.data}
            calc={calc.data}
            calcLoading={calc.loading}
            onSaved={() => {
              setEditing(null);
              plans.reload();
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function PlanForm({
  initial,
  isNew,
  plans,
  calc,
  calcLoading,
  onSaved,
}: {
  initial: Draft;
  isNew: boolean;
  plans: PlansResponse | null;
  calc: CalculatorData | null;
  calcLoading: boolean;
  onSaved: () => void;
}) {
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const isFree = d.key === 'free';
  const keyOk = /^[a-z0-9_]{2,20}$/.test(d.key);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      ...(isNew && { key: d.key, kind: d.kind }),
      label: d.label.trim(),
      tokens: Number(d.tokens),
      ...(!isFree && { priceUsd: Number(d.priceUsd) }),
      ...(!isNew && { active: d.active }),
    };
    const ok = await confirm({
      title: isNew ? `Create ${d.label || d.key}?` : `Save ${d.label}?`,
      body: `${num(Number(d.tokens))} tokens for ${money(Number(d.priceUsd))}${d.kind === 'plan' ? ' a month' : ''}.`,
      confirmLabel: isNew ? 'Create' : 'Save',
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (isNew) await api<Plan>('/admin/plans', { body });
      else await api<Plan>(`/admin/plans/${d.key}`, { method: 'PATCH', body });
      toast.success(isNew ? 'Created' : 'Saved');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <form onSubmit={submit} className="flex flex-col gap-3">
        {isNew && (
          <>
            <label>
              <span className="label">Kind</span>
              <select className="input" value={d.kind} onChange={(e) => set('kind', e.target.value as Plan['kind'])}>
                <option value="plan">Monthly plan</option>
                <option value="topup">Top-up pack</option>
              </select>
            </label>
            <label>
              <span className="label">Key (a–z, 0–9, _; 2–20)</span>
              <input
                className="input"
                required
                value={d.key}
                pattern="[a-z0-9_]{2,20}"
                onChange={(e) => set('key', e.target.value.toLowerCase())}
                placeholder="pro_plus"
              />
              {d.key && !keyOk && <span className="mt-1 block text-xs text-destructive">2–20 characters: lowercase letters, digits, _</span>}
            </label>
          </>
        )}
        <label>
          <span className="label">Label</span>
          <input className="input" required value={d.label} onChange={(e) => set('label', e.target.value)} placeholder="Pro Plus" />
        </label>
        <label>
          <span className="label">{d.kind === 'plan' ? 'Tokens per month (T)' : 'Tokens in the pack (T)'}</span>
          <input className="input" type="number" min={0} step={1} required value={d.tokens} onChange={(e) => set('tokens', e.target.value)} />
        </label>
        <label>
          <span className="label">{d.kind === 'plan' ? 'Price per month, USD (P)' : 'Price, USD (P)'}</span>
          <input
            className="input"
            type="number"
            min={0}
            step={0.01}
            required={!isFree}
            disabled={isFree}
            value={isFree ? '0' : d.priceUsd}
            onChange={(e) => set('priceUsd', e.target.value)}
          />
          {isFree && <span className="mt-1 block text-xs text-text-tertiary">Free can't be priced.</span>}
        </label>
        {!isNew && !isFree && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={d.active} onChange={(e) => set('active', e.target.checked)} /> Active
          </label>
        )}
        <div className="mt-auto flex justify-end gap-2 pt-2">
          <button type="submit" className="btn-primary" disabled={busy || (isNew && !keyOk)}>
            {busy && <Spinner className="text-white" />} {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </form>
      <Calculator price={Number(isFree ? 0 : d.priceUsd)} tokens={Number(d.tokens)} planKey={d.key} plans={plans} calc={calc} loading={calcLoading} />
    </div>
  );
}

function MarginRow({ label, m, hint }: { label: string; m: Margin | null; hint?: string }) {
  const tone = !m || m.marginPct === null ? '' : m.marginUsd < 0 ? 'text-destructive' : m.marginPct < 0.3 ? 'text-warning-ink' : 'text-success-ink';
  return (
    <div className="flex items-start justify-between gap-3 border-b border-divider py-2 text-sm last:border-0">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        {hint && <p className="text-xs text-text-tertiary">{hint}</p>}
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <p>{m ? money(m.costUsd) : '—'} cost</p>
        <p className={`text-xs font-semibold ${tone}`}>{m ? `${money(m.marginUsd)} margin${m.marginPct !== null ? ` · ${pct(m.marginPct)}` : ''}` : 'no usage data'}</p>
      </div>
    </div>
  );
}

function Calculator({
  price,
  tokens,
  planKey,
  plans,
  calc,
  loading,
}: {
  price: number;
  tokens: number;
  planKey: string;
  plans: PlansResponse | null;
  calc: CalculatorData | null;
  loading: boolean;
}) {
  const withUsers = calc?.plans.filter((p) => p.users > 0).map((p) => p.key) ?? [];
  const [compare, setCompare] = useState<string>(withUsers.includes(planKey) ? planKey : '');
  const [fixed, setFixed] = useState('');
  const grants = useMemo(
    () => Object.fromEntries((plans?.items ?? []).filter((p) => p.kind === 'plan').map((p) => [p.key, p.tokens])),
    [plans],
  );
  if (!calc) return <div className="rounded-xl bg-primary-tint p-4">{loading ? <Spinner /> : <p className="text-sm text-text-tertiary">No usage data.</p>}</div>;

  const r = calculate(calc, grants, { priceUsd: price, tokens, compareKeys: compare ? [compare] : [], fixedMonthlyUsd: Number(fixed) || 0 });
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl bg-primary-tint p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-sm font-bold">Live calculator</h3>
        <span className="text-xs text-text-tertiary">1 token = {money(calc.usdPerToken)}</span>
      </div>
      <label>
        <span className="label">Compare usage with</span>
        <select className="input" value={compare} onChange={(e) => setCompare(e.target.value)}>
          <option value="">All plans with users</option>
          {calc.plans.map((p) => (
            <option key={p.key} value={p.key} disabled={!p.users}>
              {p.key} ({num(p.users)} users)
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-lg bg-card px-3">
        <MarginRow label="Fully used" hint={`${num(tokens)} × ${money(calc.usdPerToken)}`} m={r.fullCost} />
        <MarginRow label="At average usage" hint={r.avgShare !== null ? `${pct(r.avgShare)} of the grant used` : undefined} m={r.avgCost} />
        <MarginRow label="At p90 usage" hint={r.p90Share !== null ? `${pct(r.p90Share)} of the grant used` : undefined} m={r.p90Cost} />
      </div>
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="label">Fixed monthly cost to cover, USD</span>
          <input className="input" type="number" min={0} value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="e.g. 200" />
        </label>
        <p className="mb-2 shrink-0 text-sm">
          Break-even: <b className="tabular-nums">{r.breakEvenUsers !== null ? `${num(r.breakEvenUsers)} users` : '—'}</b>
        </p>
      </div>
      <div>
        <p className="label">What {num(tokens)} tokens buy</p>
        {r.buys.length ? (
          <ul className="max-h-48 overflow-y-auto rounded-lg bg-card px-3 text-sm">
            {r.buys.map((b) => (
              <li key={b.feature} className="flex justify-between gap-3 border-b border-divider py-1.5 last:border-0">
                <span className="min-w-0 truncate">{b.feature}</span>
                <span className="shrink-0 tabular-nums">
                  <b>{num(b.count)}</b> <span className="text-xs text-text-tertiary">× {num1(b.avgTokensPerEvent)} tok</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-tertiary">No feature usage in this range.</p>
        )}
      </div>
    </div>
  );
}
