import { ServerSelector } from './ServerSelector';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useT } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { Settings, LogOut, User, ChevronDown } from 'lucide-react';

const VIEW_KEYS = {
  servers:  'nav.servers',
  dashboard:'nav.dashboard',
  health:   'nav.health',
  console:  'nav.console',
  players:  'nav.players',
  addons:   'nav.addons',
  configs:  'nav.configs',
  files:    'nav.files',
  tasks:    'nav.schedules',
  backups:  'nav.backups',
  modrinth: 'nav.modrinth',
  map:      'nav.map',
  users:    'nav.users',
};

export function Header({ currentView, onServerSwitch, onOpenSettings }) {
  const t = useT();
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name.split(/\s+/).map(s => s[0]).join('').toUpperCase().slice(0, 2)
    : user?.username?.slice(0, 2).toUpperCase() || '?';

  return (
    <header data-tour="header" className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-5 relative">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'url(/resources/stone_tile.jpg)',
          backgroundRepeat: 'repeat',
          backgroundSize: '120px',
        }}
      />
      <div className="flex items-center gap-3">
        <ServerSelector onSwitch={onServerSwitch} />
        <h1 className="text-sm font-semibold tracking-tight text-foreground">
          {currentView && VIEW_KEYS[currentView] ? t(VIEW_KEYS[currentView]) : currentView}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div data-tour="notifications"><NotificationBell /></div>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              data-tour="profile"
              variant="ghost"
              size="sm"
              className="gap-2 px-2 text-muted-foreground hover:text-foreground"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                {initials}
              </span>
              <span className="hidden md:inline text-xs font-medium">{user?.name || user?.username}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              {user?.name || user?.username}
              <span className="block text-[10px] font-normal text-muted-foreground">
                {user?.role === 'admin' ? 'Admin' : 'Operator'}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenSettings}>
              <Settings className="h-4 w-4" />
              {t('sidebar.settings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut className="h-4 w-4" />
              {t('sidebar.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
