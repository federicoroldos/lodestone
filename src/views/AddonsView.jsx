import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ListSkeleton } from '@/components/shared/Skeletons';
import { useApi } from '@/hooks/useApi';
import { useServer } from '@/context/ServerContext';
import { useT, useI18n } from '@/context/I18nContext';
import { serverAddonKind } from '@/lib/compat';
import { fmtBytes } from '@/lib/utils';
import { toast } from 'sonner';
import { RefreshCw, Trash2, Upload } from 'lucide-react';

const HINT_EM = {
  en: 'restart the server',
  es: 'reinicia el servidor',
};

export function AddonsView() {
  const api = useApi();
  const t = useT();
  const { lang } = useI18n();
  const { servers, activeServerId } = useServer();
  const [kind, setKind] = useState(null);
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const activeServer = useMemo(
    () => servers.find(s => s.id === activeServerId) || null,
    [servers, activeServerId]
  );
  // Start on whichever folder this server actually loads from, but leave the
  // other tab reachable: a folder can hold leftovers after a loader change.
  const defaultKind = serverAddonKind(activeServer);
  const currentKind = kind || defaultKind;

  useEffect(() => { setKind(null); }, [activeServerId]);

  async function load(k = currentKind) {
    setLoading(true);
    setError('');
    try {
      const { addons: list } = await api(`/api/addons?kind=${k}`);
      setAddons(list);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { load(currentKind); }, [currentKind, activeServerId]);

  async function deleteAddon(name) {
    try {
      await api(`/api/addons/${encodeURIComponent(name)}?kind=${currentKind}`, { method: 'DELETE' });
      toast.success(t('addons.deletedToast'));
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('addon', file);
    try {
      await api(`/api/addons/upload?kind=${currentKind}`, { method: 'POST', body: fd });
      toast.success(t('addons.uploadedToast'));
      load();
    } catch (e) { toast.error(e.message); }
    e.target.value = '';
  }

  const isMods = currentKind === 'mods';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('addons.title')}</CardTitle>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium border border-border bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors">
            <Upload className="h-3 w-3" />
            {t('addons.uploadJar')}
            <input type="file" accept=".jar" hidden onChange={upload} />
          </label>
          <Button variant="glass" size="xs" onClick={() => load()}><RefreshCw className="h-3 w-3" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={currentKind} onValueChange={setKind}>
          <TabsList>
            <TabsTrigger value="plugins">{t('addons.tabPlugins')}</TabsTrigger>
            <TabsTrigger value="mods">{t('addons.tabMods')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground mt-4 mb-4">{(() => {
          const h = t('addons.hint', { folder: currentKind });
          const tag = HINT_EM[lang] || HINT_EM.en;
          const i = h.toLowerCase().indexOf(tag);
          if (i < 0) return h;
          return <>{h.slice(0, i)}<strong className="text-foreground">{h.slice(i, i + tag.length)}</strong>{h.slice(i + tag.length)}</>;
        })()}</p>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorState error={error} onRetry={() => load()} />
        ) : addons.length === 0 ? (
          <EmptyState message={isMods ? t('addons.emptyMods') : t('addons.emptyPlugins')} />
        ) : (
          <div className="space-y-1.5">
            {addons.map(a => (
              <div key={a.name} className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2.5 hover:bg-secondary/40 transition-colors">
                <span className="flex-1 text-sm font-medium text-foreground">{a.name}</span>
                <span className="text-xs text-muted-foreground">{fmtBytes(a.size)}</span>
                <Button variant="ghost" size="icon-xs" onClick={() => setPendingDelete(a.name)}>
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
        title={isMods ? t('addons.deleteTitleMod') : t('addons.deleteTitlePlugin')}
        description={pendingDelete ? t('addons.deleteBody', { name: pendingDelete }) : ''}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => deleteAddon(pendingDelete)}
      />
    </Card>
  );
}
