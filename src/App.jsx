import { useState, useEffect, useCallback, useRef } from 'react';
import { Toaster } from 'sonner';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useServer } from '@/context/ServerContext';
import { useI18n, useT } from '@/context/I18nContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useApi } from '@/hooks/useApi';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LoginView } from '@/views/LoginView';
import { SpinningCube } from '@/components/shared/SpinningCube';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ControlBar } from '@/components/layout/ControlBar';
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

function AppShell({ onLoggedIn }) {
  const { token, user, setUser, isLoggedIn } = useAuth();
  const { servers, setServers, activeServerId, setActiveServerId, updateStatus, setMapUrl, wsRef } = useServer();
  const api = useApi();
  const t = useT();

  const [currentView, setCurrentView] = useState('servers');
  const [consoleLines, setConsoleLines] = useState([]);
  const [connState, setConnState] = useState('connecting');

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
    loadConfig();
    loadServers();
  }, [isLoggedIn]);

  async function loadConfig() {
    try {
      const cfg = await api('/api/config');
      const url = (cfg.map && cfg.map.url) || `http://${location.hostname}:8100`;
      setMapUrl(url);
    } catch (_) {}
  }

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

  async function serverAction(action) {
    const endpoint = action === 'start' ? '/api/server/start' :
                     action === 'stop'  ? '/api/server/stop' :
                     '/api/server/restart';
    if (action === 'restart' && !confirm(t('header.restartConfirm'))) return;
    try {
      await api(endpoint, { method: 'POST' });
    } catch (e) { toast.error(e.message); }
  }

  function handleCommand(cmd) {
    sendMessage({ type: 'command', cmd });
  }

  function navigate(view) {
    setCurrentView(view);
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
        {/* Faded, slowly-spinning 3D Lodestone cube behind every section */}
        <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
          <SpinningCube size="min(60vh, 60vw)" duration={48} opacity={0.05} />
        </div>
        <Sidebar currentView={currentView} onNavigate={navigate} />
        <div className="relative z-10 flex min-h-screen flex-1 min-w-0 flex-col">
          <Header currentView={currentView} />
          <main className="flex-1 p-5 pb-28">
            <div className="view-enter" key={currentView}>
              {views[currentView] || null}
            </div>
          </main>
        </div>
      </div>
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
