import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthUser } from '../types';
import { logoutUser, refreshSession, setAccessToken, setSessionEndedHandler } from '../api/client';

type Status = 'loading' | 'authenticated' | 'anonymous';

type AuthState = {
  user: AuthUser | null;
  status: Status;
  /** Set when the session ended unexpectedly (expired / revoked), shown on the sign-in page. */
  notice: string | null;
  login: (user: AuthUser, token: string) => void;
  logout: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

/** Only non-secret profile data is cached, so the UI can render instantly while the session is restored. */
const PROFILE_KEY = 'resumefit-profile';

const readCachedUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

const cacheUser = (user: AuthUser | null) => {
  try {
    if (user) localStorage.setItem(PROFILE_KEY, JSON.stringify(user));
    else localStorage.removeItem(PROFILE_KEY);
    // Remove the pre-hardening storage format that kept the token in localStorage.
    localStorage.removeItem('resumefit-auth');
  } catch {
    /* storage unavailable: nothing to cache */
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(readCachedUser);
  const [status, setStatus] = useState<Status>('loading');
  const [notice, setNotice] = useState<string | null>(null);

  const endSession = useCallback((reason: 'expired' | 'logout') => {
    setAccessToken(null);
    setUser(null);
    cacheUser(null);
    setStatus('anonymous');
    setNotice(reason === 'expired' ? 'Your session expired. Please sign in again.' : null);
  }, []);

  // Restore the session from the httpOnly refresh cookie on load.
  useEffect(() => {
    setSessionEndedHandler(endSession);
    let cancelled = false;
    refreshSession().then((session) => {
      if (cancelled) return;
      if (session) {
        setUser(session.user);
        cacheUser(session.user);
        setStatus('authenticated');
      } else {
        setAccessToken(null);
        setUser(null);
        cacheUser(null);
        setStatus('anonymous');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [endSession]);

  const login = useCallback((nextUser: AuthUser, token: string) => {
    setAccessToken(token);
    setUser(nextUser);
    cacheUser(nextUser);
    setNotice(null);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
    endSession('logout');
  }, [endSession]);

  const updateUser = useCallback((next: AuthUser) => {
    setUser(next);
    cacheUser(next);
  }, []);

  const value = useMemo<AuthState>(() => ({ user: status === 'anonymous' ? null : user, status, notice, login, logout, updateUser }), [user, status, notice, login, logout, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
};
