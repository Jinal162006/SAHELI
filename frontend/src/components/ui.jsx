import {
  CircleAlert,
  CircleCheck,
  Copy,
  Check as CheckIcon,
  Info,
  LoaderCircle,
  OctagonAlert,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react';
import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../lib/i18n';

const cx = (...classes) => classes.filter(Boolean).join(' ');
export { cx };

// Buttons -----------------------------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary: 'bg-pastel-lavender text-ink hover:bg-pastel-lilac shadow-sm disabled:opacity-60',
  secondary: 'bg-pastel-blue text-ink border border-pastel-blue-strong hover:bg-pastel-lavender disabled:text-muted',
  soft: 'bg-pastel-lilac text-ink hover:bg-pastel-pink disabled:opacity-60',
  ghost: 'text-ink-soft hover:bg-pastel-blue hover:text-ink disabled:text-muted',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 shadow-sm disabled:bg-danger-100',
  'danger-soft': 'bg-danger-50 text-danger-700 border border-danger-100 hover:bg-danger-100',
  safe: 'bg-safe-600 text-white hover:bg-safe-700 shadow-sm',
};
const BUTTON_SIZES = {
  sm: 'min-h-9 px-3 py-1.5 text-sm gap-1.5 rounded-lg',
  md: 'min-h-11 px-4 py-2 text-[0.95rem] gap-2 rounded-xl',
  lg: 'min-h-13 px-6 py-2.5 text-base gap-2.5 rounded-xl',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center text-center leading-tight font-semibold transition-colors disabled:cursor-not-allowed select-none',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-[1.1em] shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
});

export function LinkButton({ to, href, variant = 'primary', size = 'md', icon: Icon, className, children, ...props }) {
  const classes = cx(
    'inline-flex items-center justify-center text-center leading-tight font-semibold transition-colors select-none',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
  const content = (
    <>
      {Icon ? <Icon className="size-[1.1em] shrink-0" aria-hidden /> : null}
      {children}
    </>
  );
  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {content}
      </a>
    );
  }
  return (
    <Link to={to} className={classes} {...props}>
      {content}
    </Link>
  );
}

// Surfaces ----------------------------------------------------------------------------------

export function Card({ as: Tag = 'div', className, children, ...props }) {
  return (
    <Tag className={cx('card', className)} {...props}>
      {children}
    </Tag>
  );
}

export function ClayCard({ variant = 'lavender', as: Tag = 'div', className, children, ...props }) {
  return (
    <Tag className={cx('card clay-card', `clay-${variant}`, className)} {...props}>
      {children}
    </Tag>
  );
}

export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? <p className="mb-1 text-sm font-semibold text-brand-700">{eyebrow}</p> : null}
        <h1 className="font-display text-[1.75rem] font-semibold text-ink sm:text-[2rem]">{title}</h1>
        {description ? <p className="mt-2 text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({ children, id, className }) {
  return (
    <h2 id={id} className={cx('text-lg font-semibold text-ink', className)}>
      {children}
    </h2>
  );
}

const NOTICE_TONES = {
  info: { box: 'bg-info-50 border-info-600/20 text-info-700', icon: Info },
  success: { box: 'bg-safe-50 border-safe-600/20 text-safe-700', icon: CircleCheck },
  warning: { box: 'bg-caution-50 border-caution-600/25 text-caution-700', icon: CircleAlert },
  danger: { box: 'bg-danger-50 border-danger-600/25 text-danger-700', icon: OctagonAlert },
  neutral: { box: 'bg-lavender-50 border-line text-ink-soft', icon: Info },
};

export function Notice({ tone = 'info', title, children, icon, className, action, role }) {
  const style = NOTICE_TONES[tone];
  const Icon = icon ?? style.icon;
  return (
    <div role={role} className={cx('flex gap-3 rounded-xl border p-4 text-[0.95rem]', style.box, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cx(title && 'mt-1', 'text-ink-soft')}>{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children, className }) {
  const tones = {
    neutral: 'bg-lavender-100 text-ink-soft',
    brand: 'bg-brand-50 text-brand-700',
    safe: 'bg-safe-50 text-safe-700',
    caution: 'bg-caution-50 text-caution-700',
    high: 'bg-high-50 text-high-700',
    danger: 'bg-danger-50 text-danger-700',
    info: 'bg-info-50 text-info-700',
  };
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {children}
    </span>
  );
}

// Risk levels -------------------------------------------------------------------------------

export const LEVEL_STYLE = {
  low: { tone: 'safe', icon: CircleCheck, ring: 'border-safe-600/25 bg-safe-50', text: 'text-safe-700' },
  medium: { tone: 'caution', icon: CircleAlert, ring: 'border-caution-600/25 bg-caution-50', text: 'text-caution-700' },
  high: { tone: 'high', icon: TriangleAlert, ring: 'border-high-600/25 bg-high-50', text: 'text-high-700' },
  critical: { tone: 'danger', icon: OctagonAlert, ring: 'border-danger-600/30 bg-danger-50', text: 'text-danger-700' },
};

export function LevelBadge({ level, size = 'md' }) {
  const t = useT();
  const style = LEVEL_STYLE[level] ?? LEVEL_STYLE.medium;
  const Icon = style.icon;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg border font-semibold',
        style.ring,
        style.text,
        size === 'lg' ? 'px-3 py-1.5 text-base' : 'px-2 py-0.5 text-sm',
      )}
    >
      <Icon className={size === 'lg' ? 'size-5' : 'size-4'} aria-hidden />
      {t(`levels.${level}`)}
    </span>
  );
}

