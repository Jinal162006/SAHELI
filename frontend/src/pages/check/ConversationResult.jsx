import {
  ChevronDown,
  FileText,
  FolderLock,
  Info,
  Link2,
  MessageCircleHeart,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { EscalationPath } from '../../components/EscalationPath';
import { ResourceList } from '../../components/Resources';
import { Badge, Button, Card, Field, Input, LEVEL_STYLE, LevelBadge, Notice, cx, errorMessage } from '../../components/ui';
import { Dialog } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../lib/i18n';

const INCIDENT_FOR_PATTERN = {
  sextortion: 'sextortion',
  child_sexual_exploitation: 'grooming',
  grooming: 'grooming',
  threat_of_harm: 'threats',
  credential_theft: 'phishing',
  phishing: 'phishing',
  authority_scam: 'financial_fraud',
  romance_money: 'romance_scam',
  money_pressure: 'financial_fraud',
  investment_scam: 'financial_fraud',
  prize_or_loan_fee: 'financial_fraud',
};

const LINK_TONES = { safe: 'safe', unable_to_verify: 'neutral', suspicious: 'caution', high_risk: 'danger', invalid: 'neutral' };

function SignalItem({ signal }) {
  const { t } = useI18n();
  const first = signal.occurrences[0];
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-ink">{t(`check.signals.${signal.id}.title`)}</p>
        <div className="flex flex-wrap gap-1.5">
          {signal.ai_verdict === 'supported' ? <Badge tone="brand">{t('check.result.ai_agreed')}</Badge> : null}
          {signal.ai_verdict === 'unclear' ? <Badge tone="neutral">{t('check.result.ai_unclear')}</Badge> : null}
          {signal.ai_verdict === 'added' ? <Badge tone="brand">{t('check.result.ai_added')}</Badge> : null}
          {signal.count > 1 ? <Badge tone="neutral">{t('check.result.seen_times', { count: signal.count })}</Badge> : null}
        </div>
      </div>
      <p className="mt-1 text-ink-soft">{t(`check.signals.${signal.id}.why`)}</p>
      {first ? (
        <figure className="mt-3 rounded-lg bg-lavender-50 px-3 py-2">
          <blockquote className="text-sm text-ink-soft">“{first.excerpt}”</blockquote>
          <figcaption className="mt-1 text-xs text-muted">
            {t('check.result.message_ref', { n: first.message_index + 1 })}
            {first.from === 'unknown' ? ` · ${t('check.result.from_unknown')}` : ''}
          </figcaption>
        </figure>
      ) : null}
    </li>
  );
}

