import { Phone } from 'lucide-react';
import { Link } from 'react-router';
import { Logo } from '../../components/Logo';
import { QuickExit } from '../../components/QuickExit';
import { LanguagePicker } from '../../components/LanguagePicker';
import { useDocumentTitle } from '../../lib/hooks';
import { useT } from '../../lib/i18n';

export function AuthLayout({ title, description, children, footer }) {
  const t = useT();
  useDocumentTitle(title);
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguagePicker compact />
          <QuickExit compact />
        </div>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12">
        <div className="w-full max-w-md">
          <div className="card p-6 sm:p-8">
            <h1 className="font-display text-2xl font-semibold">{title}</h1>
            {description ? <p className="mt-2 text-ink-soft">{description}</p> : null}
            <div className="mt-6">{children}</div>
          </div>
          {footer ? <div className="mt-5 text-center text-sm text-ink-soft">{footer}</div> : null}
          <p className="mt-6 text-center text-sm text-muted">{t('auth.leave_safely')}</p>
          <p className="mt-3 text-center text-sm">
            <a href="tel:112" className="inline-flex items-center gap-1.5 font-semibold text-danger-700 hover:underline">
              <Phone className="size-4" aria-hidden />
              {t('footer.danger')}
            </a>
          </p>
          <p className="mt-6 text-center text-xs text-muted">
            <Link to="/privacy" className="hover:underline">
              {t('footer.privacy')}
            </Link>
            {' · '}
            <Link to="/terms" className="hover:underline">
              {t('footer.terms')}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export function authErrorMessage(t, error) {
  const code = error?.code || error?.error_code;
  const key = `auth.errors.${code}`;
  const known = [
    'invalid_credentials',
    'user_already_exists',
    'weak_password',
    'same_password',
    'email_not_confirmed',
    'over_request_rate_limit',
    'over_email_send_rate_limit',
    'validation_failed',
  ];
  if (known.includes(code)) return t(key);
  if (error?.status === 0 || error?.name === 'AuthRetryableFetchError') return t('errors.network');
  return t('auth.errors.generic');
}
