import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Archive, CalendarClock, CheckCircle2, Copy, Database, Download, Ellipsis, FileArchive,
  FileBox, Globe2, HardDrive, Info, Loader2, Trash2, TriangleAlert, Upload, Wand2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ListSkeleton } from '@/components/shared/Skeletons';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useT } from '@/context/I18nContext';
import { useServer } from '@/context/ServerContext';
import { fmtBytes } from '@/lib/utils';
import { PageIntro, SummaryGrid, SummaryItem } from '@/components/layout/Page';

const fmtDate = (value) => (value ? new Date(value).toLocaleString() : '-');
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const dimensionLabel = (dimension, t) => {
  if (['overworld', 'the_nether', 'the_end'].includes(dimension)) return t(`worlds.dimension.${dimension}`);
  const name = dimension.replace(/^custom:/i, '').replace(/^minecraft:/i, '').replaceAll('_', ' ');
  return t('worlds.dimension.custom', { name });
};

// The panel polls a running operation rather than holding the request open: the
// work outlives any one HTTP call, and a reload must pick it back up.
function useOperation(api, t, onDone) {
  const [op, setOp] = useState(null);
  const timer = useRef(null);

  const stop = useCallback(() => { clearTimeout(timer.current); timer.current = null; }, []);

  const follow = useCallback((operationId) => {
    const tick = async () => {
      try {
        const r = await api(`/api/operations/${operationId}`);
        setOp(r.operation);
        if (['succeeded', 'failed', 'cancelled', 'recovery_required'].includes(r.operation.state)) {
          if (r.operation.state === 'succeeded') toast.success(t('worlds.opDone'));
          else if (r.operation.state === 'cancelled') toast.info(t('worlds.opCancelled'));
          else toast.error(r.operation.error?.text || t('worlds.opFailed'));
          setTimeout(() => setOp(null), 2500);
          onDone();
          return;
        }
        timer.current = setTimeout(tick, 1000);
      } catch (e) {
        toast.error(e.message);
        setOp(null);
      }
    };
    tick();
  }, [api, t, onDone]);

  useEffect(() => stop, [stop]);

  return { op, follow };
}

// Every mutation shows what it would do before it does it. This is that panel:
// impact, disk, what the configuration would gain or lose, and why it might be
// refused - the same payload the backend will re-validate at commit time.
function Impact({ preview, t }) {
  if (!preview) return null;
  const disk = preview.disk || {};
  const rows = [
    preview.world && [t('worlds.impact.world'), `${preview.world.name} · ${fmtBytes(preview.world.sizeBytes)}${preview.world.sizeEstimated ? ` (${t('worlds.estimated')})` : ''}`],
    preview.source && [t('worlds.impact.source'), `${preview.source.name} · ${fmtBytes(preview.source.sizeBytes)}`],
    preview.name && [t('worlds.impact.name'), preview.name],
    preview.replaced && [t('worlds.impact.replaces'), `${preview.replaced.name} · ${fmtBytes(preview.replaced.sizeBytes)}`],
    preview.registration?.adds && [t('worlds.impact.registers'), preview.registration.adds],
    preview.registration?.removes && [t('worlds.impact.unregisters'), preview.registration.removes],
    preview.remaining && [t('worlds.impact.remaining'), preview.remaining.join(', ')],
    preview.radius != null && [t('worlds.impact.radius'), t('worlds.blocks', { n: preview.radius })],
    disk.requiredBytes > 0 && [
      t('worlds.impact.disk'),
      disk.availableBytes == null
        ? t('worlds.diskUnknown')
        : t('worlds.diskNeed', { need: fmtBytes(disk.neededBytes), free: fmtBytes(disk.availableBytes) }),
    ],
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <dl className="space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium break-all">{value}</dd>
          </div>
        ))}
      </dl>

      {disk.sufficient === false && (
        <p className="flex items-start gap-2 rounded-md border border-status-error/40 bg-status-error/10 p-2 text-xs">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-error" />
          {disk.reason === 'capacity_unknown' ? t('worlds.diskUnknownBlocked') : t('worlds.diskShort')}
        </p>
      )}
      {preview.requiresOffline && (
        <p className="flex items-start gap-2 rounded-md border border-status-warning/40 bg-status-warning/10 p-2 text-xs">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
          {t('worlds.needsOffline')}
        </p>
      )}
      {preview.consistencyNote && (
        <p className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t(`worlds.note.${preview.consistencyNote}`)}
        </p>
      )}
    </div>
  );
}

