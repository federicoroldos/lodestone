import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { useServer } from '@/context/ServerContext';
import { osExamplePath } from '@/lib/utils';
import { toast } from 'sonner';
import { Search, Download, Check, FolderOpen, Package } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { ModrinthResultSkeleton } from '@/components/shared/Skeletons';

function jarIsModLoader(jar, loader) {
  const l = String(loader || '').toLowerCase();
  if (['fabric', 'quilt', 'neoforge', 'forge'].includes(l)) return true;
  const j = String(jar || '').toLowerCase();
  return /fabric|quilt|neoforge|forge/.test(j) && !/paper|spigot|bukkit|vanilla|minecraft_server/.test(j);
}

function ModrinthResults({ compat, projectType, onInstalled }) {
  const api = useApi();
  const t = useT();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('downloads');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [results, setResults] = useState([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState({});

  async function search() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ q, sort, category, projectType });
      const data = await api(`/api/modrinth/search?${params.toString()}`);
      setNote(data.note || '');
      if (data.categories && !categories.length) setCategories(data.categories);
      setResults(data.hits || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { search(); }, [projectType]);
  useEffect(() => { search(); }, [sort, category]);

  async function install(projectId) {
    setInstalling(p => ({ ...p, [projectId]: 'finding' }));
    try {
      const { matched } = await api(`/api/modrinth/versions/${encodeURIComponent(projectId)}`);
      const version = matched?.[0];
      if (!version) {
        toast.error(t('modrinth.noCompatibleVersion'));
        setInstalling(p => ({ ...p, [projectId]: null }));
        return;
      }
      setInstalling(p => ({ ...p, [projectId]: 'downloading' }));
      const r = await api('/api/modrinth/install', { method: 'POST', body: { versionId: version.id } });
      toast.success(t('modrinth.installedToast', { name: r.name }));
      setInstalling(p => ({ ...p, [projectId]: 'done' }));
      onInstalled?.();
    } catch (e) {
      toast.error(e.message);
      setInstalling(p => ({ ...p, [projectId]: null }));
    }
  }

  const compatText = compat?.projectType
    ? `${compat.label} · ${projectType === 'mod' ? t('modrinth.compatMod') : t('modrinth.compatPlugin')}${compat.mcVersion ? ' · ' + compat.mcVersion : ''}`
    : note || t('modrinth.compatNone');

  return (
    <>
      <form onSubmit={e => { e.preventDefault(); search(); }} className="flex flex-wrap gap-2 mb-5">
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t('modrinth.searchPlaceholder')} className="flex-1" />
        </div>
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
        <select
          className="h-9 rounded-md border border-input bg-background/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          <option value="">{t('modrinth.allCategories')}</option>
          {categories.map(c => (
            <option key={c} value={c}>{c.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase())}</option>
          ))}
        </select>
        <Button type="submit" variant="default">
          <Search className="h-3.5 w-3.5" />
          {t('modrinth.search')}
        </Button>
      </form>

      {loading ? (
        <div className="space-y-2">
          <ModrinthResultSkeleton />
          <ModrinthResultSkeleton />
          <ModrinthResultSkeleton />
        </div>
      ) : error && !results.length ? (
        <ErrorState error={error} onRetry={search} />
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{note || t('modrinth.empty')}</p>
      ) : (
        <div className="space-y-2">
          {results.map(h => {
            const state = installing[h.project_id || h.slug];
            return (
              <div key={h.project_id || h.slug} className="flex items-center gap-3 rounded-lg border border-border/60 bg-secondary/20 p-3 hover:bg-secondary/40 transition-colors">
                {h.icon_url && (
                  <img src={h.icon_url} alt="" className="h-12 w-12 rounded shrink-0 object-cover"
                    onError={e => { e.target.style.visibility = 'hidden'; }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-foreground truncate">{h.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{(h.description || '').slice(0, 140)}</div>
                  <div className="text-xs text-muted-foreground/60 mt-1">
                    ⬇ {Number(h.downloads).toLocaleString()} · ♥ {Number(h.follows || 0).toLocaleString()} · {h.author || ''}
                  </div>
                </div>
                <Button
                  variant={state === 'done' ? 'glass' : 'default'}
                  size="sm"
                  disabled={!!state}
                  onClick={() => install(h.project_id || h.slug)}
                  className="shrink-0"
                >
                  {state === 'done' ? <><Check className="h-3.5 w-3.5" />{t('modrinth.installed')}</> :
                   state ? <>{t('modrinth.installing')}</> :
                   <><Download className="h-3.5 w-3.5" />{t('modrinth.install')}</>}
                </Button>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground/70 pt-1">{compatText}</p>
        </div>
      )}
    </>
  );
}

function ModsTab({ compat, serverLabel, onInstalled }) {
  const t = useT();

  if (!compat?.canMods) {
    return (
      <div className="rounded-lg border border-border/60 bg-secondary/15 p-5 text-sm text-muted-foreground">
        {t('modrinth.tabModsDisabledBody', { label: serverLabel || compat?.label || 'this server' })}
      </div>
    );
  }

  return <ModrinthResults compat={compat} projectType="mod" onInstalled={onInstalled} />;
}

function ModpacksInstallDialog({ open, onOpenChange, projectId, compat, onInstalled }) {
  const api = useApi();
  const t = useT();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null);
  const [name, setName] = useState('');
  const [parentDir, setParentDir] = useState('');
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    setError('');
    setPreview(null);
    setMode(null);
    setInstalling(false);
    loadPreview(projectId);
  }, [open, projectId]);

  async function loadPreview(pid) {
    try {
      const { matched } = await api(`/api/modrinth/modpack/versions/${encodeURIComponent(pid)}`);
      const version = matched?.[0];
      if (!version) {
        setError(t('modrinth.noCompatibleVersion'));
        setLoading(false);
        return;
      }
      const data = await api(`/api/modrinth/modpack/preview/${encodeURIComponent(version.id)}`);
      setPreview(data);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function installModpack(installMode) {
    if (!preview) return;
    setInstalling(true);
    try {
      const body = { versionId: preview.versionId, mode: installMode };
      if (installMode === 'create') {
        body.name = name;
        body.parentDir = parentDir;
        if (!body.name.trim()) { toast.error(t('modrinth.modpackCreateName')); setInstalling(false); return; }
        if (!body.parentDir.trim()) { toast.error(t('modrinth.modpackCreateFolder')); setInstalling(false); return; }
      }
      const r = await api('/api/modrinth/modpack/install', { method: 'POST', body });
      if (installMode === 'create') {
        toast.success(t('modrinth.modpackCreated', { name: name || r.name }));
      } else {
        toast.success(t('modrinth.installedToast', { name: r.name }));
      }
      onOpenChange(false);
      onInstalled?.();
    } catch (e) {
      toast.error(e.message);
    }
    setInstalling(false);
  }

  async function pickFolder() {
    try {
      const data = await api(`/api/pick-folder?defaultPath=${encodeURIComponent(parentDir)}`);
      if (data?.path) setParentDir(data.path);
    } catch (e) { toast.error(e.message); }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('modrinth.modpacksTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          ) : null}
          {!loading && error && <p className="text-sm text-red-400">{error}</p>}
          {preview && preview.unsupported && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
              {t('modrinth.modpackUnsupportedToast', { loader: preview.loaderType || 'unknown' })}
            </div>
          )}
          {preview && !preview.unsupported && (
            <>
              <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-1">
                <p className="text-sm font-semibold text-foreground">{preview.name || preview.indexName}</p>
                <p className="text-xs text-muted-foreground">
                  {preview.loaderType && (
                    <span className="inline-block bg-primary/15 text-primary px-1.5 py-0.5 rounded text-[11px] font-medium mr-1">
                      {preview.loaderType}
                    </span>
                  )}
                  {preview.mcVersion && (
                    <span className="inline-block bg-secondary px-1.5 py-0.5 rounded text-[11px] mr-1">
                      MC {preview.mcVersion}
                    </span>
                  )}
                  {t('modrinth.modpackReady', { name: `${preview.serverFileCount}` })}
                </p>
                <p className="text-[11px] text-muted-foreground">{preview.serverFileCount} files · {preview.loaderVersion && `loader ${preview.loaderVersion}`}</p>
              </div>

              <div className="space-y-3">
                <div className="rounded-md border border-border/60 bg-secondary/10 p-3">
                  <p className="text-xs text-muted-foreground mb-2">{t('modrinth.modpackExisting')}</p>
                  {preview.eligibleExisting ? (
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full"
                      disabled={installing}
                      onClick={() => installModpack('existing')}
                    >
                      {installing ? t('modrinth.installing') : t('modrinth.install')}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">{t('modrinth.modpackNotEligible')}</p>
                  )}
                </div>

                <div className="rounded-md border border-border/60 bg-secondary/10 p-3">
                  <p className="text-xs text-muted-foreground mb-2">{t('modrinth.modpackCreate')}</p>
                  {mode === 'create' ? (
                    <div className="space-y-2">
                      <Input
                        placeholder={t('modrinth.modpackCreateName')}
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Input
                          placeholder={osExamplePath('parent')}
                          value={parentDir}
                          onChange={e => setParentDir(e.target.value)}
                          className="flex-1 h-8 text-sm"
                        />
                        <Button variant="glass" size="sm" onClick={pickFolder} className="h-8 shrink-0">
                          <FolderOpen className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setMode(null)} className="flex-1">
                          {t('common.cancel')}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1"
                          disabled={installing || !name.trim() || !parentDir.trim()}
                          onClick={() => installModpack('create')}
                        >
                          {installing ? t('modrinth.installing') : t('modrinth.modpackCreate')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setMode('create')}
                    >
                      {t('modrinth.modpackCreate')}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModpacksTab({ compat, onInstalled }) {
  const api = useApi();
  const t = useT();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('downloads');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  async function search() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ q, sort, projectType: 'modpack' });
      const data = await api(`/api/modrinth/search?${params.toString()}`);
      setResults(data.hits || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { search(); }, []);
  useEffect(() => { search(); }, [sort]);

  function openInstall(projectId) {
    setSelectedProjectId(projectId);
    setDialogOpen(true);
  }

  return (
    <>
      <form onSubmit={e => { e.preventDefault(); search(); }} className="flex flex-wrap gap-2 mb-5">
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t('modrinth.searchPlaceholder')} className="flex-1" />
        </div>
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

      {loading ? (
        <div className="space-y-2">
          <ModrinthResultSkeleton />
          <ModrinthResultSkeleton />
          <ModrinthResultSkeleton />
        </div>
      ) : error && !results.length ? (
        <ErrorState error={error} onRetry={search} />
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{t('modrinth.empty')}</p>
      ) : (
        <div className="space-y-2">
          {results.map(h => (
            <div key={h.project_id || h.slug} className="flex items-center gap-3 rounded-lg border border-border/60 bg-secondary/20 p-3 hover:bg-secondary/40 transition-colors">
              {h.icon_url && (
                <img src={h.icon_url} alt="" className="h-12 w-12 rounded shrink-0 object-cover"
                  onError={e => { e.target.style.visibility = 'hidden'; }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-foreground truncate">{h.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{(h.description || '').slice(0, 140)}</div>
                <div className="text-xs text-muted-foreground/60 mt-1">
                  ⬇ {Number(h.downloads).toLocaleString()} · ♥ {Number(h.follows || 0).toLocaleString()} · {h.author || ''}
                </div>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => openInstall(h.project_id || h.slug)}
                className="shrink-0"
              >
                <Package className="h-3.5 w-3.5" />
                {t('modrinth.install')}
              </Button>
            </div>
          ))}
        </div>
      )}

      <ModpacksInstallDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={selectedProjectId}
        compat={compat}
        onInstalled={onInstalled}
      />
    </>
  );
}

export function ModrinthView() {
  const t = useT();
  const { servers, activeServerId } = useServer();

  const activeServer = useMemo(
    () => servers.find(s => s.id === activeServerId) || null,
    [servers, activeServerId]
  );
  const compat = useMemo(() => {
    if (!activeServer) return null;
    const jar = activeServer.jar || '';
    const loader = (activeServer.loader || '').toLowerCase();
    const canMods = jarIsModLoader(jar, loader);
    const projectType = canMods ? 'mod' : 'plugin';
    const folder = canMods ? 'mods' : 'plugins';
    const label = canMods
      ? (loader === 'fabric' || jar.toLowerCase().includes('fabric') ? 'Fabric'
        : loader === 'quilt' || jar.toLowerCase().includes('quilt') ? 'Quilt'
        : loader === 'neoforge' || jar.toLowerCase().includes('neoforge') ? 'NeoForge'
        : 'Forge')
      : (jar.toLowerCase().includes('paper') ? 'Paper'
        : jar.toLowerCase().includes('spigot') ? 'Spigot'
        : jar.toLowerCase().includes('bukkit') ? 'Bukkit'
        : jar.toLowerCase().includes('vanilla') || jar.toLowerCase().includes('minecraft_server') ? 'Vanilla'
        : 'Paper/Spigot');
    let loaders = ['paper', 'spigot', 'bukkit'];
    if (canMods) {
      const j = jar.toLowerCase();
      if (loader === 'fabric' || j.includes('fabric')) loaders = ['fabric'];
      else if (loader === 'quilt' || j.includes('quilt')) loaders = ['quilt', 'fabric'];
      else if (loader === 'neoforge' || j.includes('neoforge')) loaders = ['neoforge'];
      else if (loader === 'forge' || j.includes('forge')) loaders = ['forge'];
    }
    return { projectType, loaders, folder, label, mcVersion: activeServer.mcVersion || '', canMods };
  }, [activeServer]);

  const [tab, setTab] = useState('plugins');

  useEffect(() => {
    if (!compat?.canMods && tab === 'mods') setTab('plugins');
  }, [compat?.canMods, tab]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('modrinth.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="plugins">{t('modrinth.tabPlugins')}</TabsTrigger>
            <TabsTrigger value="mods" disabled={!compat?.canMods}>
              {compat?.canMods ? t('modrinth.tabMods') : t('modrinth.tabModsDisabled')}
            </TabsTrigger>
            <TabsTrigger value="modpacks">{t('modrinth.tabModpacks')}</TabsTrigger>
          </TabsList>
          <TabsContent value="plugins">
            <ModrinthResults compat={compat} projectType="plugin" />
          </TabsContent>
          <TabsContent value="mods">
            <ModsTab compat={compat} serverLabel={compat?.label} />
          </TabsContent>
          <TabsContent value="modpacks">
            <ModpacksTab compat={compat} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
