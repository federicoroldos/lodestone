import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { fmtBytes } from '@/lib/utils';
import { toast } from 'sonner';
import { Download, Trash2, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

function RetentionCard({ onSaved }) {
  const api = useApi();
  const t = useT();
  const [form, setForm] = useState({ maxCount: 10, maxSizeMB: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api('/api/config');
        if (cancelled) return;
        setForm({
          maxCount: Number(cfg?.backups?.maxCount ?? cfg?.backups?.retainCount ?? 10) || 0,
          maxSizeMB: Number(cfg?.backups?.maxSizeMB ?? 0) || 0,
        });
      } catch (_) { /* ignore — defaults stay in place */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const f = (k) => (e) => {
    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
    setForm((p) => ({ ...p, [k]: n }));
  };

  async function save() {
    setLoading(true);
    try {
      await api('/api/config/backups', { method: 'PUT', body: form });
      toast.success(t('backups.savedToast'));
      onSaved?.();
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('backups.retentionTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">{t('backups.retentionHint')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{t('backups.maxCount')}</Label>
            <Input type="number" min="0" step="1" value={form.maxCount} onChange={f('maxCount')} />
            <p className="text-[11px] text-muted-foreground/80">{t('backups.maxCountHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('backups.maxSizeMB')}</Label>
            <Input type="number" min="0" step="1" value={form.maxSizeMB} onChange={f('maxSizeMB')} />
            <p className="text-[11px] text-muted-foreground/80">{t('backups.maxSizeMBHint')}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="default" size="sm" onClick={save} disabled={loading}>
            {loading ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
    <div className="space-y-5">
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
      <RetentionCard onSaved={load} />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={t('backups.deleteTitle')}
        description={pendingDelete ? t('backups.deleteBody', { name: pendingDelete, cannotUndo: t('common.cannotUndo') }) : ''}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => { deleteBackup(pendingDelete); setPendingDelete(null); }}
      />
    </div>
  );
}
