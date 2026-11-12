import { ArrowLeft, Pencil, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { CopyButton, ErrorState, LinkButton, Loading, Notice, Button } from '../../components/ui';
import { formatDate, formatDateTime } from '../../lib/format';
import { useApi, useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

function Block({ title, children }) {
  return (
    <section className="break-inside-avoid border-t border-line py-5">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}

export function reportAsText(t, report, language) {
  const d = report.details;
  const none = t('reports.view.none');
  const lines = [
    `${report.title}`,
    `${t('reports.view.type')}: ${t(`reports.types.${report.incident_type}`)}`,
    t('reports.view.generated', { date: formatDateTime(new Date().toISOString(), language) }),
    t('reports.view.prepared'),
    '',
    `${t('reports.view.summary')}:`,
    d.summary || none,
    '',
    `${t('reports.view.timeline')}:`,
    ...(d.timeline.length ? d.timeline.map((e) => `- ${e.when ? `${e.when}: ` : ''}${e.what}`) : [none]),
    '',
    `${t('reports.view.people')}:`,
    ...(d.people.length
      ? d.people.map((p, i) =>
          `- Person ${i + 1}: ${[p.name, p.handle, p.platform, p.profile_url, p.phone, p.payment_ids, p.role].filter(Boolean).join(' | ')}`,
        )
      : [none]),
    '',
    `${t('reports.view.money')}:`,
    d.financial_loss?.amount
      ? `${d.financial_loss.amount} ${d.financial_loss.currency} · ${d.financial_loss.method} · ${d.financial_loss.transaction_refs} · ${d.financial_loss.date}`
      : none,
    '',
    `${t('reports.view.account')}:`,
    d.narrative || none,
    '',
    `${t('reports.view.evidence')}:`,
    ...(report.evidence.length ? report.evidence.map((e) => `- ${e.title} (${t(`vault.kinds.${e.kind}`)})`) : [none]),
    '',
    `${t('reports.view.reported')}:`,
    ...(d.reported_to.length ? d.reported_to.map((r) => `- ${r.where} ${r.reference} ${r.date}`.trim()) : [none]),
  ];
  if (d.notes) lines.push('', `${t('reports.view.notes')}:`, d.notes);
  return lines.join('\n');
}

export default function ReportView() {
  const { id } = useParams();
  const { t, language } = useI18n();
  const { data: report, error, loading, reload } = useApi(`/api/incidents/${id}`);
  useDocumentTitle(report?.title ?? t('reports.title'));

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const d = report.details;
  const none = <p className="text-muted">{t('reports.view.none')}</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          {t('reports.title')}
        </Link>
        <div className="flex flex-wrap gap-2">
          <LinkButton to={`/reports/${id}/edit`} variant="secondary" size="sm" icon={Pencil}>
            {t('reports.view.edit')}
          </LinkButton>
          <CopyButton text={reportAsText(t, report, language)} label={t('reports.view.copy')} />
          <Button size="sm" icon={Printer} onClick={() => window.print()}>
            {t('reports.view.print')}
          </Button>
        </div>
      </div>

      <article className="card p-6 sm:p-10">
        <header>
          <p className="text-sm font-semibold text-brand-700">{t(`reports.types.${report.incident_type}`)}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">{report.title}</h1>
          <p className="mt-2 text-sm text-muted">{t('reports.view.generated', { date: formatDateTime(new Date().toISOString(), language) })}</p>
          <p className="mt-3 rounded-lg bg-lavender-50 px-3 py-2 text-sm text-ink-soft">{t('reports.view.prepared')}</p>
        </header>

        <Block title={t('reports.view.summary')}>{d.summary ? <p className="whitespace-pre-wrap">{d.summary}</p> : none}</Block>

        <Block title={t('reports.view.timeline')}>
          {d.timeline.length ? (
            <ol className="space-y-2">
              {d.timeline.map((e, i) => (
                <li key={i} className="grid gap-1 sm:grid-cols-[9rem_1fr]">
                  <span className="font-semibold">{e.when || '·'}</span>
                  <span className="whitespace-pre-wrap">{e.what}</span>
                </li>
              ))}
            </ol>
          ) : (
            none
          )}
        </Block>

        <Block title={t('reports.view.people')}>
          {d.people.length ? (
            <div className="space-y-3">
              {d.people.map((p, i) => (
                <dl key={i} className="grid gap-x-4 gap-y-1 rounded-xl border border-line p-3 text-sm sm:grid-cols-[10rem_1fr]">
                  <dt className="font-semibold">Person {i + 1}</dt>
                  <dd>{p.role}</dd>
                  {[
                    ['person_name', p.name],
                    ['person_handle', p.handle],
                    ['person_platform', p.platform],
                    ['person_url', p.profile_url],
                    ['person_phone', p.phone],
                    ['person_payment', p.payment_ids],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, v]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted">{t(`reports.editor.${label}`)}</dt>
                        <dd className="break-all">{v}</dd>
                      </div>
                    ))}
                </dl>
              ))}
            </div>
          ) : (
            none
          )}
        </Block>

        <Block title={t('reports.view.money')}>
          {d.financial_loss?.amount ? (
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
              <dt className="text-muted">{t('reports.editor.money_amount')}</dt>
              <dd className="font-semibold">
                {d.financial_loss.amount} {d.financial_loss.currency}
              </dd>
              {d.financial_loss.method ? (
                <>
                  <dt className="text-muted">{t('reports.editor.money_method')}</dt>
                  <dd>{d.financial_loss.method}</dd>
                </>
              ) : null}
              {d.financial_loss.transaction_refs ? (
                <>
                  <dt className="text-muted">{t('reports.editor.money_refs')}</dt>
                  <dd className="break-all">{d.financial_loss.transaction_refs}</dd>
                </>
              ) : null}
              {d.financial_loss.date ? (
                <>
                  <dt className="text-muted">{t('reports.editor.money_date')}</dt>
                  <dd>{d.financial_loss.date}</dd>
                </>
              ) : null}
              <dt className="text-muted">{t('reports.editor.money_bank_informed')}</dt>
              <dd>{d.financial_loss.bank_informed ? t('common.yes') : t('common.no')}</dd>
            </dl>
          ) : (
            none
          )}
        </Block>

        <Block title={t('reports.view.account')}>{d.narrative ? <p className="whitespace-pre-wrap leading-relaxed">{d.narrative}</p> : none}</Block>

        <Block title={t('reports.view.evidence')}>
          {report.evidence.length ? (
            <>
              <ul className="list-disc space-y-1 pl-5">
                {report.evidence.map((e) => (
                  <li key={e.id}>
                    {e.title} <span className="text-muted">({t(`vault.kinds.${e.kind}`)}{e.occurred_at ? `, ${formatDate(e.occurred_at, language)}` : ''})</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-muted">{t('reports.view.evidence_note')}</p>
            </>
          ) : (
            none
          )}
        </Block>

        <Block title={t('reports.view.reported')}>
          {d.reported_to.length ? (
            <ul className="space-y-1">
              {d.reported_to.map((r, i) => (
                <li key={i}>
                  <span className="font-semibold">{r.where}</span>
                  {r.reference ? ` · ${r.reference}` : ''}
                  {r.date ? ` · ${r.date}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            none
          )}
        </Block>

        {d.notes ? (
          <Block title={t('reports.view.notes')}>
            <p className="whitespace-pre-wrap">{d.notes}</p>
          </Block>
        ) : null}
      </article>

      <Notice tone="info" title={t('reports.view.where_title')} className="no-print mt-6">
        <ul className="list-disc space-y-1 pl-5">
          <li>{t('reports.view.where_1930')}</li>
          <li>{t('reports.view.where_portal')}</li>
          <li>{t('reports.view.where_platform')}</li>
          <li>{t('reports.view.where_people')}</li>
        </ul>
      </Notice>
    </div>
  );
}
