import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { useServer } from '@/context/ServerContext';
import { toast } from 'sonner';
import { Search, Download, Check, ExternalLink, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

const MOD_SOURCE = { MODRINTH: 'modrinth', CURSEFORGE: 'curseforge' };

// Detect whether a given jar name targets a mod loader. Mirrors the server's
// `detectCompat` so we can decide tab visibility before the first API call.
function jarIsModLoader(jar) {
  const j = String(jar || '').toLowerCase();
  return /fabric|quilt|neoforge|forge/.test(j) && !/paper|spigot|bukkit|vanilla|minecraft_server/.test(j);
}

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v >= 1024 * 1024) return `${(v / 1048576).toFixed(1)} MB`;
  if (v >= 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${v} B`;
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
  const [installing, setInstalling] = useState({});

  async function search() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, sort, category, projectType });
      const data = await api(`/api/modrinth/search?${params.toString()}`);
      setNote(data.note || '');
      if (data.categories && !categories.length) setCategories(data.categories);
      setResults(data.hits || []);
    } catch (e) { toast.error(e.message); }
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

      {loading && <p className="text-sm text-muted-foreground">{t('modrinth.loading')}</p>}
      {!loading && results.length === 0 && (
        <p className="text-sm text-muted-foreground italic">{note || t('modrinth.empty')}</p>
      )}
      {!loading && (
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

function CurseForgeBrowser({ compat }) {
  const api = useApi();
  const t = useT();
  const [input, setInput] = useState('');
  const [project, setProject] = useState(null);
  const [loader, setLoader] = useState('');
  const [mcVersion, setMcVersion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Default the loader filter to the active server's loader (if it's a mod
  // loader). Leave empty on non-mod servers - the user can still pick one
  // and browse, they just won't have an installable jar.
  useEffect(() => {
    if (compat?.canMods && compat.loaders?.length) {
      const l = compat.loaders[0];
      setLoader(l === 'quilt' ? 'quilt' : l);
    } else {
      setLoader('fabric');
    }
  }, [compat?.canMods, compat?.loaders?.join(',')]);

  async function fetchProject(value) {
    const id = String(value || '').trim();
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (loader) params.set('loader', loader);
      if (mcVersion) params.set('version', mcVersion);
      const qs = params.toString();
      const data = await api(`/api/curseforge/mod/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`);
      setProject(data);
    } catch (e) {
      setError(e.message);
      setProject(null);
    }
    setLoading(false);
  }

  function onSubmit(e) {
    e.preventDefault();
    fetchProject(input);
  }

  // When the user changes the loader / MC filter and we already have a
  // project loaded, re-fetch with the new filter so the file list narrows.
  useEffect(() => {
    if (project?.id) fetchProject(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader, mcVersion]);

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">{t('modrinth.cfInputLabel')}</label>
        <div className="flex flex-wrap gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={t('modrinth.cfInputPlaceholder')}
            className="flex-1 min-w-48"
          />
          <Button type="submit" variant="default" size="sm" disabled={loading || !input.trim()}>
            <Search className="h-3.5 w-3.5" />
            {t('modrinth.cfFetch')}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/70">{t('modrinth.cfInputHelp')}</p>
      </form>

      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">{t('modrinth.cfLoaderLabel')}</label>
          <select
            className="h-8 rounded-md border border-input bg-background/60 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50"
            value={loader}
            onChange={e => setLoader(e.target.value)}
          >
            <option value="fabric">Fabric</option>
            <option value="forge">Forge</option>
            <option value="neoforge">NeoForge</option>
            <option value="quilt">Quilt</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">{t('modrinth.cfVersionLabel')}</label>
          <select
            className="h-8 rounded-md border border-input bg-background/60 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50"
            value={mcVersion}
            onChange={e => setMcVersion(e.target.value)}
            disabled={!project?.versions?.length}
          >
            <option value="">{t('modrinth.cfVersionAll')}</option>
            {(project?.versions || []).map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {error}
        </div>
      )}

      {!project && !loading && !error && (
        <p className="text-sm text-muted-foreground italic">{t('modrinth.cfEmpty')}</p>
      )}

      {project && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-secondary/20 p-4 flex gap-4">
            {project.thumbnail && (
              <img src={project.thumbnail} alt="" className="h-16 w-16 rounded shrink-0 object-cover bg-background/60"
                onError={e => { e.target.style.visibility = 'hidden'; }} />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={project.urls?.curseforge || `https://www.curseforge.com/minecraft/mc-mods/${project.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-sm text-foreground hover:text-primary inline-flex items-center gap-1"
                >
                  {project.title}
                  <ExternalLink className="h-3 w-3" />
                </a>
                {project.downloads?.total != null && (
                  <span className="text-[11px] text-muted-foreground/70">
                    {t('modrinth.cfStatsDownloads', { n: Number(project.downloads.total).toLocaleString() })}
                  </span>
                )}
              </div>
              {(project.summary || project.description) && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-line">
                  {(project.summary || project.description).slice(0, 280)}
                </p>
              )}
              <div className="text-[11px] text-muted-foreground/70 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {project.loaders?.length > 0 && (
                  <span>Loaders: {project.loaders.join(', ')}</span>
                )}
                {project.versions?.length > 0 && (
                  <span>{t('modrinth.cfSupports', { list: project.versions.slice(0, 8).join(', ') + (project.versions.length > 8 ? '…' : '') })}</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-status-warn/30 bg-status-warn/5 px-3 py-2 text-xs text-status-warn/90">
            {t('modrinth.cfDownloadHint')}
          </div>

          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {t('modrinth.cfFilesTitle')}
            </h4>
            {(!project.files || project.files.length === 0) ? (
              <p className="text-sm text-muted-foreground italic">{t('modrinth.cfNoFiles')}</p>
            ) : (
              <div className="space-y-1.5">
                {project.files.slice(0, 40).map(f => (
                  <div key={f.id} className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/15 px-3 py-2">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{f.display || f.name}</div>
                      <div className="text-[11px] text-muted-foreground/70">
                        {formatBytes(f.filesize)} · {f.type} · {f.version} · {Array.isArray(f.loaders) ? f.loaders.join('/') : ''}
                      </div>
                    </div>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer" className="shrink-0">
                        <Button variant="glass" size="sm" asChild>
                          <span className="inline-flex items-center gap-1.5">
                            <ExternalLink className="h-3 w-3" />
                            {t('modrinth.cfViewOnCurseForge')}
                          </span>
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModsTab({ compat, serverLabel, onInstalled }) {
  const t = useT();
  const [source, setSource] = useState(MOD_SOURCE.MODRINTH);

  if (!compat?.canMods) {
    return (
      <div className="rounded-lg border border-border/60 bg-secondary/15 p-5 text-sm text-muted-foreground">
        {t('modrinth.tabModsDisabledBody', { label: serverLabel || compat?.label || 'this server' })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Source</label>
        <select
          className="h-8 rounded-md border border-input bg-background/60 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50"
          value={source}
          onChange={e => setSource(e.target.value)}
        >
          <option value={MOD_SOURCE.MODRINTH}>{t('modrinth.sourceModrinth')}</option>
          <option value={MOD_SOURCE.CURSEFORGE}>{t('modrinth.sourceCurseForge')}</option>
        </select>
      </div>
      {source === MOD_SOURCE.MODRINTH && (
        <ModrinthResults compat={compat} projectType="mod" onInstalled={onInstalled} />
      )}
      {source === MOD_SOURCE.CURSEFORGE && (
        <CurseForgeBrowser compat={compat} />
      )}
    </div>
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
    const canMods = jarIsModLoader(jar);
    const projectType = canMods ? 'mod' : 'plugin';
    const folder = canMods ? 'mods' : 'plugins';
    const label = canMods
      ? (jar.toLowerCase().includes('fabric') ? 'Fabric'
        : jar.toLowerCase().includes('quilt') ? 'Quilt'
        : jar.toLowerCase().includes('neoforge') ? 'NeoForge'
        : 'Forge')
      : (jar.toLowerCase().includes('paper') ? 'Paper'
        : jar.toLowerCase().includes('spigot') ? 'Spigot'
        : jar.toLowerCase().includes('bukkit') ? 'Bukkit'
        : jar.toLowerCase().includes('vanilla') || jar.toLowerCase().includes('minecraft_server') ? 'Vanilla'
        : 'Paper/Spigot');
    let loaders = ['paper', 'spigot', 'bukkit'];
    if (canMods) {
      const j = jar.toLowerCase();
      if (j.includes('fabric')) loaders = ['fabric'];
      else if (j.includes('quilt')) loaders = ['quilt', 'fabric'];
      else if (j.includes('neoforge')) loaders = ['neoforge'];
      else if (j.includes('forge')) loaders = ['forge'];
    }
    return { projectType, loaders, folder, label, mcVersion: activeServer.mcVersion || '', canMods };
  }, [activeServer]);

  const [tab, setTab] = useState('plugins');

  // When the user switches to a non-mod server, make sure we don't leave the
  // view pinned to a disabled tab. Switching back to a mod server keeps the
  // user's last tab if it's still available.
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
          </TabsList>
          <TabsContent value="plugins">
            <ModrinthResults compat={compat} projectType="plugin" />
          </TabsContent>
          <TabsContent value="mods">
            <ModsTab compat={compat} serverLabel={compat?.label} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
