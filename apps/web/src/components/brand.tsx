import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-9', className)} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#0a8f45" />
      <path d="M14 18h6l5 22h20l5-15H23" fill="none" stroke="#ffc93c" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="28" cy="48" r="4" fill="#fff" />
      <circle cx="43" cy="48" r="4" fill="#fff" />
    </svg>
  );
}

export function Logo({ subtitle, dark, className }: { subtitle?: string; dark?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="leading-tight">
        <span className={cn('block text-lg font-extrabold tracking-tight', dark ? 'text-white' : 'text-slate-900')}>
          smart<span className="text-brand-600">cart</span>
        </span>
        {subtitle && (
          <span className={cn('block text-[11px] font-semibold tracking-wide uppercase', dark ? 'text-slate-400' : 'text-slate-500')}>
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
