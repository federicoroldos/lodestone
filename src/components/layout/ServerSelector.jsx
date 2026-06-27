import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { useServer } from '@/context/ServerContext';
import { StatusDot } from '@/components/shared/StatusPill';
import { cn } from '@/lib/utils';

export function ServerSelector({ onSwitch }) {
  const { servers, activeServerId, statuses } = useServer();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', esc); };
  }, []);

  const active = servers.find(s => s.id === activeServerId);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm border border-border/60 bg-secondary/50 hover:bg-secondary',
          'transition-colors max-w-[200px]'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {active && <StatusDot status={(statuses[activeServerId] || active.status)?.status || 'offline'} />}
        <span className="truncate text-foreground">{active ? active.name : 'No servers'}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 min-w-[180px] rounded-md border border-border bg-popover shadow-xl z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
        >
          {servers.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No servers</div>
          ) : servers.map(s => {
            const st = (statuses[s.id] || s.status)?.status || 'offline';
            const isActive = s.id === activeServerId;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => { setOpen(false); if (!isActive) onSwitch(s.id); }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left',
                  isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary'
                )}
              >
                <StatusDot status={st} />
                <span className="truncate">{s.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