function ImportDialog({ open, onClose, serverId, api, t, onStarted }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState('add');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setFile(null); setName(''); setMode('add'); setPreview(null); } }, [open]);

  async function runPreview() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (name) form.append('name', name);
      form.append('mode', mode);
      const r = await api(`/api/worlds/import/preview?serverId=${encodeURIComponent(serverId)}`, { method: 'POST', body: form });
      setPreview(r.preview);
      setName(r.preview.name);
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  async function apply() {
    setBusy(true);
    try {
      const r = await api(`/api/worlds/import?serverId=${encodeURIComponent(serverId)}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': uuid() },
        body: { serverId, token: preview.token },
      });
      onStarted(r.operationId);
      onClose();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-primary" />{t('worlds.import')}</DialogTitle>
          <DialogDescription>{t('worlds.importHelp')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <label className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/15 px-5 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5">
            <input type="file" accept=".zip" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {file ? <CheckCircle2 className="h-5 w-5" /> : <FileArchive className="h-5 w-5" />}
            </span>
            <span className="max-w-full truncate text-sm font-medium">{file?.name || t('worlds.chooseArchive')}</span>
            <span className="mt-1 text-xs text-muted-foreground">{file ? fmtBytes(file.size) : t('worlds.archiveHint')}</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="world-import-name">{t('worlds.worldName')}</Label>
              <Input id="world-import-name" value={name} onChange={(e) => { setName(e.target.value); setPreview(null); }} placeholder={t('worlds.namePlaceholder')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="world-import-mode">{t('worlds.importMode')}</Label>
              <select
                id="world-import-mode"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={mode}
                onChange={(e) => { setMode(e.target.value); setPreview(null); }}
              >
                <option value="add">{t('worlds.modeAdd')}</option>
                <option value="replace">{t('worlds.modeReplace')}</option>
              </select>
            </div>
          </div>

          {preview && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                {t('worlds.archiveSummary', {
                  entries: preview.archive.entries,
                  size: fmtBytes(preview.archive.expandedBytes),
                })}
              </p>
              {/* Only a folder with a level.dat is a world; the rest are shown so
                  the operator can see we picked the right one. */}
              <ul className="mb-3 space-y-1 text-xs">
                {preview.roots.map((r) => (
                  <li key={r.path} className="flex items-center justify-between gap-2">
                    <span className={r.hasMarker ? '' : 'text-muted-foreground'}>
                      {r.path}{r.path === preview.selectedRoot ? ` · ${t('worlds.selected')}` : ''}
                    </span>
                    <span className="text-muted-foreground">
                      {r.hasMarker ? fmtBytes(r.sizeBytes) : t('worlds.noMarker')}
                    </span>
                  </li>
                ))}
              </ul>
              <Impact preview={preview} t={t} />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          {!preview
            ? <Button onClick={runPreview} disabled={!file || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('worlds.previewImpact')}</Button>
            : <Button onClick={apply} disabled={busy || preview.disk?.sufficient === false}>{t('worlds.importConfirm')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PregenerateDialog({ world, onClose, serverId, api, t, onStarted }) {
  const [radius, setRadius] = useState(1000);
  const [preview, setPreview] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function runPreview() {
    setBusy(true);
    try {
      const r = await api(`/api/worlds/${encodeURIComponent(world.id)}/pregenerate/preview`, {
        method: 'POST', body: { serverId, radius: Number(radius) },
      });
      setPreview(r.preview);
      setConsent(false);
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  async function apply() {
    setBusy(true);
    try {
      const r = await api(`/api/worlds/${encodeURIComponent(world.id)}/pregenerate`, {
        method: 'POST',
        headers: { 'Idempotency-Key': uuid() },
        body: { serverId, token: preview.token, consent: true },
      });
      onStarted(r.operationId);
      onClose();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  }

  const chunky = preview?.chunky;
  // "Unsupported" is a real answer, and it says why: no compatible Chunky for
  // this loader and Minecraft version, a vanilla server, or Modrinth unreachable.
  const unsupportedReason = chunky && !chunky.supported
    ? t(`worlds.chunky.${chunky.reason}`, { loader: chunky.loader || '?', version: chunky.mcVersion || '?' })
    : null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" />{t('worlds.pregenerate')} · {world.name}</DialogTitle>
          <DialogDescription>{t('worlds.pregenerateHelp')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="pregenerate-radius">{t('worlds.radius')}</Label>
            <div className="relative">
              <Input
                id="pregenerate-radius"
                type="number" min={1} max={20000} value={radius}
                onChange={(e) => { setRadius(e.target.value); setPreview(null); }}
                className="pr-20 text-base font-medium"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{t('worlds.blocksUnit')}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('worlds.radiusBlocks')}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {[500, 1000, 2500, 5000].map((value) => (
                <Button key={value} type="button" size="sm" variant={Number(radius) === value ? 'secondary' : 'outline'} onClick={() => { setRadius(value); setPreview(null); }}>{value.toLocaleString()}</Button>
              ))}
            </div>
          </div>

          {preview && (
            <div className="space-y-3 rounded-lg border p-3">
              {unsupportedReason ? (
                <p className="flex items-start gap-2 text-sm">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
                  {unsupportedReason}
                </p>
              ) : (
                <>
                  <Impact preview={preview} t={t} />
                  {!preview.serverOnline && (
                    <p className="text-xs text-status-warning">{t('worlds.needsOnline')}</p>
                  )}
                  {chunky.restartRequired && (
                    <p className="flex items-start gap-2 rounded-md border border-status-warning/40 bg-status-warning/10 p-2 text-xs">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
                      {t('worlds.chunky.restartRequired')}
                    </p>
                  )}
                  {!chunky.restartRequired && (
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                      <span>
                        {chunky.installed
                          ? t('worlds.consentCommands')
                          : t('worlds.consentInstall', { version: chunky.versionNumber, size: fmtBytes(chunky.sizeBytes) })}
                      </span>
                    </label>
                  )}
                </>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          {!preview
            ? <Button onClick={runPreview} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('worlds.previewImpact')}</Button>
            : <Button onClick={apply} disabled={busy || !consent || !chunky?.supported || chunky.restartRequired || !preview.serverOnline}>{t('worlds.pregenerateStart')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Clone / archive / delete all follow the same shape: describe, then confirm.
const ACTION_ICON = { clone: Copy, archive: Archive, delete: Trash2 };

function ActionDialog({ action, world, onClose, serverId, api, t, onStarted }) {
  const [name, setName] = useState(`${world.name} copy`);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(action !== 'clone');
  const [submitting, setSubmitting] = useState(false);

  // The impact is a consequence of the name, not a button the operator has to
  // find: a stale request must never land on top of a newer one.
  const latest = useRef(0);

  const load = useCallback(async (cloneName) => {
    const seq = ++latest.current;
    setChecking(true);
    try {
      const r = action === 'clone'
        ? await api(`/api/worlds/${encodeURIComponent(world.id)}/clone`, { method: 'POST', body: { serverId, preview: true, name: cloneName } })
        : action === 'archive'
          ? await api(`/api/worlds/${encodeURIComponent(world.id)}/archive`, { method: 'POST', body: { serverId, preview: true } })
          : await api(`/api/worlds/${encodeURIComponent(world.id)}/delete/preview`, { method: 'POST', body: { serverId } });
      if (seq !== latest.current) return;
      setPreview(r.preview);
    } catch (e) {
      if (seq !== latest.current) return;
      // A clone name the backend refuses (taken, illegal) is an answer, not a
      // dead end: keep the dialog open so the operator can just retype it.
      if (action === 'clone') { setPreview(null); setError(e.message); }
      else { toast.error(e.message); onClose(); }
    } finally {
      if (seq === latest.current) setChecking(false);
    }
  }, [action, api, serverId, world.id, onClose]);

  useEffect(() => {
    if (action !== 'clone') { load(); return undefined; }
    const trimmed = name.trim();
    setPreview(null);
    setError('');
    if (!trimmed) { setChecking(false); return undefined; }
    setChecking(true);
    const timer = setTimeout(() => load(trimmed), 400);
    return () => clearTimeout(timer);
  }, [action, name, load]);

  async function apply() {
    setSubmitting(true);
    try {
      const headers = { 'Idempotency-Key': uuid() };
      let r;
      if (action === 'clone') r = await api(`/api/worlds/${encodeURIComponent(world.id)}/clone`, { method: 'POST', headers, body: { serverId, token: preview.token } });
      else if (action === 'archive') r = await api(`/api/worlds/${encodeURIComponent(world.id)}/archive`, { method: 'POST', headers, body: { serverId } });
      else r = await api(`/api/worlds/${encodeURIComponent(world.id)}`, { method: 'DELETE', headers, body: { serverId, token: preview.token } });
      onStarted(r.operationId);
      onClose();
    } catch (e) { toast.error(e.message); setSubmitting(false); }
  }

  const blocked = preview?.disk?.sufficient === false
    || (action === 'delete' && preview && !preview.serverOffline);
  const Icon = ACTION_ICON[action];

  return (
    <Dialog open onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${action === 'delete' ? 'text-destructive' : 'text-primary'}`} />
            {t(`worlds.${action}`)} · {world.name}
          </DialogTitle>
          <DialogDescription>{t(`worlds.${action}Help`)}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {action === 'clone' && (
            <div className="space-y-1.5">
              <Label htmlFor="world-clone-name">{t('worlds.worldName')}</Label>
              <Input
                id="world-clone-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('worlds.namePlaceholder')}
                aria-invalid={!!error}
                className={error ? 'border-status-error' : undefined}
              />
              {error && <p className="text-xs text-status-error">{error}</p>}
            </div>
          )}
          {action === 'delete' && (
            <p className="flex items-start gap-2 rounded-md border border-status-warning/40 bg-status-warning/10 p-2 text-xs">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
              {t('worlds.deleteWarning')}
            </p>
          )}
          {checking && !preview
            ? <ListSkeleton rows={3} />
            : <Impact preview={preview} t={t} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t('common.cancel')}</Button>
          <Button
            variant={action === 'delete' ? 'destructive' : 'default'}
            onClick={apply}
            disabled={checking || submitting || !preview || blocked}
          >
            {(checking || submitting) && <Loader2 className="h-4 w-4 animate-spin" />}
            {t(`worlds.${action}Confirm`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorldsView() {
  const api = useApi();
  const t = useT();
  const { token } = useAuth();
  const { activeServerId } = useServer();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [dialog, setDialog] = useState(null); // { action, world }

  const load = useCallback(async () => {
    if (!activeServerId) { setData(null); setLoading(false); return; }
    setError('');
    try {
      setData(await api(`/api/worlds?serverId=${encodeURIComponent(activeServerId)}`));
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [api, activeServerId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const { op, follow } = useOperation(api, t, load);
  const operationStarted = useCallback((operationId) => {
    follow(operationId);
    load();
  }, [follow, load]);

  // A world download is a plain GET, so it goes through the browser (with the
  // token in the query string, the way the other download routes work).
  const download = (world) => {
    window.location.href = `/api/worlds/${encodeURIComponent(world.id)}/download`
      + `?serverId=${encodeURIComponent(activeServerId)}&token=${encodeURIComponent(token)}`;
  };

  if (loading) return <ListSkeleton rows={3} />;
  if (error && !data) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <EmptyState icon={Globe2} title={t('worlds.noServer')} />;

  const busy = !!op && ['queued', 'running'].includes(op.state);
  const existingWorlds = data.worlds.filter((world) => world.exists);
  const totalSize = existingWorlds.reduce((sum, world) => sum + (world.sizeBytes || 0), 0);
  const latestChange = existingWorlds.reduce((latest, world) => {
    const changed = world.lastModified ? new Date(world.lastModified).getTime() : 0;
    return changed > latest ? changed : latest;
  }, 0);

  return (
    <div className="space-y-5">
      <PageIntro
        description={t('worlds.subtitle')}
        actions={<Button onClick={() => setImporting(true)} disabled={busy}>
          <Upload className="h-4 w-4" />{t('worlds.import')}
        </Button>}
      />

      <SummaryGrid className="sm:grid-cols-3 xl:grid-cols-3">
        {[
          { icon: Database, label: t('worlds.summaryWorlds'), value: existingWorlds.length },
          { icon: HardDrive, label: t('worlds.summaryStorage'), value: fmtBytes(totalSize) },
          { icon: CalendarClock, label: t('worlds.summaryUpdated'), value: latestChange ? fmtDate(latestChange) : '-' },
        ].map(({ icon, label, value }) => <SummaryItem key={label} icon={icon} label={label} value={value} />)}
      </SummaryGrid>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileBox className="h-4 w-4" />{t('worlds.registered')}</CardTitle>
          <Badge variant="secondary">{data.worlds.length}</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {data.worlds.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t('worlds.empty')}</div>
          )}
          {data.worlds.map((world) => (
            <div key={world.id} className="group flex min-h-44 flex-col rounded-xl border bg-background/35 p-4 transition-colors hover:border-primary/30 hover:bg-background/60">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{world.name}</span>
                    {!world.exists && <Badge variant="destructive">{t('worlds.missing')}</Badge>}
                    {world.exists && !world.hasMarker && <Badge variant="secondary">{t('worlds.noMarker')}</Badge>}
                    {world.operation && <Badge variant="outline">{t(`worlds.op.${world.operation.action}`)}</Badge>}
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={world.relativePath}>{world.relativePath}</p>
                  {world.dimensions.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {world.dimensions.map((d) => <Badge key={d} variant="secondary" className="text-[10px]">{dimensionLabel(d, t)}</Badge>)}
                    </p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('worlds.moreActions')}><Ellipsis className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={busy || !world.exists} onSelect={() => setDialog({ action: 'clone', world })}><Copy className="h-4 w-4" />{t('worlds.clone')}</DropdownMenuItem>
                    <DropdownMenuItem disabled={busy || !world.exists} onSelect={() => setDialog({ action: 'archive', world })}><Archive className="h-4 w-4" />{t('worlds.archive')}</DropdownMenuItem>
                    <DropdownMenuItem disabled={!world.exists} onSelect={() => download(world)}><Download className="h-4 w-4" />{t('worlds.download')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={busy || !world.exists} onSelect={() => setDialog({ action: 'delete', world })}><Trash2 className="h-4 w-4" />{t('worlds.delete')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/35 p-2"><span className="block text-muted-foreground">{t('worlds.summaryStorage')}</span><strong>{fmtBytes(world.sizeBytes)}{world.sizeEstimated ? ` (${t('worlds.estimated')})` : ''}</strong></div>
                <div className="rounded-lg bg-muted/35 p-2"><span className="block text-muted-foreground">{t('worlds.summaryFiles')}</span><strong>{world.fileCount}</strong></div>
              </div>
              <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                <span className="text-[11px] text-muted-foreground">{world.lastModified ? t('worlds.modified', { at: fmtDate(world.lastModified) }) : '-'}</span>
                <Button variant="outline" size="sm" onClick={() => setDialog({ action: 'pregenerate', world })} disabled={busy || !world.exists}><Wand2 className="h-3.5 w-3.5" />{t('worlds.pregenerate')}</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Discovered, not adopted: a folder with a level.dat that nobody registered
          is a suggestion. Registering it is a decision the operator makes. */}
      {data.candidates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HardDrive className="h-4 w-4" />{t('worlds.candidates')}</CardTitle>
            <span className="text-xs text-muted-foreground">{t('worlds.candidatesHelp')}</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.candidates.map((c) => (
              <div key={c.name} className="flex items-center justify-between gap-3 text-sm">
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">{fmtBytes(c.sizeBytes)} · {fmtDate(c.lastModified)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.operations.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('worlds.history')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.operations.slice(0, 10).map((entry) => (
              <div key={entry.operationId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {t(`worlds.op.${entry.action}`)}
                  {entry.worldId ? ` · ${entry.worldId}` : ''}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {fmtDate(entry.queuedAt)}
                  <Badge variant={entry.state === 'succeeded' ? 'secondary' : entry.state === 'running' ? 'outline' : 'destructive'}>
                    {t(`worlds.state.${entry.state}`)}
                  </Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ImportDialog
        open={importing} onClose={() => setImporting(false)}
        serverId={activeServerId} api={api} t={t} onStarted={operationStarted}
      />
      {dialog?.action === 'pregenerate' && (
        <PregenerateDialog world={dialog.world} onClose={() => setDialog(null)} serverId={activeServerId} api={api} t={t} onStarted={operationStarted} />
      )}
      {dialog && dialog.action !== 'pregenerate' && (
        <ActionDialog action={dialog.action} world={dialog.world} onClose={() => setDialog(null)} serverId={activeServerId} api={api} t={t} onStarted={operationStarted} />
      )}
    </div>
  );
}
