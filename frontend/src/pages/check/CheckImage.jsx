import {
  Calendar,
  Download,
  FileBadge,
  FolderLock,
  ImageUp,
  MapPin,
  PenLine,
  RotateCcw,
  ScanEye,
  Smartphone,
  Sparkles,
  Tag,
  User,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Card, Checkbox, Notice, PageHeader, Spinner, cx, errorMessage } from '../../components/ui';
import { Dialog, Field, Input } from '../../components/ui';
import { api, saveBlob } from '../../lib/api';
import { useConfig, useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

const HIDDEN_ICONS = {
  location_embedded: MapPin,
  device_info: Smartphone,
  capture_time: Calendar,
  author_name: User,
  edited_with_app: PenLine,
  ai_label_found: Tag,
  content_credentials: FileBadge,
  no_hidden_data: ScanEye,
};
const RISK_TONE = { low: 'safe', medium: 'caution', high: 'danger' };

function SaveImageDialog({ open, onClose, file }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(file?.name ?? '');
  const [state, setState] = useState({ busy: false, error: null, done: false });
  const save = async () => {
    setState({ busy: true, error: null, done: false });
    const form = new FormData();
    form.set('kind', 'image');
    form.set('title', title || 'Photo');
    form.append('files', file);
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
      title={t('check.image.save')}
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
          <Link className="font-semibold underline" to="/vault">
            {t('nav.vault')}
          </Link>
        </Notice>
      ) : (
        <div className="space-y-3">
          <Field label={t('check.result.save_name')} htmlFor="img-name">
            <Input id="img-name" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
        </div>
      )}
    </Dialog>
  );
}

