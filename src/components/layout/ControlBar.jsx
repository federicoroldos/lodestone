import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ServerSelector } from './ServerSelector';
import { StatusPill } from '@/components/shared/StatusPill';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { Play, RotateCcw, Square } from 'lucide-react';

export function ControlBar({ onServerSwitch, onStart, onStop, onRestart }) {
  const { activeServerId, statuses } = useServer();
  const t = useT();
  const status = activeServerId ? (statuses[activeServerId] || { status: 'offline' }) : { status: 'offline' };
  const showStart = status.status === 'offline' || status.status === 'stopping';
  const showRestartStop = status.status === 'online' || status.status === 'starting';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-card/85 p-1.5 pl-2 shadow-2xl backdrop-blur-md"
        role="toolbar"
        aria-label={t('header.start')}
      >
        <ServerSelector onSwitch={onServerSwitch} placement="top" />

        <span className="mx-1 h-7 w-px bg-border/60" aria-hidden="true" />

        <StatusPill status={status.status} className="px-3 py-1" />

        <span className="mx-1 h-7 w-px bg-border/60" aria-hidden="true" />

        {showStart && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="success"
                size="icon"
                onClick={onStart}
                className="rounded-full"
                aria-label={t('header.start')}
              >
                <Play className="h-4 w-4 fill-current" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('header.start')}</TooltipContent>
          </Tooltip>
        )}

        {showRestartStop && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="glass"
                  size="icon"
                  onClick={onRestart}
                  className="rounded-full"
                  aria-label={t('header.restart')}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('header.restart')}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={onStop}
                  className="rounded-full"
                  aria-label={t('header.stop')}
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('header.stop')}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
