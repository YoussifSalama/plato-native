import { toast } from 'sonner';
import { ApiError, GENERIC_AUTH_ERROR } from '../../lib/api';

/**
 * Auth failures: the owner's rule is one message for every 401, never a more specific one.
 * 403 INACTIVE (and rate limits / network) show the backend's own words.
 */
export function authError(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 401) return toast.error(GENERIC_AUTH_ERROR);
    if (e.status === 403 && e.code === 'INACTIVE') return toast.error(e.message);
    if (e.status === 0 || e.status === 429) return toast.error(e.message);
  }
  toast.error(GENERIC_AUTH_ERROR);
}
