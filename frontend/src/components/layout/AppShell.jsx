import {
  Bell,
  CircleCheck,
  FileText,
  FolderLock,
  House,
  ShieldCheck,
  Image,
  LifeBuoy,
  Link2,
  LogOut,
  MapPinned,
  MessageCircleHeart,
  MessagesSquare,
  Settings,
  Siren,
  UserSearch,
  Users,
  UsersRound,
  Watch,
  X,
  LayoutGrid,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useInterval } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { timeAgo } from '../../lib/format';
import { LanguagePicker } from '../LanguagePicker';
import { Logo } from '../Logo';
import { Button, cx } from '../ui';
import { OfflineBanner } from './OfflineBanner';

export const NAV_GROUPS = [
  { items: [{ to: '/home', icon: House, label: 'nav.home' }, { to: '/safety', icon: ShieldCheck, label: 'nav.safety' }] },
  {
    title: 'nav.check',
    items: [
      { to: '/check', icon: LayoutGrid, label: 'nav.check_hub' },
      { to: '/check/conversation', icon: MessagesSquare, label: 'nav.check_conversation' },
      { to: '/check/link', icon: Link2, label: 'nav.check_link' },
      { to: '/check/image', icon: Image, label: 'nav.check_image' },
      { to: '/check/profile', icon: UserSearch, label: 'nav.check_profile' },
    ],
  },
  { items: [
    { to: '/companion', icon: MessageCircleHeart, label: 'nav.companion' },
    { to: '/evidence', icon: FolderLock, label: 'nav.evidence' },
    { to: '/contacts', icon: Users, label: 'nav.contacts' },
    { to: '/sos', icon: Siren, label: 'nav.sos' },
    { to: '/settings', icon: Settings, label: 'nav.settings' },
  ] },
  {
    title: 'nav.protect',
    items: [
      { to: '/vault', icon: FolderLock, label: 'nav.vault' },
      { to: '/reports', icon: FileText, label: 'nav.reports' },
      { to: '/meeting', icon: MapPinned, label: 'nav.meeting' },
    ],
  },
  {
    title: 'nav.family',
    items: [
      { to: '/family', icon: UsersRound, label: 'nav.family_links' },
      { to: '/checkin', icon: CircleCheck, label: 'nav.checkin' },
      { to: '/devices', icon: Watch, label: 'nav.devices' },
    ],
  },
  {
    items: [
      { to: '/help', icon: LifeBuoy, label: 'nav.help' },
    ],
  },
];

const MOBILE_TABS = [
  { to: '/home', icon: House, label: 'nav.home' },
  { to: '/check', icon: LayoutGrid, label: 'nav.check' },
  { to: '/companion', icon: MessageCircleHeart, label: 'nav.companion' },
  { to: '/vault', icon: FolderLock, label: 'nav.vault_short' },
];

function SosLink({ className }) {
  const { t } = useI18n();
  return (
    <Link
      to="/sos"
      className={cx(
        'inline-flex items-center justify-center rounded-xl bg-danger-600 px-3.5 font-bold tracking-wide text-white shadow-sm hover:bg-danger-700',
        className,
      )}
    >
      {t('nav.sos')}
    </Link>
  );
}

function NotificationsButton() {
  const { t, language } = useI18n();
  const { status } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, items: [] });

  const load = () =>
    api('/api/notifications')
      .then(setData)
      .catch(() => {});
  useInterval(load, status === 'signed_in' ? 30000 : 0, { immediate: true });

  const markAll = async () => {
    await api('/api/notifications/read', { method: 'POST', body: { all: true } }).catch(() => {});
    load();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${t('nav.notifications')}${data.unread ? ` (${data.unread})` : ''}`}
        className="relative grid size-10 place-items-center rounded-xl text-ink-soft hover:bg-lavender-100 hover:text-ink"
      >
        <Bell className="size-5" aria-hidden />
        {data.unread ? (
          <span className="absolute right-1.5 top-1.5 grid min-w-4.5 place-items-center rounded-full bg-rose-600 px-1 text-[0.65rem] font-bold leading-4 text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow-lift)]">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="font-semibold">{t('notifications.title')}</p>
            {data.unread ? (
              <button type="button" onClick={markAll} className="text-sm font-medium text-brand-700 hover:underline">
                {t('notifications.mark_all')}
              </button>
            ) : null}
          </div>
          {data.items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">{t('notifications.empty')}</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      api('/api/notifications/read', { method: 'POST', body: { ids: [n.id] } }).then(load, () => {});
                      if (n.link) navigate(n.link);
                    }}
                    className={cx('w-full rounded-xl px-3 py-2.5 text-left hover:bg-lavender-50', !n.read && 'bg-brand-50/60')}
                  >
                    <span className="block text-sm font-semibold text-ink">{n.title}</span>
                    <span className="block text-sm text-ink-soft">{n.body}</span>
                    <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.at, language)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SideNav({ onNavigate }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('nav.main')} className="space-y-5">
      {NAV_GROUPS.map((group, index) => (
        <div key={index}>
          {group.title ? <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted">{t(group.title)}</p> : null}
          <ul className="space-y-0.5">
            {group.items.map(({ to, icon: Icon, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-[0.95rem] font-medium transition-colors',
                      isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-lavender-100 hover:text-ink',
                    )
                  }
                >
                  <Icon className="size-[1.15rem] shrink-0" aria-hidden />
                  {t(label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function MoreSheet({ open, onClose }) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.more')}>
      <button type="button" className="absolute inset-0 bg-ink/40" onClick={onClose} aria-label={t('common.close')} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <div className="mb-4 flex items-center justify-between">
          <Logo to="/home" />
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-lavender-100" aria-label={t('common.close')}>
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <SideNav onNavigate={onClose} />
        <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
          <LanguagePicker />
          <Button variant="ghost" size="sm" icon={LogOut} onClick={() => signOut()}>
            {t('nav.sign_out')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const { t } = useI18n();
  const { signOut, profile } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <a href="#main" className="skip-link">
        {t('nav.skip_to_content')}
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface/70 px-4 py-5 lg:flex">
        <Logo to="/home" className="px-2" />
        <div className="mt-6 flex-1 overflow-y-auto pr-1">
          <SideNav />
        </div>
        <div className="space-y-3 border-t border-line pt-4">
          <SosLink className="h-11 w-full" />
          <div className="flex items-center justify-between">
            <span className="truncate text-sm text-muted" title={profile?.email}>
              {profile?.display_name || profile?.email}
            </span>
            <button type="button" onClick={() => signOut()} className="rounded-lg p-2 text-muted hover:bg-lavender-100 hover:text-ink" aria-label={t('nav.sign_out')}>
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-2 px-4 sm:px-6">
            <Logo to="/home" className="lg:hidden" />
            <div className="hidden lg:block" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="hidden md:block">
                <LanguagePicker compact />
              </span>
              <NotificationsButton />
              <SosLink className="h-10 lg:hidden" />
            </div>
          </div>
          <OfflineBanner />
        </header>

        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {MOBILE_TABS.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cx('flex flex-col items-center gap-0.5 py-2.5 text-[0.72rem] font-semibold', isActive ? 'text-brand-700' : 'text-muted')
                }
              >
                <Icon className="size-5" aria-hidden />
                {t(label)}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setMoreOpen(true)} className="flex w-full flex-col items-center gap-0.5 py-2.5 text-[0.72rem] font-semibold text-muted">
              <LayoutGrid className="size-5" aria-hidden />
              {t('nav.more')}
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
