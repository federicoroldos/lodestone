import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/shared/StatusPill';
import { ServerSelector } from './ServerSelector';
import { useServer } from '@/context/ServerContext';
import { Play, RotateCcw, Square } from 'lucide-react';

const VIEW_TITLES = {
  servers: 'Servers', dashboard: 'Dashboard', metrics: 'Metrics', console: 'Console',
  players: 'Players', plugins: 'Plugins', configs: 'Configs', files: 'Files',
  tasks: 'Schedules', backups: 'Backups', modrinth: 'Modrinth', map: 'Map', users: 'Users',
};

export function Header({ currentView, onServerSwitch, onStart, onStop, onRestart }) {
  const { activeServerId, statuses } = useServer();
  const status = activeServerId ? (statuses[activeServerId] || { status: 'offline' }) : { status: 'offline' };
  const running = status.status !== 'offline';
  const busy = status.status === 'starting' || status.status === 'stopping';

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-5">
      <div className="flex items-center gap-3">
        <ServerSelector onSwitch={onServerSwitch} />
        <h1 className="text-sm font-semibold tracking-tight text-foreground">
          {VIEW_TITLES[currentView] || currentView}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <StatusPill status={status.status} />
        <Button
          variant="success"
          size="sm"
          onClick={onStart}
          disabled={running || busy}
        >
          <Play className="h-3.5 w-3.5" />
          Start
        </Button>
        <Button
          variant="glass"
          size="sm"
          onClick={onRestart}
          disabled={busy}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restart
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onStop}
          disabled={!running || busy}
        >
          <Square className="h-3.5 w-3.5" />
          Stop
        </Button>
      </div>
    </header>
  );
}
