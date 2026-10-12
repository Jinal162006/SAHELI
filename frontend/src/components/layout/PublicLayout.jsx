import { Phone } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { LanguagePicker } from '../LanguagePicker';
import { Logo } from '../Logo';
import { LinkButton } from '../ui';
import { OfflineBanner } from './OfflineBanner';

export function PublicHeader() {
  const t = useT();
  const { status } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <nav aria-label={t('nav.main')} className="flex items-center gap-1 sm:gap-2">
          <Link to="/help" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-lavender-100 hover:text-ink md:inline-block">
            {t('nav.help')}
          </Link>
          <span className="hidden sm:block">
            <LanguagePicker />
          </span>
          {status === 'signed_in' ? (
            <LinkButton to="/home" size="sm" className="whitespace-nowrap">
              {t('nav.home')}
            </LinkButton>
          ) : (
            <LinkButton to="/sign-in" size="sm" variant="secondary" className="whitespace-nowrap">
              {t('nav.sign_in')}
            </LinkButton>
          )}
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const t = useT();
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-md text-sm text-muted">{t('footer.note')}</p>
          <a href="tel:112" className="inline-flex items-center gap-2 text-sm font-semibold text-danger-700 hover:underline">
            <Phone className="size-4" aria-hidden />
            {t('footer.danger')}
          </a>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap content-start gap-x-6 gap-y-2 text-sm md:justify-end">
          <Link className="text-ink-soft hover:text-ink hover:underline" to="/help">{t('footer.help')}</Link>
          <Link className="text-ink-soft hover:text-ink hover:underline" to="/privacy">{t('footer.privacy')}</Link>
          <Link className="text-ink-soft hover:text-ink hover:underline" to="/terms">{t('footer.terms')}</Link>
          <Link className="text-ink-soft hover:text-ink hover:underline" to="/contact">{t('footer.contact')}</Link>
          <span className="w-full sm:hidden">
            <LanguagePicker />
          </span>
        </nav>
      </div>
    </footer>
  );
}

export function PublicLayout({ contained = false }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        {t('nav.skip_to_content')}
      </a>
      <PublicHeader />
      <OfflineBanner />
      <main id="main" className={contained ? 'page-atmosphere page-atmosphere-check mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-10' : 'flex-1'}>
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
