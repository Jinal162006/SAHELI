import {
  CircleCheck,
  CircleX,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  Phone,
  Square,
  UserPlus,
  Video,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ResourceList } from '../components/Resources';
import { Button, Card, ConfirmDialog, Dialog, Loading, Notice, Switch, cx, errorMessage } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { QUICK_SOS_KEY } from '../lib/constants';
import { formatTime, timeAgo } from '../lib/format';
import { geoSupported, getPosition } from '../lib/geo';
import { useApi, useDocumentTitle, useInterval } from '../lib/hooks';
import { useI18n } from '../lib/i18n';

const HOLD_MS = 2000;
const LOCATION_EVERY_MS = 30000;
const CHUNK_MS = 10000;

function Call112({ large = false }) {
  const { t } = useI18n();
  return (
    <a
      href="tel:112"
      className={cx(
        'flex items-center justify-center gap-3 rounded-2xl border-2 border-danger-600 bg-surface font-bold text-danger-700 hover:bg-danger-50',
        large ? 'px-6 py-4 text-lg' : 'px-4 py-3',
      )}
    >
      <Phone className="size-5" aria-hidden />
      <span>
        {t('sos.call_112')}
        <span className="block text-sm font-medium text-ink-soft">{t('sos.call_112_body')}</span>
      </span>
    </a>
  );
}

/** Press and hold for two seconds. A progress ring shows how long is left. */
function HoldButton({ onActivate, disabled }) {
  const { t } = useI18n();
  const [progress, setProgress] = useState(0);
  const frame = useRef(null);
  const started = useRef(0);
  const fired = useRef(false);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!fired.current) setProgress(0);
  }, []);

  const tick = useCallback(() => {
    const value = Math.min(1, (performance.now() - started.current) / HOLD_MS);
    setProgress(value);
    if (value >= 1) {
      fired.current = true;
      frame.current = null;
      navigator.vibrate?.(200);
      onActivate();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  }, [onActivate]);

  const start = useCallback(() => {
    if (disabled || frame.current) return;
    fired.current = false;
    started.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const radius = 92;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        disabled={disabled}
        aria-describedby="hold-help"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') stop();
        }}
        className="relative grid size-56 touch-none select-none place-items-center rounded-full bg-danger-600 text-white shadow-[0_18px_50px_-18px_rgb(220_38_38/0.7)] transition-transform active:scale-[0.98] disabled:opacity-60 sm:size-64"
      >
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle cx="100" cy="100" r={radius} fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="10" />
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="white"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        </svg>
        <span className="relative px-6 text-center text-2xl font-bold leading-tight">{progress > 0 && progress < 1 ? t('sos.holding') : t('sos.hold')}</span>
      </button>
      <p id="hold-help" className="mt-4 text-center text-sm text-muted">
        {t('sos.hold_help')}
      </p>
    </div>
  );
}

function deliveryIcon(status) {
  if (status === 'sent') return <CircleCheck className="size-4 shrink-0 text-safe-600" aria-hidden />;
  if (status === 'no_address') return <MessageCircle className="size-4 shrink-0 text-brand-600" aria-hidden />;
  return <CircleX className="size-4 shrink-0 text-muted" aria-hidden />;
}

function phoneDigits(phone) {
  return (phone || '').replace(/[^\d]/g, '');
}

/** Records audio or video and uploads it to the vault in pieces, so it survives interruptions. */
function useEmergencyRecorder(eventId) {
  const [status, setStatus] = useState('idle'); // idle | recording | unsupported | denied | error
  const [kind, setKind] = useState(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const recorder = useRef(null);
  const stream = useRef(null);
  const part = useRef(0);
  const queue = useRef(Promise.resolve());

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    stream.current = null;
    setStatus((s) => (s === 'recording' ? 'idle' : s));
  }, []);

  const start = useCallback(
    async (which) => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setStatus('unsupported');
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia(which === 'video' ? { audio: true, video: { facingMode: 'environment' } } : { audio: true });
        const candidates = which === 'video' ? ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
        const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
        const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
        stream.current = media;
        recorder.current = rec;
        part.current = 0;
        setKind(which);
        setUploadFailed(false);
        rec.ondataavailable = (event) => {
          if (!event.data?.size) return;
          const index = part.current++;
          const form = new FormData();
          form.set('part', String(index));
          form.set('mime_type', rec.mimeType || event.data.type || (which === 'video' ? 'video/webm' : 'audio/webm'));
          form.append('chunk', event.data, `part-${index}`);
          // Upload in order, one at a time.
          queue.current = queue.current.then(() =>
            api(`/api/emergency/${eventId}/recording`, { method: 'POST', form }).catch(() => setUploadFailed(true)),
          );
        };
        rec.start(CHUNK_MS);
        setStatus('recording');
      } catch (error) {
        setStatus(error?.name === 'NotAllowedError' ? 'denied' : 'error');
      }
    },
    [eventId],
  );

  useEffect(() => stop, [stop]);
  return { status, kind, uploadFailed, start, stop };
}

