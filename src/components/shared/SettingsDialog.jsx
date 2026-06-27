import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Globe, Keyboard, Languages } from 'lucide-react';
import { useI18n, useT } from '@/context/I18nContext';
import { cn } from '@/lib/utils';

const HOTKEYS = [
  { combo: ['Ctrl', 'B'], labelKey: 'settings.hotkeyToggleSidebar', hintKey: 'settings.hotkeyToggleSidebarHint', mac: ['Cmd', 'B'] },
  { combo: ['↑'], altCombo: ['↓'], labelKey: 'settings.hotkeyConsoleHistory', hintKey: 'settings.hotkeyConsoleHistoryHint' },
  { combo: ['Esc'], labelKey: 'settings.hotkeyCloseMenu', hintKey: 'settings.hotkeyCloseMenuHint' },
];

function Kbd({ children }) {
  return (
    <kbd className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-border/80 bg-background/70 px-1.5 font-mono text-[11px] font-medium text-foreground shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]">
      {children}
    </kbd>
  );
}

function ComboRow({ combo, altCombo }) {
  return (
    <span className="flex items-center gap-1">
      {combo.map((k, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/60 text-[10px]">+</span>}
          <Kbd>{k}</Kbd>
        </span>
      ))}
      {altCombo && (
        <>
          <span className="text-muted-foreground/60 text-[10px] mx-1">/</span>
          {altCombo.map((k, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/60 text-[10px]">+</span>}
              <Kbd>{k}</Kbd>
            </span>
          ))}
        </>
      )}
    </span>
  );
}

export function SettingsDialog({ open, onOpenChange }) {
  const t = useT();
  const { lang, setLang, supported, labels } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0 border-stone-border">
        {/* Stone-tile background, slightly darker than the panel surface. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage: 'url(/resources/stone_tile.jpg)',
            backgroundRepeat: 'repeat',
            backgroundSize: '120px',
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-card/85" />

        <div className="relative">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Globe className="h-4 w-4" />
              </span>
              {t('settings.title')}
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-5 pt-2">
            {/* Language */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t('settings.language')}
                </h3>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">{t('settings.languageDesc')}</p>
              <div className="grid grid-cols-2 gap-2">
                {supported.map((code) => {
                  const active = lang === code;
                  return (
                    <Button
                      key={code}
                      variant={active ? 'default' : 'glass'}
                      size="sm"
                      onClick={() => setLang(code)}
                      className={cn('justify-between px-3', !active && 'text-muted-foreground')}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{labels[code] || code}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">{code}</span>
                      </span>
                      {active && <Check className="h-3.5 w-3.5" />}
                    </Button>
                  );
                })}
              </div>
            </section>

            {/* Hotkeys */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Keyboard className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t('settings.hotkeys')}
                </h3>
              </div>
              <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-background/40">
                {HOTKEYS.map((h) => (
                  <li key={h.labelKey} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{t(h.labelKey)}</div>
                      <div className="text-[11px] text-muted-foreground">{t(h.hintKey)}</div>
                    </div>
                    <ComboRow combo={h.combo} altCombo={h.altCombo} />
                  </li>
                ))}
              </ul>
            </section>
          </DialogBody>
        </div>
      </DialogContent>
    </Dialog>
  );
}
