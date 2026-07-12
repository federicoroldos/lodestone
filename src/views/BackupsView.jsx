import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ListSkeleton } from '@/components/shared/Skeletons';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { fmtBytes } from '@/lib/utils';
import { toast } from 'sonner';
import { Download, Trash2, Plus, ShieldCheck, RotateCcw, ListTree, FlaskConical } from 'lucide-react';
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
      } catch (_) { /* ignore - defaults stay in place */ }
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
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [contents, setContents] = useState(null);
  const [impact, setImpact] = useState(null);
  const [action, setAction] = useState('');

  async function load() {
    setListLoading(true);
    setListError('');
    try {
      const { backups: b } = await api('/api/backups');
      setBackups(b);
    } catch (e) { setListError(e.message); }
    setListLoading(false);
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

  async function showContents(name) {
    try { setAction(name); const r = await api(`/api/backups/${encodeURIComponent(name)}/contents`); setContents(r.manifest); }
    catch (e) { toast.error(e.message); } finally { setAction(''); }
  }

  async function verify(name) {
    try { setAction(name); await api(`/api/backups/${encodeURIComponent(name)}/verify`, { method: 'POST' }); toast.success(t('backups.verifiedToast')); await load(); }
    catch (e) { toast.error(e.message); } finally { setAction(''); }
  }

  async function previewRestore(name) {
    try { setAction(name); await api(`/api/backups/${encodeURIComponent(name)}/verify`, { method: 'POST' }); const r = await api(`/api/backups/${encodeURIComponent(name)}/impact`, { method: 'POST' }); setImpact({ name, ...r.impact }); await load(); }
    catch (e) { toast.error(e.message); } finally { setAction(''); }
  }

  async function restore() {
    try { setAction(impact.name); const key = crypto.randomUUID(); const r = await api(`/api/backups/${encodeURIComponent(impact.name)}/restore`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: { token: impact.token } }); toast.success(t('backups.restoreQueued', { id: r.operationId })); setImpact(null); }
    catch (e) { toast.error(e.message); } finally { setAction(''); }
  }

  async function drill(name) {
    try { setAction(name); await api(`/api/backups/${encodeURIComponent(name)}/drill`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } }); toast.success(t('backups.drillQueued')); }
    catch (e) { toast.error(e.message); } finally { setAction(''); }
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
          {listLoading ? (
            <ListSkeleton rows={3} />
          ) : listError ? (
            <ErrorState error={listError} onRetry={load} />
          ) : backups.length === 0 ? (
            <EmptyState message={t('backups.empty')} />
          ) : (
            <div className="space-y-1.5">
              {backups.map(b => (
                <div key={b.name} className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2.5 hover:bg-secondary/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{fmtBytes(b.size)} · {new Date(b.mtime).toLocaleString()}</div>
                    <div className="mt-1 flex gap-1.5">
                      <Badge variant={b.verification?.status === 'verified' ? 'softSuccess' : 'default'}>{t(`backups.${b.verification?.status === 'verified' ? 'verified' : 'unverified'}`)}</Badge>
                      {b.manifest?.worldRoots?.length > 0 && <Badge>{t('backups.worldCount', { count: b.manifest.worldRoots.length })}</Badge>}
                      {b.drill?.completedAt && <span className="text-[11px] text-muted-foreground">{t('backups.drilled', { age: new Date(b.drill.completedAt).toLocaleDateString() })}</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-xs" title={t('backups.contents')} onClick={() => showContents(b.name)} disabled={action === b.name}><ListTree className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon-xs" title={t('backups.verify')} onClick={() => verify(b.name)} disabled={action === b.name}><ShieldCheck className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon-xs" title={t('backups.drill')} onClick={() => drill(b.name)} disabled={action === b.name}><FlaskConical className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon-xs" title={t('backups.restore')} onClick={() => previewRestore(b.name)} disabled={action === b.name}><RotateCcw className="h-3.5 w-3.5" /></Button>
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
      <Dialog open={!!contents} onOpenChange={(o) => { if (!o) setContents(null); }}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{t('backups.contents')}</DialogTitle></DialogHeader><DialogBody>
          {contents && <><div className="mb-3 text-xs text-muted-foreground">{fmtBytes(contents.sizeBytes)} · SHA-256 <code>{contents.sha256}</code> · {t('backups.fileCount', { count: contents.inventory.length })}</div>
            <div className="max-h-80 overflow-auto rounded border p-2 font-mono text-xs">{contents.inventory.map((e) => <div key={e.path} className="flex justify-between gap-4"><span className="truncate">{e.path}</span><span>{fmtBytes(e.size)}</span></div>)}</div></>}
        </DialogBody></DialogContent>
      </Dialog>
      <Dialog open={!!impact} onOpenChange={(o) => { if (!o) setImpact(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{t('backups.restorePreview')}</DialogTitle></DialogHeader><DialogBody className="space-y-3">
          {impact && <><p className="text-sm">{t('backups.restoreWarning')}</p><div className="rounded border p-3 text-xs space-y-1"><div>{t('backups.replacements')}: {impact.replacements.map((x) => x.root).join(', ')}</div><div>{t('backups.preserved')}: {impact.preserved.join(', ') || '—'}</div><div>{t('backups.diskRequired')}: {fmtBytes(impact.requiredBytes)}</div><div>{t('backups.rollbackAvailable')}</div></div></>}
        </DialogBody><DialogFooter><Button variant="ghost" onClick={() => setImpact(null)}>{t('common.cancel')}</Button><Button onClick={restore} disabled={!!action}>{t('backups.confirmRestore')}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
