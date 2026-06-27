import { ServerSelector } from './ServerSelector';
import { useT } from '@/context/I18nContext';

const VIEW_KEYS = {
  servers:  'nav.servers',
  dashboard:'nav.dashboard',
  metrics:  'nav.metrics',
  console:  'nav.console',
  players:  'nav.players',
  plugins:  'nav.plugins',
  configs:  'nav.configs',
  files:    'nav.files',
  tasks:    'nav.schedules',
  backups:  'nav.backups',
  modrinth: 'nav.modrinth',
  map:      'nav.map',
  users:    'nav.users',
};

export function Header({ currentView }) {
  const t = useT();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-5 relative">
      {/* Stone-tile texture, slightly darker than the main background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'url(/resources/stone_tile.jpg)',
          backgroundRepeat: 'repeat',
          backgroundSize: '120px',
        }}
      />
      <div className="flex items-center gap-3">
        <ServerSelector />
        <h1 className="text-sm font-semibold tracking-tight text-foreground">
          {currentView && VIEW_KEYS[currentView] ? t(VIEW_KEYS[currentView]) : currentView}
        </h1>
      </div>

      <div className="flex items-center gap-2">
      </div>
    </header>
  );
}
