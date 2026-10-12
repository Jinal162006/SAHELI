import { ArrowRight, CircleCheck, FileText, LifeBuoy, MapPinned, Settings, Siren, UsersRound, Watch } from 'lucide-react';
import { Link } from 'react-router';
import { ClayCard, PageHeader } from '../components/ui';
import { useDocumentTitle } from '../lib/hooks';
import { useI18n } from '../lib/i18n';

const LINKS = [
  { to: '/sos', icon: Siren, title: 'Emergency SOS', body: 'Open emergency support immediately.', variant: 'pink' },
  { to: '/settings', icon: Settings, title: 'Settings', body: 'Manage your account and preferences.', variant: 'blue' },
  { to: '/reports', icon: FileText, title: 'Incident reports', body: 'Review and organise your reports.', variant: 'lavender' },
  { to: '/meeting', icon: MapPinned, title: 'Safe meeting', body: 'Plan a meeting with safety check-ins.', variant: 'mint' },
  { to: '/family', icon: UsersRound, title: 'Family links', body: 'Manage guardian and family connections.', variant: 'lilac' },
  { to: '/checkin', icon: CircleCheck, title: 'Check in', body: 'Keep trusted people updated.', variant: 'yellow' },
  { to: '/devices', icon: Watch, title: 'Devices and watch', body: 'Manage connected safety devices.', variant: 'blue' },
  { to: '/help', icon: LifeBuoy, title: 'Help and support', body: 'Find guidance for using SAHELI.', variant: 'lavender' },
];

export default function More() {
  const { t } = useI18n();
  useDocumentTitle(t('nav.more'));
  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.more')} description="Open another SAHELI feature." />
      <div className="grid gap-3 sm:grid-cols-2">
        {LINKS.map(({ to, icon: Icon, title, body, variant }) => (
          <Link key={to} to={to} className="group">
            <ClayCard variant={variant} className="flex h-full items-center gap-4 p-4 transition-transform hover:-translate-y-0.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/60 text-ink">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="mt-0.5 block text-sm text-ink-soft">{body}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-ink-soft transition-transform group-hover:translate-x-1" aria-hidden />
            </ClayCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
