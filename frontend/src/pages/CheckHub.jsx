import { ArrowRight, Image, Link2, MessagesSquare, UserSearch } from 'lucide-react';
import { Link } from 'react-router';
import { ClayCard, PageHeader } from '../components/ui';
import { useDocumentTitle } from '../lib/hooks';
import { useI18n } from '../lib/i18n';

const CHECKS = [
  { to: '/check/conversation', icon: MessagesSquare, variant: 'lavender', title: 'Conversation', body: 'Check a conversation for scam signals.' },
  { to: '/check/image', icon: Image, variant: 'pink', title: 'Image', body: 'Review an image for safety risks.' },
  { to: '/check/link', icon: Link2, variant: 'blue', title: 'Suspicious link', body: 'Check a link before you open it.' },
  { to: '/check/profile', icon: UserSearch, variant: 'lavender', title: 'Profile', body: 'Look for identity and impersonation risks.' },
];

export default function CheckHub() {
  const { t } = useI18n();
  useDocumentTitle(t('nav.check'));
  return (
    <div className="space-y-6">
      <PageHeader title="Safety checks" description="Choose the kind of content you want SAHELI to review." />
      <div className="grid gap-4 sm:grid-cols-2">
        {CHECKS.map(({ to, icon: Icon, variant, title, body }) => (
          <Link key={to} to={to} className="group">
            <ClayCard variant={variant} className="flex h-full items-center gap-4 p-5 transition-transform hover:-translate-y-0.5">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                <Icon className="size-6" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">{title}</span>
                <span className="mt-1 block text-sm text-ink-soft">{body}</span>
              </span>
              <ArrowRight className="size-5 text-muted transition-transform group-hover:translate-x-1" aria-hidden />
            </ClayCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
