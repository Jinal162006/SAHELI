import { CircleCheck, RotateCcw, UserSearch } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Checkbox, Chips, Field, LevelBadge, Notice, PageHeader, errorMessage } from '../../components/ui';
import { api } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

const INITIAL = {
  account_age: 'unknown',
  photo_count: 'unknown',
  connections: 'unknown',
  mutual_connections: 'unknown',
  video_call: 'not_asked',
  reverse_image: 'not_checked',
  met_in_person: false,
  photos_look_professional: false,
  story_inconsistent: false,
  claims: [],
  asked_for: [],
};

export default function CheckProfile() {
  const { t } = useI18n();
  useDocumentTitle(t('check.profile.title'));
  const [answers, setAnswers] = useState(INITIAL);
  const [result, setResult] = useState(null);
  const [state, setState] = useState({ busy: false, error: null });

  const set = (key) => (value) => setAnswers((a) => ({ ...a, [key]: value ?? INITIAL[key] }));
  const options = (values) => values.map((v) => ({ value: v, label: t(`check.profile.a.${v}`) }));

  const submit = async (event) => {
    event.preventDefault();
    setState({ busy: true, error: null });
    try {
      setResult(await api('/api/check/profile', { method: 'POST', body: answers }));
      setState({ busy: false, error: null });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title={t('check.profile.title')} />
        <Card className="p-5 sm:p-6" aria-live="polite">
          <LevelBadge level={result.level} size="lg" />
          <h2 className="mt-3 font-display text-2xl font-semibold">{t(`check.profile.result_title.${result.level}`)}</h2>
          <p className="mt-2 text-ink-soft">{t('check.profile.result_body')}</p>
        </Card>
        {result.signals.length ? (
          <section>
            <h2 className="mb-2 text-lg font-semibold">{t('check.profile.signals_title')}</h2>
            <ul className="space-y-2">
              {result.signals.map((s) => (
                <li key={s.id} className="rounded-xl border border-line bg-surface p-3">
                  {t(`check.profile.signal.${s.id}`)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {result.reassuring.length ? (
          <section>
            <h2 className="mb-2 text-lg font-semibold">{t('check.profile.reassuring_title')}</h2>
            <ul className="space-y-2">
              {result.reassuring.map((r) => (
                <li key={r} className="flex gap-2 rounded-xl border border-safe-600/20 bg-safe-50 p-3 text-ink">
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-safe-600" aria-hidden />
                  {t(`check.profile.reassuring.${r}`)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section>
          <h2 className="mb-2 text-lg font-semibold">{t('check.profile.steps_title')}</h2>
          <ol className="space-y-2">
            {result.steps.map((s, i) => (
              <li key={s} className="flex gap-3 rounded-xl bg-surface p-3 ring-1 ring-line">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{i + 1}</span>
                <span className="pt-0.5">{t(`check.profile.step.${s}`)}</span>
              </li>
            ))}
          </ol>
        </section>
        <p className="text-sm text-muted">{t('check.profile.cannot_verify')}</p>
        <Button
          variant="ghost"
          icon={RotateCcw}
          onClick={() => {
            setResult(null);
            setAnswers(INITIAL);
          }}
        >
          {t('check.profile.new_check')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('check.profile.title')} description={t('check.profile.description')} />
      <Notice tone="neutral" className="mb-5">
        {t('check.profile.cannot_verify')}
      </Notice>
      <form onSubmit={submit} className="space-y-5">
        <Card className="space-y-6 p-5 sm:p-6">
          <Field label={t('check.profile.q_account_age')}>
            <Chips options={options(['new', 'months', 'years'])} value={answers.account_age} onChange={set('account_age')} label={t('check.profile.q_account_age')} />
          </Field>
          <Field label={t('check.profile.q_photos')}>
            <Chips options={options(['none', 'few', 'many'])} value={answers.photo_count} onChange={set('photo_count')} label={t('check.profile.q_photos')} />
          </Field>
          <Field label={t('check.profile.q_connections')}>
            <Chips options={options(['few', 'some', 'many'])} value={answers.connections} onChange={set('connections')} label={t('check.profile.q_connections')} />
          </Field>
          <Field label={t('check.profile.q_mutual')}>
            <Chips options={options(['yes', 'no'])} value={answers.mutual_connections} onChange={set('mutual_connections')} label={t('check.profile.q_mutual')} />
          </Field>
          <Field label={t('check.profile.q_video')}>
            <Chips options={options(['yes', 'refused', 'not_asked'])} value={answers.video_call} onChange={set('video_call')} label={t('check.profile.q_video')} />
          </Field>
          <Field label={t('check.profile.q_reverse')}>
            <Chips
              options={options(['different_name', 'same_name', 'nothing_found', 'not_checked'])}
              value={answers.reverse_image}
              onChange={set('reverse_image')}
              label={t('check.profile.q_reverse')}
            />
          </Field>
        </Card>
        <Card className="space-y-6 p-5 sm:p-6">
          <Field label={t('check.profile.q_claims')}>
            <Chips
              multiple
              options={Object.keys(INITIAL_CLAIMS).map((v) => ({ value: v, label: t(`check.profile.claims.${v}`) }))}
              value={answers.claims}
              onChange={set('claims')}
              label={t('check.profile.q_claims')}
            />
          </Field>
          <Field label={t('check.profile.q_asked')}>
            <Chips
              multiple
              options={ASKED.map((v) => ({ value: v, label: t(`check.profile.asked.${v}`) }))}
              value={answers.asked_for}
              onChange={set('asked_for')}
              label={t('check.profile.q_asked')}
            />
          </Field>
          <Field label={t('check.profile.q_other')}>
            <div className="space-y-3">
              <Checkbox label={t('check.profile.met_in_person')} checked={answers.met_in_person} onChange={(e) => set('met_in_person')(e.target.checked)} />
              <Checkbox label={t('check.profile.professional_photos')} checked={answers.photos_look_professional} onChange={(e) => set('photos_look_professional')(e.target.checked)} />
              <Checkbox label={t('check.profile.inconsistent')} checked={answers.story_inconsistent} onChange={(e) => set('story_inconsistent')(e.target.checked)} />
            </div>
          </Field>
        </Card>
        {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
        <Button type="submit" size="lg" icon={UserSearch} loading={state.busy}>
          {t('check.profile.submit')}
        </Button>
      </form>
    </div>
  );
}

const INITIAL_CLAIMS = {
  military_abroad: 1,
  oil_rig_or_ship: 1,
  doctor_abroad: 1,
  widowed: 1,
  wealthy_investor: 1,
  model_or_celebrity: 1,
};
const ASKED = ['money', 'gift_cards', 'crypto', 'investment', 'intimate_images', 'personal_details', 'move_apps', 'secrecy'];
