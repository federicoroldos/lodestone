import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useServer } from '@/context/ServerContext';
import { useI18n, useT } from '@/context/I18nContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useApi } from '@/hooks/useApi';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LoginView } from '@/views/LoginView';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ControlBar } from '@/components/layout/ControlBar';
import { FirstStartDialog } from '@/components/shared/FirstStartDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DashboardView } from '@/views/DashboardView';
import { ServersView } from '@/views/ServersView';
import { MetricsView } from '@/views/MetricsView';
import { ConsoleView } from '@/views/ConsoleView';
import { PlayersView } from '@/views/PlayersView';
import { MapView } from '@/views/MapView';
import { PluginsView } from '@/views/PluginsView';
import { ModrinthView } from '@/views/ModrinthView';
import { FileManagerView } from '@/views/FileManagerView';
import { ConfigsView } from '@/views/ConfigsView';
import { BackupsView } from '@/views/BackupsView';
import { TasksView } from '@/views/TasksView';
import { UsersView } from '@/views/UsersView';
import { viewToPath, pathToView } from '@/lib/routes';

// Views that touch the server's on-disk content (plugins, mods, configs, files).
// Navigating into any of them while the active server has never been started
// triggers the "Start the server first" prompt so mods/plugins install into a
// fully generated folder tree instead of a half-empty one.
const CONTENT_VIEWS = ['plugins', 'modrinth', 'files', 'configs'];

// Views that are meaningless without at least one registered server: every one
// of them reads a server's status, files, or config. With zero servers they are
// blocked (the sidebar greys them out and direct URLs bounce to Servers).
const SERVER_REQUIRED_VIEWS = new Set([
  'metrics', 'console', 'players', 'map',
  'plugins', 'modrinth', 'files', 'configs',
  'backups', 'tasks',
]);

// Views only admins may open.
const ADMIN_VIEWS = new Set(['users']);

function initialView() {
  return pathToView(window.location.pathname) || 'dashboard';
}

function dismissedKey(serverId) {
  return `ls-fs-dismissed:${serverId || ''}`;
}

function isDismissed(serverId) {
  if (!serverId) return false;
  try { return sessionStorage.getItem(dismissedKey(serverId)) === '1'; }
  catch (_) { return false; }
}

function markDismissed(serverId) {
  if (!serverId) return;
  try { sessionStorage.setItem(dismissedKey(serverId), '1'); } catch (_) {}
}

