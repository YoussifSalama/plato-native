import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, User } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { canSee, NAV } from '../lib/nav';
import type { Paged, UserRow } from '../lib/types';

type Hit = { key: string; label: string; hint?: string; to: string; icon: 'page' | 'user'; Icon?: typeof Search };

// Extra places worth jumping to, besides the sidebar.
const PLACES: { label: string; to: string; page: string }[] = [
  { label: 'Searches (cost per search)', to: '/usage/searches', page: 'usage' },
  { label: 'Extension errors', to: '/logs/extension', page: 'logs' },
  { label: 'Audit log', to: '/team?tab=audit', page: 'admin' },
  { label: 'Invite an admin', to: '/team?tab=invites', page: 'admin' },
  { label: 'Rate limits', to: '/users/rate-limits', page: 'admin' },
];

/**
 * Ctrl+K (⌘K) from anywhere: type a seeker's email or name, or a page, and go. Arrow keys move,
 * Enter opens, Esc closes. Seekers are searched only for roles that can open Users.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth();
  const nav = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [i, setI] = useState(0);
  const canUsers = canSee(me?.pages, me?.isSuper, 'users');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQ('');
      setUsers([]);
      setI(0);
      setTimeout(() => input.current?.focus(), 0);
    }
    if (!open && d.open) d.close();
  }, [open]);

  // seekers by email or name, a moment after typing stops
  useEffect(() => {
    const term = q.trim();
    if (!open || !canUsers || term.length < 2) {
      setUsers([]);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      api<Paged<UserRow>>('/admin/users', { query: { q: term }, signal: ctrl.signal })
        .then((r) => setUsers(r.items.slice(0, 6)))
        .catch(() => undefined);
    }, 200);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open, canUsers]);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    const pages = [
      ...NAV.filter((n) => canSee(me?.pages, me?.isSuper, n.page)).map((n) => ({ label: n.label, to: n.to })),
      ...PLACES.filter((p) => canSee(me?.pages, me?.isSuper, p.page)),
    ]
      .filter((p) => !term || p.label.toLowerCase().includes(term))
      .map((p) => ({ key: `p:${p.to}`, label: p.label, to: p.to, icon: 'page' as const }));
    const people = users.map((u) => ({ key: `u:${u.id}`, label: u.email, hint: [u.name, u.plan, u.blocked ? 'blocked' : null].filter(Boolean).join(' · '), to: `/users/${u.id}`, icon: 'user' as const }));
    return [...people, ...pages].slice(0, 12);
  }, [q, users, me]);

  useEffect(() => setI(0), [q, users.length]);

  const go = (h?: Hit) => {
    if (!h) return;
    onClose();
    nav(h.to);
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Search the admin panel"
      className="m-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-border bg-card p-0 text-foreground shadow-float"
    >
      {open && (
        <div>
          <div className="flex items-center gap-3 border-b border-divider px-4">
            <Search className="size-4 text-text-tertiary" />
            <input
              ref={input}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder={canUsers ? 'Search a seeker by email or name, or a page…' : 'Go to a page…'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') (e.preventDefault(), setI((x) => Math.min(hits.length - 1, x + 1)));
                if (e.key === 'ArrowUp') (e.preventDefault(), setI((x) => Math.max(0, x - 1)));
                if (e.key === 'Enter') (e.preventDefault(), go(hits[i]));
              }}
              aria-activedescendant={hits[i] ? `cmd-${hits[i].key}` : undefined}
              aria-controls="cmd-list"
              role="combobox"
              aria-expanded
            />
            <kbd className="rounded border border-border px-1.5 text-[11px] text-text-tertiary">Esc</kbd>
          </div>
          <ul id="cmd-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
            {hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-text-tertiary">{q.trim().length < 2 ? 'Type to search.' : 'Nothing matches.'}</li>}
            {hits.map((h, n) => (
              <li
                key={h.key}
                id={`cmd-${h.key}`}
                role="option"
                aria-selected={n === i}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${n === i ? 'bg-primary-soft text-primary' : 'hover:bg-muted'}`}
                onMouseEnter={() => setI(n)}
                onClick={() => go(h)}
              >
                {h.icon === 'user' ? <User className="size-4 shrink-0" /> : <Search className="size-4 shrink-0 opacity-50" />}
                <span className="min-w-0 flex-1 truncate">{h.label}</span>
                {h.hint && <span className="shrink-0 text-xs text-text-tertiary">{h.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </dialog>
  );
}
