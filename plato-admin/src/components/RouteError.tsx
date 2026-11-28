import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { RefreshCw } from 'lucide-react';

const RELOADED = 'plato-admin:reloaded-for-deploy';

/** A page whose code is gone: the panel was deployed while this tab was open. */
export const isStaleBuild = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch module|ChunkLoadError/i.test(
    String((e as Error)?.message ?? e),
  );

/**
 * One reload per deploy: the new build has the page. A second failure in the same minute shows the
 * error instead of reloading in a loop.
 */
export function reloadForDeploy(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED, String(Date.now()));
  } catch {
    // no storage: reload once anyway
  }
  window.location.reload();
  return true;
}

/** Shown in place of a page that failed to render, inside the shell (the sidebar stays). */
export function RouteError() {
  const error = useRouteError();
  if (isStaleBuild(error) && reloadForDeploy()) return null;
  const status = isRouteErrorResponse(error) ? error.status : null;
  if (status === 404) return <NotFoundState />;
  // eslint-disable-next-line no-console
  console.error(error);
  return (
    <div className="fade-in flex flex-col items-center py-20 text-center">
      <p className="text-5xl font-extrabold text-primary">Oops</p>
      <h1 className="mt-3 text-lg font-bold">This page hit an error</h1>
      <p className="mt-1 max-w-md text-sm text-text-secondary">Nothing was changed. Reload to try again; if it keeps happening, the error is in Logs.</p>
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          <RefreshCw className="size-4" /> Reload
        </button>
        <Link to="/" className="btn-outline">
          Dashboard
        </Link>
      </div>
    </div>
  );
}

/** A link to something that does not exist (a deleted user, a wrong id): say so, and the way back. */
export function NotFoundState({
  title = 'Page not found',
  body = 'The link is wrong or what it pointed to no longer exists.',
  back = { to: '/', label: 'Back to the start' },
}: {
  title?: string;
  body?: string;
  back?: { to: string; label: string };
}) {
  useEffect(() => {
    document.title = `${title} · Plato Admin`;
  }, [title]);
  return (
    <div className="fade-in flex flex-col items-center py-20 text-center">
      <p className="text-5xl font-extrabold text-primary">404</p>
      <h1 className="mt-3 text-lg font-bold">{title}</h1>
      <p className="mt-1 max-w-md text-sm text-text-secondary">{body}</p>
      <Link to={back.to} className="btn-primary mt-5">
        {back.label}
      </Link>
    </div>
  );
}
