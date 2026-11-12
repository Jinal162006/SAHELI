import { useT } from '../../lib/i18n';
import { Button, Notice } from '../../components/ui';

export function AuthUnavailable() {
  const t = useT();
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <Notice
        tone="warning"
        title={t('auth.errors.unavailable')}
        action={
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              {t('common.try_again')}
            </Button>
            <a className="inline-flex h-9 items-center font-semibold text-danger-700 hover:underline" href="tel:112">
              {t('sos.call_112')}
            </a>
          </div>
        }
      >
        {t('errors.config')}
      </Notice>
    </div>
  );
}
