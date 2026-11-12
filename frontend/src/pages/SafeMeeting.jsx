import { CalendarClock, CircleCheck, MapPinned, MessageCircle, Plus, Siren, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Notice,
  PageHeader,
  Select,
  Switch,
  Textarea,
  errorMessage,
} from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, formatTime, timeAgo, toLocalInput } from '../lib/format';
import { getPosition } from '../lib/geo';
import { useApi, useDocumentTitle, useInterval } from '../lib/hooks';
import { useI18n } from '../lib/i18n';

const STATUS_TONE = { planned: 'neutral', active: 'brand', ended: 'neutral', escalated: 'danger' };

function NewMeeting({ contacts, onClose, onSaved }) {
  const { t } = useI18n();
  const now = new Date();
  const [form, setForm] = useState({
    person_name: '',
    profile_link: '',
    place: '',
    notes: '',
    starts_at: toLocalInput(now),
    expected_end_at: toLocalInput(new Date(now.getTime() + 2 * 3600 * 1000)),
    checkin_interval_min: 30,
    grace_min: 10,
    contact_id: contacts[0]?.id ?? '',
    share_location: true,
  });
  const [state, setState] = useState({ busy: false, error: null });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const contactName = contacts.find((c) => c.id === form.contact_id)?.name ?? t('meeting.form.contact_all');

  const submit = async (event) => {
    event.preventDefault();
    setState({ busy: true, error: null });
    try {
      await api('/api/meetings', {
        method: 'POST',
        body: {
          ...form,
          starts_at: new Date(form.starts_at).toISOString(),
          expected_end_at: new Date(form.expected_end_at).toISOString(),
          checkin_interval_min: Number(form.checkin_interval_min),
          grace_min: Number(form.grace_min),
          contact_id: form.contact_id || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
        },
      });
      onSaved();
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={t('meeting.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="meeting-form" loading={state.busy} disabled={!form.person_name.trim() || !form.place.trim() || !contacts.length}>
            {t('meeting.form.submit')}
          </Button>
        </>
      }
    >
      <form id="meeting-form" onSubmit={submit} className="space-y-4">
        {!contacts.length ? (
          <Notice tone="warning" action={<Link to="/contacts" className="font-semibold underline">{t('contacts.add')}</Link>}>
            {t('meeting.form.no_contacts')}
          </Notice>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('meeting.form.person')} htmlFor="m-person">
            <Input id="m-person" maxLength={120} value={form.person_name} onChange={set('person_name')} />
          </Field>
          <Field label={t('meeting.form.profile')} htmlFor="m-profile" optional>
            <Input id="m-profile" maxLength={500} value={form.profile_link} onChange={set('profile_link')} />
          </Field>
        </div>
        <Field label={t('meeting.form.place')} htmlFor="m-place">
          <Input id="m-place" maxLength={300} placeholder={t('meeting.form.place_placeholder')} value={form.place} onChange={set('place')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('meeting.form.starts')} htmlFor="m-start">
            <Input id="m-start" type="datetime-local" value={form.starts_at} onChange={set('starts_at')} />
          </Field>
          <Field label={t('meeting.form.ends')} htmlFor="m-end">
            <Input id="m-end" type="datetime-local" value={form.expected_end_at} onChange={set('expected_end_at')} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('meeting.form.interval')} htmlFor="m-interval">
            <Select id="m-interval" value={form.checkin_interval_min} onChange={set('checkin_interval_min')}>
              {[15, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {t('common.minutes', { count: m })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('meeting.form.grace')} htmlFor="m-grace">
            <Select id="m-grace" value={form.grace_min} onChange={set('grace_min')}>
              {[5, 10, 15, 30].map((m) => (
                <option key={m} value={m}>
                  {t('common.minutes', { count: m })}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('meeting.form.contact')} htmlFor="m-contact">
          <Select id="m-contact" value={form.contact_id} onChange={set('contact_id')} disabled={!contacts.length}>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="">{t('meeting.form.contact_all')}</option>
          </Select>
        </Field>
        <Switch checked={form.share_location} onChange={(v) => setForm((f) => ({ ...f, share_location: v }))} label={t('meeting.form.share_location')} />
        <Field label={t('meeting.form.notes')} htmlFor="m-notes" optional>
          <Textarea id="m-notes" rows={2} maxLength={1000} value={form.notes} onChange={set('notes')} />
        </Field>
        <Notice tone="neutral">{t('meeting.form.preview', { contact: contactName })}</Notice>
        {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
      </form>
    </Dialog>
  );
}

function ActiveMeeting({ meeting, onChange }) {
  const { t, language } = useI18n();
  const [busy, setBusy] = useState(null);
  const [planText, setPlanText] = useState(null);
  const [message, setMessage] = useState(null);
  const [, setTick] = useState(0);
  useInterval(() => setTick((n) => n + 1), 30000);

  const withLocation = async () => {
    if (!meeting.share_location) return {};
    try {
      return { location: await getPosition({ timeout: 8000 }) };
    } catch {
      return {};
    }
  };

  const act = async (action, body = {}) => {
    setBusy(action);
    setMessage(null);
    try {
      const extra = action === 'checkin' || action === 'start' ? await withLocation() : {};
      const result = await api(`/api/meetings/${meeting.id}/${action}`, { method: 'POST', body: { ...body, ...extra } });
      if (result.plan_text) setPlanText(result.plan_text);
      if (action === 'start' && result.email_status) setMessage(t(`sos.status.${result.email_status}`));
      onChange();
    } catch (error) {
      setMessage(errorMessage(t, error));
    } finally {
      setBusy(null);
    }
  };

  const due = meeting.next_checkin_due_at ? new Date(meeting.next_checkin_due_at) : null;
  const overdue = due && due.getTime() < Date.now();
  const alertAt = due ? new Date(due.getTime() + meeting.grace_min * 60000).toISOString() : null;
  const phone = meeting.contact?.phone;

  return (
    <Card className="space-y-4 border-2 border-brand-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{meeting.person_name}</p>
          <p className="text-sm text-ink-soft">{meeting.place}</p>
          <p className="text-xs text-muted">{formatDateTime(meeting.starts_at, language)}</p>
        </div>
        <Badge tone={STATUS_TONE[meeting.status]}>{t(`meeting.status.${meeting.status}`)}</Badge>
      </div>

      {meeting.status === 'planned' ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => act('start', { tell_contact_by_email: false })} loading={busy === 'start'}>
            {t('meeting.start')}
          </Button>
          {meeting.contact?.has_email ? (
            <Button variant="secondary" onClick={() => act('start', { tell_contact_by_email: true })} loading={busy === 'start'}>
              {t('meeting.tell_contact')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {meeting.status === 'active' ? (
        <>
          {overdue ? (
            <Notice tone="warning">{t('meeting.overdue', { time: timeAgo(alertAt, language) })}</Notice>
          ) : due ? (
            <p className="text-ink-soft">{t('meeting.next_due', { time: formatTime(meeting.next_checkin_due_at, language) })}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="safe" size="lg" icon={CircleCheck} onClick={() => act('checkin')} loading={busy === 'checkin'}>
              {t('meeting.checkin')}
            </Button>
            <Button variant="secondary" onClick={() => act('end')} loading={busy === 'end'}>
              {t('meeting.end')}
            </Button>
          </div>
          <p className="text-xs text-muted">{t('meeting.keep_open')}</p>
        </>
      ) : null}

      {meeting.status === 'escalated' ? (
        <Notice
          tone="danger"
          icon={Siren}
          action={
            <Link to="/sos" className="font-semibold underline">
              {t('meeting.open_emergency')}
            </Link>
          }
        >
          {t('meeting.escalated')}
        </Notice>
      ) : null}

      {planText ? (
        <div className="rounded-xl bg-lavender-50 p-3">
          <p className="text-sm font-semibold">{t('meeting.share_plan')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {phone ? (
              <>
                <a className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white" href={`sms:${phone}?body=${encodeURIComponent(planText)}`}>
                  <MessageCircle className="size-4" aria-hidden />
                  {t('sos.sms')}
                </a>
                <a
                  className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold"
                  href={`https://wa.me/${phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(planText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('sos.whatsapp')}
                </a>
              </>
            ) : null}
            {navigator.share ? (
              <Button variant="secondary" size="sm" onClick={() => navigator.share({ text: planText }).catch(() => {})}>
                {t('common.share')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {message ? <p className="text-sm text-ink-soft">{message}</p> : null}
    </Card>
  );
}

export default function SafeMeeting() {
  const { t, language } = useI18n();
  useDocumentTitle(t('meeting.title'));
  const meetings = useApi('/api/meetings');
  const contacts = useApi('/api/contacts');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useInterval(() => meetings.reload(), 60000);

  const items = meetings.data?.items ?? [];
  const current = items.filter((m) => ['planned', 'active', 'escalated'].includes(m.status));
  const past = items.filter((m) => m.status === 'ended');
  const sosContacts = (contacts.data?.items ?? []).filter((c) => c.notify_on_sos);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('meeting.title')}
        description={t('meeting.description')}
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            {t('meeting.new')}
          </Button>
        }
      />
      <Card className="mb-6 p-5">
        <p className="font-semibold">{t('meeting.how_title')}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-soft">
          <li>{t('meeting.how_1')}</li>
          <li>{t('meeting.how_2')}</li>
          <li>{t('meeting.how_3')}</li>
        </ol>
      </Card>

      {meetings.loading ? (
        <Loading />
      ) : meetings.error ? (
        <ErrorState error={meetings.error} onRetry={meetings.reload} />
      ) : !items.length ? (
        <EmptyState icon={MapPinned} title={t('meeting.empty_title')} action={<Button icon={Plus} onClick={() => setCreating(true)}>{t('meeting.new')}</Button>}>
          {t('meeting.empty_body')}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {current.map((m) => (
            <ActiveMeeting key={m.id} meeting={m} onChange={meetings.reload} />
          ))}
          {past.length ? (
            <ul className="space-y-2">
              {past.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {m.person_name} · {m.place}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <CalendarClock className="size-3.5" aria-hidden />
                      {formatDateTime(m.starts_at, language)}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDeleting(m)} aria-label={t('common.delete')} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {creating ? (
        <NewMeeting
          contacts={sosContacts}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            meetings.reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api(`/api/meetings/${deleting.id}`, { method: 'DELETE' }).catch(() => {});
          setDeleting(null);
          meetings.reload();
        }}
        title={t('common.delete')}
        confirmLabel={t('common.delete')}
      >
        {t('meeting.delete_confirm')}
      </ConfirmDialog>
    </div>
  );
}
