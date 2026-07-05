import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/context/I18nContext';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Steps reference real UI elements through stable `data-tour` attributes.
// A step with `target: null` renders a centered card (no spotlight).
const STEPS = [
  { target: null, titleKey: 'tour.welcome.title', bodyKey: 'tour.welcome.body' },
  { target: 'sidebar', titleKey: 'tour.sidebar.title', bodyKey: 'tour.sidebar.body' },
  { target: 'nav-servers', titleKey: 'tour.createServer.title', bodyKey: 'tour.createServer.body' },
  { target: 'server-create-new', titleKey: 'tour.serverTypes.title', bodyKey: 'tour.serverTypes.body' },
  { target: 'server-create-modpack', titleKey: 'tour.modpackServer.title', bodyKey: 'tour.modpackServer.body' },
  { target: 'nav-configs', titleKey: 'tour.configureTabs.title', bodyKey: 'tour.configureTabs.body' },
  { target: 'nav-plugins', titleKey: 'tour.contentTabs.title', bodyKey: 'tour.contentTabs.body' },
  { target: 'header', titleKey: 'tour.header.title', bodyKey: 'tour.header.body' },
  { target: 'notifications', titleKey: 'tour.notifications.title', bodyKey: 'tour.notifications.body' },
  { target: 'profile', titleKey: 'tour.profile.title', bodyKey: 'tour.profile.body' },
  { target: 'controlbar', titleKey: 'tour.controlbar.title', bodyKey: 'tour.controlbar.body' },
  { target: null, titleKey: 'tour.done.title', bodyKey: 'tour.done.body' },
];

const CARD_WIDTH = 425;
const VIEWPORT_GUTTER = 12;
const TARGET_PADDING = 8;
const TARGET_GAP = 12;
const FALLBACK_CARD_HEIGHT = 220;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function rectFor(target) {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  return el.getBoundingClientRect();
}

export function OnboardingTour({ open, onClose }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [cardHeight, setCardHeight] = useState(FALLBACK_CARD_HEIGHT);
  const cardRef = useRef(null);
  const rafRef = useRef(0);

  const measure = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setRect(rectFor(STEPS[step].target));
    });
  }, [step]);

  // Re-measure when the step changes and on viewport changes.
  useEffect(() => {
    if (!open) return;
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      cancelAnimationFrame(rafRef.current);
    };
  }, [open, step, measure]);

  // Reset to the first step each time the tour is opened.
  useEffect(() => { if (open) setStep(0); }, [open]);

  useEffect(() => {
    if (!open || !cardRef.current) return;
    const updateCardHeight = () => {
      if (cardRef.current) setCardHeight(cardRef.current.offsetHeight || FALLBACK_CARD_HEIGHT);
    };
    updateCardHeight();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateCardHeight);
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [open, step]);

  // Press Esc to close, ArrowLeft/Right to navigate between steps.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  if (!open) return null;

  const total = STEPS.length;
  const isFirst = step === 0;
  const isLast = step === total - 1;
  const current = STEPS[step];

  function next() { setStep((s) => Math.min(s + 1, total - 1)); }
  function prev() { setStep((s) => Math.max(s - 1, 0)); }

  // Spotlight dimming: a full-screen dark layer with a transparent hole
  // punched around the target's bounding box (drawn with a big box-shadow
  // so it scales with any rect without recomposing four panels).
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const top = rect ? clamp(rect.top - TARGET_PADDING, 0, viewportHeight) : 0;
  const left = rect ? clamp(rect.left - TARGET_PADDING, 0, viewportWidth) : 0;
  const right = rect ? clamp(rect.right + TARGET_PADDING, 0, viewportWidth) : 0;
  const bottom = rect ? clamp(rect.bottom + TARGET_PADDING, 0, viewportHeight) : 0;
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const hasTarget = !!rect;

  // Position the tooltip card near the spotlight. Default to placing it
  // below the hole; flip above if there isn't room, then clamp it inside
  // the viewport so small screens and edge targets remain usable.
  const maxCardLeft = Math.max(VIEWPORT_GUTTER, viewportWidth - CARD_WIDTH - VIEWPORT_GUTTER);
  const maxCardTop = Math.max(VIEWPORT_GUTTER, viewportHeight - cardHeight - VIEWPORT_GUTTER);
  const belowTop = top + height + TARGET_GAP;
  const aboveTop = top - cardHeight - TARGET_GAP;
  const hasRoomBelow = belowTop + cardHeight <= viewportHeight - VIEWPORT_GUTTER;
  const preferredTop = hasRoomBelow || aboveTop < VIEWPORT_GUTTER ? belowTop : aboveTop;
  const cardStyle = hasTarget
    ? {
        top: clamp(preferredTop, VIEWPORT_GUTTER, maxCardTop),
        left: clamp(left, VIEWPORT_GUTTER, maxCardLeft),
      }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={t('tour.welcome.title')}>
      {/* Dim overlay with a punched hole when there is a target. */}
      {hasTarget ? (
        <div
          className="absolute pointer-events-auto"
          style={{
            top, left, width, height,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(20, 18, 14, 0.72)',
            border: '1px solid rgba(255,255,255,0.12)',
            transition: 'all 220ms ease',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(20,18,14,0.72)]" />
      )}

      {/* Click-catcher to dismiss on outside click. */}
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      {/* Tooltip card. */}
      <div
        ref={cardRef}
        className={cn(
          'absolute z-10 max-h-[calc(100vh-24px)] w-[425px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl',
          'animate-in fade-in slide-in-from-bottom-2 duration-200',
        )}
        style={cardStyle}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-widest text-primary">
            {t('tour.badge', { n: step + 1, total })}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 className="text-[17px] font-semibold text-foreground">{t(current.titleKey)}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t(current.bodyKey)}</p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex shrink-0 gap-2">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === step ? 'w-6 bg-primary' : i < step ? 'w-2 bg-primary/60' : 'w-2 bg-border',
                )}
              />
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            {!isFirst && (
              <Button variant="ghost" size="sm" className="h-10 min-w-0 px-3 text-[15px]" onClick={prev}>
                <ArrowLeft className="h-4 w-4" /> {t('common.back')}
              </Button>
            )}
            {isLast ? (
              <Button size="sm" className="h-10 min-w-0 px-3 text-[15px]" onClick={onClose}>
                <Check className="h-4 w-4" /> {t('tour.finish')}
              </Button>
            ) : (
              <Button size="sm" className="h-10 min-w-0 px-3 text-[15px]" onClick={next}>
                {t('tour.next')} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
