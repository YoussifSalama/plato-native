import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import type { Me } from './types';

type AuthState = {
  me: Me | null;
  /** true until the first /admin/auth/me answers */
  loading: boolean;
  /** a non-401 failure of /me (server down): shown instead of bouncing to /login */
  error: ApiError | null;
  setMe: (me: Me | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/admin/auth/me'));
      setError(null);
    } catch (e) {
      setMe(null);
      setError(e instanceof ApiError && e.status !== 401 ? e : null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await api('/admin/auth/logout', { method: 'POST' }).catch(() => undefined);
    setMe(null);
  }, []);

  useEffect(() => {
    void refresh();
    // any admin call answering 401 (session expired, admin deactivated) drops the session
    const drop = () => setMe(null);
    window.addEventListener('admin:unauthorized', drop);
    return () => window.removeEventListener('admin:unauthorized', drop);
  }, [refresh]);

  return <Ctx.Provider value={{ me, loading, error, setMe, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
