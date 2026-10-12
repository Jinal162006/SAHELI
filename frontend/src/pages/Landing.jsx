import {
  ArrowRight,
  BellRing,
  Camera,
  CircleCheck,
  CircleHelp,
  EyeOff,
  FileText,
  Fingerprint,
  HandHeart,
  Lock,
  MapPin,
  MessageCircleHeart,
  MessagesSquare,
  ScanSearch,
  Scale,
  Siren,
  Smartphone,
  UsersRound,
  Watch,
} from 'lucide-react';
import { Link } from 'react-router';
import { EscalationPath } from '../components/EscalationPath';
import { ResourceList } from '../components/Resources';
import { Badge, LevelBadge, LinkButton, cx } from '../components/ui';
import { useDocumentTitle } from '../lib/hooks';
import { useT } from '../lib/i18n';

function Section({ id, children, className, tone }) {
  return (
    <section id={id} className={cx('py-16 sm:py-24', tone === 'soft' && 'bg-lavender-50/70', tone === 'white' && 'bg-surface', className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

function SectionIntro({ title, body, center }) {
  return (
    <div className={cx('max-w-2xl', center && 'mx-auto text-center')}>
      <h2 className="font-display text-3xl font-semibold text-ink sm:text-[2.4rem]">{title}</h2>
      {body ? <p className="mt-4 text-lg text-ink-soft">{body}</p> : null}
    </div>
  );
}

function Points({ items }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((text) => (
        <li key={text} className="flex gap-3 text-ink-soft">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

function ExampleResult() {
  const t = useT();
  const signals = ['money_request', 'secrecy_request', 'video_call_avoidance'];
  return (
    <div className="card relative p-5 sm:p-6" aria-label={t('landing.example_label')}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Badge tone="neutral">{t('landing.example_label')}</Badge>
        <LevelBadge level="high" />
      </div>
      <p className="font-semibold text-ink">{t('check.result.headline.level_high')}</p>
      <p className="mt-4 text-sm font-semibold text-ink">{t('check.result.why_title')}</p>
      <ul className="mt-2 space-y-2.5">
        {signals.map((id) => (
          <li key={id} className="rounded-xl border border-line bg-lavender-50/60 p-3">
            <p className="text-sm font-semibold text-ink">{t(`check.signals.${id}.title`)}</p>
            <p className="mt-0.5 text-sm text-ink-soft">{t(`check.signals.${id}.why`)}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm font-semibold text-ink">{t('check.result.steps_title')}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
        <li>{t('check.steps.no_money')}</li>
        <li>{t('check.steps.verify_identity')}</li>
        <li>{t('check.steps.talk_to_someone')}</li>
      </ol>
    </div>
  );
}

function ExampleImage() {
  const t = useT();
  return (
    <div className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Badge tone="neutral">{t('common.example')}</Badge>
        <Badge tone="danger">{t('check.image.risk_title', { level: t('levels.high') })}</Badge>
      </div>
      <p className="text-sm font-semibold text-ink">{t('check.image.hidden_title')}</p>
      <ul className="mt-2 space-y-2.5">
        <li className="flex gap-3 rounded-xl border border-line p-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-danger-600" aria-hidden />
          <div>
            <p className="text-sm font-semibold">{t('check.image.hidden.location_embedded.title')}</p>
            <p className="text-sm text-ink-soft">{t('check.image.hidden.location_embedded.body', { lat: '28.614', lng: '77.209' })}</p>
          </div>
        </li>
        <li className="flex gap-3 rounded-xl border border-line p-3">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-sm font-semibold">{t('check.image.hidden.device_info.title')}</p>
            <p className="text-sm text-ink-soft">{t('check.image.hidden.device_info.body', { device: 'Redmi Note 13' })}</p>
          </div>
        </li>
      </ul>
      <p className="mt-4 text-sm font-semibold text-ink">{t('check.image.visible_title')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone="caution">{t('check.image.visible.school_uniform_or_logo')}</Badge>
        <Badge tone="caution">{t('check.image.visible.home_or_house_number')}</Badge>
      </div>
    </div>
  );
}

export default function Landing() {
  const t = useT();
  useDocumentTitle(null);

  const helps = [
    { icon: ScanSearch, key: 'detect' },
    { icon: Scale, key: 'assess' },
    { icon: CircleHelp, key: 'explain' },
    { icon: Lock, key: 'protect' },
    { icon: HandHeart, key: 'support' },
    { icon: Siren, key: 'emergency' },
  ];

  return (
    <>
      {/* 1. Introduction */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(60rem_28rem_at_70%_-10%,var(--color-lavender-200),transparent_70%)] opacity-70"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-surface/80 px-3 py-1 text-sm font-semibold text-brand-700">
              <span className="size-1.5 rounded-full bg-rose-500" aria-hidden />
              {t('brand.tagline')}
            </p>
            <h1 className="font-display text-[2.4rem] font-semibold leading-[1.08] text-ink sm:text-[3.4rem]">
              SAHELI {'\u2014'} Always by Your Side.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">{t('landing.hero_body')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <LinkButton to="/check/conversation" size="lg" icon={MessagesSquare}>
                {t('landing.hero_cta')}
              </LinkButton>
              <LinkButton to="/sign-up" size="lg" variant="secondary">
                {t('landing.hero_secondary')}
              </LinkButton>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <EyeOff className="size-4" aria-hidden />
              {t('landing.hero_cta_note')}
            </p>
          </div>
          <ExampleResult />
        </div>
      </section>

      {/* 2. The problem */}
      <Section tone="white">
        <SectionIntro title={t('landing.problem_title')} body={t('landing.problem_body')} />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-2xl border border-line bg-canvas p-6">
              <span className="font-display text-3xl font-semibold text-brand-500" aria-hidden>0{n}</span>
              <h3 className="mt-2 text-lg font-semibold">{t(`landing.problem_${n}_title`)}</h3>
              <p className="mt-2 text-ink-soft">{t(`landing.problem_${n}_body`)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. How it escalates */}
      <Section id="escalation">
        <SectionIntro title={t('landing.path_title')} body={t('landing.path_body')} />
        <EscalationPath className="mt-10" />
        <p className="mt-6 max-w-2xl text-sm text-muted">{t('landing.path_note')}</p>
      </Section>

      {/* 4. How SAHELI helps */}
      <Section tone="white">
        <SectionIntro title={t('landing.helps_title')} />
        <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {helps.map(({ icon: Icon, key }) => (
            <div key={key} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold text-ink">{t(`landing.helps_${key}`)}</h3>
                <p className="mt-1 text-ink-soft">{t(`landing.helps_${key}_body`)}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 5. Conversation analysis */}
      <Section>
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionIntro title={t('landing.convo_title')} body={t('landing.convo_body')} />
            <Points items={[t('landing.convo_point_1'), t('landing.convo_point_2'), t('landing.convo_point_3')]} />
            <Link to="/check/conversation" className="mt-6 inline-flex items-center gap-2 font-semibold text-brand-700 hover:underline">
              {t('landing.hero_cta')}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="card p-5 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <Badge tone="neutral">{t('common.example')}</Badge>
              <span className="text-sm font-semibold text-ink-soft">{t('check.result.moments_title')}</span>
            </div>
            <ol className="relative space-y-4 border-l-2 border-line pl-5">
              {[
                ['bonding', 'love_bombing', 'I have never felt this way. God brought you to me.'],
                ['secrecy', 'secrecy_request', "Let's keep this between us, okay?"],
                ['financial', 'money_request', 'Customs are asking for a clearance fee. Can you send it?'],
                ['urgency', 'urgency_pressure', 'Please, it has to be right now.'],
              ].map(([stage, signal, quote], i) => (
                <li key={signal} className="relative">
                  <span className="absolute -left-[1.68rem] top-1 size-3 rounded-full border-2 border-surface bg-brand-500" aria-hidden />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('check.result.message_ref', { n: [3, 7, 11, 12][i] })} · {t(`check.stages.${stage}.title`)}
                  </p>
                  <p className="mt-0.5 font-semibold text-ink">{t(`check.signals.${signal}.title`)}</p>
                  <p className="mt-1 rounded-lg bg-lavender-50 px-3 py-2 text-sm italic text-ink-soft">“{quote}”</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      {/* 6. Image safety */}
      <Section tone="white">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <ExampleImage />
          </div>
          <div className="order-1 lg:order-2">
            <span className="mb-4 grid size-11 place-items-center rounded-xl bg-info-50 text-info-700">
              <Camera className="size-5" aria-hidden />
            </span>
            <SectionIntro title={t('landing.image_title')} body={t('landing.image_body')} />
            <Points items={[t('landing.image_point_1'), t('landing.image_point_2'), t('landing.image_point_3')]} />
          </div>
        </div>
      </Section>

      {/* 7. Emergency */}
      <Section>
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="mb-4 grid size-11 place-items-center rounded-xl bg-danger-50 text-danger-700">
              <BellRing className="size-5" aria-hidden />
            </span>
            <SectionIntro title={t('landing.sos_title')} body={t('landing.sos_body')} />
            <Points items={[t('landing.sos_point_1'), t('landing.sos_point_2'), t('landing.sos_point_3')]} />
          </div>
          <div className="card flex flex-col items-center p-8 text-center">
            <Badge tone="neutral" className="self-start">{t('common.example')}</Badge>
            <p className="mt-4 font-display text-2xl font-semibold">{t('sos.question')}</p>
            <div className="mt-6 grid size-40 place-items-center rounded-full border-[10px] border-danger-100 bg-danger-600 text-white shadow-[0_12px_40px_-12px_rgb(220_38_38/0.6)]">
              <span className="px-4 text-lg font-bold leading-tight">{t('sos.hold')}</span>
            </div>
            <p className="mt-6 text-sm text-muted">{t('sos.hold_help')}</p>
          </div>
        </div>
      </Section>

      {/* 8. Family and watch */}
      <Section tone="soft">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card p-6 sm:p-8">
            <span className="mb-4 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <UsersRound className="size-5" aria-hidden />
            </span>
            <h2 className="font-display text-2xl font-semibold">{t('landing.family_title')}</h2>
            <p className="mt-3 text-ink-soft">{t('landing.family_body')}</p>
          </div>
          <div className="card p-6 sm:p-8">
            <span className="mb-4 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Watch className="size-5" aria-hidden />
            </span>
            <h2 className="font-display text-2xl font-semibold">{t('landing.watch_title')}</h2>
            <p className="mt-3 text-ink-soft">{t('landing.watch_body')}</p>
          </div>
        </div>
      </Section>

      {/* 9. Privacy */}
      <Section tone="white" id="privacy">
        <SectionIntro title={t('landing.privacy_title')} body={t('landing.privacy_body')} />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ['privacy_not_stored', EyeOff, 'text-safe-700 bg-safe-50'],
            ['privacy_stored_choice', Fingerprint, 'text-brand-700 bg-brand-50'],
            ['privacy_never', Lock, 'text-ink bg-lavender-100'],
          ].map(([key, Icon, tone]) => (
            <div key={key} className="rounded-2xl border border-line p-6">
              <span className={cx('mb-4 grid size-11 place-items-center rounded-xl', tone)}>
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="font-semibold">{t(`landing.${key}`)}</h3>
              <ul className="mt-3 space-y-1.5 text-ink-soft">
                {t(`landing.${key}_items`)
                  .split(' · ')
                  .map((item) => (
                    <li key={item}>{item}</li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <Link to="/privacy" className="mt-6 inline-flex items-center gap-2 font-semibold text-brand-700 hover:underline">
          {t('footer.privacy')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Section>

      {/* 10. How it works */}
      <Section>
        <SectionIntro title={t('landing.how_title')} />
        <ol className="mt-10 grid gap-4 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <li key={n} className="rounded-2xl border border-line bg-surface p-5">
              <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{n}</span>
              <p className="mt-3 text-ink-soft">{t(`landing.how_${n}`)}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* 11. Support */}
      <Section tone="white">
        <SectionIntro title={t('landing.support_title')} body={t('landing.support_body')} />
        <ResourceList ids={['emergency_112', 'cyber_1930', 'women_helpline_181', 'tele_manas']} className="mt-8 lg:grid-cols-4" />
        <Link to="/help" className="mt-6 inline-flex items-center gap-2 font-semibold text-brand-700 hover:underline">
          {t('landing.support_all')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Section>

      {/* 12. Call to action */}
      <Section>
        <div className="rounded-3xl bg-brand-800 px-6 py-12 text-center text-white sm:px-12 sm:py-16">
          <MessageCircleHeart className="mx-auto size-10 text-brand-200" aria-hidden />
          <h2 className="mt-4 font-display text-3xl font-semibold sm:text-4xl">{t('landing.cta_title')}</h2>
          <p className="mx-auto mt-4 max-w-xl text-brand-100">{t('landing.cta_body')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton to="/check/conversation" size="lg" className="bg-white !text-brand-800 hover:bg-brand-50" icon={MessagesSquare}>
              {t('landing.hero_cta')}
            </LinkButton>
            <LinkButton to="/sign-up" size="lg" variant="ghost" className="!text-white ring-1 ring-white/40 hover:!bg-white/10" icon={FileText}>
              {t('landing.hero_secondary')}
            </LinkButton>
          </div>
        </div>
      </Section>
    </>
  );
}
