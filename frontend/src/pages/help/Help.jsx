import { ArrowRight, ImageOff, MessageCircleHeart } from 'lucide-react';
import { Link } from 'react-router';
import { ResourceCard, useResources } from '../../components/Resources';
import { Card, ErrorState, Loading, PageHeader } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

const GROUP_ORDER = ['emergency', 'helpline', 'portal', 'counselling', 'legal', 'tool'];

export default function Help() {
  const { t, language } = useI18n();
  useDocumentTitle(t('help.title'));
  const { data, error, loading, reload } = useResources();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('help.title')} description={t('help.description')} />

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <Link to="/help/private-images" className="card flex items-start gap-3 p-4 hover:shadow-[var(--shadow-lift)]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
            <ImageOff className="size-5" aria-hidden />
          </span>
          <span>
            <span className="flex items-center gap-1 font-semibold">
              {t('help.private_title')}
              <ArrowRight className="size-4" aria-hidden />
            </span>
            <span className="text-sm text-ink-soft">{t('help.private_link')}</span>
          </span>
        </Link>
        <Link to="/companion" className="card flex items-start gap-3 p-4 hover:shadow-[var(--shadow-lift)]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <MessageCircleHeart className="size-5" aria-hidden />
          </span>
          <span>
            <span className="flex items-center gap-1 font-semibold">
              {t('help.companion_title')}
              <ArrowRight className="size-4" aria-hidden />
            </span>
            <span className="text-sm text-ink-soft">{t('help.companion_body')}</span>
          </span>
        </Link>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="space-y-8">
          {GROUP_ORDER.map((group) => {
            const items = data.resources.filter((r) => r.kind === group);
            if (!items.length) return null;
            return (
              <section key={group} aria-labelledby={`group-${group}`}>
                <h2 id={`group-${group}`} className="mb-3 text-lg font-semibold">
                  {t(`help.groups.${group}`)}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((r) => (
                    <ResourceCard key={r.id} resource={r} />
                  ))}
                </div>
              </section>
            );
          })}
          <Card className="p-4">
            <p className="text-sm text-muted">{t('help.checked', { date: formatDate(data.checked_on, language) })}</p>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {data.resources.map((r) => (
                <li key={r.id}>
                  {r.name}: {t('help.source')}{' '}
                  <a href={r.source} target="_blank" rel="noopener noreferrer" className="break-all underline">
                    {r.source}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
