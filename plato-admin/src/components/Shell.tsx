import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { canSee, NAV } from '../lib/nav';
import { Loading } from './ui';

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-1.5">
      <img src="/logo.png" alt="" className="size-9 rounded-xl bg-white shadow-card ring-1 ring-primary-line/70" />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-extrabold tracking-[0.22em] text-primary">PLATO</span>
        <span className="mt-1 text-[9.5px] font-bold tracking-[0.3em] text-text-secondary">ADMIN</span>
      </span>
    </Link>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { me } = useAuth();
  const items = NAV.filter((n) => canSee(me?.pages, me?.isSuper, n.page));
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
              isActive ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-muted hover:text-foreground'
            }`
          }
        >
          <n.icon className="size-4.5 shrink-0" strokeWidth={1.9} />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Signed-in layout: sidebar (a drawer below lg), top bar, page. Bounces to /login without a session. */
export function Shell() {
  const { me, loading, error, logout, refresh } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setDrawer(false), [pathname]);

  if (loading) return <Loading />;
  if (error)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-text-secondary">{error.message}</p>
        <button type="button" className="btn-primary" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  if (!me) return <Navigate to="/login" replace state={{ from: pathname }} />;

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[248px_1fr]">
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:p-3">
        <div className="flex w-full flex-col gap-5 rounded-[22px] border border-border bg-card px-3 py-4 shadow-card">
          <Brand />
          <SideNav />
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-foreground/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-5 bg-card px-3 py-4 shadow-float">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" className="btn-ghost px-2" onClick={() => setDrawer(false)} aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <SideNav onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:border-0 lg:px-8">
          <button type="button" className="btn-ghost -ml-2 px-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <div className="min-w-0 text-right leading-tight">
              <p className="truncate text-sm font-semibold">{me.email}</p>
              <p className="truncate text-xs text-text-tertiary">{me.isSuper ? 'Super admin' : (me.role?.name ?? 'No role')}</p>
            </div>
            <button type="button" className="btn-outline px-2.5" onClick={() => void logout()} aria-label="Log out" title="Log out">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Route guard for one page key: 403 screen when the role doesn't have it. */
export function RequirePage({ page }: { page: string }) {
  const { me } = useAuth();
  if (!canSee(me?.pages, me?.isSuper, page)) return <Forbidden />;
  return <Outlet />;
}

export function Forbidden() {
  const { me } = useAuth();
  const first = NAV.find((n) => canSee(me?.pages, me?.isSuper, n.page));
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <p className="text-5xl font-extrabold text-primary">403</p>
      <h1 className="mt-3 text-lg font-bold">You don't have access to this page</h1>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">Your role doesn't include it. Ask the super admin if you need it.</p>
      {first && (
        <Link to={first.to} className="btn-primary mt-5">
          Go to {first.label}
        </Link>
      )}
    </div>
  );
}

export function NotFound() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <p className="text-5xl font-extrabold text-primary">404</p>
      <h1 className="mt-3 text-lg font-bold">Page not found</h1>
      <Link to="/" className="btn-primary mt-5">
        Back to the start
      </Link>
    </div>
  );
}
