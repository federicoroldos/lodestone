import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { fmtBytes } from '@/lib/utils';
import { toast } from 'sonner';
import { Download, Trash2, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function BackupsView() {
  const api = useApi();
  const t = useT();
  const { token } = useAuth();
  const [backups, setBackups] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function load() {
    try {
      const { backups: b } = await api('/api/backups');
      setBackups(b);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function backupNow() {
    setLoading(true);
    setStatus(t('backups.creatingStatus'));
    try {
      const r = await api('/api/backups', { method: 'POST' });
      setStatus(t('backups.doneStatus', { name: r.name, size: fmtBytes(r.size) }));
      toast.success(t('backups.createdToast'));
      load();
    } catch (e) {
      setStatus('');
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteBackup(name) {
    try {
      await api(`/api/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
      toast.success(t('backups.deletedToast'));
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('backups.title')}</CardTitle>
          <Button variant="default" size="sm" onClick={backupNow} disabled={loading}>
            <Plus className="h-3.5 w-3.5" />
            {loading ? t('backups.creating') : t('backups.backupNow')}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">{(() => {
            const h = t('backups.hint');
            const tag = 'save-off/save-all';
            const i = h.indexOf(tag);
            if (i < 0) return h;
            return <>{h.slice(0, i)}<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{tag}</code>{h.slice(i + tag.length)}</>;
          })()}</p>
          {status && <p className="text-xs text-primary mb-3">{status}</p>}
          {backups.length === 0 ? (
            <EmptyState message={t('backups.empty')} />
          ) : (
            <div className="space-y-1.5">
              {backups.map(b => (
                <div key={b.name} className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2.5 hover:bg-secondary/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{fmtBytes(b.size)} · {new Date(b.mtime).toLocaleString()}</div>
                  </div>
                  <Button variant="glass" size="xs" asChild>
                    <a href={`/api/backups/${encodeURIComponent(b.name)}/download?token=${encodeURIComponent(token)}`} download>
                      <Download className="h-3 w-3" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon-xs"
                    onClick={() => setPendingDelete(b.name)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={t('backups.deleteTitle')}
        description={pendingDelete ? t('backups.deleteBody', { name: pendingDelete, cannotUndo: t('common.cannotUndo') }) : ''}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => { deleteBackup(pendingDelete); setPendingDelete(null); }}
      />
    </>
  );
}
