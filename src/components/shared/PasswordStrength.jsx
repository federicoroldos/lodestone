import { useT } from '@/context/I18nContext';
import { cn } from '@/lib/utils';

// Cheap, dependency-free strength estimate that mirrors the server's policy
// (length + character-class variety). Returns 0..4.
export function scorePassword(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^A-Za-z0-9]/.test(pw)) classes++;
  if (classes >= 2) score++;
  if (classes >= 3) score++;
  return Math.min(4, score);
}

const TIERS = [
  { labelKey: 'password.weak', color: 'bg-red-500', text: 'text-red-400' },
  { labelKey: 'password.weak', color: 'bg-red-500', text: 'text-red-400' },
  { labelKey: 'password.fair', color: 'bg-amber-500', text: 'text-amber-400' },
  { labelKey: 'password.good', color: 'bg-lime-500', text: 'text-lime-400' },
  { labelKey: 'password.strong', color: 'bg-emerald-500', text: 'text-emerald-400' },
];

export function PasswordStrength({ password }) {
  const t = useT();
  if (!password) return null;
  const score = scorePassword(password);
  const tier = TIERS[score];
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn('h-1 flex-1 rounded-full transition-colors', i < score ? tier.color : 'bg-border')}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{t('password.strength')}</span>
        <span className={cn('font-medium', tier.text)}>{t(tier.labelKey)}</span>
      </div>
    </div>
  );
}
