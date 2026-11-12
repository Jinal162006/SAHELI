import { ChevronDown, FileUp, Images, LockKeyhole, ScanText, Type, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, Checkbox, Chips, Field, Notice, PageHeader, Spinner, Switch, Textarea, cx, errorMessage } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useConfig, useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { ConversationResult } from './ConversationResult';

const MAX_CHARS = 120_000;

function Tabs({ value, onChange, tabs }) {
  return (
    <div role="tablist" className="mb-4 inline-flex rounded-xl bg-lavender-100 p-1">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
            value === id ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

function ScreenshotReader({ onRead }) {
  const { t } = useI18n();
  const [files, setFiles] = useState([]);
  const [state, setState] = useState({ busy: false, error: null });
  const previews = useRef([]);

  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const add = (list) => {
    const next = [...files, ...Array.from(list)].slice(0, 6);
    previews.current.forEach((url) => URL.revokeObjectURL(url));
    previews.current = next.map((f) => URL.createObjectURL(f));
    setFiles(next);
  };

  const read = async () => {
    setState({ busy: true, error: null });
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    try {
      const result = await api('/api/check/screenshots', { method: 'POST', form });
      const text = result.messages.map((m) => `${m.sender}: ${m.text.replace(/\n/g, ' ')}`).join('\n');
      onRead(text);
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  return (
    <div className="space-y-4">
      <Field label={t('check.conversation.screenshots_label')} hint={t('check.conversation.screenshots_help')}>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-lavender-50/50 px-4 py-8 text-center hover:border-brand-300">
          <Images className="size-6 text-brand-600" aria-hidden />
          <span className="font-semibold text-ink">{t('check.image.choose')}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
        </label>
      </Field>
      {files.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="relative">
              <img src={previews.current[i]} alt="" className="aspect-[9/16] w-full rounded-lg border border-line object-cover" />
              <button
                type="button"
                onClick={() => {
                  const next = files.filter((_, j) => j !== i);
                  previews.current.forEach((url) => URL.revokeObjectURL(url));
                  previews.current = next.map((f) => URL.createObjectURL(f));
                  setFiles(next);
                }}
                className="absolute right-1 top-1 rounded-full bg-ink/70 p-1 text-white"
                aria-label={`${t('common.remove')} ${i + 1}`}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
      <Button icon={ScanText} onClick={read} loading={state.busy} disabled={!files.length}>
        {state.busy ? t('check.conversation.screenshots_reading') : t('check.conversation.screenshots_read')}
      </Button>
    </div>
  );
}

export default function CheckConversation() {
  const { t } = useI18n();
  const { status, isMinor } = useAuth();
  const { features } = useConfig();
  useDocumentTitle(t('check.conversation.title'));

  const [tab, setTab] = useState('paste');
  const [text, setText] = useState('');
  const [fileNote, setFileNote] = useState(null);
  const [readNote, setReadNote] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [known, setKnown] = useState(null);
  const [happened, setHappened] = useState([]);
  const [under18, setUnder18] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [step, setStep] = useState('input'); // input | who | running | result
  const [senders, setSenders] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const aiAvailable = Boolean(features.ai);
  const signedIn = status === 'signed_in';

  const loadFile = async (file) => {
    if (!file) return;
    try {
      const content = await file.text();
      if (content.includes('\u0000')) throw new Error('binary');
      setText(content.slice(0, MAX_CHARS));
      setFileNote({ ok: true, name: file.name });
      setTab('paste');
    } catch {
      setFileNote({ ok: false });
    }
  };

  const run = async (me) => {
    setStep('running');
    setError(null);
    try {
      const body = {
        text,
        me: me ?? null,
        use_ai: aiAvailable && useAi,
        under_18: under18,
        context: {
          known_duration: known,
          sent_money: happened.includes('money'),
          shared_images: happened.includes('images'),
          shared_codes: happened.includes('codes'),
          planning_to_meet: happened.includes('meet'),
        },
      };
      const response = await api('/api/check/conversation', { method: 'POST', body });
      setResult(response);
      setStep('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err);
      setStep('input');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (text.trim().length < 10) {
      setError({ code: 'too_short', message: t('check.conversation.too_short') });
      return;
    }
    try {
      const found = await api('/api/check/conversation/senders', { method: 'POST', body: { text } });
      if (found.senders.includes('You') && readNote) {
        run('You');
      } else if (found.senders.length >= 2) {
        setSenders(found.senders);
        setStep('who');
      } else {
        run(null);
      }
    } catch (err) {
      setError(err);
    }
  };

  const reset = () => {
    setStep('input');
    setResult(null);
    setText('');
    setSenders([]);
    setReadNote(false);
    setFileNote(null);
  };

  if (step === 'result' && result) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t('check.conversation.title')} />
        <ConversationResult result={result} text={text} onReset={reset} />
      </div>
    );
  }

  if (step === 'running') {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t('check.conversation.title')} />
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center" role="status" aria-live="polite">
          <Spinner className="size-7" />
          <p className="font-semibold">{t('check.conversation.running')}</p>
          {aiAvailable && useAi ? <p className="text-sm text-muted">{t('check.conversation.running_ai')}</p> : null}
        </Card>
      </div>
    );
  }

  if (step === 'who') {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t('check.conversation.title')} />
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">{t('check.conversation.who_title')}</h2>
          <p className="mt-1 text-ink-soft">{t('check.conversation.who_body')}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {senders.map((name) => (
              <Button key={name} variant="secondary" onClick={() => run(name)}>
                {name}
              </Button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => run(null)}>
              {t('check.conversation.who_skip')}
            </Button>
            <Button variant="ghost" onClick={() => setStep('input')}>
              {t('common.back')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const tabs = [
    { id: 'paste', label: t('check.conversation.tab_paste'), icon: Type },
    { id: 'file', label: t('check.conversation.tab_file'), icon: FileUp },
    { id: 'screenshots', label: t('check.conversation.tab_screenshots'), icon: Images },
  ];
  const happenedOptions = [
    { value: 'money', label: t('check.conversation.happened_money') },
    { value: 'images', label: t('check.conversation.happened_images') },
    { value: 'codes', label: t('check.conversation.happened_codes') },
    { value: 'meet', label: t('check.conversation.happened_meet') },
  ];
  const knownOptions = ['days', 'weeks', 'months', 'years'].map((v) => ({ value: v, label: t(`check.conversation.known_${v}`) }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('check.conversation.title')} description={t('check.conversation.description')} />

      <form onSubmit={submit} className="space-y-5">
        <Card className="p-5 sm:p-6">
          <Tabs value={tab} onChange={setTab} tabs={tabs} />

          {tab === 'paste' ? (
            <Field label={t('check.conversation.paste_label')} hint={t('check.conversation.paste_help')} htmlFor="conversation">
              {fileNote?.ok ? <Notice tone="success" className="mb-2">{t('check.conversation.file_loaded', { name: fileNote.name })}</Notice> : null}
              {readNote ? <Notice tone="info" className="mb-2">{t('check.conversation.screenshots_review')}</Notice> : null}
              <Textarea
                id="conversation"
                rows={12}
                value={text}
                maxLength={MAX_CHARS}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('check.conversation.paste_placeholder')}
                spellCheck={false}
              />
            </Field>
          ) : null}

          {tab === 'file' ? (
            <Field label={t('check.conversation.file_label')} hint={t('check.conversation.file_help')}>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-lavender-50/50 px-4 py-8 text-center hover:border-brand-300">
                <FileUp className="size-6 text-brand-600" aria-hidden />
                <span className="font-semibold">{t('check.image.choose')}</span>
                <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(e) => loadFile(e.target.files?.[0])} />
              </label>
              {fileNote && !fileNote.ok ? <Notice tone="danger" className="mt-2">{t('check.conversation.file_wrong')}</Notice> : null}
            </Field>
          ) : null}

          {tab === 'screenshots' ? (
            !signedIn ? (
              <Notice tone="info" action={<Link to="/sign-in?next=/check/conversation" className="font-semibold text-brand-700 underline">{t('nav.sign_in')}</Link>}>
                {t('check.conversation.screenshots_need_account')}
              </Notice>
            ) : !aiAvailable ? (
              <Notice tone="info">{t('check.conversation.screenshots_need_ai')}</Notice>
            ) : (
              <ScreenshotReader
                onRead={(content) => {
                  setText(content);
                  setReadNote(true);
                  setTab('paste');
                }}
              />
            )
          ) : null}

          <p className="mt-4 flex items-start gap-2 text-sm text-muted">
            <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('check.conversation.privacy_note')}
          </p>
        </Card>

        <Card>
          <button
            type="button"
            aria-expanded={contextOpen}
            onClick={() => setContextOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-3 p-5 text-left sm:px-6"
          >
            <span>
              <span className="block font-semibold">{t('check.conversation.context_title')}</span>
              <span className="block text-sm text-muted">{t('check.conversation.context_body')}</span>
            </span>
            <ChevronDown className={cx('size-5 shrink-0 text-muted transition-transform', contextOpen && 'rotate-180')} aria-hidden />
          </button>
          {contextOpen ? (
            <div className="space-y-5 border-t border-line p-5 sm:px-6">
              <Field label={t('check.conversation.known_label')}>
                <Chips options={knownOptions} value={known} onChange={setKnown} label={t('check.conversation.known_label')} />
              </Field>
              <Field label={t('check.conversation.happened_label')}>
                <Chips options={happenedOptions} value={happened} onChange={setHappened} multiple label={t('check.conversation.happened_label')} />
              </Field>
              {!isMinor ? <Checkbox label={t('check.conversation.under_18')} checked={under18} onChange={(e) => setUnder18(e.target.checked)} /> : null}
            </div>
          ) : null}
        </Card>

        <Card className="p-5 sm:px-6">
          {aiAvailable ? (
            <Switch checked={useAi} onChange={setUseAi} label={t('check.conversation.ai_toggle')} description={t('check.conversation.ai_toggle_body')} />
          ) : (
            <p className="text-sm text-muted">{t('check.conversation.ai_unavailable')}</p>
          )}
        </Card>

        {error ? <Notice tone="danger" role="alert">{error.code === 'too_short' ? error.message : errorMessage(t, error)}</Notice> : null}

        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={!text.trim()}>
          {t('check.conversation.submit')}
        </Button>
      </form>
    </div>
  );
}
