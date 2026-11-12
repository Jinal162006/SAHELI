import { FileText, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, EmptyState, ErrorState, LinkButton, Loading, Notice, PageHeader } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { useApi, useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

export default function Reports() {
  const { t, language } = useI18n();
  useDocumentTitle(t('reports.title'));
  const { data, error, loading, reload } = useApi('/api/incidents');

  return (
    <div>
      <PageHeader
        title={t('reports.title')}
        description={t('reports.description')}
        actions={
          <LinkButton to="/reports/new" icon={Plus}>
            {t('reports.new')}
          </LinkButton>
        }
      />
      <Notice tone="neutral" className="mb-6">
        {t('reports.not_police')}
      </Notice>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data.items.length ? (
        <EmptyState
          icon={FileText}
          title={t('reports.empty_title')}
          action={
            <LinkButton to="/reports/new" icon={Plus}>
              {t('reports.new')}
            </LinkButton>
          }
        >
          {t('reports.empty_body')}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.items.map((item) => (
            <li key={item.id}>
              <Link to={`/reports/${item.id}`} className="card block h-full p-4 transition-shadow hover:shadow-[var(--shadow-lift)]">
                <p className="font-semibold text-ink">{item.title}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{t(`reports.types.${item.incident_type}`)}</Badge>
                  <span className="text-xs text-muted">{t('reports.updated', { date: formatDate(item.updated_at, language) })}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
