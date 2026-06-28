import { cn } from '@/lib/utils';
import { useT } from '@/context/I18nContext';

/**
 * Lodestone brand mark - the actual `lodestone_face` pixel texture as the
 * icon, paired with a Press Start 2P wordmark. Used in the sidebar header
 * (also doubles as a "back to dashboard" shortcut).
 *
 * @param {boolean}  collapsed  When true, only the icon is rendered.
 * @param {function} onClick    Optional click handler (e.g. go to dashboard).
 */
export function BrandMark({ collapsed = false, onClick, className }) {
  const t = useT();
  const name = t('brand.name');
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center rounded-md select-none transition-colors duration-75',
        'hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        collapsed ? 'justify-center px-0 py-1' : 'gap-2.5 px-2 py-1.5',
        className,
      )}
      aria-label={t('brand.goToDashboard', { name })}
      title={name}
    >
      <span className="brand-icon" aria-hidden="true" />
      {!collapsed && (
        <span className="brand-wordmark">{name}</span>
      )}
    </button>
  );
}
