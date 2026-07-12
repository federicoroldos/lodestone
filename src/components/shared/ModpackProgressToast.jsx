import { toast } from 'sonner';
import { Package } from 'lucide-react';

// Persistent, non-dismissible toast shown while a modpack install runs in the background.
// Returns the toast id; dismiss it with toast.dismiss(id) when the install settles.
export function showModpackProgressToast(t) {
  return toast.custom(() => (
    <div className="w-[356px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card/95 p-4 shadow-xl backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Package className="h-4 w-4 shrink-0 animate-pulse text-primary" />
        {t('modrinth.modpackProgress')}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t('modrinth.modpackProgress')}>
        <div className="modpack-progress-indeterminate h-full rounded-full bg-primary" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t('modrinth.modpackProgressBackground')}</p>
    </div>
  ), {
    duration: Infinity,
    dismissible: false,
    closeButton: false,
  });
}
