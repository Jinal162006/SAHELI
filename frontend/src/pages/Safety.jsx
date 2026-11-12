import { Activity, ArrowRight, CircleCheck, ShieldCheck, Siren, Users } from 'lucide-react';
import { Link } from 'react-router';
import { Card, Notice, PageHeader, SectionTitle } from '../components/ui';
import { useApi, useDocumentTitle } from '../lib/hooks';

export default function Safety() {
  useDocumentTitle('Safety dashboard');
  const checks = useApi('/api/checks');
  const contacts = useApi('/api/contacts');
  const active = useApi('/api/emergency/active');

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Your safety space"
        title="Safety dashboard"
        description="A calm view of your recent checks, support network and next steps."
        actions={
          <Link to="/sos" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-danger-600 px-4 font-semibold text-white shadow-sm hover:bg-danger-700">
            <Siren className="size-4" aria-hidden /> Emergency help
          </Link>
        }
      />
      {active.data?.event ? <Notice tone="danger" icon={Siren} title="An emergency is active">Open SOS to see your live safety options.</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="clay-card p-5">
          <div className="flex items-center gap-3"><span className="clay-icon bg-safe-50 text-safe-700"><CircleCheck className="size-5" /></span><span className="text-sm text-muted">Current status</span></div>
          <p className="mt-4 text-2xl font-semibold text-safe-700">You&apos;re all good</p>
          <p className="mt-1 text-sm text-ink-soft">Keep checking anything that feels unusual.</p>
        </Card>
        <Card className="clay-card p-5">
          <div className="flex items-center gap-3"><span className="clay-icon bg-brand-50 text-brand-700"><Activity className="size-5" /></span><span className="text-sm text-muted">Safety checks</span></div>
          <p className="mt-4 text-2xl font-semibold">{checks.data?.items?.length ?? 0}</p>
          <p className="mt-1 text-sm text-ink-soft">Recent checks in your history.</p>
        </Card>
        <Card className="clay-card p-5">
          <div className="flex items-center gap-3"><span className="clay-icon bg-info-50 text-info-700"><Users className="size-5" /></span><span className="text-sm text-muted">Trusted people</span></div>
          <p className="mt-4 text-2xl font-semibold">{contacts.data?.items?.length ?? 0}</p>
          <p className="mt-1 text-sm text-ink-soft">People who can support you.</p>
        </Card>
      </div>
      <section>
        <SectionTitle>What would help right now?</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            ['/check', ShieldCheck, 'Check something', 'Review a message, image, link or profile.'],
            ['/companion', Activity, 'Talk to SAHELI', 'Get a calm second opinion when something feels off.'],
            ['/contacts', Users, 'Manage trusted people', 'Keep your support network ready.'],
            ['/sos', Siren, 'I need urgent help', 'Open clear emergency actions.'],
          ].map(([to, Icon, title, body]) => (
            <Link key={to} to={to} className="clay-card group flex items-center gap-4 p-4 transition-transform hover:-translate-y-0.5">
              <span className="clay-icon bg-lavender-50 text-brand-700"><Icon className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="block text-sm text-ink-soft">{body}</span></span>
              <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
