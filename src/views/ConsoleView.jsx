import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useT } from '@/context/I18nContext';
import { Send, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

function detectLevel(text) {
  if (!text) return '';
  const e = String(text).toUpperCase();
  if (e.includes('ERROR') || e.includes('SEVERE') || e.includes('STDERR') ||
      e.includes('EXCEPTION') || e.includes('CAUSED BY')) return 'error';
  if (e.includes('WARN')) return 'warn';
  if (e.includes('JOINED THE GAME') || e.includes('LEFT THE GAME')) return 'chat';
  if (e.includes('INFO')) return 'info';
  return '';
}

const LEVEL_BAR = {
  info:  'bg-log-info',
  warn:  'bg-log-warn',
  error: 'bg-log-error',
  cmd:   'bg-log-cmd',
  chat:  'bg-log-chat',
};

const MAX_LINES = 1200;

// Strip the leading Minecraft log timestamp ([HH:MM:SS INFO]: or [HH:MM:SS] [thread/LEVEL]: )
// so our custom timestamp column is the only one shown.
const MC_TS_RE = /^\[\d{2}:\d{2}:\d{2}(?:\s+\w+)?\](?:\s*\[[^\]]*\])?:\s*/;
function stripMcTs(text) {
  return text ? text.replace(MC_TS_RE, '') : text;
}

function fmtTs(ts) {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':') +
    '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function ConsoleView({ lines, onCommand }) {
  const t = useT();
  const [cmd, setCmd] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [showJump, setShowJump] = useState(false);
  const consoleRef = useRef(null);
  const prevLenRef = useRef(0);
  // Whether the user is currently pinned to the bottom. Tracked from real
  // scroll events so the decision to auto-scroll doesn't depend on measuring
  // the viewport *after* new lines have already grown it (the old bug: a batch
  // of lines or one long wrapped line pushed the distance past the threshold,
  // and auto-scroll silently stopped).
  const atBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = consoleRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = el.clientHeight > 0 && dist < 120;
    atBottomRef.current = nearBottom;
    setShowJump(!nearBottom);
  }, []);

  // Stick to the live tail as new lines arrive, unless the user scrolled up.
  useEffect(() => {
    const el = consoleRef.current;
    if (!el) return;
    const prevLen = prevLenRef.current;
    prevLenRef.current = lines.length;

    // Force-scroll when history loads (initial mount or server switch):
    // lines jumped from 0 → many.
    const historyLoaded = prevLen === 0 && lines.length > 0;
    if (historyLoaded || (autoscroll && atBottomRef.current)) {
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
      setShowJump(false);
    }
  }, [lines, autoscroll]);

  // Re-enabling autoscroll snaps back to the bottom immediately.
  useEffect(() => {
    if (!autoscroll) return;
    const el = consoleRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setShowJump(false);
  }, [autoscroll]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = cmd.trim();
    if (!trimmed) return;
    onCommand(trimmed);
    setHistory(prev => {
      if (prev[prev.length - 1] === trimmed) return prev;
      return [...prev, trimmed];
    });
    setHistIdx(-1);
    setCmd('');
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!history.length) return;
    e.preventDefault();
    if (e.key === 'ArrowUp') {
      const idx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setCmd(history[idx] || '');
    } else {
      if (histIdx === -1) return;
      if (histIdx < history.length - 1) {
        const idx = histIdx + 1;
        setHistIdx(idx);
        setCmd(history[idx] || '');
      } else {
        setHistIdx(-1);
        setCmd('');
      }
    }
  };

  const displayLines = lines.slice(-MAX_LINES);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{t('console.title')}</CardTitle>
        <div className="flex items-center gap-2">
          <Checkbox id="autoscroll" checked={autoscroll} onCheckedChange={setAutoscroll} />
          <Label htmlFor="autoscroll" className="normal-case text-xs tracking-normal font-normal text-muted-foreground cursor-pointer">
            {t('console.autoscroll')}
          </Label>
        </div>
      </CardHeader>

      <div ref={consoleRef} onScroll={handleScroll} className="console-area relative">
        {displayLines.map((line, i) => {
          const level = line.level || detectLevel(line.text) || '';
          return (
            <div key={i} className="grid grid-cols-[6px_80px_1fr] gap-x-5 items-start">
              <span className={cn('h-full w-[3px] self-stretch rounded-full mt-1.5', LEVEL_BAR[level] || 'bg-transparent')} />
              <span className="text-muted-foreground/40 tabular-nums select-none text-[12.5px]">{fmtTs(line.ts || Date.now())}</span>
              <span className={cn('whitespace-pre-wrap break-words', `l-${level || 'plain'}`)}>{stripMcTs(line.text)}</span>
            </div>
          );
        })}
        {showJump && (
          <button
            type="button"
            onClick={() => { consoleRef.current.scrollTop = consoleRef.current.scrollHeight; setShowJump(false); }}
            className="absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
            title={t('console.jumpToLive')}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border px-4 py-2 bg-console">
        <span className="font-mono text-status-online shrink-0">&gt;</span>
        <Input
          type="text"
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('console.commandPlaceholder')}
          autoComplete="off"
          className="flex-1 font-mono border-0 bg-transparent focus-visible:ring-0 h-7"
        />
        <Button type="submit" variant="default" size="xs">
          <Send className="h-3 w-3" />
          {t('console.send')}
        </Button>
      </form>
    </Card>
  );
}