// Forms -------------------------------------------------------------------------------------

export function Field({ label, hint, error, children, optional, className, htmlFor }) {
  const t = useT();
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
          {label}
          {optional ? <span className="ml-1 font-normal text-muted">({t('common.optional')})</span> : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="text-sm text-muted">{hint}</p> : null}
      {error ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-danger-700" role="alert">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const INPUT =
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 text-ink placeholder:text-muted/70 transition-colors hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-200 disabled:bg-lavender-50';

export const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
  return <input ref={ref} className={cx(INPUT, 'h-11', invalid && 'border-danger-600', className)} aria-invalid={invalid || undefined} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, invalid, ...props }, ref) {
  return <textarea ref={ref} className={cx(INPUT, 'py-3 leading-relaxed', invalid && 'border-danger-600', className)} aria-invalid={invalid || undefined} {...props} />;
});

export function Select({ className, children, ...props }) {
  return (
    <select className={cx(INPUT, 'h-11 appearance-auto pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, description, className, ...props }) {
  const id = useId();
  return (
    <div className={cx('flex items-start gap-3', className)}>
      <input id={id} type="checkbox" className="mt-1 size-5 shrink-0 cursor-pointer rounded accent-brand-600" {...props} />
      <label htmlFor={id} className="cursor-pointer">
        <span className="font-medium text-ink">{label}</span>
        {description ? <span className="block text-sm text-muted">{description}</span> : null}
      </label>
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <span className="font-medium text-ink">{label}</span>
        {description ? <span className="block text-sm text-muted">{description}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-brand-600' : 'bg-line-strong',
        )}
      >
        <span className={cx('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
      </button>
    </div>
  );
}

/** A row of selectable chips (single or multiple choice). */
export function Chips({ options, value, onChange, multiple = false, label }) {
  const selected = multiple ? new Set(value) : new Set([value]);
  const toggle = (option) => {
    if (multiple) {
      const next = new Set(value);
      next.has(option) ? next.delete(option) : next.add(option);
      onChange([...next]);
    } else {
      onChange(option === value ? null : option);
    }
  };
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(({ value: option, label: text }) => {
        const on = selected.has(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(option)}
            className={cx(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              on ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-line-strong bg-surface text-ink-soft hover:border-brand-300',
            )}
          >
            {on ? <CheckIcon className="mr-1 inline size-3.5" aria-hidden /> : null}
            {text}
          </button>
        );
      })}
    </div>
  );
}

// States ------------------------------------------------------------------------------------

export function Spinner({ className }) {
  return <LoaderCircle className={cx('size-5 animate-spin text-brand-600', className)} aria-hidden />;
}

export function Loading({ label }) {
  const t = useT();
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status" aria-live="polite">
      <Spinner />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, titleAs: Title = 'p' }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
      {Icon ? (
        <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-lavender-100 text-brand-700">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : null}
      <Title className="font-semibold text-ink">{title}</Title>
      {children ? <div className="mt-1 max-w-md text-ink-soft">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function errorMessage(t, error) {
  if (!error) return '';
  const code = error.code;
  const known = {
    network: 'errors.network',
    unauthorised: 'errors.unauthorised',
    rate_limited: 'errors.rate_limited',
    server_error: 'errors.server',
    not_found: 'errors.not_found',
  };
  if (known[code]) return t(known[code]);
  if (error.message && error.message !== 'network') return error.message;
  return t('errors.generic');
}

export function ErrorState({ error, onRetry, title }) {
  const t = useT();
  return (
    <Notice
      tone="danger"
      role="alert"
      title={title ?? t('errors.title')}
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
            {t('common.try_again')}
          </Button>
        ) : null
      }
    >
      {errorMessage(t, error)}
    </Notice>
  );
}

// Dialog ------------------------------------------------------------------------------------

export function Dialog({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const t = useT();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-ink/40',
        size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
      )}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-lavender-100" aria-label={t('common.close')}>
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel, tone = 'danger', loading }) {
  const t = useT();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-ink-soft">{children}</div>
    </Dialog>
  );
}

export function CopyButton({ text, label, size = 'sm', variant = 'secondary' }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      icon={copied ? CheckIcon : Copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? t('common.copied') : (label ?? t('common.copy'))}
    </Button>
  );
}