function Collapsible({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold"
      >
        {title}
        <ChevronDown className={cx('size-5 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? <div className="border-t border-line px-4 py-4">{children}</div> : null}
    </div>
  );
}

function SaveDialog({ open, onClose, text }) {
  const { t, language } = useI18n();
  const [title, setTitle] = useState(() => t('check.result.save_default_name', { date: formatDate(new Date().toISOString(), language) }));
  const [state, setState] = useState({ busy: false, error: null, done: false });

  const save = async () => {
    setState({ busy: true, error: null, done: false });
    const form = new FormData();
    form.set('kind', 'conversation');
    form.set('title', title || 'Conversation');
    form.set('content', text);
    try {
      await api('/api/evidence', { method: 'POST', form });
      setState({ busy: false, error: null, done: true });
    } catch (error) {
      setState({ busy: false, error, done: false });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('check.result.save_title')}
      footer={
        state.done ? (
          <Button onClick={onClose}>{t('common.done')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} loading={state.busy} icon={FolderLock}>
              {t('common.save')}
            </Button>
          </>
        )
      }
    >
      {state.done ? (
        <Notice tone="success">
          {t('check.result.saved')}{' '}
          <Link to="/vault" className="font-semibold underline">
            {t('nav.vault')}
          </Link>
        </Notice>
      ) : (
        <div className="space-y-4">
          <p className="text-ink-soft">{t('check.result.save_body')}</p>
          <Field label={t('check.result.save_name')} htmlFor="save-name">
            <Input id="save-name" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
        </div>
      )}
    </Dialog>
  );
}

export function ConversationResult({ result, text, onReset }) {
  const { t } = useI18n();
  const { status } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const style = LEVEL_STYLE[result.level];
  const isLow = result.level === 'low';
  const reached = result.stages.filter((s) => s.reached).length;
  const levelDecisions = result.decisions.filter((d) => d.level === result.level);
  const basis = result.basis;

  const incidentType = result.decisions.map((d) => INCIDENT_FOR_PATTERN[d.pattern]).find(Boolean) ?? 'other';

  return (
    <div className="space-y-6" aria-live="polite">
      {/* Level and headline */}
      <Card className={cx('border-2 p-5 sm:p-6', style.ring)}>
        <div className="flex flex-wrap items-center gap-3">
          <LevelBadge level={result.level} size="lg" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold text-ink">{t(`check.result.headline.${result.headline}`)}</h2>
        {isLow ? <p className="mt-2 text-ink-soft">{t('check.result.low_note')}</p> : null}
        {result.reassure ? (
          <p className="mt-3 rounded-xl bg-surface/80 px-4 py-3 font-medium text-ink">{t('check.result.reassure')}</p>
        ) : null}
        {result.ai?.summary ? (
          <div className="mt-4 rounded-xl bg-surface/80 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
              <Sparkles className="size-4" aria-hidden />
              {t('check.ai_label')}
            </p>
            <p className="mt-1 text-ink-soft">{result.ai.summary}</p>
          </div>
        ) : null}
      </Card>

      {/* Why */}
      <section aria-labelledby="why">
        <h2 id="why" className="mb-3 text-lg font-semibold">
          {isLow ? t('check.result.why_title_low') : t('check.result.why_title')}
        </h2>
        {result.signals.length ? (
          <ul className="space-y-3">
            {result.signals.map((signal) => (
              <SignalItem key={signal.id} signal={signal} />
            ))}
          </ul>
        ) : (
          <p className="text-ink-soft">{t('check.result.nothing_found')}</p>
        )}
        {result.ai?.reassuring?.length ? (
          <div className="mt-4 rounded-xl border border-safe-600/20 bg-safe-50 p-4">
            <p className="font-semibold text-safe-700">{t('check.result.reassuring_title')}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
              {result.ai.reassuring.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* Escalation */}
      {reached >= 2 ? (
        <section aria-labelledby="escalation">
          <h2 id="escalation" className="text-lg font-semibold">
            {t('check.result.escalation_title')}
          </h2>
          <p className="mb-3 text-sm text-muted">{t('check.result.escalation_body')}</p>
          {result.escalation ? <Notice tone="warning" className="mb-3">{t('check.result.escalation_flag')}</Notice> : null}
          <EscalationPath stages={result.stages} />
        </section>
      ) : null}

      {/* Links */}
      {result.links?.length ? (
        <section aria-labelledby="links">
          <h2 id="links" className="mb-3 text-lg font-semibold">
            {t('check.result.links_title')}
          </h2>
          <ul className="space-y-2">
            {result.links.map((link) => (
              <li key={link.url} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <Link2 className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="truncate font-medium">{link.host}</span>
                </span>
                <Badge tone={LINK_TONES[link.status]}>{t(`check.link.status.${link.status}`)}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* What you can do */}
      <section aria-labelledby="steps">
        <h2 id="steps" className="mb-3 text-lg font-semibold">
          {t('check.result.steps_title')}
        </h2>
        <ol className="space-y-2">
          {result.next_steps.map((step, i) => (
            <li key={step} className="flex gap-3 rounded-xl bg-surface p-3 ring-1 ring-line">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{i + 1}</span>
              <span className="pt-0.5 text-ink">{t(`check.steps.${step}`)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-muted">{t('check.result.steps_footer')}</p>
      </section>

      {result.resources?.length ? (
        <section aria-labelledby="resources">
          <h2 id="resources" className="mb-3 text-lg font-semibold">
            {t('check.result.resources_title')}
          </h2>
          <ResourceList ids={result.resources} />
        </section>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {status === 'signed_in' ? (
          <>
            <Button variant="secondary" icon={FolderLock} onClick={() => setSaving(true)}>
              {t('check.result.save')}
            </Button>
            <Button
              variant="secondary"
              icon={MessageCircleHeart}
              onClick={() => navigate('/companion', { state: { check: { level: result.level, signals: result.signals.map((s) => s.id) } } })}
            >
              {t('check.result.talk')}
            </Button>
            {!isLow ? (
              <Button variant="secondary" icon={FileText} onClick={() => navigate('/reports/new', { state: { incident_type: incidentType } })}>
                {t('check.result.report')}
              </Button>
            ) : null}
          </>
        ) : (
          <Link to="/sign-up" className="inline-flex h-11 items-center rounded-xl px-4 font-semibold text-brand-700 hover:bg-brand-50">
            {t('check.result.save_needs_account')}
          </Link>
        )}
        <Button variant="ghost" icon={RotateCcw} onClick={onReset}>
          {t('check.conversation.new_check')}
        </Button>
      </div>

      {/* How SAHELI decided */}
      <div className="space-y-3">
        <Collapsible title={t('check.result.decided_title')}>
          {levelDecisions.length ? (
            <>
              <p className="text-ink-soft">{t('check.result.decided_level', { level: t(`levels.${result.level}`) })}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
                {levelDecisions.map((d) => (
                  <li key={d.pattern}>{t(`check.patterns.${d.pattern}`)}</li>
                ))}
              </ul>
              {result.decisions.length > levelDecisions.length ? (
                <ul className="mt-3 space-y-1 text-sm text-muted">
                  {result.decisions
                    .filter((d) => d.level !== result.level)
                    .map((d) => (
                      <li key={d.pattern}>
                        {t(`check.patterns.${d.pattern}`)} ({t(`levels.${d.level}`)})
                      </li>
                    ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-ink-soft">{t('check.result.decided_none')}</p>
          )}
          <p className="mt-4 font-semibold">{t('check.result.basis_title')}</p>
          <ul className="mt-1 space-y-1 text-sm text-ink-soft">
            <li>{t('check.result.basis_messages', { count: basis.message_count })}</li>
            <li>{basis.senders_known ? t('check.result.basis_senders_known') : t('check.result.basis_senders_unknown')}</li>
            {basis.message_count < 4 ? <li>{t('check.result.basis_few')}</li> : null}
            {basis.truncated ? <li>{t('check.result.basis_truncated')}</li> : null}
            <li>{t(`check.result.ai_status.${result.ai?.status ?? 'not_requested'}`)}</li>
          </ul>
          {basis.injection_detected ? (
            <Notice tone="info" icon={Info} className="mt-3">
              {t('check.result.basis_injection')}
            </Notice>
          ) : null}
        </Collapsible>

        {result.set_aside?.length ? (
          <Collapsible title={t('check.result.set_aside_title')}>
            <p className="text-sm text-muted">{t('check.result.set_aside_body')}</p>
            <ul className="mt-3 space-y-2">
              {result.set_aside.map((item) => (
                <li key={`${item.id}-${item.message_index}`} className="rounded-lg bg-lavender-50 px-3 py-2 text-sm">
                  <span className="font-semibold">{t(`check.signals.${item.id}.title`)}</span>
                  <span className="block text-ink-soft">“{item.excerpt}”</span>
                </li>
              ))}
            </ul>
          </Collapsible>
        ) : null}
      </div>

      <p className="text-sm text-muted">{t('check.disclaimer')}</p>

      {saving ? <SaveDialog open={saving} onClose={() => setSaving(false)} text={text} /> : null}
    </div>
  );
}
