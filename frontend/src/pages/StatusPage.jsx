import { ExternalLink, MapPin, Phone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { LanguagePicker } from '../components/LanguagePicker';
import { LogoMark } from '../components/Logo';
import { Card, Loading, Notice } from '../components/ui';
import { api } from '../lib/api';
import { formatTime, timeAgo } from '../lib/format';
import { useDocumentTitle, useInterval } from '../lib/hooks';
import { useI18n } from '../lib/i18n';

/** What a trusted contact sees through their private link. No account needed. */
export default function StatusPage() {
  const { token } = useParams();
  const { t, language } = useI18n();
  useDocumentTitle(t('status_page.title'));
  const [state, setState] = useState({ loading: true, data: null, error: null });

  const load = useCallback(() => {
    api(`/api/status/${encodeURIComponent(token)}`, { anonymous: true })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState((s) => ({ loading: false, data: error.status === 404 ? null : s.data, error })));
  }, [token]);

  useEffect(load, [load]);
  useInterval(load, 30000);

  const { data, error } = state;
  const expired = error?.status === 404;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <span className="inline-flex items-center gap-2 font-display text-lg font-semibold">
          <LogoMark className="size-7" />
          SAHELI
        </span>
        <LanguagePicker compact />
      </header>
      <main id="main" className="mx-auto max-w-lg space-y-4 px-4 pb-16">
        {state.loading || expired || !data ? <h1 className="sr-only">{t('status_page.title')}</h1> : null}
        {state.loading ? (
          <Loading label={t('status_page.loading')} />
        ) : expired ? (
          <Notice tone="neutral">{t('status_page.expired')}</Notice>
        ) : !data ? (
          <Notice tone="warning">{t('errors.network')}</Notice>
        ) : (
          <>
            <Card className={data.status === 'active' ? 'border-2 border-danger-600/40 p-5' : 'p-5'}>
              {data.status === 'active' ? (
                <>
                  <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-danger-700">
                    <span className="recording-dot size-2.5 rounded-full bg-danger-600" aria-hidden />
                    {t('status_page.title')}
                  </p>
                  <h1 className="mt-2 font-display text-2xl font-semibold">{t('status_page.active', { name: data.name })}</h1>
                  <p className="mt-1 text-ink-soft">{t('status_page.started', { time: `${formatTime(data.started_at, language)} (${timeAgo(data.started_at, language)})` })}</p>
                </>
              ) : (
                <>
                  <h1 className="font-display text-2xl font-semibold">{t('status_page.ended', { name: data.name })}</h1>
                  <p className="mt-1 text-ink-soft">{t('status_page.ended_body', { time: timeAgo(data.ended_at, language) })}</p>
                </>
              )}
            </Card>

            {data.status === 'active' ? (
              <a href="tel:112" className="flex items-center justify-center gap-2 rounded-2xl bg-danger-600 px-4 py-4 text-lg font-bold text-white">
                <Phone className="size-5" aria-hidden />
                {t('status_page.call_112')}
              </a>
            ) : null}

            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <MapPin className="size-5 text-brand-600" aria-hidden />
                {t('status_page.location')}
              </h2>
              {!data.location_shared ? (
                <p className="mt-2 text-ink-soft">{t('status_page.location_not_shared')}</p>
              ) : data.location ? (
                <div className="mt-2 space-y-2">
                  <p className="text-ink-soft">{t('status_page.location_at', { time: timeAgo(data.location.at, language) })}</p>
                  {data.location.accuracy_m ? <p className="text-sm text-muted">{t('status_page.accuracy', { meters: data.location.accuracy_m })}</p> : null}
                  <a
                    href={data.location.maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white"
                  >
                    {t('status_page.open_map')}
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                </div>
              ) : (
                <p className="mt-2 text-ink-soft">{t('status_page.no_location')}</p>
              )}
            </Card>

            <p className="text-sm text-muted">{t('status_page.refresh_note')}</p>
            <p className="text-sm text-muted">{t('status_page.what_is_this', { name: data.name })}</p>
          </>
        )}
      </main>
    </div>
  );
}
