import { Compass } from 'lucide-react';
import { EmptyState, LinkButton } from '../components/ui';
import { useDocumentTitle } from '../lib/hooks';
import { useT } from '../lib/i18n';

export default function NotFound() {
  const t = useT();
  useDocumentTitle(t('not_found.title'));
  return (
    <div className="mx-auto max-w-xl py-8">
      <EmptyState icon={Compass} titleAs="h1" title={t('not_found.title')} action={<LinkButton to="/">{t('not_found.home')}</LinkButton>}>
        {t('not_found.body')}
      </EmptyState>
    </div>
  );
}
