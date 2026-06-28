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
import { Play, Square, RotateCcw, Star, Pencil, Trash2, FolderOpen, Plus, Server } from 'lucide-react';
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
                const data = await api(`/api/pick-folder?defaultPath=${encodeURIComponent(form.parentDir)}`);
                if (data?.path) setForm(f => ({ ...f, parentDir: data.path }));
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
  );
}

export function ServersView({ onSetActive, onRefresh }) {
  const api = useApi();
  const t = useT();
  const { servers, activeServerId, statuses } = useServer();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [registerOpen, setRegisterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editServer, setEditServer] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function action(act, s) {
    try {
      if (act === 'start') await api(`/api/servers/${s.id}/start`, { method: 'POST' });
      else if (act === 'stop') await api(`/api/servers/${s.id}/stop`, { method: 'POST' });
      else if (act === 'restart') await api(`/api/servers/${s.id}/restart`, { method: 'POST' });
      else if (act === 'active') onSetActive(s.id);
      else if (act === 'delete') {
        await api(`/api/servers/${s.id}`, { method: 'DELETE' });
        toast.success(t('servers.removedToast'));
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
              <Button variant="default" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t('servers.createNew')}
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
          {servers.length === 0 ? (
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
                                {isActive && <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/25">{t('servers.activeLabel')}</span>}
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

      {confirmDelete && (
        <Dialog open onOpenChange={() => setConfirmDelete(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t('servers.removeTitle')}</DialogTitle></DialogHeader>
            <p className="px-5 py-3 text-sm text-muted-foreground">{(() => {
              const notWord = t('servers.removeBodyEm');
              const txt = t('servers.removeBody', { name: confirmDelete.name, not: notWord });
              const ni = txt.indexOf(confirmDelete.name);
              const emi = txt.indexOf(notWord);
              if (ni < 0 && emi < 0) return txt;
              const out = [];
              if (ni >= 0) out.push(txt.slice(0, ni));
              if (ni >= 0) out.push(<strong key="n" className="text-foreground">{confirmDelete.name}</strong>);
              if (ni >= 0) out.push(txt.slice(ni + confirmDelete.name.length, emi >= 0 ? emi : undefined));
              if (emi >= 0) out.push(<em key="e">{notWord}</em>);
              if (emi >= 0) out.push(txt.slice(emi + notWord.length));
              return out;
            })()}</p>
            <DialogFooter>
              <Button variant="glass" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button>
              <Button variant="destructive" onClick={() => { action('delete', confirmDelete); setConfirmDelete(null); }}>{t('common.remove')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