function AppShell({ onLoggedIn }) {
  const { token, user, setUser, isLoggedIn } = useAuth();
  const { servers, setServers, activeServerId, setActiveServerId, getServerStatus, updateStatus, wsRef } = useServer();
  const api = useApi();
  const t = useT();

  const [currentView, setCurrentView] = useState(initialView);
  const [serversLoaded, setServersLoaded] = useState(false);
  const [consoleLines, setConsoleLines] = useState([]);
  const [connState, setConnState] = useState('connecting');

  const isAdmin = user?.role === 'admin';

  // Push (or replace) the URL so it matches the shown view. Pushing adds a
  // history entry so Back/Forward (and the mouse back button) can return here.
  const syncUrl = useCallback((view, replace = false) => {
    const path = viewToPath(view);
    if (window.location.pathname === path) return;
    if (replace) window.history.replaceState({ view }, '', path);
    else window.history.pushState({ view }, '', path);
  }, []);

  // Bumped whenever the active server transitions to "online" after a
  // first-start prompt, so the current view re-mounts and re-fetches its data
  // (the auto-generated files only exist once the server is fully up).
  const [viewNonce, setViewNonce] = useState(0);
  const [firstStart, setFirstStart] = useState({ open: false, pendingView: null, starting: false });
  const [confirmRestart, setConfirmRestart] = useState(false);
  const awaitingFirstStart = useRef(false);

  // Central navigation entry point. Applies the no-server, admin, and
  // first-start guards, then shows the view and updates the URL.
  const goTo = useCallback((view, { fromHistory = false } = {}) => {
    // Block server-only sections until at least one server exists.
    if (SERVER_REQUIRED_VIEWS.has(view) && serversLoaded && servers.length === 0) {
      toast.error(t('nav.requiresServerToast'));
      setCurrentView('servers');
      syncUrl('servers', true);
      return;
    }
    // Block admin-only sections for non-admins.
    if (ADMIN_VIEWS.has(view) && user && !isAdmin) {
      setCurrentView('dashboard');
      syncUrl('dashboard', true);
      return;
    }
    // First-start prompt for content views on a never-started server. Only on
    // in-app navigation; on Back/Forward we just show the page (the URL already
    // moved, and the prompt is still reachable from the section itself).
    if (!fromHistory && CONTENT_VIEWS.includes(view)) {
      const active = servers.find(s => s.id === activeServerId);
      const generated = !active || active.hasGenerated || isDismissed(active.id);
      const live = active ? getServerStatus(active.id) : null;
      const online = !!(live && live.status && live.status !== 'offline');
      if (active && !generated && !online) {
        setFirstStart({ open: true, pendingView: view, starting: false });
        return;
      }
    }
    setCurrentView(view);
    syncUrl(view, fromHistory);
  }, [serversLoaded, servers, activeServerId, user, isAdmin, getServerStatus, syncUrl, t]);

  const navigate = useCallback((view) => goTo(view), [goTo]);

  // Commit to a view unconditionally (used once the first-start dialog resolves).
  const commitView = useCallback((view) => {
    setCurrentView(view);
    syncUrl(view, false);
  }, [syncUrl]);

  // Browser Back/Forward and the mouse back button fire popstate; mirror the URL
  // back into the shown view (re-running the same guards).
  useEffect(() => {
    const onPop = () => goTo(pathToView(window.location.pathname) || 'dashboard', { fromHistory: true });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [goTo]);

  // Normalize the URL to the initial view once on mount (e.g. an unknown path
  // collapses to '/'), seeding a history entry so the first Back works.
  useEffect(() => {
    syncUrl(currentView, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once servers/user are known, bounce out of any view the current state no
  // longer allows (deleted the last server while on Console, opened /users as a
  // non-admin via a direct link, etc.).
  useEffect(() => {
    if (!serversLoaded) return;
    if (SERVER_REQUIRED_VIEWS.has(currentView) && servers.length === 0) {
      setCurrentView('servers');
      syncUrl('servers', true);
    } else if (ADMIN_VIEWS.has(currentView) && user && !isAdmin) {
      setCurrentView('dashboard');
      syncUrl('dashboard', true);
    }
  }, [serversLoaded, servers, currentView, user, isAdmin, syncUrl]);

  // Boot: load /api/me if we have a token but no user yet
  useEffect(() => {
    if (isLoggedIn && !user) {
      api('/api/me', { silent: true })
        .then(u => setUser(u))
        .catch(() => {});
    }
  }, [isLoggedIn]);

  // Load initial data on mount
  useEffect(() => {
    if (!isLoggedIn) return;
    loadServers();
  }, [isLoggedIn]);

  async function loadServers() {
    try {
      const data = await api('/api/servers');
      const srvs = data.servers || [];
      setServers(srvs);
      if (!activeServerId || !srvs.some(s => s.id === activeServerId)) {
        const id = data.activeServerId || srvs[0]?.id || null;
        setActiveServerId(id);
      }
      const act = srvs.find(s => s.id === (activeServerId || data.activeServerId || srvs[0]?.id));
      if (act?.status) updateStatus(act.status);
    } catch (e) { toast.error(e.message); }
    finally { setServersLoaded(true); }
  }

  // WebSocket
  const { sendMessage } = useWebSocket({
    onLine: useCallback((msg) => {
      if (msg.serverId !== activeServerId) return;
      setConsoleLines(prev => [...prev, msg.line].slice(-1200));
    }, [activeServerId]),
    onHistory: useCallback((msg) => {
      if (msg.serverId !== activeServerId) return;
      setConsoleLines(msg.lines || []);
    }, [activeServerId]),
    onStatus: useCallback((msg) => {
      if (!msg) return;
      updateStatus(msg);
      if (msg.serverId === activeServerId && msg.status === 'online' && awaitingFirstStart.current) {
        awaitingFirstStart.current = false;
        setViewNonce(n => n + 1);
        toast.success(t('firstStart.onlineToast'));
        loadServers();
      }
    }, [activeServerId, updateStatus, t]),
    onStats: useCallback((stats) => {
      // Pass to dashboard if it's the active listener
      if (window.__dashOnStats) window.__dashOnStats(stats);
    }, []),
    onConnChange: setConnState,
  });

  async function handleSetActive(id) {
    if (!id || id === activeServerId) return;
    try {
      await api('/api/active', { method: 'POST', body: { serverId: id } });
      setActiveServerId(id);
      setConsoleLines([]);
      sendMessage({ type: 'getHistory', serverId: id });
      await loadServers();
      toast.success(t('header.restartSuccess'));
    } catch (e) { toast.error(e.message); }
  }

  async function runServerAction(action) {
    const endpoint = action === 'start' ? '/api/server/start' :
                     action === 'stop'  ? '/api/server/stop' :
                     '/api/server/restart';
    try {
      await api(endpoint, { method: 'POST' });
    } catch (e) { toast.error(e.message); }
  }

  function serverAction(action) {
    // Restart is disruptive (kicks everyone) — confirm with the app's own
    // dialog instead of the browser's native confirm box.
    if (action === 'restart') { setConfirmRestart(true); return; }
    runServerAction(action);
  }

  function handleCommand(cmd) {
    sendMessage({ type: 'command', cmd });
  }

  function closeFirstStart() {
    setFirstStart({ open: false, pendingView: null, starting: false });
  }

  async function startFromFirstStart() {
    if (!activeServerId) { closeFirstStart(); return; }
    markDismissed(activeServerId);
    setFirstStart(prev => ({ ...prev, starting: true }));
    awaitingFirstStart.current = true;
    const pendingView = firstStart.pendingView;
    try {
      await api('/api/server/start', { method: 'POST' });
      commitView(pendingView);
      closeFirstStart();
      toast(t('firstStart.startingToast'));
      loadServers();
    } catch (e) {
      awaitingFirstStart.current = false;
      toast.error(e.message);
      setFirstStart(prev => ({ ...prev, starting: false }));
    }
  }

  function continueFromFirstStart() {
    if (activeServerId) markDismissed(activeServerId);
    commitView(firstStart.pendingView);
    closeFirstStart();
  }

  const views = {
    dashboard: <DashboardView active={currentView === 'dashboard'} />,
    servers:   <ServersView onSetActive={handleSetActive} onRefresh={loadServers} />,
    metrics:   <MetricsView />,
    console:   <ConsoleView lines={consoleLines} onCommand={handleCommand} />,
    players:   <PlayersView />,
    map:       <MapView />,
    plugins:   <PluginsView />,
    modrinth:  <ModrinthView />,
    files:     <FileManagerView />,
    configs:   <ConfigsView />,
    backups:   <BackupsView />,
    tasks:     <TasksView />,
    users:     <UsersView />,
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="app-shell-enter relative flex min-h-screen bg-background">
        {/* Stone-tile texture behind every section */}
        <div
          className="pointer-events-none fixed inset-0 z-0 opacity-[0.05]"
          style={{
            backgroundImage: 'url(/resources/stone_tile.jpg)',
            backgroundRepeat: 'repeat',
            backgroundSize: '120px',
          }}
        />
        <Sidebar currentView={currentView} onNavigate={navigate} />
        <div className="relative z-10 flex min-h-screen flex-1 min-w-0 flex-col pl-[var(--ls-sidebar-w,220px)] transition-[padding] duration-200">
          <Header currentView={currentView} />
          <main className="flex-1 p-5 pb-28">
            <div className="view-enter" key={`${currentView}:${viewNonce}`}>
              {views[currentView] || null}
            </div>
          </main>
        </div>
      </div>
      <FirstStartDialog
        open={firstStart.open}
        onOpenChange={(o) => { if (!o) closeFirstStart(); }}
        serverName={servers.find(s => s.id === activeServerId)?.name}
        starting={firstStart.starting}
        onStartNow={startFromFirstStart}
        onContinueAnyway={continueFromFirstStart}
      />
      <ConfirmDialog
        open={confirmRestart}
        onOpenChange={setConfirmRestart}
        title={t('header.restart')}
        description={t('header.restartConfirm')}
        confirmLabel={t('header.restart')}
        onConfirm={() => runServerAction('restart')}
      />
      <ControlBar
        onServerSwitch={handleSetActive}
        onStart={() => serverAction('start')}
        onStop={() => serverAction('stop')}
        onRestart={() => serverAction('restart')}
      />
    </TooltipProvider>
  );
}

export default function App() {
  const { isLoggedIn, login } = useAuth();
  const { setLang } = useI18n();

  const handleLogin = (token, user) => {
    if (user && user.language) setLang(user.language);
    login(token, user);
  };

  if (!isLoggedIn) {
    return <LoginView onLogin={handleLogin} />;
  }

  return <AppShell />;
}
