import {
  ArrowRight,
  CircleCheck,
  Image,
  MessageCircleHeart,
  MessagesSquare,
  Siren,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Badge, Card, Chips, LevelBadge, Notice, cx } from '../components/ui';
import { useAuth } from '../lib/auth';
import { PENDING_AGE_KEY } from '../lib/constants';
import { formatDateTime } from '../lib/format';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useI18n } from '../lib/i18n';

export const LINK_TONES = { safe: 'safe', unable_to_verify: 'neutral', suspicious: 'caution', high_risk: 'danger', invalid: 'neutral' };

function QuickAction({ to, icon: Icon, title, body, tone = 'brand' }) {
  const tones = {
    brand: 'clay-brand text-brand-700',
    info: 'clay-blue text-blue-600',
    rose: 'clay-rose text-rose-600',
    danger: 'bg-danger-50 text-danger-700',
  };
  return (
    <Link to={to} className="card clay-card group flex items-start gap-4 p-4 transition-shadow hover:shadow-[var(--shadow-lift)] sm:p-5">
      <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', tones[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-semibold text-ink">
          {title}
          <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </span>
        <span className="mt-0.5 block text-sm text-ink-soft">{body}</span>
      </span>
    </Link>
  );
}

function AgePrompt() {
  const { t } = useI18n();
  const { updateProfile } = useAuth();
  const [value, setValue] = useState(null);
  const options = [
    { value: '13_17', label: t('auth.age_13_17') },
    { value: '18_plus', label: t('auth.age_18_plus') },
    { value: 'under_13', label: t('auth.age_under_13') },
  ];
  return (
    <Notice tone="neutral" title={t('dashboard.status_age_missing')}>
      <p>{t('dashboard.status_age_missing_body')}</p>
      <div className="mt-3">
        <Chips
          options={options}
          value={value}
          label={t('auth.age_label')}
          onChange={(v) => {
            setValue(v);
            if (v) updateProfile({ age_group: v }).catch(() => {});
          }}
        />
      </div>
    </Notice>
  );
}

export default function Dashboard() {
  const { t, language } = useI18n();
  const { profile, updateProfile } = useAuth();
  const location = useLocation();
  useDocumentTitle(t('nav.home'));
  const contacts = useApi('/api/contacts');
  const checks = useApi('/api/checks');
  const active = useApi('/api/emergency/active');

  // An age group chosen at sign-up before email confirmation is applied once signed in.
  useEffect(() => {
    if (!profile || profile.age_group) return;
    try {
      const pending = localStorage.getItem(PENDING_AGE_KEY);
      if (pending) {
        localStorage.removeItem(PENDING_AGE_KEY);
        updateProfile({ age_group: pending }).catch(() => {});
      }
    } catch {
      // ignore
    }
  }, [profile, updateProfile]);

  const name = profile?.display_name?.split(' ')[0];
  const contactCount = contacts.data?.items?.length ?? 0;
  const emergency = active.data?.event;

  return (
    <div className="space-y-8">
      {location.state?.notice ? <Notice tone="success">{location.state.notice}</Notice> : null}

      <header>
        <h1 className="font-display text-3xl font-semibold">{name ? t('dashboard.greeting', { name }) : t('dashboard.greeting_no_name')}</h1>
        <p className="mt-1 text-ink-soft">{t('dashboard.intro')}</p>
      </header>

      {emergency ? (
        <Notice
          tone="danger"
          icon={Siren}
          title={t('dashboard.status_emergency_active')}
          action={
            <Link to="/sos" className="font-semibold text-danger-700 underline">
              {t('dashboard.status_emergency_open')}
            </Link>
          }
        />
      ) : null}

      {profile && !profile.age_group ? <AgePrompt /> : null}

      <section aria-label={t('dashboard.intro')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickAction to="/check/conversation" icon={MessagesSquare} title={t('dashboard.quick_conversation')} body={t('dashboard.quick_conversation_body')} />
          <QuickAction to="/companion" icon={MessageCircleHeart} tone="rose" title={t('dashboard.quick_companion')} body={t('dashboard.quick_companion_body')} />
          <QuickAction to="/check/image" icon={Image} tone="info" title={t('dashboard.quick_image')} body={t('dashboard.quick_image_body')} />
          <QuickAction to="/sos" icon={Siren} tone="danger" title={t('dashboard.quick_sos')} body={t('dashboard.quick_sos_body')} />
        </div>
        <Link to="/check" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
          {t('nav.check')} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="setup">
          <h2 id="setup" className="mb-3 text-lg font-semibold">
            {t('dashboard.status_title')}
          </h2>
          <Card className="clay-mint divide-y divide-line overflow-hidden">
            <Link to="/contacts" className="flex items-center gap-3 p-4 hover:bg-lavender-50">
              <Users className={cx('size-5', contactCount ? 'text-safe-600' : 'text-caution-600')} aria-hidden />
              <span className="flex-1">
                <span className="block font-medium">
                  {contactCount ? t('dashboard.status_contacts', { count: contactCount }) : t('dashboard.status_contacts_none')}
                </span>
                {!contactCount && !contacts.loading ? <span className="block text-sm text-muted">{t('dashboard.status_add_contact')}</span> : null}
              </span>
              <ArrowRight className="size-4 text-muted" aria-hidden />
            </Link>
            <Link to="/safety" className="flex items-center gap-3 p-4 hover:bg-lavender-50">
              <CircleCheck className="size-5 text-safe-600" aria-hidden />
              <span className="flex-1 font-medium">{t('nav.safety')}</span>
              <ArrowRight className="size-4 text-muted" aria-hidden />
            </Link>
          </Card>
        </section>

        <section aria-labelledby="activity">
          <h2 id="activity" className="mb-3 text-lg font-semibold">
            {t('dashboard.activity_title')}
          </h2>
          <Card className="clay-blue p-2">
            {checks.loading ? (
              <p className="p-4 text-sm text-muted">{t('common.loading')}</p>
            ) : checks.data && !checks.data.enabled ? (
              <p className="p-4 text-sm text-muted">
                {t('dashboard.activity_off')}{' '}
                <Link to="/settings" className="font-semibold text-brand-700 hover:underline">
                  {t('nav.settings')}
                </Link>
              </p>
            ) : !checks.data?.items?.length ? (
              <div className="flex items-start gap-3 p-4">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                <p className="text-sm text-muted">{t('dashboard.activity_empty')}</p>
              </div>
            ) : (
              <ul>
                {checks.data.items.slice(0, 6).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {t(`dashboard.activity_kinds.${item.kind}`)}
                        {item.label ? <span className="font-normal text-muted"> · {item.label}</span> : null}
                      </span>
                      <span className="block text-xs text-muted">{formatDateTime(item.at, language)}</span>
                    </span>
                    {item.kind === 'link' ? (
                      <Badge tone={LINK_TONES[item.level] ?? 'neutral'}>{t(`check.link.status.${item.level}`)}</Badge>
                    ) : (
                      <LevelBadge level={item.level} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
