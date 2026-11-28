// Admin panel permission keys. A role grants some of GRANTABLE_PAGES;
// "admin" (admins, roles, invites) is the super admin's alone and never grantable.
export const GRANTABLE_PAGES = [
  'dashboard',
  'usage',
  'plans',
  'credits',
  'users',
  'logs',
] as const;

export const ADMIN_PAGES = [...GRANTABLE_PAGES, 'admin'] as const;

export type GrantablePageKey = (typeof GRANTABLE_PAGES)[number];
export type AdminPageKey = (typeof ADMIN_PAGES)[number];

export const PAGE_LABELS: Record<AdminPageKey, string> = {
  dashboard: 'Dashboard',
  usage: 'Usage',
  plans: 'Plans',
  credits: 'Credits',
  users: 'Users',
  logs: 'Logs',
  admin: 'Admins',
};

const grantable = new Set<string>(GRANTABLE_PAGES);

/** What an admin may open: everything for the super admin, else the role's grantable pages. */
export function pagesFor(admin: {
  is_super: boolean;
  role?: { pages: string[] } | null;
}): string[] {
  if (admin.is_super) return [...ADMIN_PAGES];
  const own = new Set(admin.role?.pages ?? []);
  return GRANTABLE_PAGES.filter((p) => own.has(p) && grantable.has(p));
}
