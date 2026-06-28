import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { useServer } from '@/context/ServerContext';
import { toast } from 'sonner';
import { Search, Download, Check } from 'lucide-react';

// Detect whether a given jar name targets a mod loader. Mirrors the server's
// `detectCompat` so we can decide tab visibility before the first API call.
function jarIsModLoader(jar) {
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
