import { useConfig, useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { Notice } from '../../components/ui';

export const POLICY_DATE = '2026-10-11';

export function useOperator() {
  const { config } = useConfig();
  return config?.operator ?? { name: null, support_email: null, governing_law: null };
}

export function OperatorNotice() {
  const operator = useOperator();
  if (operator.name && operator.support_email) return null;
  return (
    <Notice tone="warning" className="mb-6">
      The operator&apos;s name and contact email for this deployment have not been configured yet. They must be completed before SAHELI
      is offered to the public.
    </Notice>
  );
}

export function LegalPage({ title, children }) {
  const { language, t } = useI18n();
  useDocumentTitle(title);
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted">{t('legal.updated', { date: POLICY_DATE })}</p>
      {language !== 'en' ? <p className="mt-2 text-sm text-muted">This page is available in English only for now.</p> : null}
      <div className="legal mt-8 space-y-8 text-ink-soft [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-ink [&_li]:mt-1.5 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-semibold [&_a]:text-brand-700 [&_a]:underline">
        {children}
      </div>
    </article>
  );
}
