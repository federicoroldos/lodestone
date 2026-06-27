import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { StatusPill } from '@/components/shared/StatusPill';
import { EmptyState } from '@/components/shared/EmptyState';
import { useServer } from '@/context/ServerContext';
import { useApi } from '@/hooks/useApi';
import { fmtUptime } from '@/lib/utils';
import { toast } from 'sonner';
import { Play, Square, RotateCcw, Star, Pencil, Trash2, FolderOpen, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

function FolderBrowserModal({ open, onOpenChange, onSelect, initial = '' }) {
  const api = useApi();
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
    return base.replace(/[\\/]+$/, '') + '\\' + name;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Pick the server folder</DialogTitle></DialogHeader>
        <div className="px-5 pt-2 pb-0">
          <p className="text-xs font-mono text-muted-foreground mb-3 truncate">{current || 'This PC (drives)'}</p>
          <div className="border border-border rounded-md overflow-hidden max-h-64 overflow-y-auto">
            {entries.path && (
              <button type="button" onClick={() => navigate(entries.parent || '')}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary border-b border-border">
                ⬆ ..
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
            <p className="mt-2 text-xs text-muted-foreground">Jars here: {entries.jars.join(', ')}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="default" onClick={() => {
            if (!current) { toast.error('Navigate into a folder first'); return; }
            onSelect(current, entries.jars || []);
            onOpenChange(false);
          }}>
            Use this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServerModal({ open, onOpenChange, server, onSaved, servers: allServers }) {
  const api = useApi();
  const [form, setForm] = useState({ name: '', dir: '', jar: '', javaArgs: '-Xmx4G -Xms4G', mcVersion: '', worlds: 'world, world_nether, world_the_end' });
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
        });
        setJars(server.jar ? [server.jar] : []);
      } else {
        setForm({ name: '', dir: '', jar: '', javaArgs: '-Xmx4G -Xms4G', mcVersion: '', worlds: 'world, world_nether, world_the_end' });
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
        const guess = j.find(x => /spigot|paper|purpur|server|bukkit|fabric|forge/i.test(x)) || j[0];
        setForm(f => ({ ...f, jar: guess }));
      }
    } catch (_) {}
  }

  async function save() {
    try {
      if (server?.id) await api(`/api/servers/${server.id}`, { method: 'PUT', body: form });
      else await api('/api/servers', { method: 'POST', body: form });
      onSaved(server ? 'Server updated' : 'Server registered');
      onOpenChange(false);
    } catch (e) { setError(e.message); }
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{server ? 'Edit server' : 'Register server'}</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={f('name')} placeholder="My survival server" />
            </div>
            <div className="space-y-1.5">
              <Label>Server folder</Label>
              <div className="flex gap-2">
                <Input value={form.dir} onChange={f('dir')} placeholder="C:\Servers\My Server" className="flex-1" />
                <Button variant="glass" size="sm" type="button" onClick={() => setFsOpen(true)}>
                  <FolderOpen className="h-3.5 w-3.5" />
                  Browse…
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Server jar</Label>
              <select
                className="flex h-9 w-full items-center rounded-md border border-input bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                value={form.jar}
                onChange={f('jar')}
              >
                {jars.length === 0 && <option value="">— pick the folder first —</option>}
                {jars.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Java args</Label>
              <Input value={form.javaArgs} onChange={f('javaArgs')} placeholder="-Xmx4G -Xms4G" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>MC version (optional)</Label>
                <Input value={form.mcVersion} onChange={f('mcVersion')} placeholder="1.21.1" />
              </div>
              <div className="space-y-1.5">
                <Label>Worlds (for backups)</Label>
                <Input value={form.worlds} onChange={f('worlds')} placeholder="world, world_nether" />
              </div>
            </div>
            {error && <p className="text-xs text-status-error">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="glass" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="default" onClick={save}>Save</Button>
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
            const guess = j.find(x => /spigot|paper|purpur|server|bukkit|fabric|forge/i.test(x)) || j[0];
            setForm(f => ({ ...f, jar: guess }));
          }
        }}
      />
    </>
  );
}

