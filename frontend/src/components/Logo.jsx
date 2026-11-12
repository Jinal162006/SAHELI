import { Link } from 'react-router';
import { cx } from './ui';

/** Two figures side by side: someone beside you. Also used for the favicon (public/favicon.svg). */
export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={cx('shrink-0', className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#6A2BD9" />
      <circle cx="20.6" cy="12.2" r="3.4" fill="#F8C8DF" />
      <path d="M14.6 25.5a6 6 0 0 1 12 0z" fill="#F8C8DF" />
      <circle cx="12.4" cy="11.4" r="4" fill="#FFFFFF" />
      <path d="M5.4 25.5a7 7 0 0 1 14 0z" fill="#FFFFFF" />
    </svg>
  );
}

export function Logo({ to = '/', className, label = 'SAHELI home' }) {
  return (
    <Link to={to} className={cx('inline-flex items-center gap-2.5 rounded-lg', className)} aria-label={label}>
      <LogoMark className="size-8" />
      <span className="font-display text-xl font-semibold tracking-[0.06em] text-ink">SAHELI</span>
    </Link>
  );
}
