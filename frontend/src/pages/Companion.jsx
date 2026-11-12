import { HeartHandshake, Phone, SendHorizontal, Siren, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { LogoMark } from '../components/Logo';
import { ResourceList } from '../components/Resources';
import { Badge, Button, Notice, PageHeader, Spinner, Textarea, cx, errorMessage } from '../components/ui';
import { api } from '../lib/api';
import { useConfig, useDocumentTitle, useSessionState } from '../lib/hooks';
import { useI18n } from '../lib/i18n';

const QUICK = ['what_happened', 'what_do', 'need_help', 'understand', 'talk_someone'];

function Bubble({ role, children }) {
  const mine = role === 'user';
  return (
    <div className={cx('flex gap-2.5', mine && 'flex-row-reverse')}>
      {!mine ? <LogoMark className="mt-1 size-7" /> : null}
      <div
        className={cx(
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 leading-relaxed',
          mine ? 'rounded-tr-md bg-brand-600 text-white' : 'rounded-tl-md border border-line bg-surface text-ink',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default function Companion() {
  const { t, language } = useI18n();
  const { features } = useConfig();
  const location = useLocation();
  useDocumentTitle(t('companion.title'));

  const [messages, setMessages] = useSessionState('saheli.companion', []);
  const [check, setCheck] = useSessionState('saheli.companion.check', null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [flags, setFlags] = useState({ crisis: false, danger: false });
  const [unavailable, setUnavailable] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (location.state?.check) setCheck(location.state.check);
  }, [location.state, setCheck]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setDraft('');
    setBusy(true);
    setError(null);
    try {
      const response = await api('/api/companion', {
        method: 'POST',
        body: { messages: next.slice(-40), language, check: check ?? undefined },
      });
      setFlags((f) => ({ crisis: f.crisis || response.crisis, danger: f.danger || response.danger }));
      if (response.reply) {
        setMessages([...next, { role: 'assistant', content: response.reply }]);
        setUnavailable(false);
      } else {
        setUnavailable(true);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    if (!window.confirm(t('companion.clear_confirm'))) return;
    setMessages([]);
    setCheck(null);
    setFlags({ crisis: false, danger: false });
    setUnavailable(false);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <PageHeader
        title={t('companion.title')}
        description={t('companion.description')}
        actions={
          messages.length ? (
            <Button variant="ghost" size="sm" icon={Trash2} onClick={clear}>
              {t('companion.clear')}
            </Button>
          ) : null
        }
      />

      <div className="space-y-3">
        {flags.danger ? (
          <Notice
            tone="danger"
            icon={Siren}
            title={t('companion.danger_title')}
            action={
              <div className="flex flex-wrap gap-2">
                <a href="tel:112" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger-600 px-3 text-sm font-semibold text-white">
                  <Phone className="size-4" aria-hidden />
                  {t('sos.call_112')}
                </a>
                <Link to="/sos" className="inline-flex h-9 items-center rounded-lg border border-danger-600/40 px-3 text-sm font-semibold text-danger-700">
                  {t('nav.sos')}
                </Link>
              </div>
            }
          >
            {t('companion.danger_body')}
          </Notice>
        ) : null}
        {flags.crisis ? (
          <Notice
            tone="info"
            icon={HeartHandshake}
            title={t('companion.crisis_title')}
            action={
              <a href="tel:14416" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-info-600 px-3 text-sm font-semibold text-white">
                <Phone className="size-4" aria-hidden />
                Tele-MANAS 14416
              </a>
            }
          >
            {t('companion.crisis_body')}
          </Notice>
        ) : null}
        {check ? <Badge tone="brand">{t('companion.with_check', { level: t(`levels.${check.level}`).toLowerCase() })}</Badge> : null}
      </div>

      <div className="mt-4 min-h-[16rem] space-y-4 rounded-2xl border border-line bg-lavender-50/50 p-4 sm:p-5" aria-live="polite">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <Bubble role="assistant">{t('companion.description')}</Bubble>
            <div className="flex flex-wrap gap-2 pl-9">
              {QUICK.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => send(t(`companion.quick.${key}_text`))}
                  className="rounded-full border border-brand-200 bg-surface px-3.5 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50 disabled:opacity-50"
                >
                  {t(`companion.quick.${key}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <Bubble key={i} role={m.role}>
              {m.content}
            </Bubble>
          ))
        )}
        {busy ? (
          <div className="flex items-center gap-2 pl-9 text-sm text-muted" role="status">
            <Spinner className="size-4" />
            {t('companion.thinking')}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {unavailable || features.ai === false ? (
        <div className="mt-4 space-y-3">
          <Notice tone="warning" title={t('companion.unavailable_title')}>
            {t('companion.unavailable_body')}
          </Notice>
          <ResourceList ids={['emergency_112', 'women_helpline_181', 'tele_manas', 'cyber_1930']} />
        </div>
      ) : null}
      {error ? <Notice tone="danger" className="mt-3">{errorMessage(t, error) || t('companion.error')}</Notice> : null}

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label htmlFor="companion-input" className="sr-only">
          {t('companion.placeholder')}
        </label>
        <Textarea
          id="companion-input"
          rows={2}
          value={draft}
          maxLength={4000}
          placeholder={t('companion.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          className="min-h-[3.25rem] flex-1 resize-none"
        />
        <Button type="submit" icon={SendHorizontal} disabled={!draft.trim() || busy} className="h-[3.25rem]">
          <span className="sr-only sm:not-sr-only">{t('companion.send')}</span>
        </Button>
      </form>
      <p className="mt-3 text-xs text-muted">
        {t('companion.ai_note')} {t('companion.not_saved')}
      </p>
    </div>
  );
}
