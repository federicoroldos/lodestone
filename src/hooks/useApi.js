import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

export function useApi() {
  const { token, logout } = useAuth();

  const api = useCallback(async (path, opts = {}) => {
    const headers = { ...opts.headers, Authorization: `Bearer ${token}` };
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts = { ...opts, body: JSON.stringify(opts.body) };
    }
    const r = await fetch(path, { ...opts, headers });
    if (r.status === 401 && !opts.silent) {
      logout();
      throw new Error('Session expired');
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  }, [token, logout]);

  return api;
}
