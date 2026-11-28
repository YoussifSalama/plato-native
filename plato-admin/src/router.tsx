import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { Forbidden, NotFound, RequirePage, Shell } from './components/Shell';
import { Loading } from './components/ui';
import { useAuth } from './lib/auth';
import { canSee, NAV } from './lib/nav';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import Recover from './pages/auth/Recover';

// Signed-in pages load on demand (recharts only ships with the pages that chart).
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UsageLayout = lazy(() => import('./pages/usage/UsageLayout'));
const UsageOverview = lazy(() => import('./pages/usage/UsageOverview'));
const UsageProvider = lazy(() => import('./pages/usage/UsageProvider'));
const UsageUsers = lazy(() => import('./pages/usage/UsageUsers'));
const Plans = lazy(() => import('./pages/Plans'));
const Credits = lazy(() => import('./pages/Credits'));
const UsersList = lazy(() => import('./pages/users/UsersList'));
const UserDetail = lazy(() => import('./pages/users/UserDetail'));
const RateLimits = lazy(() => import('./pages/users/RateLimits'));
const LogsLayout = lazy(() => import('./pages/logs/LogsLayout'));
const PlatformLogs = lazy(() => import('./pages/logs/PlatformLogs'));
const ExtensionLogs = lazy(() => import('./pages/logs/ExtensionLogs'));
const ExtensionUserLogs = lazy(() => import('./pages/logs/ExtensionUserLogs'));
const Team = lazy(() => import('./pages/Team'));

const s = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

/** `/`: the dashboard, or the first page this role has when it lacks the dashboard. */
function Home() {
  const { me } = useAuth();
  if (canSee(me?.pages, me?.isSuper, 'dashboard')) return s(<Dashboard />);
  const first = NAV.find((n) => canSee(me?.pages, me?.isSuper, n.page));
  return first ? <Navigate to={first.to} replace /> : <Forbidden />;
}

// SPA routes never start with /admin: that prefix is the API (proxied in dev).
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  { path: '/recover', element: <Recover /> },
  {
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      {
        element: <RequirePage page="usage" />,
        children: [
          {
            path: 'usage',
            element: s(<UsageLayout />),
            children: [
              { index: true, element: s(<UsageOverview />) },
              { path: 'users', element: s(<UsageUsers />) },
              { path: ':provider', element: s(<UsageProvider />) },
            ],
          },
        ],
      },
      { element: <RequirePage page="plans" />, children: [{ path: 'plans', element: s(<Plans />) }] },
      { element: <RequirePage page="credits" />, children: [{ path: 'credits', element: s(<Credits />) }] },
      {
        element: <RequirePage page="users" />,
        children: [
          { path: 'users', element: s(<UsersList />) },
          { path: 'users/rate-limits', element: s(<RateLimits />) },
          { path: 'users/:id', element: s(<UserDetail />) },
        ],
      },
      {
        element: <RequirePage page="logs" />,
        children: [
          {
            path: 'logs',
            element: s(<LogsLayout />),
            children: [
              { index: true, element: s(<PlatformLogs />) },
              { path: 'extension', element: s(<ExtensionLogs />) },
              { path: 'extension/:userId', element: s(<ExtensionUserLogs />) },
            ],
          },
        ],
      },
      { element: <RequirePage page="admin" />, children: [{ path: 'team', element: s(<Team />) }] },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