function useVoiceTrigger(enabled, language, onPhrase) {
  const supported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  useEffect(() => {
    if (!enabled || !supported) return undefined;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = language === 'en' ? 'en-IN' : 'hi-IN';
    let active = true;
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .slice(event.resultIndex)
        .map((r) => r[0].transcript.toLowerCase())
        .join(' ');
      const named = /saheli|सहेली|saheri|sahely/.test(text);
      const asked = /help|bachao|madad|बचाओ|मदद/.test(text);
      if (named && asked) onPhrase();
    };
    recognition.onend = () => {
      if (active) {
        try {
          recognition.start();
        } catch {
          // Already started.
        }
      }
    };
    try {
      recognition.start();
    } catch {
      // ignore
    }
    return () => {
      active = false;
      recognition.stop();
    };
  }, [enabled, supported, language, onPhrase]);
  return supported;
}

function ActiveEmergency({ event, onRefresh, onEnded, shareLocation }) {
  const { t, language } = useI18n();
  const [location, setLocation] = useState({ state: shareLocation ? 'waiting' : 'off', at: event.location?.at ?? null });
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const recorder = useEmergencyRecorder(event.id);

  const sendLocation = useCallback(async () => {
    if (!shareLocation) return;
    try {
      const pos = await getPosition({ timeout: 15000, maximumAge: 10000 });
      const response = await api(`/api/emergency/${event.id}/location`, { method: 'POST', body: pos });
      setLocation({ state: 'sharing', at: response.at });
    } catch (error) {
      setLocation((current) => ({ ...current, state: error?.code === 'denied' ? 'denied' : 'unavailable' }));
    }
  }, [event.id, shareLocation]);

  useInterval(sendLocation, shareLocation ? LOCATION_EVERY_MS : null, { immediate: true });
  useInterval(onRefresh, 15000);

  const end = async () => {
    setEnding(true);
    recorder.stop();
    try {
      await api(`/api/emergency/${event.id}/end`, { method: 'POST' });
      onEnded();
    } finally {
      setEnding(false);
      setConfirmEnd(false);
    }
  };

  const emailDeliveries = event.deliveries.filter((d) => d.kind === 'started');
  const smsText = (link) => t('sos.sms_text', { link });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-danger-600 p-5 text-white sm:p-6">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-danger-100">
          <span className="recording-dot size-2.5 rounded-full bg-white" aria-hidden />
          {t('sos.active_title')}
        </p>
        <p className="mt-1 text-lg">{t('sos.active_since', { time: formatTime(event.started_at, language) })}</p>
        <p className="mt-2 text-sm text-danger-100">{t('sos.never_police')}</p>
      </div>

      <Call112 large />

      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t('sos.alerts_title')}</h2>
        {emailDeliveries.length ? (
          <ul className="mt-3 space-y-2">
            {emailDeliveries.map((d, i) => (
              <li key={`${d.recipient}-${d.channel}-${i}`} className="flex items-center gap-2 text-sm">
                {deliveryIcon(d.status)}
                <span className="font-medium">{d.recipient}</span>
                <span className="text-muted">· {d.channel === 'in_app' ? t('sos.in_app_sent') : t(`sos.status.${d.status}`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">{t('sos.nobody')}</p>
        )}

        {event.shares.length ? (
          <div className="mt-5 border-t border-line pt-4">
            <p className="font-semibold">{t('sos.send_from_phone')}</p>
            <p className="text-sm text-muted">{t('sos.send_from_phone_body')}</p>
            <ul className="mt-3 space-y-2">
              {event.shares.map((share) => (
                <li key={share.link} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-lavender-50 p-3">
                  <span className="font-medium">{share.name}</span>
                  <span className="flex flex-wrap gap-2">
                    {share.phone ? (
                      <>
                        <a
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white"
                          href={`sms:${share.phone}?body=${encodeURIComponent(smsText(share.link))}`}
                        >
                          <MessageCircle className="size-4" aria-hidden />
                          {t('sos.sms')}
                        </a>
                        <a
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold"
                          href={`https://wa.me/${phoneDigits(share.phone)}?text=${encodeURIComponent(smsText(share.link))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('sos.whatsapp')}
                        </a>
                        <a className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold" href={`tel:${share.phone}`}>
                          <Phone className="size-4" aria-hidden />
                          {t('common.call')}
                        </a>
                      </>
                    ) : (
                      <a
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold"
                        href={`mailto:?subject=${encodeURIComponent(t('sos.active_title'))}&body=${encodeURIComponent(smsText(share.link))}`}
                      >
                        <Mail className="size-4" aria-hidden />
                        Email
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MapPin className="size-5 text-brand-600" aria-hidden />
          {t('sos.location_title')}
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          {location.state === 'sharing' && location.at ? t('sos.location_sharing', { time: timeAgo(location.at, language) }) : null}
          {location.state === 'waiting' ? t('sos.location_waiting') : null}
          {location.state === 'denied' ? t('sos.location_denied') : null}
          {location.state === 'unavailable' ? t('sos.location_unavailable') : null}
          {location.state === 'off' ? t('sos.location_off') : null}
        </p>
        {shareLocation ? <p className="mt-1 text-xs text-muted">{t('sos.location_keep_open')}</p> : null}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t('sos.recording_title')}</h2>
        {recorder.status === 'recording' ? (
          <div className="mt-3 space-y-3">
            <p className="flex items-center gap-2 font-semibold text-danger-700" role="status">
              <span className="recording-dot size-3 rounded-full bg-danger-600" aria-hidden />
              {t('sos.recording')}
            </p>
            <Button variant="secondary" icon={Square} onClick={recorder.stop}>
              {t('sos.stop_recording')}
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" icon={Mic} onClick={() => recorder.start('audio')}>
              {t('sos.record_audio')}
            </Button>
            <Button variant="secondary" icon={Video} onClick={() => recorder.start('video')}>
              {t('sos.record_video')}
            </Button>
          </div>
        )}
        {recorder.status === 'unsupported' ? <Notice tone="warning" className="mt-3">{t('sos.recording_unsupported')}</Notice> : null}
        {recorder.status === 'denied' ? <Notice tone="warning" className="mt-3">{t('sos.recording_denied')}</Notice> : null}
        {recorder.uploadFailed ? <Notice tone="warning" className="mt-3">{t('sos.upload_failed')}</Notice> : null}
        {event.recording_evidence_id && recorder.status !== 'recording' ? (
          <p className="mt-3 text-sm text-safe-700">
            {t('sos.recording_saved')}{' '}
            <Link className="font-semibold underline" to={`/vault/${event.recording_evidence_id}`}>
              {t('common.open')}
            </Link>
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted">{t('sos.recording_note')}</p>
      </Card>

      <Button variant="safe" size="lg" className="w-full" onClick={() => setConfirmEnd(true)}>
        {t('sos.end')}
      </Button>
      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={end}
        loading={ending}
        tone="primary"
        title={t('sos.end_confirm_title')}
        confirmLabel={t('sos.end')}
      >
        {t('sos.end_confirm_body')}
      </ConfirmDialog>
    </div>
  );
}

function SignedOutSos() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-center font-display text-3xl font-semibold">{t('sos.signed_out_title')}</h1>
      <p className="text-center text-ink-soft">{t('sos.signed_out_body')}</p>
      <Call112 large />
      <ResourceList ids={['women_helpline_181', 'childline_1098', 'cyber_1930', 'tele_manas']} />
      <div className="flex justify-center gap-3">
        <Link to="/sign-in?next=/sos" className="font-semibold text-brand-700 hover:underline">
          {t('nav.sign_in')}
        </Link>
      </div>
    </div>
  );
}

export default function Emergency() {
  const { t, language } = useI18n();
  const { status } = useAuth();
  const [params] = useSearchParams();
  useDocumentTitle(t('sos.title'));

  const signedIn = status === 'signed_in';
  const active = useApi(signedIn ? '/api/emergency/active' : null);
  const contacts = useApi(signedIn ? '/api/contacts' : null);
  const [shareLocation, setShareLocation] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const [ended, setEnded] = useState(false);
  const [tapConfirm, setTapConfirm] = useState(false);
  const [voice, setVoice] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const event = active.data?.event;

  const startSos = useCallback(
    async (trigger = 'button') => {
      if (starting) return;
      setStarting(true);
      setStartError(null);
      setEnded(false);
      setTapConfirm(false);
      setCountdown(null);
      try {
        // Start immediately; location follows once the browser provides it.
        const response = await api('/api/emergency', { method: 'POST', body: { trigger } });
        active.setData({ event: response.event });
      } catch (error) {
        setStartError(error);
      } finally {
        setStarting(false);
      }
    },
    [starting, active],
  );

  // Quick SOS link from a voice shortcut: a cancellable countdown, only if enabled on this device.
  useEffect(() => {
    if (!signedIn || params.get('quick') !== '1' || event) return;
    let allowed;
    try {
      allowed = localStorage.getItem(QUICK_SOS_KEY) === 'on';
    } catch {
      allowed = false;
    }
    if (allowed) setCountdown(5);
  }, [signedIn, params, event]);

  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown <= 0) {
      startSos(voice ? 'voice' : 'button');
      return undefined;
    }
    const timer = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown, startSos, voice]);

  const onPhrase = useCallback(() => setCountdown((c) => (c === null ? 5 : c)), []);
  const voiceSupported = useVoiceTrigger(voice && !event, language, onPhrase);

  if (status === 'loading') return <Loading />;
  if (!signedIn) return <SignedOutSos />;
  if (active.loading) return <Loading />;

  if (event) {
    return (
      <div className="mx-auto max-w-xl">
        <ActiveEmergency
          event={event}
          shareLocation={shareLocation}
          onRefresh={() => api('/api/emergency/active').then((d) => d.event && active.setData(d)).catch(() => {})}
          onEnded={() => {
            active.setData({ event: null });
            setEnded(true);
          }}
        />
      </div>
    );
  }

  const alerted = (contacts.data?.items ?? []).filter((c) => c.notify_on_sos);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {ended ? <Notice tone="success">{t('sos.ended')}</Notice> : null}
      <h1 className="text-center font-display text-3xl font-semibold">{t('sos.question')}</h1>

      {countdown !== null ? (
        <Card className="flex flex-col items-center gap-3 p-6 text-center" role="alert">
          <p className="text-xl font-bold text-danger-700">{t('sos.quick_countdown', { seconds: countdown })}</p>
          <Button variant="secondary" size="lg" onClick={() => setCountdown(null)}>
            {t('sos.quick_cancel')}
          </Button>
        </Card>
      ) : (
        <HoldButton onActivate={() => startSos('button')} disabled={starting} />
      )}

      {starting ? <p className="text-center font-semibold text-danger-700" role="status">{t('sos.starting')}</p> : null}
      {startError ? (
        <Notice tone="danger" role="alert">
          {t('sos.start_failed')} {startError.code === 'network' ? '' : errorMessage(t, startError)}
        </Notice>
      ) : null}

      <div className="text-center">
        <button type="button" className="text-sm font-semibold text-brand-700 underline" onClick={() => setTapConfirm(true)}>
          {t('sos.tap_confirm')}
        </button>
      </div>

      <Call112 />

      <Card className="space-y-4 p-5">
        {geoSupported() ? (
          <Switch checked={shareLocation} onChange={setShareLocation} label={t('sos.share_location')} description={t('sos.share_location_body')} />
        ) : null}
        <div>
          <p className="font-semibold">{t('sos.who_alerted')}</p>
          {contacts.loading ? (
            <p className="text-sm text-muted">{t('common.loading')}</p>
          ) : alerted.length ? (
            <p className="text-sm text-ink-soft">{alerted.map((c) => c.name).join(', ')}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-ink-soft">{t('sos.nobody')}</p>
              <Link to="/contacts" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
                <UserPlus className="size-4" aria-hidden />
                {t('sos.add_contacts')}
              </Link>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <p className="font-semibold">{t('sos.voice_title')}</p>
        {voiceSupported ? (
          <div className="mt-3">
            <Switch checked={voice} onChange={setVoice} label={t('sos.voice_toggle')} description={t('sos.voice_body')} />
            {voice ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-brand-700" role="status">
                <Mic className="size-4" aria-hidden /> {t('sos.voice_toggle')}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 flex items-start gap-2 text-sm text-muted">
            <MicOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {t('sos.voice_unsupported')}{' '}
              <Link to="/settings" className="font-semibold text-brand-700 hover:underline">
                {t('nav.settings')}
              </Link>
            </span>
          </p>
        )}
      </Card>

      <Dialog
        open={tapConfirm}
        onClose={() => setTapConfirm(false)}
        title={t('sos.tap_confirm')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTapConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => startSos('button')} loading={starting}>
              {t('sos.tap_confirm')}
            </Button>
          </>
        }
      >
        <p className="text-ink-soft">{t('sos.tap_confirm_body')}</p>
      </Dialog>
    </div>
  );
}
