import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { StatusPill } from '@/components/shared/StatusPill';
import { EmptyState } from '@/components/shared/EmptyState';
import { useServer } from '@/context/ServerContext';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { useApiStream } from '@/hooks/useApiStream';
import { useT } from '@/context/I18nContext';
import { fmtUptime, fmtBytes, fmtBytesRaw, osExamplePath } from '@/lib/utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Play, Square, RotateCcw, Star, Pencil, Trash2, FolderOpen, Plus, Server, Package, Search } from 'lucide-react';
import { TableSkeleton, ModrinthResultSkeleton } from '@/components/shared/Skeletons';
import { cn } from '@/lib/utils';

function FolderBrowserModal({ open, onOpenChange, onSelect, initial = '' }) {
  const api = useApi();
  const t = useT();
  const [current, setCurrent] = useState('');
  const [entries, setEntries] = useState({ path: '', dirs: [], drives: [], jars: [] });

  useEffect(() => {
    if (open) navigate(initial);
  }, [open]);

  async function navigate(p) {
    try {
      const data = await api(`/api/fs?path=${encodeURIComponent(p)}`);
      setCurrent(data.path || '');
      setEntries(data);
    } catch (e) { toast.error(e.message); }
  }

  function joinPath(base, name) {
    if (!base) return name;
    const sep = entries.sep || '/';
    return base.replace(/[\\/]+$/, '') + sep + name;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('servers.pickFolderTitle')}</DialogTitle></DialogHeader>
        <div className="px-5 pt-2 pb-0">
          <p className="text-xs font-mono text-muted-foreground mb-3 truncate">{current || t('servers.thisPcDrives')}</p>
          <div className="border border-border rounded-md overflow-hidden max-h-64 overflow-y-auto">
            {entries.path && (
              <button type="button" onClick={() => navigate(entries.parent || '')}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary border-b border-border">
                {t('servers.up')}
              </button>
            )}
            {(entries.drives || []).map(d => (
              <button key={d} type="button" onClick={() => navigate(d)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-secondary border-b border-border last:border-0">
                💽 {d}
              </button>
            ))}
            {(entries.dirs || []).map(d => (
              <button key={d} type="button" onClick={() => navigate(joinPath(entries.path, d))}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-secondary border-b border-border last:border-0">
                📁 {d}
              </button>
            ))}
          </div>
          {entries.jars?.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{t('servers.jarsHere', { list: entries.jars.join(', ') })}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button variant="default" onClick={() => {
            if (!current) { toast.error(t('servers.navigateFirst')); return; }
            onSelect(current, entries.jars || []);
            onOpenChange(false);
          }}>
            {t('servers.useThisFolder')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServerModal({ open, onOpenChange, server, onSaved, servers: allServers }) {
  const api = useApi();
  const t = useT();
  const [form, setForm] = useState({ name: '', dir: '', jar: '', javaArgs: '-Xmx4G -Xms4G', mcVersion: '', worlds: 'world, world_nether, world_the_end', mapUrl: '' });
  const [jars, setJars] = useState([]);
  const [error, setError] = useState('');
  const [fsOpen, setFsOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setError('');
      if (server) {
        setForm({
          name: server.name || '',
          dir: server.dir || '',
          jar: server.jar || '',
          javaArgs: (server.javaArgs || []).join(' '),
          mcVersion: server.mcVersion || '',
          worlds: (server.worlds || []).join(', '),
          mapUrl: server.mapUrl || '',
        });
        setJars(server.jar ? [server.jar] : []);
      } else {
        setForm({ name: '', dir: '', jar: '', javaArgs: '-Xmx4G -Xms4G', mcVersion: '', worlds: 'world, world_nether, world_the_end', mapUrl: '' });
        setJars([]);
      }
    }
  }, [open, server]);

  async function loadJars(dir) {
    try {
      const data = await api(`/api/fs?path=${encodeURIComponent(dir)}`);
      const j = data.jars || [];
      setJars(j);
      if (j.length) {
        const guess = j.find(x => /spigot|paper|server|bukkit|fabric|forge/i.test(x)) || j[0];
        setForm(f => ({ ...f, jar: guess }));
      }
    } catch (_) {}
  }

  async function save() {
    try {
      if (server?.id) await api(`/api/servers/${server.id}`, { method: 'PUT', body: form });
      else await api('/api/servers', { method: 'POST', body: form });
      onSaved(server ? t('servers.updatedToast') : t('servers.registeredToast'));
      onOpenChange(false);
    } catch (e) { setError(e.message); }
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{server ? t('servers.editTitle') : t('servers.registerTitle')}</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label>{t('servers.fieldName')}</Label>
              <Input value={form.name} onChange={f('name')} placeholder={t('servers.namePlaceholder')} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('servers.fieldFolder')}</Label>
              <div className="flex gap-2">
                <Input value={form.dir} onChange={f('dir')} placeholder={t('servers.folderPlaceholder', { path: osExamplePath('server') })} className="flex-1" />
                <Button variant="glass" size="sm" type="button" onClick={() => setFsOpen(true)}>
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t('servers.browse')}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('servers.fieldJar')}</Label>
              <select
                className="flex h-9 w-full items-center rounded-md border border-input bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                value={form.jar}
                onChange={f('jar')}
              >
                {jars.length === 0 && <option value="">{t('servers.jarPlaceholder')}</option>}
                {jars.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('servers.fieldJavaArgs')}</Label>
              <Input value={form.javaArgs} onChange={f('javaArgs')} placeholder={t('servers.javaArgsPlaceholder')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t('servers.fieldMcVersion')}</Label>
                <Input value={form.mcVersion} onChange={f('mcVersion')} placeholder={t('servers.mcVersionPlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('servers.fieldWorlds')}</Label>
                <Input value={form.worlds} onChange={f('worlds')} placeholder={t('servers.worldsPlaceholder')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('servers.fieldMapUrl')}</Label>
              <Input
                value={form.mapUrl}
                onChange={f('mapUrl')}
                placeholder={t('servers.mapUrlPlaceholder')}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            {error && <p className="text-xs text-status-error">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="glass" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button variant="default" onClick={save}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FolderBrowserModal
        open={fsOpen}
        onOpenChange={setFsOpen}
        initial={form.dir}
        onSelect={(dir, j) => {
          setForm(f => ({
            ...f,
            dir,
            name: f.name || dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || f.name,
          }));
          setJars(j);
          if (j.length) {
            const guess = j.find(x => /spigot|paper|server|bukkit|fabric|forge/i.test(x)) || j[0];
            setForm(f => ({ ...f, jar: guess }));
          }
        }}
      />
    </>
  );
}

function CreateServerModal({ open, onOpenChange, onCreated }) {
  const api = useApi();
  const stream = useApiStream();
  const t = useT();
  const [form, setForm] = useState({ name: '', type: 'paper', mcVersion: '', parentDir: '', javaArgs: '-Xmx4G -Xms4G', eula: false });
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('');
  const [progress, setProgress] = useState(null); // { received, total }
  const [fsOpen, setFsOpen] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    if (open) {
      setError(''); setProgress(null); setPhase('');
      loadVersions('paper');
    }
  }, [open]);

  async function loadVersions(type) {
    setVersions([]);
    try {
      const { versions: v } = await api(`/api/create/versions?type=${encodeURIComponent(type)}`);
      setVersions(v.slice(0, 60));
      setForm(f => ({ ...f, mcVersion: v[0] || '' }));
    } catch (_) {}
  }

  async function create() {
    if (!form.eula) { setError(t('errors.eulaRequired')); return; }
    setLoading(true); setError(''); setProgress(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const phaseKey = {
        resolving: 'servers.phaseResolving',
        downloading: 'servers.phaseDownloading',
        'installing-forge': 'servers.phaseInstallingForge',
        'installing-neoforge': 'servers.phaseInstallingNeoForge',
        finalizing: 'servers.phaseFinalizing',
      };
      const final = await stream('/api/create', {
        body: form,
        signal: ac.signal,
        onEvent: (evt) => {
          if (!evt || !evt.type) return;
          if (evt.type === 'phase') {
            setPhase(phaseKey[evt.phase] ? t(phaseKey[evt.phase]) : evt.phase);
          } else if (evt.type === 'download-start') {
            setProgress({ received: 0, total: evt.total || 0 });
          } else if (evt.type === 'progress') {
            setProgress({ received: evt.received, total: evt.total || 0 });
          }
        },
      });
      onCreated(t('servers.createdToast'));
      onOpenChange(false);
    } catch (e) {
      if (e.name === 'AbortError') {
        setError('');
        setProgress(null);
        setPhase('');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    if (abortRef.current) abortRef.current.abort();
  }

  const f = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(p => ({ ...p, [k]: v }));
    if (k === 'type') loadVersions(e.target.value);
  };

  const pct = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.received / progress.total) * 100))
    : null;
  const indeterminate = loading && (!progress || !progress.total);

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v); }}>
      <DialogContent className="max-w-lg" onPointerDownOutside={(e) => { if (loading) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (loading) e.preventDefault(); }}>
        <DialogHeader><DialogTitle>{t('servers.createTitle')}</DialogTitle></DialogHeader>
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-muted-foreground">{t('servers.createIntro')}</p>
          <div className="space-y-1.5">
            <Label>{t('servers.fieldName')}</Label>
            <Input value={form.name} onChange={f('name')} disabled={loading} placeholder={t('servers.namePlaceholderCreate')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('servers.fieldType')}</Label>
              <select disabled={loading} className="flex h-9 w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50" value={form.type} onChange={f('type')}>
                <option value="vanilla">{t('servers.typeVanilla')}</option>
                <option value="spigot">{t('servers.typeSpigot')}</option>
                <option value="paper">{t('servers.typePaper')}</option>
                <option value="fabric">{t('servers.typeFabric')}</option>
                <option value="forge">{t('servers.typeForge')}</option>
                <option value="neoforge">{t('servers.typeNeoForge')}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('servers.fieldMcVersionCreate')}</Label>
              <select disabled={loading} className="flex h-9 w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50" value={form.mcVersion} onChange={f('mcVersion')}>
                {versions.length === 0 && <option value="">{t('servers.loadingVersions')}</option>}
                {versions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('servers.fieldParent')}</Label>
            <div className="flex gap-2">
              <Input value={form.parentDir} onChange={f('parentDir')} disabled={loading} placeholder={t('servers.parentPlaceholder', { path: osExamplePath('parent') })} className="flex-1" />
              <Button variant="glass" size="sm" type="button" disabled={loading} onClick={async () => {
                try {
                  const data = await api(`/api/pick-folder?defaultPath=${encodeURIComponent(form.parentDir)}`);
                  if (data?.path) setForm(f => ({ ...f, parentDir: data.path }));
                } catch {
                  setFsOpen(true);
                }
              }}>
                <FolderOpen className="h-3.5 w-3.5" />{t('servers.browse')}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('servers.fieldJavaArgs')}</Label>
            <Input value={form.javaArgs} onChange={f('javaArgs')} disabled={loading} placeholder={t('servers.javaArgsPlaceholder')} />
          </div>
          <label className={cn('flex items-center gap-2 text-sm cursor-pointer', loading && 'opacity-60 pointer-events-none')}>
            <input type="checkbox" checked={form.eula} onChange={f('eula')} className="accent-primary" />
            <span className="text-muted-foreground">{(() => {
              const txt = t('servers.eula');
              const link = t('servers.eulaLink');
              const i = txt.indexOf(link);
              if (i < 0) return txt;
              return <>{txt.slice(0, i)}<a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer" className="text-primary hover:underline">{link}</a>{txt.slice(i + link.length)}</>;
            })()}</span>
          </label>
          {loading && (
            <div className="space-y-2 rounded-md border border-border/60 bg-secondary/30 px-3 py-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/90 truncate">{phase || t('servers.downloading')}</span>
                {pct != null && <span className="font-mono text-muted-foreground">{t('servers.progressPercent', { pct })}</span>}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-border/70">
                <div
                  className={cn('h-full bg-primary transition-[width] duration-150 ease-out', indeterminate && 'animate-pulse w-1/3')}
                  style={indeterminate ? undefined : { width: `${pct}%` }}
                />
              </div>
              {progress && (
                <div className="text-[11px] font-mono text-muted-foreground">
                  {progress.total > 0
                    ? t('servers.progressBytes', { received: fmtBytesRaw(progress.received), total: fmtBytesRaw(progress.total) })
                    : t('servers.progressBytesUnknown', { received: fmtBytesRaw(progress.received) })}
                </div>
              )}
            </div>
          )}
          {error && <p className="text-xs text-status-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="glass" onClick={loading ? cancel : () => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="default" onClick={create} disabled={loading}>
            {loading ? t('servers.downloading') : t('servers.downloadAndCreate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <FolderBrowserModal
      open={fsOpen}
      onOpenChange={setFsOpen}
      initial={form.parentDir}
      onSelect={(dir) => setForm(f => ({ ...f, parentDir: dir }))}
    />
    </>
  );
}

function CreateFromModpackModal({ open, onOpenChange, onCreated }) {
  const api = useApi();
  const t = useT();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('downloads');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  // Selection / preview step
  const [selected, setSelected] = useState(null); // hit chosen from the list
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [name, setName] = useState('');
  const [parentDir, setParentDir] = useState('');
  const [installing, setInstalling] = useState(false);
  const [fsOpen, setFsOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setQ(''); setSort('downloads'); setResults([]);
      setSelected(null); setPreview(null); setPreviewError('');
      setName(''); setParentDir(''); setInstalling(false);
      search('');
    }
  }, [open]);

  useEffect(() => { if (open) search(q); /* re-search on sort change */ }, [sort]);

  async function search(query) {
    setSearching(true);
    try {
      const params = new URLSearchParams({ q: query ?? q, sort, projectType: 'modpack' });
      const data = await api(`/api/modrinth/search?${params.toString()}`);
      setResults(data.hits || []);
    } catch (e) { toast.error(e.message); }
    setSearching(false);
  }

  async function selectModpack(hit) {
    setSelected(hit);
    setPreview(null);
    setPreviewError('');
    setLoadingPreview(true);
    setName('');
    try {
      const projectId = hit.project_id || hit.slug;
      const { matched } = await api(`/api/modrinth/modpack/versions/${encodeURIComponent(projectId)}`);
      const version = matched?.[0];
      if (!version) { setPreviewError(t('modrinth.noCompatibleVersion')); setLoadingPreview(false); return; }
      const data = await api(`/api/modrinth/modpack/preview/${encodeURIComponent(version.id)}`);
      setPreview(data);
      setName(data.name || data.indexName || hit.title || '');
    } catch (e) {
      setPreviewError(e.message);
    }
    setLoadingPreview(false);
  }

  async function pickFolder() {
    try {
      const data = await api(`/api/pick-folder?defaultPath=${encodeURIComponent(parentDir)}`);
      if (data?.path) setParentDir(data.path);
    } catch {
      setFsOpen(true);
    }
  }

  async function create() {
    if (!preview || preview.unsupported) return;
    if (!name.trim()) { toast.error(t('modrinth.modpackCreateName')); return; }
    if (!parentDir.trim()) { toast.error(t('modrinth.modpackCreateFolder')); return; }
    setInstalling(true);
    try {
      const r = await api('/api/modrinth/modpack/install', {
        method: 'POST',
        body: { versionId: preview.versionId, mode: 'create', name, parentDir },
      });
      toast.success(t('modrinth.modpackCreated', { name: name || r.name }));
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error(e.message);
    }
    setInstalling(false);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!installing) onOpenChange(v); }}>
      <DialogContent className="max-w-lg" onPointerDownOutside={(e) => { if (installing) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (installing) e.preventDefault(); }}>
        <DialogHeader><DialogTitle>{t('servers.createFromModpack')}</DialogTitle></DialogHeader>
        <div className="px-5 py-4 space-y-4">
          {!selected ? (
            <>
              <p className="text-xs text-muted-foreground">{t('servers.createModpackIntro')}</p>
              <form onSubmit={e => { e.preventDefault(); search(q); }} className="flex flex-wrap gap-2">
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t('modrinth.searchPlaceholder')} className="flex-1 min-w-40" />
                <select
                  className="h-9 rounded-md border border-input bg-background/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                >
                  <option value="downloads">{t('modrinth.sortDownloads')}</option>
                  <option value="follows">{t('modrinth.sortFollows')}</option>
                  <option value="relevance">{t('modrinth.sortRelevance')}</option>
                  <option value="updated">{t('modrinth.sortUpdated')}</option>
                  <option value="newest">{t('modrinth.sortNewest')}</option>
                </select>
                <Button type="submit" variant="default">
                  <Search className="h-3.5 w-3.5" />
                  {t('modrinth.search')}
                </Button>
              </form>
              {searching ? (
                <div className="space-y-2">
                  <ModrinthResultSkeleton />
                  <ModrinthResultSkeleton />
                  <ModrinthResultSkeleton />
                </div>
              ) : results.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">{t('modrinth.empty')}</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto -mx-1 px-1">
                  {results.map(h => (
                    <button
                      type="button"
                      key={h.project_id || h.slug}
                      onClick={() => selectModpack(h)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-secondary/20 p-3 text-left hover:bg-secondary/40 transition-colors"
                    >
                      {h.icon_url && (
                        <img src={h.icon_url} alt="" className="h-11 w-11 rounded shrink-0 object-cover"
                          onError={e => { e.target.style.visibility = 'hidden'; }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-foreground truncate">{h.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{(h.description || '').slice(0, 140)}</div>
                        <div className="text-xs text-muted-foreground/60 mt-1">
                          ⬇ {Number(h.downloads).toLocaleString()} · ♥ {Number(h.follows || 0).toLocaleString()} · {h.author || ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { if (!installing) { setSelected(null); setPreview(null); setPreviewError(''); } }}
                disabled={installing}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {t('servers.backToModpacks')}
              </button>
              {loadingPreview ? (
                <div className="space-y-2">
                  <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-2">
                    <div className="rounded animate-pulse bg-muted h-4 w-3/4" />
                    <div className="rounded animate-pulse bg-muted h-3 w-1/2" />
                    <div className="rounded animate-pulse bg-muted h-3 w-1/3" />
                  </div>
                </div>
              ) : null}
              {!loadingPreview && previewError && <p className="text-sm text-status-error">{previewError}</p>}
              {preview && preview.unsupported && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                  {t('modrinth.modpackUnsupportedToast', { loader: preview.loaderType || 'unknown' })}
                </div>
              )}
              {preview && !preview.unsupported && (
                <>
                  <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-1">
                    <p className="text-sm font-semibold text-foreground">{preview.name || preview.indexName || selected.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {preview.loaderType && (
                        <Badge variant="softPrimary" className="mr-1">
                          {preview.loaderType}
                        </Badge>
                      )}
                      {preview.mcVersion && (
                        <Badge variant="default" className="mr-1">
                          MC {preview.mcVersion}
                        </Badge>
                      )}
                      {preview.loaderVersion && <span className="text-[11px]">loader {preview.loaderVersion}</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{preview.serverFileCount} files</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('servers.fieldName')}</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} disabled={installing} placeholder={t('modrinth.modpackCreateName')} autoFocus />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('servers.fieldParent')}</Label>
                    <div className="flex gap-2">
                      <Input value={parentDir} onChange={e => setParentDir(e.target.value)} disabled={installing} placeholder={t('servers.parentPlaceholder', { path: osExamplePath('parent') })} className="flex-1" />
                      <Button variant="glass" size="sm" type="button" disabled={installing} onClick={pickFolder}>
                        <FolderOpen className="h-3.5 w-3.5" />{t('servers.browse')}
                      </Button>
                    </div>
                  </div>
                  {installing && (
                    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-3 py-2.5 text-xs text-foreground/90">
                      <Package className="h-3.5 w-3.5 animate-pulse" />
                      {t('modrinth.modpackProgress')}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)} disabled={installing}>{t('common.cancel')}</Button>
          {selected && preview && !preview.unsupported && (
            <Button variant="default" onClick={create} disabled={installing || !name.trim() || !parentDir.trim()}>
              {installing ? t('modrinth.installing') : t('servers.createFromModpack')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <FolderBrowserModal
      open={fsOpen}
      onOpenChange={setFsOpen}
      initial={parentDir}
      onSelect={(dir) => setParentDir(dir)}
    />
    </>
  );
}

export function ServersView({ onSetActive, onRefresh }) {
  const api = useApi();
  const t = useT();
  const { servers, activeServerId, statuses } = useServer();
  const [tableReady, setTableReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTableReady(true), 1500); return () => clearTimeout(t); }, []);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [registerOpen, setRegisterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [modpackOpen, setModpackOpen] = useState(false);
  const [editServer, setEditServer] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteFiles, setDeleteFiles] = useState(false);

  async function action(act, s, opts = {}) {
    try {
      if (act === 'start') await api(`/api/servers/${s.id}/start`, { method: 'POST' });
      else if (act === 'stop') await api(`/api/servers/${s.id}/stop`, { method: 'POST' });
      else if (act === 'restart') await api(`/api/servers/${s.id}/restart`, { method: 'POST' });
      else if (act === 'active') onSetActive(s.id);
      else if (act === 'delete') {
        const q = opts.deleteFiles ? '?deleteFiles=true' : '';
        const r = await api(`/api/servers/${s.id}${q}`, { method: 'DELETE' });
        toast.success(r?.filesDeleted ? t('servers.removedWithFilesToast') : t('servers.removedToast'));
        onRefresh?.();
      }
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t('servers.registeredTitle')}</CardTitle>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button data-tour="server-create-new" variant="default" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t('servers.createNew')}
              </Button>
              <Button data-tour="server-create-modpack" variant="glass" size="sm" onClick={() => setModpackOpen(true)}>
                <Package className="h-3.5 w-3.5" />
                {t('servers.createFromModpack')}
              </Button>
              <Button variant="glass" size="sm" onClick={() => { setEditServer(null); setRegisterOpen(true); }}>
                {t('servers.registerExisting')}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">{(() => {
            const txt = t('servers.activeExplainer', { active: t('servers.activeLabel') });
            const active = t('servers.activeLabel');
            const i = txt.indexOf(active);
            if (i < 0) return txt;
            return <>{txt.slice(0, i)}<strong className="text-foreground">{active}</strong>{txt.slice(i + active.length)}</>;
          })()}</p>
          {!tableReady && servers.length === 0 ? (
            <TableSkeleton rows={4} cols={6} />
          ) : servers.length === 0 ? (
            <EmptyState message={t('servers.empty')} />
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pl-4 text-left">{t('servers.colServer')}</th>
                    <th className="py-2 text-left">{t('servers.colStatus')}</th>
                    <th className="py-2 text-left">{t('servers.colPlayers')}</th>
                    <th className="py-2 text-left hidden sm:table-cell">{t('servers.colUptime')}</th>
                    <th className="py-2 text-left hidden sm:table-cell">{t('servers.colVersion')}</th>
                    <th className="py-2 pr-4 text-right">{t('servers.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map(s => {
                    const st = statuses[s.id] || s.status || { status: 'offline', playerCount: 0, maxPlayers: 0 };
                    const running = st.status !== 'offline';
                    const isActive = s.id === activeServerId;
                    return (
                      <tr key={s.id} className={cn('border-b border-border/50 last:border-0 transition-colors', isActive && 'bg-primary/5')}>
                        <td className="py-3 pl-4 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted/30 text-muted-foreground">
                              <Server className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 font-medium text-foreground">
                                <span className="hover:text-primary cursor-pointer" onClick={() => onSetActive(s.id)}>
                                  {s.name}
                                </span>
                                {isActive && <Badge variant="active" className="text-[9px] px-1 py-0.5">{t('servers.activeLabel')}</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground/70 font-mono truncate max-w-[180px]">{s.dir || ''}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4"><StatusPill status={st.status} /></td>
                        <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                          {running ? `${st.playerCount}/${st.maxPlayers || '?'}` : t('common.dashPlaceholder')}
                        </td>
                        <td className="py-3 pr-4 hidden sm:table-cell tabular-nums text-muted-foreground">
                          {running ? (fmtUptime(st.uptimeMs) || '0m') : t('common.dashPlaceholder')}
                        </td>
                        <td className="py-3 pr-4 hidden sm:table-cell text-muted-foreground">{s.mcVersion || t('common.dashPlaceholder')}</td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-xs" title={t('servers.btnStart')} disabled={running} onClick={() => action('start', s)}><Play className="h-3.5 w-3.5 text-status-online" /></Button>
                            <Button variant="ghost" size="icon-xs" title={t('servers.btnRestart')} onClick={() => action('restart', s)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon-xs" title={t('servers.btnStop')} disabled={!running} onClick={() => action('stop', s)}><Square className="h-3.5 w-3.5 text-status-error" /></Button>
                            <Button variant="ghost" size="icon-xs" title={t('servers.btnSetActive')} disabled={isActive} onClick={() => action('active', s)}><Star className={cn('h-3.5 w-3.5', isActive && 'text-primary fill-primary')} /></Button>
                            {isAdmin && <Button variant="ghost" size="icon-xs" title={t('servers.btnEdit')} onClick={() => { setEditServer(s); setRegisterOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>}
                            {isAdmin && <Button variant="ghost" size="icon-xs" title={t('servers.btnRemove')} onClick={() => setConfirmDelete(s)}><Trash2 className="h-3.5 w-3.5 text-status-error" /></Button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ServerModal
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        server={editServer}
        servers={servers}
        onSaved={(msg) => { toast.success(msg); onRefresh?.(); }}
      />
      <CreateServerModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(msg) => { toast.success(msg); onRefresh?.(); }}
      />
      <CreateFromModpackModal
        open={modpackOpen}
        onOpenChange={setModpackOpen}
        onCreated={() => { onRefresh?.(); }}
      />

      {confirmDelete && (
        <Dialog open onOpenChange={(o) => { if (!o) { setConfirmDelete(null); setDeleteFiles(false); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t('servers.removeTitle')}</DialogTitle></DialogHeader>
            <div className="px-5 py-3 space-y-3">
              <p className="text-sm text-muted-foreground">{(() => {
                const txt = t('servers.removeBody', { name: confirmDelete.name });
                const ni = txt.indexOf(confirmDelete.name);
                if (ni < 0) return txt;
                return [
                  txt.slice(0, ni),
                  <strong key="n" className="text-foreground">{confirmDelete.name}</strong>,
                  txt.slice(ni + confirmDelete.name.length),
                ];
              })()}</p>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={deleteFiles} onCheckedChange={(v) => setDeleteFiles(!!v)} className="mt-0.5" />
                <span>
                  <span className="text-foreground">{t('servers.removeFilesLabel')}</span>
                  {deleteFiles && (
                    <span className="block text-xs text-status-error mt-0.5">{t('servers.removeFilesWarn')}</span>
                  )}
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="glass" onClick={() => { setConfirmDelete(null); setDeleteFiles(false); }}>{t('common.cancel')}</Button>
              <Button variant="destructive" onClick={() => { action('delete', confirmDelete, { deleteFiles }); setConfirmDelete(null); setDeleteFiles(false); }}>{t('common.remove')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
