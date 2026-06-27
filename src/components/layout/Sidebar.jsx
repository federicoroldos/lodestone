import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { BrandMark } from '@/components/shared/BrandMark';
import { useAuth } from '@/context/AuthContext';
import { useT } from '@/context/I18nContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Server, BarChart2, Terminal, Users, Map,
  Puzzle, Package, FolderOpen, FileText, Database, Clock, Settings, LogOut,
  ChevronDown, ChevronsLeft, ChevronsRight,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    key: 'nav.groupOverview',
    items: [
      { view: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { view: 'servers',   labelKey: 'nav.servers',   icon: Server },
      { view: 'metrics',   labelKey: 'nav.metrics',   icon: BarChart2 },
    ],
  },
  {
    key: 'nav.groupOperate',
    items: [
      { view: 'console', labelKey: 'nav.console', icon: Terminal },
      { view: 'players', labelKey: 'nav.players', icon: Users },
      { view: 'map',     labelKey: 'nav.map',     icon: Map },
    ],
  },
  {
    key: 'nav.groupContent',
    items: [
      { view: 'plugins',  labelKey: 'nav.plugins',  icon: Puzzle },
      { view: 'modrinth', labelKey: 'nav.modrinth', icon: Package },
      { view: 'files',    labelKey: 'nav.files',    icon: FolderOpen },
      { view: 'configs',  labelKey: 'nav.configs',  icon: FileText },
    ],
  },
  {
    key: 'nav.groupMaintenance',
    items: [
      { view: 'backups', labelKey: 'nav.backups',   icon: Database },
      { view: 'tasks',   labelKey: 'nav.schedules', icon: Clock },
    ],
  },
  {
    key: 'nav.groupSettings',
    items: [
      { view: 'users', labelKey: 'nav.users', icon: Settings },
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
  const { logout } = useAuth();
  const t = useT();
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [mode, setMode] = useState(getInitialMode);

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

  return (
    <aside className={cn(
      'sticky top-0 z-10 flex h-screen shrink-0 flex-col overflow-hidden self-start border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
      isCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
    )}>
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
        {NAV_GROUPS.map((group) => (
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
            {(isCollapsed || !collapsed.has(group.key)) && group.items.map(({ view, labelKey, icon: Icon }) => {
              const label = t(labelKey);
              const itemBtn = (
                <button
                  key={view}
                  type="button"
                  onClick={() => onNavigate(view)}
                  className={cn(
                    'flex w-full items-center rounded-md border-l-2 py-1.5 text-sm transition-colors duration-75',
                    isCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
                    currentView === view
                      ? 'border-l-primary bg-primary/10 text-primary'
                      : 'border-l-transparent text-muted-foreground hover:bg-primary/15 hover:text-primary'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{label}</span>}
                </button>
              );
              if (!isCollapsed) return itemBtn;
              return (
                <Tooltip key={view}>
                  <TooltipTrigger asChild>{itemBtn}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
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
          onClick={logout}
          className={cn('text-muted-foreground hover:text-foreground', isCollapsed ? 'justify-center px-0' : 'justify-start gap-3')}
        >
          <LogOut className="h-4 w-4" />
          {!isCollapsed && t('sidebar.logout')}
        </Button>
      </div>
    </aside>
  );
}
