import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { BrandMark } from '@/components/shared/BrandMark';
import { SettingsDialog } from '@/components/shared/SettingsDialog';
import { useAuth } from '@/context/AuthContext';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Server, BarChart2, Terminal, Users, User, Map,
  Puzzle, Package, FolderOpen, FileText, Database, Clock, Settings, LogOut,
  ChevronDown, ChevronsLeft, ChevronsRight,
} from 'lucide-react';

// `requiresServer` items are greyed out and unclickable until a server exists
// (everything they show reads a server). `adminOnly` items are hidden from
// operators entirely.
const NAV_GROUPS = [
  {
    key: 'nav.groupOverview',
    items: [
      { view: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { view: 'servers',   labelKey: 'nav.servers',   icon: Server },
      { view: 'metrics',   labelKey: 'nav.metrics',   icon: BarChart2, requiresServer: true },
    ],
  },
  {
    key: 'nav.groupOperate',
    items: [
      { view: 'console', labelKey: 'nav.console', icon: Terminal, requiresServer: true },
      { view: 'players', labelKey: 'nav.players', icon: Users, requiresServer: true },
      { view: 'map',     labelKey: 'nav.map',     icon: Map, requiresServer: true },
    ],
  },
  {
    key: 'nav.groupContent',
    items: [
      { view: 'plugins',  labelKey: 'nav.plugins',  icon: Puzzle, requiresServer: true },
      { view: 'modrinth', labelKey: 'nav.modrinth', icon: Package, requiresServer: true },
      { view: 'files',    labelKey: 'nav.files',    icon: FolderOpen, requiresServer: true },
      { view: 'configs',  labelKey: 'nav.configs',  icon: FileText, requiresServer: true },
    ],
  },
  {
    key: 'nav.groupMaintenance',
    items: [
      { view: 'backups', labelKey: 'nav.backups',   icon: Database, requiresServer: true },
      { view: 'tasks',   labelKey: 'nav.schedules', icon: Clock, requiresServer: true },
    ],
  },
  {
    key: 'nav.groupSettings',
    items: [
      { view: 'users', labelKey: 'nav.users', icon: User, adminOnly: true },
    ],
  },
];

function getInitialCollapsed() {
  try {
    const arr = JSON.parse(localStorage.getItem('ls-collapsed-navs') || '[]');
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function getInitialMode() {
  try {
    const m = localStorage.getItem('ls-sidebar-mode');
    return m === 'collapsed' ? 'collapsed' : 'expanded';
  } catch {
    return 'expanded';
  }
}

export function Sidebar({ currentView, onNavigate }) {
  const { logout, user } = useAuth();
  const { servers } = useServer();
  const t = useT();
  const isAdmin = user?.role === 'admin';
  const hasServers = (servers?.length || 0) > 0;
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [mode, setMode] = useState(getInitialMode);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setMode(prev => {
          const next = prev === 'expanded' ? 'collapsed' : 'expanded';
          try { localStorage.setItem('ls-sidebar-mode', next); } catch {}
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleMode = () => {
    setMode(prev => {
      const next = prev === 'expanded' ? 'collapsed' : 'expanded';
      try { localStorage.setItem('ls-sidebar-mode', next); } catch {}
      return next;
    });
  };

  const toggleGroup = (key) => {
    if (mode === 'collapsed') return;
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem('ls-collapsed-navs', JSON.stringify([...next]));
      return next;
    });
  };

  const isCollapsed = mode === 'collapsed';

  useEffect(() => {
    document.documentElement.style.setProperty('--ls-sidebar-w', isCollapsed ? '48px' : '220px');
  }, [isCollapsed]);

  return (
    <aside className={cn(
      'fixed top-0 left-0 z-20 flex h-screen flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
      isCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
    )}>
      {/* Stone-tile texture, slightly darker than the main background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'url(/resources/stone_tile.jpg)',
          backgroundRepeat: 'repeat',
          backgroundSize: '120px',
        }}
      />
      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-border',
        isCollapsed ? 'justify-center px-2 py-3' : 'px-3 py-3'
      )}>
        <BrandMark
          collapsed={isCollapsed}
          onClick={() => onNavigate('dashboard')}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((it) => !(it.adminOnly && !isAdmin));
          if (items.length === 0) return null;
          return (
          <div key={group.key} className="mb-1">
            {!isCollapsed && (
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              >
                {t(group.key)}
                <ChevronDown className={cn('h-3 w-3 transition-transform', collapsed.has(group.key) && '-rotate-90')} />
              </button>
            )}
            {(isCollapsed || !collapsed.has(group.key)) && items.map(({ view, labelKey, icon: Icon, requiresServer }) => {
              const label = t(labelKey);
              const disabled = requiresServer && !hasServers;
              const itemBtn = (
                <button
                  key={view}
                  type="button"
                  onClick={() => { if (!disabled) onNavigate(view); }}
                  aria-disabled={disabled}
                  className={cn(
                    'flex w-full items-center rounded-md border-l-2 py-1.5 text-sm transition-colors duration-75',
                    isCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
                    disabled
                      ? 'border-l-transparent text-muted-foreground/35 cursor-not-allowed'
                      : currentView === view
                        ? 'border-l-primary bg-primary/10 text-primary'
                        : 'border-l-transparent text-muted-foreground hover:bg-primary/15 hover:text-primary'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{label}</span>}
                </button>
              );
              // Show a tooltip when collapsed (just the label) or when disabled
              // (explain that a server is needed). Otherwise the bare button.
              if (!isCollapsed && !disabled) return itemBtn;
              return (
                <Tooltip key={view}>
                  <TooltipTrigger asChild>{itemBtn}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {disabled ? t('nav.requiresServerTip') : label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleMode}
          className={cn('text-muted-foreground hover:text-foreground', isCollapsed ? 'justify-center px-0' : 'justify-start gap-3')}
          title={isCollapsed ? t('sidebar.expandTitle') : t('sidebar.collapseTitle')}
        >
          {isCollapsed
            ? <ChevronsRight className="h-4 w-4" />
            : <><ChevronsLeft className="h-4 w-4" /> {t('sidebar.collapseLabel')}</>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSettingsOpen(true)}
          className={cn('text-muted-foreground hover:text-foreground', isCollapsed ? 'justify-center px-0' : 'justify-start gap-3')}
          title={t('sidebar.settingsTitle')}
          aria-label={t('sidebar.settingsTitle')}
        >
          <Settings className="h-4 w-4" />
          {!isCollapsed && t('sidebar.settings')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className={cn('text-muted-foreground hover:text-foreground', isCollapsed ? 'justify-center px-0' : 'justify-start gap-3')}
        >
          <LogOut className="h-4 w-4" />
          {!isCollapsed && t('sidebar.logout')}
        </Button>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  );
}
