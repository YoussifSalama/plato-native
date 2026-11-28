import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../components/ConfirmDialog';
import { DataTable } from '../components/DataTable';
import { Dialog } from '../components/Dialog';
import { ErrorNote, PageHeader, Section, Spinner, StatusChip, Tabs } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { date, dateTime, num } from '../lib/format';
import { useSearchState } from '../lib/searchState';
import type { AdminRow, Invite, PageInfo, Role } from '../lib/types';
import { AuditLog } from './AuditLog';
import { useApi } from '../lib/useApi';

type Tab = 'admins' | 'roles' | 'invites' | 'audit';

/** Super admin only: admins, roles and invitations. */
export default function Team() {
  const [s, set] = useSearchState({ tab: 'admins' });
  const roles = useApi<Role[]>('/admin/roles');
  const [roleDialog, setRoleDialog] = useState<Role | 'new' | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitesTick, setInvitesTick] = useState(0);
  // an unknown tab in the link opens the first one, never an empty page
  const tab: Tab = (['admins', 'roles', 'invites', 'audit'] as const).includes(s.tab as Tab) ? (s.tab as Tab) : 'admins';

  return (
    <>
      <PageHeader
        title="Team"
        description="Who can open the admin panel, and what each role sees."
        actions={
          tab === 'roles' ? (
            <button type="button" className="btn-primary" onClick={() => setRoleDialog('new')}>
              <Plus className="size-4" /> New role
            </button>
          ) : tab === 'invites' ? (
            <button type="button" className="btn-primary" onClick={() => setInviteOpen(true)}>
              <Plus className="size-4" /> Invite admin
            </button>
          ) : undefined
        }
      />
      <Tabs
        value={tab}
        onChange={(t) => set({ tab: t })}
        items={[
          { value: 'admins', label: 'Admins' },
          { value: 'roles', label: 'Roles' },
          { value: 'invites', label: 'Invites' },
          { value: 'audit', label: 'Audit log' },
        ]}
      />
      {tab === 'admins' && <Admins roles={roles.data ?? []} />}
      {tab === 'roles' && <Roles roles={roles} onEdit={setRoleDialog} />}
      {tab === 'invites' && <Invites key={invitesTick} />}
      {tab === 'audit' && <AuditLog />}

      <Dialog open={roleDialog !== null} onClose={() => setRoleDialog(null)} title={roleDialog === 'new' ? 'New role' : `Edit ${roleDialog?.name ?? ''}`}>
        {roleDialog !== null && (
          <RoleForm
            role={roleDialog === 'new' ? null : roleDialog}
            onSaved={() => {
              setRoleDialog(null);
              roles.reload();
            }}
          />
        )}
      </Dialog>
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite an admin">
        {inviteOpen && (
          <InviteForm
            roles={roles.data ?? []}
            onSent={() => {
              setInviteOpen(false);
              setInvitesTick((t) => t + 1);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function Admins({ roles }: { roles: Role[] }) {
  const { data, error, loading, reload } = useApi<AdminRow[]>('/admin/admins');
  const confirm = useConfirm();

  const patch = async (a: AdminRow, body: { active?: boolean; roleId?: string }, title: string, detail: string) => {
    if (!(await confirm({ title, body: detail, confirmLabel: 'Confirm', danger: body.active === false }))) return;
    try {
      await api(`/admin/admins/${a.id}`, { method: 'PATCH', body });
      toast.success('Saved');
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const reset2fa = async (a: AdminRow) => {
    if (!(await confirm({ title: `Reset 2FA for ${a.email}?`, body: 'Their sessions end and the next sign-in asks them to scan a new QR code.', confirmLabel: 'Reset 2FA', danger: true })))
      return;
    try {
      await api(`/admin/admins/${a.id}/reset-2fa`, { method: 'POST' });
      toast.success('2FA reset');
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Section>
      <ErrorNote error={error} onRetry={reload} />
      <DataTable
        rows={data}
        loading={loading}
        rowKey={(a) => a.id}
        empty="No admins yet. Invite one from the Invites tab."
        columns={[
          {
            key: 'email',
            header: 'Admin',
            render: (a) => (
              <span className="block min-w-0">
                <span className="block truncate font-medium">{a.email}</span>
                <span className="text-xs text-text-tertiary">Since {date(a.createdAt)}</span>
              </span>
            ),
          },
          {
            key: 'role',
            header: 'Role',
            render: (a) =>
              a.isSuper ? (
                <span className="chip-primary">Super admin</span>
              ) : (
                <select
                  className="input h-8 w-auto max-w-44"
                  aria-label={`Role of ${a.email}`}
                  value={a.role?.id ?? ''}
                  onChange={(e) => {
                    const r = roles.find((x) => x.id === e.target.value);
                    if (r) void patch(a, { roleId: r.id }, `Change ${a.email}'s role?`, `New role: ${r.name}. It applies at once.`);
                  }}
                >
                  {!a.role && <option value="">No role</option>}
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ),
          },
          {
            key: 'active',
            header: 'Active',
            render: (a) =>
              a.isSuper ? (
                <StatusChip tone="success">Active</StatusChip>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    role="switch"
                    className="peer sr-only"
                    checked={a.active}
                    onChange={() =>
                      void patch(
                        a,
                        { active: !a.active },
                        a.active ? `Deactivate ${a.email}?` : `Activate ${a.email}?`,
                        a.active ? 'They are signed out at once and cannot sign in.' : 'They can sign in (and set up 2FA on the first sign-in).',
                      )
                    }
                  />
                  <span className="relative h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
                  <span className={`text-xs font-semibold ${a.active ? 'text-success-ink' : 'text-text-tertiary'}`}>{a.active ? 'Active' : 'Inactive'}</span>
                </label>
              ),
          },
          {
            key: 'totp',
            header: '2FA',
            hideOnMobile: true,
            render: (a) => (a.totpEnabled ? <StatusChip tone="success">On</StatusChip> : <StatusChip tone="warning">Not set up</StatusChip>),
          },
          { key: 'last', header: 'Last sign-in', hideOnMobile: true, render: (a) => <span className="whitespace-nowrap">{dateTime(a.lastLoginAt)}</span> },
          {
            key: 'x',
            header: '',
            align: 'right',
            render: (a) =>
              !a.isSuper && (
                <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => void reset2fa(a)}>
                  Reset 2FA
                </button>
              ),
          },
        ]}
      />
    </Section>
  );
}

function Roles({ roles, onEdit }: { roles: ReturnType<typeof useApi<Role[]>>; onEdit: (r: Role) => void }) {
  const pages = useApi<PageInfo[]>('/admin/pages');
  const confirm = useConfirm();
  const label = (k: string) => pages.data?.find((p) => p.key === k)?.label ?? k;
  const remove = async (r: Role) => {
    if (!(await confirm({ title: `Delete ${r.name}?`, body: 'Only a role no admin uses can be deleted.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await api(`/admin/roles/${r.id}`, { method: 'DELETE' });
      toast.success('Deleted');
      roles.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Section>
      <ErrorNote error={roles.error} onRetry={roles.reload} />
      <DataTable
        rows={roles.data}
        loading={roles.loading}
        rowKey={(r) => r.id}
        empty="No roles yet. Create one with “New role”."
        columns={[
          { key: 'name', header: 'Role', render: (r) => <span className="font-medium">{r.name}</span> },
          {
            key: 'pages',
            header: 'Pages',
            render: (r) => (
              <span className="flex flex-wrap gap-1">
                {r.pages.length ? r.pages.map((p) => <span key={p} className="chip-neutral">{label(p)}</span>) : <span className="text-xs text-text-tertiary">None</span>}
              </span>
            ),
          },
          { key: 'count', header: 'Admins', align: 'right', render: (r) => num(r.adminCount) },
          {
            key: 'x',
            header: '',
            align: 'right',
            render: (r) => (
              <div className="flex justify-end gap-1">
                <button type="button" className="btn-ghost h-8 px-2" onClick={() => onEdit(r)} aria-label={`Edit ${r.name}`}>
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  className="btn-ghost h-8 px-2"
                  disabled={r.adminCount > 0}
                  title={r.adminCount > 0 ? 'Admins still use this role' : undefined}
                  onClick={() => void remove(r)}
                  aria-label={`Delete ${r.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ),
          },
        ]}
      />
    </Section>
  );
}

function RoleForm({ role, onSaved }: { role: Role | null; onSaved: () => void }) {
  const pages = useApi<PageInfo[]>('/admin/pages');
  const confirm = useConfirm();
  const [name, setName] = useState(role?.name ?? '');
  const [picked, setPicked] = useState<string[]>(role?.pages ?? []);
  const [busy, setBusy] = useState(false);
  // `admin` is super-admin only and never grantable
  const grantable = (pages.data ?? []).filter((p) => p.key !== 'admin');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { name: name.trim(), pages: picked.filter((p) => p !== 'admin') };
    if (!(await confirm({ title: role ? `Save ${body.name}?` : `Create ${body.name}?`, body: role?.adminCount ? `Applies at once to ${role.adminCount} admin(s).` : undefined, confirmLabel: 'Save' })))
      return;
    setBusy(true);
    try {
      if (role) await api(`/admin/roles/${role.id}`, { method: 'PATCH', body });
      else await api('/admin/roles', { body });
      toast.success('Saved');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label>
        <span className="label">Name</span>
        <input className="input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Support" />
      </label>
      <fieldset>
        <legend className="label">Pages this role can open</legend>
        {pages.loading && !pages.data ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {grantable.map((p) => (
              <label key={p.key} className="flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={picked.includes(p.key)}
                  onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p.key] : x.filter((k) => k !== p.key)))}
                />
                {p.label}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="flex justify-end pt-1">
        <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
          {busy && <Spinner className="text-white" />} Save
        </button>
      </div>
    </form>
  );
}

const INVITE_TONE = { pending: 'warning', used: 'success', expired: 'neutral' } as const;

function Invites() {
  const { data, error, loading, reload } = useApi<Invite[]>('/admin/invites');
  const confirm = useConfirm();
  const act = async (i: Invite, kind: 'resend' | 'revoke') => {
    const ok = await confirm(
      kind === 'resend'
        ? { title: `Resend to ${i.email}?`, body: 'A new link is emailed; it works for 3 hours. The old link stops working.', confirmLabel: 'Resend' }
        : { title: `Revoke the invite for ${i.email}?`, body: 'The link stops working.', confirmLabel: 'Revoke', danger: true },
    );
    if (!ok) return;
    try {
      if (kind === 'resend') await api(`/admin/invites/${i.id}/resend`, { method: 'POST' });
      else await api(`/admin/invites/${i.id}`, { method: 'DELETE' });
      toast.success(kind === 'resend' ? 'Sent' : 'Revoked');
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Section>
      <ErrorNote error={error} onRetry={reload} />
      <DataTable
        rows={data}
        loading={loading}
        rowKey={(i) => i.id}
        empty="No invitations yet. Use “Invite admin”."
        columns={[
          { key: 'email', header: 'Email', render: (i) => <span className="font-medium break-all">{i.email}</span> },
          { key: 'role', header: 'Role', hideOnMobile: true, render: (i) => i.role?.name ?? '—' },
          { key: 'status', header: 'Status', render: (i) => <StatusChip tone={INVITE_TONE[i.status]}>{i.status}</StatusChip> },
          { key: 'exp', header: 'Expires', hideOnMobile: true, render: (i) => <span className="whitespace-nowrap">{dateTime(i.expiresAt)}</span> },
          { key: 'sent', header: 'Sent', hideOnMobile: true, render: (i) => date(i.createdAt) },
          {
            key: 'x',
            header: '',
            align: 'right',
            render: (i) =>
              i.status !== 'used' && (
                <div className="flex justify-end gap-1">
                  <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => void act(i, 'resend')}>
                    Resend
                  </button>
                  <button type="button" className="btn-ghost h-8 px-2 text-xs text-destructive" onClick={() => void act(i, 'revoke')}>
                    Revoke
                  </button>
                </div>
              ),
          },
        ]}
      />
    </Section>
  );
}

function InviteForm({ roles, onSent }: { roles: Role[]; onSent: () => void }) {
  const confirm = useConfirm();
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const role = roles.find((r) => r.id === roleId);
    if (!(await confirm({ title: `Invite ${email}?`, body: `Role: ${role?.name}. They get an email with a sign-up link valid for 3 hours.`, confirmLabel: 'Send invite' })))
      return;
    setBusy(true);
    try {
      await api('/admin/invites', { body: { email: email.trim(), roleId } });
      toast.success('Invitation sent');
      onSent();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label>
        <span className="label">Email</span>
        <input className="input" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        <span className="label">Role</span>
        <select className="input" required value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">Choose a role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {!roles.length && <span className="mt-1 block text-xs text-text-tertiary">Create a role first (Roles tab).</span>}
      </label>
      <div className="flex justify-end pt-1">
        <button type="submit" className="btn-primary" disabled={busy || !roleId}>
          {busy && <Spinner className="text-white" />} Send invite
        </button>
      </div>
    </form>
  );
}
