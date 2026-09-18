import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import {
  getStoredUser,
  getToken,
  clearSession,
  login as apiLogin,
  postLoginPath,
  canToggleSite,
  canToggleMdo,
  isSiteEngineer,
  isProcessController,
  isHr,
  syncSiteUser,
  api,
  setSession,
} from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getToken());

  // api() clears localStorage on 401 — keep React auth state in sync
  useEffect(() => {
    const onCleared = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('tf:session-cleared', onCleared);
    return () => window.removeEventListener('tf:session-cleared', onCleared);
  }, []);

  // Site portal mostly talks to Supabase directly, so JWT never slid-refreshes.
  // Ping /auth/me on an interval so X-New-Token keeps the session alive.
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    const beat = async () => {
      try {
        const me = await api('/auth/me');
        if (cancelled || !me?.id) return;
        const t = getToken();
        if (t) setSession(t, me);
        setUser(me);
        setToken(t || getToken());
      } catch {
        /* soft — do not force logout here; api() already handles hard JWT fails */
      }
    };
    beat();
    const id = setInterval(beat, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  const login = useCallback(async (username, password) => {
    const u = await apiLogin(username, password);
    setUser(u);
    setToken(getToken());
    return { user: u, path: postLoginPath(u) };
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
  }, []);

  const refreshUser = useCallback((next) => {
    localStorage.setItem('tf_user', JSON.stringify(next));
    syncSiteUser(next);
    setUser(next);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      login,
      logout,
      refreshUser,
      canToggleSite: canToggleSite(user),
      canToggleMdo: canToggleMdo(user),
      isSiteEngineer: isSiteEngineer(user),
      isProcessController: isProcessController(user),
      isHr: isHr(user),
    }),
    [user, token, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
