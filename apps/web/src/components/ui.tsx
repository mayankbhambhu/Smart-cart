import { CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useToasts } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dark' | 'accent';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-brand-300',
  secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:text-slate-400',
  outline: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm disabled:bg-rose-300',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm disabled:bg-slate-400',
  accent: 'bg-accent-400 text-slate-900 hover:bg-accent-500 shadow-sm disabled:opacity-60',
};

const buttonSizes: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-lg',
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed',
        buttonVariants[variant],
        buttonSizes[size],
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ className, label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const controlBase =
  'w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(controlBase, 'h-10', invalid && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20', className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(controlBase, 'min-h-20 py-2', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(controlBase, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <span className="block text-xs text-rose-600">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm text-slate-700 disabled:opacity-50"
    >
      <span className={cn('relative h-6 w-10 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-slate-300')}>
        <span
          className={cn('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')}
        />
      </span>
      {label}
    </button>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors',
        active ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-xl bg-slate-100 p-1', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
            value === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  max = 99,
  size = 'md',
}: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  size?: 'sm' | 'md';
}) {
  const dims = size === 'sm' ? 'h-7 text-sm' : 'h-9 text-sm';
  return (
    <div className={cn('inline-flex items-center overflow-hidden rounded-lg bg-brand-600 font-bold text-white', dims)}>
      <button type="button" aria-label="Decrease" className="h-full px-2.5 hover:bg-brand-700" onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="tabular min-w-6 text-center">{value}</span>
      <button
        type="button"
        aria-label="Increase"
        className="h-full px-2.5 hover:bg-brand-700 disabled:opacity-50"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white shadow-card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type BadgeTone = 'gray' | 'green' | 'yellow' | 'red' | 'blue' | 'violet' | 'orange' | 'dark';
const badgeTones: Record<BadgeTone, string> = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-brand-50 text-brand-800 ring-brand-600/20',
  yellow: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  blue: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  violet: 'bg-violet-50 text-violet-800 ring-violet-600/20',
  orange: 'bg-orange-50 text-orange-800 ring-orange-600/20',
  dark: 'bg-slate-900 text-white',
};

export function Badge({ tone = 'gray', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-transparent ring-inset',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-brand-600', className)} />;
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Spinner className="size-7" />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-200/70', className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      {icon && <div className="mb-1 text-4xl">{icon}</div>}
      <p className="font-semibold text-slate-800">{title}</p>
      {body && <p className="max-w-sm text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <EmptyState
      icon="⚠️"
      title="Couldn't load this"
      body={error instanceof Error ? error.message : 'Please try again.'}
      action={
        retry && (
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        )
      }
    />
  );
}

export function Stat({
  label,
  value,
  hint,
  delta,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: number | null;
  icon?: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon && (
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-lg',
              tone === 'warning'
                ? 'bg-amber-50 text-amber-600'
                : tone === 'danger'
                  ? 'bg-rose-50 text-rose-600'
                  : tone === 'success'
                    ? 'bg-brand-50 text-brand-700'
                    : 'bg-slate-100 text-slate-600',
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="tabular mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {delta !== undefined && delta !== null && Number.isFinite(delta) && (
          <span className={cn('font-semibold', delta >= 0 ? 'text-brand-700' : 'text-rose-600')}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-slate-500">{hint}</span>}
      </div>
    </Card>
  );
}

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  const palette = [
    'bg-sky-100 text-sky-800',
    'bg-violet-100 text-violet-800',
    'bg-amber-100 text-amber-800',
    'bg-rose-100 text-rose-800',
    'bg-teal-100 text-teal-800',
    'bg-indigo-100 text-indigo-800',
  ];
  const color = palette[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % palette.length];
  const dims =
    size === 'xs' ? 'size-5 text-[9px]' : size === 'sm' ? 'size-7 text-[11px]' : size === 'lg' ? 'size-12 text-base' : 'size-9 text-xs';
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold', dims, color, className)}>
      {initials || '?'}
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-slate-200 scrollbar-none', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
            value === tab.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                'rounded-full px-1.5 text-xs',
                value === tab.value ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600',
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

function useEscape(onClose: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = overflow;
    };
  }, [onClose, open]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEscape(onClose, open);
  if (!open) return null;
  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-lg';
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'flex max-h-[92vh] w-full animate-fade-in flex-col overflow-hidden rounded-t-3xl bg-white shadow-pop sm:rounded-3xl',
          width,
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              {title && <h2 className="text-lg font-bold text-slate-900">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X className="size-5" />
            </IconButton>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEscape(onClose, open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onMouseDown={onClose}>
      <aside
        className={cn('flex h-full w-full animate-slide-in flex-col bg-white shadow-pop', width)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 text-lg font-bold text-slate-900">{title}</div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-slate-100 bg-white p-4">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

export function Toaster() {
  const toasts = useToasts((state) => state.toasts);
  const dismiss = useToasts((state) => state.dismiss);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-pop"
        >
          {t.tone === 'success' ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" />
          ) : t.tone === 'error' ? (
            <XCircle className="mt-0.5 size-5 shrink-0 text-rose-600" />
          ) : (
            <Info className="mt-0.5 size-5 shrink-0 text-sky-600" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{t.title}</p>
            {t.body && <p className="mt-0.5 text-sm text-slate-600">{t.body}</p>}
          </div>
          <button type="button" aria-label="Dismiss" className="text-slate-400 hover:text-slate-700" onClick={() => dismiss(t.id)}>
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-500 uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('border-b border-slate-100 px-4 py-3 align-middle text-slate-700', className)}>
      {children}
    </td>
  );
}
