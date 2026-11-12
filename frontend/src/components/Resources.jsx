import { ExternalLink, Phone } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { cx, ErrorState, Spinner } from './ui';

export function useResources() {
  return useApi('/api/resources');
}

export function ResourceCard({ resource, compact = false }) {
  const t = useT();
  const description = t(`help.resource.${resource.id}`);
  return (
    <div className={cx('card flex h-full flex-col gap-2', compact ? 'p-4' : 'p-5')}>
      <p className="font-semibold text-ink">{resource.name}</p>
      <p className="text-sm text-ink-soft">{description}</p>
      {resource.hours ? <p className="text-xs text-muted">{t('help.hours', { hours: resource.hours })}</p> : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        {resource.phone ? (
          <a
            href={`tel:${resource.phone.replace(/[^\d+]/g, '')}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800 hover:bg-brand-100"
          >
            <Phone className="size-4" aria-hidden />
            {resource.phone}
          </a>
        ) : null}
        {resource.url ? (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-semibold text-ink-soft hover:border-brand-300 hover:text-ink"
          >
            {new URL(resource.url).hostname.replace(/^www\./, '')}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** Cards for specific resource ids, in the given order. */
export function ResourceList({ ids, compact = true, className }) {
  const { data, error, loading, reload } = useResources();
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const byId = Object.fromEntries((data?.resources ?? []).map((r) => [r.id, r]));
  const items = (ids ?? []).map((id) => byId[id]).filter(Boolean);
  if (!items.length) return null;
  return (
    <div className={cx('grid gap-3 sm:grid-cols-2', className)}>
      {items.map((r) => (
        <ResourceCard key={r.id} resource={r} compact={compact} />
      ))}
    </div>
  );
}
