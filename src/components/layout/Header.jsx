import { useState } from 'react';
import { ServerSelector } from './ServerSelector';
import { useI18n, useT } from '@/context/I18nContext';
import { useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Globe, Check } from 'lucide-react';

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

function LanguageSwitcher() {
  const { lang, setLang, supported, labels } = useI18n();
  const api = useApi();
  const [open, setOpen] = useState(false);
  const t = useT();

  async function pick(next) {
    setOpen(false);
    if (next === lang) return;
    setLang(next);
    try {
      const { user } = await api('/api/me/language', { method: 'PUT', body: { language: next } });
      // The server is the source of truth; we already updated local state.
      // We just want to make sure the change persists across logins.
      void user;
    } catch (_) {
      // Local change still applies for this session even if the server
      // call failed; user can retry on the next action.
    }
  }

  return (
    <div className="relative">
      <Button
        variant="glass"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        title={t('header.langSwitch')}
        aria-label={t('header.langSwitch')}
      >
        <Globe className="h-3.5 w-3.5" />
        {labels[lang] || lang.toUpperCase()}
      </Button>
      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1.5 min-w-[140px] overflow-hidden rounded-md border border-border bg-card/95 shadow-xl backdrop-blur-md">
            {supported.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => pick(code)}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-sm hover:bg-sidebar-accent"
              >
                <span>{labels[code] || code}</span>
                {code === lang && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Header({ currentView }) {
  const t = useT();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-5">
      <div className="flex items-center gap-3">
        <ServerSelector />
        <h1 className="text-sm font-semibold tracking-tight text-foreground">
          {currentView && VIEW_KEYS[currentView] ? t(VIEW_KEYS[currentView]) : currentView}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <LanguageSwitcher />
      </div>
    </header>
  );
}
