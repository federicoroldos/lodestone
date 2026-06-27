import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useApi } from '@/hooks/useApi';
import { useT, useI18n } from '@/context/I18nContext';
import { fmtBytes } from '@/lib/utils';
import { toast } from 'sonner';
import { RefreshCw, Trash2, Upload } from 'lucide-react';

const HINT_EM = {
  en: 'restart the server',
  es: 'reinicia el servidor',
};

export function PluginsView() {
  const api = useApi();
  const t = useT();
  const { lang } = useI18n();
  const [plugins, setPlugins] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function load() {
    try {
      const { plugins: p } = await api('/api/plugins');
      setPlugins(p);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function deletePlugin(name) {
    try {
      await api(`/api/plugins/${encodeURIComponent(name)}`, { method: 'DELETE' });
      toast.success(t('plugins.deletedToast'));
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('plugin', file);
    try {
      await api('/api/plugins/upload', { method: 'POST', body: fd });
      toast.success(t('plugins.uploadedToast'));
      load();
    } catch (e) { toast.error(e.message); }
    e.target.value = '';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('plugins.title')}</CardTitle>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium border border-border bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors">
            <Upload className="h-3 w-3" />
            {t('plugins.uploadJar')}
            <input type="file" accept=".jar" hidden onChange={upload} />
          </label>
          <Button variant="glass" size="xs" onClick={load}><RefreshCw className="h-3 w-3" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">{(() => {
          const h = t('plugins.hint');
          const tag = HINT_EM[lang] || HINT_EM.en;
          const i = h.toLowerCase().indexOf(tag);
          if (i < 0) return h;
          return <>{h.slice(0, i)}<strong className="text-foreground">{h.slice(i, i + tag.length)}</strong>{h.slice(i + tag.length)}</>;
        })()}</p>
        {plugins.length === 0 ? (
          <EmptyState message={t('plugins.empty')} />
        ) : (
          <div className="space-y-1.5">
            {plugins.map(p => (
              <div key={p.name} className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2.5 hover:bg-secondary/40 transition-colors">
                <span className="flex-1 text-sm font-medium text-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground">{fmtBytes(p.size)}</span>
                <Button variant="ghost" size="icon-xs" onClick={() => setPendingDelete(p.name)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={t('plugins.deleteTitle')}
        description={pendingDelete ? t('plugins.deleteBody', { name: pendingDelete }) : ''}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => deletePlugin(pendingDelete)}
      />
    </Card>
  );
}