function CreateServerModal({ open, onOpenChange, onCreated }) {
  const api = useApi();
  const [form, setForm] = useState({ name: '', type: 'paper', mcVersion: '', parentDir: '', javaArgs: '-Xmx4G -Xms4G', eula: false });
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setError(''); loadVersions('paper'); }
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
    if (!form.eula) { setError('You must accept the Minecraft EULA'); return; }
    setLoading(true); setError('');
    try {
      await api('/api/create', { method: 'POST', body: form });
      onCreated('Server created');
      onOpenChange(false);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const f = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(p => ({ ...p, [k]: v }));
    if (k === 'type') loadVersions(e.target.value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create a new server</DialogTitle></DialogHeader>
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-muted-foreground">Lodestone downloads the server jar for you and accepts the Minecraft EULA. A new folder is created inside the parent folder you choose.</p>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={f('name')} placeholder="My new server" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50" value={form.type} onChange={f('type')}>
                <option value="paper">Paper (plugins)</option>
                <option value="purpur">Purpur (plugins)</option>
                <option value="fabric">Fabric (mods)</option>
                <option value="vanilla">Vanilla</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Minecraft version</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50" value={form.mcVersion} onChange={f('mcVersion')}>
                {versions.length === 0 && <option value="">loading…</option>}
                {versions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Parent folder</Label>
            <div className="flex gap-2">
              <Input value={form.parentDir} onChange={f('parentDir')} placeholder="C:\Servers" className="flex-1" />
              <Button variant="glass" size="sm" type="button" onClick={async () => {
                const data = await api(`/api/pick-folder?defaultPath=${encodeURIComponent(form.parentDir)}`);
                if (data?.path) setForm(f => ({ ...f, parentDir: data.path }));
              }}>
                <FolderOpen className="h-3.5 w-3.5" />Browse…
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Java args</Label>
            <Input value={form.javaArgs} onChange={f('javaArgs')} placeholder="-Xmx4G -Xms4G" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.eula} onChange={f('eula')} className="accent-primary" />
            <span className="text-muted-foreground">I accept the <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer" className="text-primary hover:underline">Minecraft EULA</a></span>
          </label>
          {error && <p className="text-xs text-status-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="default" onClick={create} disabled={loading}>
            {loading ? 'Downloading…' : 'Download & create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ServersView({ onSetActive, onRefresh }) {
  const api = useApi();
  const { servers, activeServerId, statuses } = useServer();
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
        toast.success('Server removed');
        onRefresh?.();
      }
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Registered servers</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create new
            </Button>
            <Button variant="glass" size="sm" onClick={() => { setEditServer(null); setRegisterOpen(true); }}>
              + Register existing
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            The <strong className="text-foreground">active</strong> server is the one Console, Players, Plugins, Configs and Backups act on.
          </p>
          {servers.length === 0 ? (
            <EmptyState message="No servers registered yet. Click Create new or Register existing." />
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 text-left">Server</th>
                    <th className="py-2 text-left">Status</th>
                    <th className="py-2 text-left">Players</th>
                    <th className="py-2 text-left hidden sm:table-cell">Uptime</th>
                    <th className="py-2 text-left hidden sm:table-cell">Version</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map(s => {
                    const st = statuses[s.id] || s.status || { status: 'offline', playerCount: 0, maxPlayers: 0 };
                    const running = st.status !== 'offline';
                    const isActive = s.id === activeServerId;
                    return (
                      <tr key={s.id} className={cn('border-b border-border/50 last:border-0 transition-colors', isActive && 'bg-primary/5')}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted/30">
                              <span className="text-muted-foreground">▣</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 font-medium text-foreground">
                                <span className="hover:text-primary cursor-pointer" onClick={() => onSetActive(s.id)}>
                                  {s.name}
                                </span>
                                {isActive && <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/25">active</span>}
                              </div>
                              <div className="text-xs text-muted-foreground/70 font-mono truncate max-w-[180px]">{s.dir || ''}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4"><StatusPill status={st.status} /></td>
                        <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                          {running ? `${st.playerCount}/${st.maxPlayers || '?'}` : '—'}
                        </td>
                        <td className="py-3 pr-4 hidden sm:table-cell tabular-nums text-muted-foreground">
                          {running ? (fmtUptime(st.uptimeMs) || '0m') : '—'}
                        </td>
                        <td className="py-3 pr-4 hidden sm:table-cell text-muted-foreground">{s.mcVersion || '—'}</td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-xs" title="Start" disabled={running} onClick={() => action('start', s)}><Play className="h-3.5 w-3.5 text-status-online" /></Button>
                            <Button variant="ghost" size="icon-xs" title="Restart" onClick={() => action('restart', s)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon-xs" title="Stop" disabled={!running} onClick={() => action('stop', s)}><Square className="h-3.5 w-3.5 text-status-error" /></Button>
                            <Button variant="ghost" size="icon-xs" title="Set active" disabled={isActive} onClick={() => action('active', s)}><Star className={cn('h-3.5 w-3.5', isActive && 'text-primary fill-primary')} /></Button>
                            <Button variant="ghost" size="icon-xs" title="Edit" onClick={() => { setEditServer(s); setRegisterOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon-xs" title="Remove" onClick={() => setConfirmDelete(s)}><Trash2 className="h-3.5 w-3.5 text-status-error" /></Button>
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
            <DialogHeader><DialogTitle>Remove server</DialogTitle></DialogHeader>
            <p className="px-5 py-3 text-sm text-muted-foreground">Remove <strong className="text-foreground">"{confirmDelete.name}"</strong> from the panel? Server files are <em>not</em> deleted.</p>
            <DialogFooter>
              <Button variant="glass" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { action('delete', confirmDelete); setConfirmDelete(null); }}>Remove</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
