import { ArrowLeft, BellRing, CircleCheck, ExternalLink, LocateFixed, MapPin, Plus, Siren, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge, Button, Card, ConfirmDialog, Dialog, ErrorState, Field, Input, Loading, Notice, PageHeader, errorMessage } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime, formatTime, timeAgo } from '../../lib/format';
import { getPosition, mapsLink } from '../../lib/geo';
import { useApi, useDocumentTitle, useInterval } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { PERMISSIONS } from './Family';

function ZoneDialog({ linkId, onClose, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', lat: '', lng: '', radius_m: 300 });
  const [state, setState] = useState({ busy: false, error: null, locating: false });

  const useMine = async () => {
    setState((s) => ({ ...s, locating: true, error: null }));
    try {
      const pos = await getPosition();
      setForm((f) => ({ ...f, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6) }));
      setState((s) => ({ ...s, locating: false }));
    } catch (error) {
      setState({ busy: false, locating: false, error: { message: t(error.code === 'denied' ? 'sos.location_denied' : 'sos.location_unavailable') } });
    }
  };

  const save = async () => {
    setState({ busy: true, error: null, locating: false });
    try {
      await api(`/api/guardian/links/${linkId}/zones`, {
        method: 'POST',
        body: { name: form.name.trim(), lat: Number(form.lat), lng: Number(form.lng), radius_m: Number(form.radius_m) },
      });
      onSaved();
    } catch (error) {
      setState({ busy: false, error, locating: false });
    }
  };

  const valid = form.name.trim() && form.lat !== '' && form.lng !== '' && !Number.isNaN(Number(form.lat)) && !Number.isNaN(Number(form.lng));

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('guardian.zone_add')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} loading={state.busy} disabled={!valid}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('guardian.zone_name')} htmlFor="z-name">
          <Input id="z-name" maxLength={60} placeholder={t('guardian.zone_name_placeholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold">{t('guardian.zone_where')}</p>
          <Button variant="soft" size="sm" icon={LocateFixed} onClick={useMine} loading={state.locating}>
            {t('guardian.zone_use_mine')}
          </Button>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label={t('guardian.zone_lat')} htmlFor="z-lat">
              <Input id="z-lat" inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
            </Field>
            <Field label={t('guardian.zone_lng')} htmlFor="z-lng">
              <Input id="z-lng" inputMode="decimal" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
            </Field>
          </div>
        </div>
        <Field label={t('guardian.zone_radius', { meters: form.radius_m })} htmlFor="z-radius">
          <input
            id="z-radius"
            type="range"
            min={100}
            max={2000}
            step={50}
            value={form.radius_m}
            onChange={(e) => setForm({ ...form, radius_m: e.target.value })}
            className="w-full accent-brand-600"
          />
        </Field>
        {state.error ? <Notice tone="danger">{state.error.message && !state.error.code ? state.error.message : errorMessage(t, state.error)}</Notice> : null}
      </div>
    </Dialog>
  );
}

