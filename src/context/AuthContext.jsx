import { createContext, useContext, useState, useCallback } from 'react';
import { isJwtExpired } from '@/lib/utils';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('lodestone_token') || '');
  const [user, setUser] = useState(null);

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem('lodestone_token', newToken);
    setToken(newToken);
    setUser(newUser || null);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('lodestone_token');
    setToken('');
    setUser(null);
  }, []);

  const isLoggedIn = !!token && !isJwtExpired(token);
  const hasCapability = useCallback((capability, serverId = null) => {
    if (user?.role === 'admin' || user?.permissions?.admin) return true;
    return !!user?.permissions?.grants?.some((grant) => grant.capability === capability && (grant.serverId || null) === (serverId || null));
  }, [user]);

  return (
    <AuthContext.Provider value={{ token, user, setUser, login, logout, isLoggedIn, hasCapability }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
