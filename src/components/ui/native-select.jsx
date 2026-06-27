import { cn } from '@/lib/utils';

function NativeSelect({ options, value, onChange, placeholder, className, ...props }) {
  return (
    <select
      value={value ?? ''}
      onChange={onChange}
      className={cn(
        'flex h-9 w-full items-center rounded-md border border-input',
        'bg-background/60 px-3 py-2 text-sm text-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export { NativeSelect };