export default function GuardianView() {
  const { linkId } = useParams();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi(`/api/guardian/links/${linkId}/overview`);
  const [requested, setRequested] = useState(false);
  const [addingZone, setAddingZone] = useState(false);
  const [ending, setEnding] = useState(false);
  useDocumentTitle(data?.name ?? t('family.title'));
  useInterval(reload, 30000);

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const name = data.name;
  const perms = data.permissions;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/family" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t('guardian.back')}
      </Link>
      <PageHeader
        title={name}
        actions={
          perms.checkins ? (
            <Button
              icon={BellRing}
              onClick={async () => {
                await api(`/api/guardian/links/${linkId}/request-checkin`, { method: 'POST' }).catch(() => {});
                setRequested(true);
              }}
            >
              {t('guardian.request_checkin')}
            </Button>
          ) : null
        }
      />
      {requested ? <Notice tone="success">{t('guardian.request_sent', { name })}</Notice> : null}

      {data.active_emergency ? (
        <Notice tone="danger" icon={Siren} title={t('guardian.emergency_active', { name })}>
          <p>{t('guardian.emergency_since', { time: formatTime(data.active_emergency.started_at, language) })}</p>
          {data.active_emergency.location ? (
            <a
              className="mt-2 inline-flex items-center gap-1.5 font-semibold text-danger-700 underline"
              href={mapsLink(data.active_emergency.location.lat, data.active_emergency.location.lng)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('status_page.open_map')}
              <ExternalLink className="size-4" aria-hidden />
            </a>
          ) : null}
        </Notice>
      ) : null}

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <MapPin className="size-5 text-brand-600" aria-hidden />
          {t('guardian.last_location')}
        </h2>
        {data.last_location ? (
          <div className="mt-2 space-y-2">
            <p className="text-ink-soft">
              {timeAgo(data.last_location.at, language)} · {t(`guardian.via.${data.last_location.source}`)}
            </p>
            <a
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
              href={mapsLink(data.last_location.lat, data.last_location.lng)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('status_page.open_map')}
              <ExternalLink className="size-4" aria-hidden />
            </a>
          </div>
        ) : (
          <p className="mt-2 text-ink-soft">{t('guardian.last_location_none', { name })}</p>
        )}
        {perms.live_location ? (
          <p className="mt-3 text-sm text-muted">
            {data.live_sharing.active ? t('guardian.live_on', { time: formatTime(data.live_sharing.until, language) }) : t('guardian.live_off')}
          </p>
        ) : null}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">{t('guardian.checkins')}</h2>
          {!perms.checkins ? (
            <p className="mt-2 text-sm text-muted">{t('guardian.not_permitted')}</p>
          ) : data.checkins.length ? (
            <ul className="mt-3 space-y-2">
              {data.checkins.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {c.status === 'safe' ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-safe-600" aria-hidden />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger-600" aria-hidden />
                  )}
                  <span>
                    <span className="font-medium">{c.status === 'safe' ? t('guardian.checkin_safe') : t('guardian.checkin_help')}</span>
                    {c.note ? <span className="text-ink-soft"> · {c.note}</span> : null}
                    <span className="block text-xs text-muted">{formatDateTime(c.at, language)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">{t('guardian.checkins_none')}</p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">{t('guardian.events')}</h2>
          {!perms.safe_zones ? (
            <p className="mt-2 text-sm text-muted">{t('guardian.not_permitted')}</p>
          ) : data.zone_events.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {data.zone_events.map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{e.event === 'entered' ? t('guardian.entered', { zone: e.zone }) : t('guardian.left', { zone: e.zone })}</span>
                  <span className="block text-xs text-muted">{formatDateTime(e.at, language)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">{t('guardian.events_none')}</p>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('guardian.zones_title')}</h2>
          {perms.safe_zones ? (
            <Button variant="soft" size="sm" icon={Plus} onClick={() => setAddingZone(true)}>
              {t('guardian.zone_add')}
            </Button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted">{perms.safe_zones ? t('guardian.zones_body') : t('guardian.zone_not_permitted', { name })}</p>
        {data.zones.length ? (
          <ul className="mt-3 space-y-2">
            {data.zones.map((z) => (
              <li key={z.id} className="flex items-center justify-between gap-2 rounded-xl bg-lavender-50 px-3 py-2">
                <span>
                  <span className="font-medium">{z.name}</span>
                  <span className="text-sm text-muted"> · {z.radius_m} m</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  aria-label={t('common.delete')}
                  onClick={async () => {
                    await api(`/api/guardian/zones/${z.id}`, { method: 'DELETE' }).catch(() => {});
                    reload();
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">{t('guardian.agreed', { name })}</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {PERMISSIONS.map((p) => (
            <Badge key={p} tone={perms[p] ? 'safe' : 'neutral'}>
              {t(`family.perm.${p}`)}
            </Badge>
          ))}
        </ul>
      </Card>

      <Button variant="danger-soft" onClick={() => setEnding(true)}>
        {t('family.end_link')}
      </Button>

      {addingZone ? (
        <ZoneDialog
          linkId={linkId}
          onClose={() => setAddingZone(false)}
          onSaved={() => {
            setAddingZone(false);
            reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={ending}
        onClose={() => setEnding(false)}
        onConfirm={async () => {
          await api(`/api/guardian/links/${linkId}`, { method: 'DELETE' }).catch(() => {});
          navigate('/family', { replace: true });
        }}
        title={t('family.end_link')}
        confirmLabel={t('family.end_link')}
      >
        {t('family.end_confirm')}
      </ConfirmDialog>
    </div>
  );
}
