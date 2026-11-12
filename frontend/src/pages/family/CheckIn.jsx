import { CircleCheck, Radio, Siren, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, Field, Input, Notice, PageHeader, Select, Switch, errorMessage } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime, formatTime, timeAgo } from '../../lib/format';
import { getPosition } from '../../lib/geo';
import { useApi, useDocumentTitle, useInterval } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

export default function CheckIn() {
  const { t, language } = useI18n();
  useDocumentTitle(t('checkin.title'));
  const links = useApi('/api/guardian/links');
  const recent = useApi('/api/checkins');
  const live = useApi('/api/location/live');
  const [note, setNote] = useState('');
  const [withLocation, setWithLocation] = useState(true);
  const [state, setState] = useState({ busy: null, error: null, sent: false });
  const [minutes, setMinutes] = useState(30);
  const [lastSent, setLastSent] = useState(null);
  const [liveError, setLiveError] = useState(null);

  const guardians = links.data?.as_child ?? [];
  const sharing = live.data?.active;

  const send = async (status) => {
    setState({ busy: status, error: null, sent: false });
    let location;
    if (withLocation) {
      try {
        location = await getPosition({ timeout: 10000 });
      } catch {
        location = undefined;
      }
    }
    try {
      await api('/api/checkins', { method: 'POST', body: { status, note: note.trim() || null, location } });
      setState({ busy: null, error: null, sent: true });
      setNote('');
      recent.reload();
    } catch (error) {
      setState({ busy: null, error, sent: false });
    }
  };

  const pushLocation = async () => {
    try {
      const pos = await getPosition({ timeout: 15000 });
      await api('/api/location', { method: 'POST', body: pos });
      setLastSent(new Date().toISOString());
      setLiveError(null);
    } catch (error) {
      if (error?.code === 'not_sharing') live.reload();
      else setLiveError(error?.code === 'denied' ? t('sos.location_denied') : t('sos.location_unavailable'));
    }
  };
  useInterval(pushLocation, sharing ? 60000 : null, { immediate: true });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('checkin.title')} description={t('checkin.description')} />

      <Card className="space-y-5 p-5 sm:p-6">
        {guardians.length ? (
          <p className="text-sm text-ink-soft">{t('checkin.who_sees', { names: guardians.map((g) => g.name).join(', ') })}</p>
        ) : (
          <Notice tone="neutral">
            {t('checkin.no_links')}{' '}
            <Link to="/family" className="font-semibold text-brand-700 hover:underline">
              {t('nav.family_links')}
            </Link>
          </Notice>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="safe" size="lg" icon={CircleCheck} className="h-16 text-lg" onClick={() => send('safe')} loading={state.busy === 'safe'}>
            {t('checkin.safe')}
          </Button>
          <Button variant="danger-soft" size="lg" icon={TriangleAlert} className="h-16 text-lg" onClick={() => send('need_help')} loading={state.busy === 'need_help'}>
            {t('checkin.help')}
          </Button>
        </div>
        <Field label={t('checkin.note')} htmlFor="ci-note" optional>
          <Input id="ci-note" maxLength={200} placeholder={t('checkin.note_placeholder')} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Switch checked={withLocation} onChange={setWithLocation} label={t('checkin.with_location')} />
        {state.sent ? <Notice tone="success">{t('checkin.sent')}</Notice> : null}
        {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
        <p className="flex items-start gap-2 text-sm text-muted">
          <Siren className="mt-0.5 size-4 shrink-0 text-danger-600" aria-hidden />
          <span>
            {t('checkin.help_note')}{' '}
            <Link to="/sos" className="font-semibold text-danger-700 hover:underline">
              {t('nav.sos')}
            </Link>
          </span>
        </p>
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Radio className="size-5 text-brand-600" aria-hidden />
          {t('checkin.live_title')}
        </h2>
        <p className="text-ink-soft">{t('checkin.live_body')}</p>
        {sharing ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-semibold text-brand-800" role="status">
              <span className="recording-dot size-2.5 rounded-full bg-brand-600" aria-hidden />
              {t('checkin.live_active', { time: formatTime(live.data.until, language) })}
            </p>
            {lastSent ? <p className="text-sm text-muted">{t('checkin.live_last', { time: timeAgo(lastSent, language) })}</p> : null}
            {liveError ? <Notice tone="warning">{liveError}</Notice> : null}
            <Button
              variant="secondary"
              onClick={async () => {
                await api('/api/location/live', { method: 'DELETE' }).catch(() => {});
                live.reload();
              }}
            >
              {t('checkin.live_stop')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('checkin.live_for')} htmlFor="live-mins">
              <Select id="live-mins" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-40">
                {[15, 30, 60, 120, 240].map((m) => (
                  <option key={m} value={m}>
                    {t('common.minutes', { count: m })}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              onClick={async () => {
                await api('/api/location/live', { method: 'POST', body: { minutes } }).catch(() => {});
                live.reload();
              }}
            >
              {t('checkin.live_start')}
            </Button>
          </div>
        )}
      </Card>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('checkin.recent')}</h2>
        {recent.data?.items?.length ? (
          <ul className="space-y-2">
            {recent.data.items.map((c, i) => (
              <li key={i} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                <span className="font-medium">{c.status === 'safe' ? t('guardian.checkin_safe') : t('guardian.checkin_help')}</span>
                <span className="text-muted">{formatDateTime(c.at, language)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('checkin.recent_none')}</p>
        )}
      </section>
    </div>
  );
}
