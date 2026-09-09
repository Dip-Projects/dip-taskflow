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