export default function CheckImage() {
  const { t } = useI18n();
  const { features } = useConfig();
  useDocumentTitle(t('check.image.title'));
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState(null);
  const [state, setState] = useState({ busy: false, error: null });
  const [cleaning, setCleaning] = useState({ busy: false, done: false, error: null });
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const choose = (selected) => {
    if (!selected) return;
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setResult(null);
    setState({ busy: false, error: null });
    setCleaning({ busy: false, done: false, error: null });
  };

  const submit = async () => {
    setState({ busy: true, error: null });
    const form = new FormData();
    form.append('file', file);
    form.set('ai_consent', consent && features.ai ? 'true' : 'false');
    try {
      setResult(await api('/api/check/image', { method: 'POST', form }));
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  const clean = async () => {
    setCleaning({ busy: true, done: false, error: null });
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await api('/api/check/image/clean', { method: 'POST', form, blob: true });
      const blob = await response.blob();
      saveBlob(blob, blob.type === 'image/png' ? 'saheli-clean.png' : 'saheli-clean.jpg');
      setCleaning({ busy: false, done: true, error: null });
    } catch (error) {
      setCleaning({ busy: false, done: false, error });
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setConsent(false);
  };

  const imageError = state.error && t(`check.image.errors.${state.error.code}`) !== `check.image.errors.${state.error.code}`
    ? t(`check.image.errors.${state.error.code}`)
    : state.error
      ? errorMessage(t, state.error)
      : null;

  const review = result?.ai?.review;
  const intimate = review?.sensitive_content === 'intimate';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('check.image.title')} description={t('check.image.description')} />

      <Notice
        tone="warning"
        title={t('check.image.dont_upload_title')}
        className="mb-5"
        action={
          <Link to="/help/private-images" className="font-semibold text-caution-700 underline">
            {t('check.image.private_help_link')}
          </Link>
        }
      >
        {t('check.image.dont_upload_body')}
      </Notice>

      <div className="grid gap-5 md:grid-cols-[minmax(0,15rem)_1fr]">
        <div>
          {preview ? (
            <img src={preview} alt="" className="w-full rounded-2xl border border-line object-contain" />
          ) : (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                choose(e.dataTransfer.files?.[0]);
              }}
              className={cx(
                'flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 text-center transition-colors',
                dragging ? 'border-brand-500 bg-brand-50' : 'border-line-strong bg-surface hover:border-brand-300',
              )}
            >
              <ImageUp className="size-7 text-brand-600" aria-hidden />
              <span className="font-semibold">{t('check.image.choose')}</span>
              <span className="text-sm text-muted">{t('check.image.drop')}</span>
              <span className="text-xs text-muted">{t('check.image.formats')}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
            </label>
          )}
          {file ? <p className="mt-2 text-xs text-muted">{t('check.image.not_saved')}</p> : null}
        </div>

        <div className="space-y-4">
          {!result ? (
            <Card className="space-y-4 p-5">
              {features.ai ? (
                <Checkbox
                  label={t('check.image.ai_consent')}
                  description={t('check.image.ai_consent_body')}
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
              ) : (
                <p className="text-sm text-muted">{t('check.image.ai_unavailable')}</p>
              )}
              {imageError ? <Notice tone="danger">{imageError}</Notice> : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={submit} disabled={!file} loading={state.busy} icon={ScanEye}>
                  {state.busy ? t('check.image.running') : t('check.image.submit')}
                </Button>
                {file ? (
                  <Button variant="ghost" onClick={reset}>
                    {t('common.remove')}
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : (
            <div className="space-y-5" aria-live="polite">
              <Card className="p-5">
                <Badge tone={RISK_TONE[result.sharing_risk]} className="text-sm">
                  {t('check.image.risk_title', { level: t(`levels.${result.sharing_risk}`) })}
                </Badge>
                <p className="mt-3 text-ink-soft">{t(`check.image.risk_body.${result.sharing_risk}`)}</p>
                {review?.summary ? (
                  <div className="mt-4 rounded-xl bg-lavender-50 p-4">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                      <Sparkles className="size-4" aria-hidden />
                      {t('check.ai_label')}
                    </p>
                    <p className="mt-1 text-ink-soft">{review.summary}</p>
                  </div>
                ) : null}
              </Card>

              {intimate ? (
                <Notice
                  tone="info"
                  action={
                    <Link to="/help/private-images" className="font-semibold underline">
                      {t('check.image.private_help_link')}
                    </Link>
                  }
                >
                  {t('check.image.sensitive_intimate')}
                </Notice>
              ) : null}

              <section aria-labelledby="hidden">
                <h2 id="hidden" className="mb-2 font-semibold">
                  {t('check.image.hidden_title')}
                </h2>
                <ul className="space-y-2">
                  {result.metadata.map((m) => {
                    const Icon = HIDDEN_ICONS[m.id] ?? ScanEye;
                    return (
                      <li key={m.id} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
                        <Icon className={cx('mt-0.5 size-5 shrink-0', m.severity >= 3 ? 'text-danger-600' : m.severity === 2 ? 'text-caution-600' : 'text-muted')} aria-hidden />
                        <div>
                          <p className="font-semibold">{t(`check.image.hidden.${m.id}.title`)}</p>
                          <p className="text-sm text-ink-soft">{t(`check.image.hidden.${m.id}.body`, m.detail)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {review ? (
                <>
                  <section aria-labelledby="visible">
                    <h2 id="visible" className="mb-2 font-semibold">
                      {t('check.image.visible_title')}
                    </h2>
                    {review.privacy_findings.length ? (
                      <ul className="space-y-2">
                        {review.privacy_findings.map((f, i) => (
                          <li key={`${f.type}-${i}`} className="rounded-xl border border-line bg-surface p-3">
                            <p className="font-semibold">{t(`check.image.visible.${f.type}`)}</p>
                            {f.detail ? <p className="text-sm text-ink-soft">{f.detail}</p> : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-ink-soft">{t('check.image.visible_none')}</p>
                    )}
                  </section>
                  <section aria-labelledby="authenticity" className="grid gap-3 sm:grid-cols-2">
                    <h2 id="authenticity" className="sr-only">
                      {t('check.image.manipulation_title')}
                    </h2>
                    <Card className="p-4">
                      <p className="font-semibold">{t('check.image.manipulation_title')}</p>
                      <p className="mt-1 text-sm text-ink">{t(`check.image.manipulation.${review.manipulation.assessment}`)}</p>
                      {review.manipulation.detail ? <p className="mt-1 text-sm text-ink-soft">{review.manipulation.detail}</p> : null}
                    </Card>
                    <Card className="p-4">
                      <p className="font-semibold">{t('check.image.ai_generated_title')}</p>
                      <p className="mt-1 text-sm text-ink">{t(`check.image.ai_generated.${review.ai_generated.assessment}`)}</p>
                      {review.ai_generated.detail ? <p className="mt-1 text-sm text-ink-soft">{review.ai_generated.detail}</p> : null}
                    </Card>
                  </section>
                  <p className="text-sm text-muted">{t('check.image.ai_uncertain')}</p>
                </>
              ) : (
                <p className="text-sm text-muted">{t(`check.image.ai_status.${result.ai.status}`)}</p>
              )}

              {cleaning.done ? <Notice tone="success">{t('check.image.clean_done')}</Notice> : null}
              {cleaning.error ? <Notice tone="danger">{errorMessage(t, cleaning.error)}</Notice> : null}

              <div className="flex flex-wrap gap-2">
                {result.can_clean ? (
                  <Button icon={Download} onClick={clean} loading={cleaning.busy}>
                    {t('check.image.clean')}
                  </Button>
                ) : null}
                <Button variant="secondary" icon={FolderLock} onClick={() => setSaving(true)}>
                  {t('check.image.save')}
                </Button>
                <Button variant="ghost" icon={RotateCcw} onClick={reset}>
                  {t('check.image.new_check')}
                </Button>
              </div>
            </div>
          )}
          {state.busy ? (
            <div className="flex items-center gap-2 text-sm text-muted" role="status">
              <Spinner className="size-4" />
              {t('check.image.running')}
            </div>
          ) : null}
        </div>
      </div>
      {saving ? <SaveImageDialog open={saving} onClose={() => setSaving(false)} file={file} /> : null}
    </div>
  );
}
