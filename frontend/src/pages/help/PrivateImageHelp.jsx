import { ExternalLink, FileText, FolderLock, HeartHandshake } from 'lucide-react';
import { useState } from 'react';
import { ResourceList } from '../../components/Resources';
import { Button, Card, LinkButton, Notice, PageHeader } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

function Step({ title, children }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-ink-soft">{children}</div>
    </Card>
  );
}

function External({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
      {children}
      <ExternalLink className="size-4" aria-hidden />
    </a>
  );
}

export default function PrivateImageHelp() {
  const { t } = useI18n();
  const { status } = useAuth();
  useDocumentTitle(t('private_help.title'));
  const [under18, setUnder18] = useState(null);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('private_help.title')} description={t('private_help.description')} />
      <Notice tone="info" icon={HeartHandshake} title={t('private_help.first')}>
        {t('private_help.honest')}
      </Notice>

      <Step title={t('private_help.step1_title')}>
        <p>{t('private_help.step1_body')}</p>
      </Step>

      <Step title={t('private_help.step2_title')}>
        <p>{t('private_help.step2_body')}</p>
        {status === 'signed_in' ? (
          <LinkButton to="/vault" variant="secondary" size="sm" icon={FolderLock}>
            {t('private_help.vault_cta')}
          </LinkButton>
        ) : null}
      </Step>

      <Step title={t('private_help.step3_title')}>
        <p className="font-medium text-ink">{t('private_help.under18_q')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={under18 === true ? 'primary' : 'secondary'} size="sm" onClick={() => setUnder18(true)} aria-pressed={under18 === true}>
            {t('private_help.under18_yes')}
          </Button>
          <Button variant={under18 === false ? 'primary' : 'secondary'} size="sm" onClick={() => setUnder18(false)} aria-pressed={under18 === false}>
            {t('private_help.under18_no')}
          </Button>
        </div>
        {under18 === true ? (
          <div className="space-y-2 rounded-xl bg-lavender-50 p-4">
            <p>{t('private_help.under18_answer')}</p>
            <External href="https://takeitdown.ncmec.org">Take It Down</External>
          </div>
        ) : null}
        {under18 === false ? (
          <div className="space-y-2 rounded-xl bg-lavender-50 p-4">
            <p>{t('private_help.adult_answer')}</p>
            <External href="https://stopncii.org">StopNCII.org</External>
          </div>
        ) : null}
      </Step>

      <Step title={t('private_help.step4_title')}>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t('private_help.step4_platform')}</li>
          <li>
            {t('private_help.step4_google')}{' '}
            <a className="font-semibold text-brand-700 underline" href="https://support.google.com/accounts/answer/17045517" target="_blank" rel="noopener noreferrer">
              support.google.com
            </a>
          </li>
          <li>
            {t('private_help.step4_portal')}{' '}
            <a className="font-semibold text-brand-700 underline" href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">
              cybercrime.gov.in
            </a>
          </li>
        </ul>
        {status === 'signed_in' ? (
          <LinkButton to="/reports/new" state={{ incident_type: 'sextortion' }} variant="secondary" size="sm" icon={FileText}>
            {t('private_help.report_cta')}
          </LinkButton>
        ) : null}
      </Step>

      <Step title={t('private_help.step5_title')}>
        <p>{t('private_help.step5_body')}</p>
        <ResourceList ids={['women_helpline_181', 'ncw_helpline', 'childline_1098', 'tele_manas', 'nalsa_15100']} />
      </Step>
    </div>
  );
}
