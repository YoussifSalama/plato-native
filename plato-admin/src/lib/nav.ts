import { BarChart3, CreditCard, FileWarning, LayoutDashboard, Shield, Tags, Users, type LucideIcon } from 'lucide-react';

export type NavItem = { to: string; label: string; page: string; icon: LucideIcon };

/** Sidebar order. `page` is the permission key from API_CONTRACT.md. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', page: 'dashboard', icon: LayoutDashboard },
  { to: '/usage', label: 'Usage & cost', page: 'usage', icon: BarChart3 },
  { to: '/plans', label: 'Plans', page: 'plans', icon: Tags },
  { to: '/credits', label: 'Credits', page: 'credits', icon: CreditCard },
  { to: '/users', label: 'Users', page: 'users', icon: Users },
  { to: '/logs', label: 'Logs', page: 'logs', icon: FileWarning },
  { to: '/team', label: 'Team', page: 'admin', icon: Shield },
];

export const canSee = (pages: string[] | undefined, isSuper: boolean | undefined, page: string) =>
  page === 'admin' ? !!isSuper && !!pages?.includes('admin') : !!isSuper || !!pages?.includes(page);
