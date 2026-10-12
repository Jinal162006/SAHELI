import { ArrowRight, CircleCheck, FileText, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router';
import { ClayCard, Notice, PageHeader, SectionTitle } from '../components/ui';
import { useDocumentTitle } from '../lib/hooks';
import { useI18n } from '../lib/i18n';

export default function Safety() {
  const { t } = useI18n();
  useDocumentTitle(t('nav.safety'));
  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.safety')} description="A calm overview of your safety tools and support options." />
      <Notice tone="success" title="Your safety toolkit is ready">
        Choose a check, review your evidence, or contact someone you trust. SOS is always available in the navigation.
      </Notice>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Safety tools">
        <Link to="/check" className="group">
          <ClayCard variant="mint" className="h-full p-5 transition-transform hover:-translate-y-0.5">
            <CircleCheck className="size-7 text-safe-600" aria-hidden />
            <h2 className="mt-4 font-semibold">Run a check</h2>
            <p className="mt-1 text-sm text-ink-soft">Review a conversation, image, link, or profile.</p>
          </ClayCard>
        </Link>
        <Link to="/evidence" className="group">
          <ClayCard variant="blue" className="h-full p-5 transition-transform hover:-translate-y-0.5">
            <ShieldCheck className="size-7 text-brand-600" aria-hidden />
            <h2 className="mt-4 font-semibold">Protect your evidence</h2>
            <p className="mt-1 text-sm text-ink-soft">Keep important items private and organised.</p>
          </ClayCard>
        </Link>
        <Link to="/contacts" className="group">
          <ClayCard variant="mint" className="h-full p-5 transition-transform hover:-translate-y-0.5">
            <Users className="size-7 text-info-600" aria-hidden />
            <h2 className="mt-4 font-semibold">Trusted contacts</h2>
            <p className="mt-1 text-sm text-ink-soft">Manage the people who can support you.</p>
          </ClayCard>
        </Link>
      </section>
      <section>
        <SectionTitle>Keep your records clear</SectionTitle>
        <ClayCard variant="lilac" className="mt-3 flex items-center gap-4 p-5">
          <FileText className="size-6 text-brand-600" aria-hidden />
          <p className="flex-1 text-sm text-ink-soft">Use incident reports when you want to record what happened.</p>
          <Link to="/reports" className="inline-flex items-center gap-1 font-semibold text-brand-700">
            Reports <ArrowRight className="size-4" aria-hidden />
          </Link>
        </ClayCard>
      </section>
    </div>
  );
}
