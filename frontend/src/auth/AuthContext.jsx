import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import {
  getStoredUser,
  getToken,
  clearSession,
  login as apiLogin,
  postLoginPath,
  canToggleSite,
  isSiteEngineer,
  syncSiteUser,
} from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getToken());

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
      isSiteEngineer: isSiteEngineer(user),
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
