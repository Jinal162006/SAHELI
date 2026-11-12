import { Image, Link2, MessagesSquare, UserSearch } from 'lucide-react';
import { Link } from 'react-router';
import { Card, PageHeader } from '../components/ui';
import { useDocumentTitle } from '../lib/hooks';

const checks = [
  ['/check/conversation', MessagesSquare, 'Conversation', 'Find pressure, secrecy and scam signals in a chat.'],
  ['/check/image', Image, 'Image', 'Review an image for privacy and safety risks.'],
  ['/check/link', Link2, 'Suspicious link', 'Check where a link may lead before opening it.'],
  ['/check/profile', UserSearch, 'Profile', 'Think through identity and impersonation signals.'],
];

export default function CheckHub() {
  useDocumentTitle('Safety checks');
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Check safely" title="What would you like to check?" description="Choose one focused check. SAHELI explains the signals in plain language and helps you decide what to do next." />
      <div className="grid gap-4 sm:grid-cols-2">
        {checks.map(([to, Icon, title, body]) => (
          <Link key={to} to={to} className="clay-card group block p-5 transition-transform hover:-translate-y-0.5">
            <span className="clay-icon bg-brand-50 text-brand-700"><Icon className="size-6" /></span>
            <h2 className="mt-5 text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-ink-soft">{body}</p>
            <span className="mt-5 inline-flex rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">Open check</span>
          </Link>
        ))}
      </div>
      <Card className="clay-card bg-info-50/70 p-5">
        <p className="font-semibold text-info-700">A gentle reminder</p>
        <p className="mt-1 text-sm text-ink-soft">You can pause, take a screenshot, and ask someone you trust before responding.</p>
      </Card>
    </div>
  );
}
