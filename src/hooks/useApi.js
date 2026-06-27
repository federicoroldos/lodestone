import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

export function useApi() {
  const { token, logout } = useAuth();
  const { t } = useI18n();

  const api = useCallback(async (path, opts = {}) => {
    const headers = { ...opts.headers, Authorization: `Bearer ${token}` };
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts = { ...opts, body: JSON.stringify(opts.body) };
    }
    const r = await fetch(path, { ...opts, headers });
    if (r.status === 401 && !opts.silent) {
      logout();
      throw new Error(t('common.sessionExpired'));
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || t('common.httpError', { status: r.status }));
    return data;
  }, [token, logout, t]);

  return api;
}
