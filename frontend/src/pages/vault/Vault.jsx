import { FileAudio, FileImage, FileText, FolderLock, Link2, MessageSquareText, NotebookPen, Plus, ShieldCheck, Upload, Video } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Dialog, EmptyState, ErrorState, Field, Input, Loading, Notice, PageHeader, Select, Textarea, cx, errorMessage } from '../../components/ui';
import { api } from '../../lib/api';
import { formatBytes, formatDate } from '../../lib/format';
import { useApi, useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

export const KIND_ICONS = {
  screenshot: FileImage,
  image: FileImage,
  conversation: MessageSquareText,
  link: Link2,
  note: NotebookPen,
  recording: FileAudio,
  document: FileText,
  video: Video,
};
const KINDS = ['screenshot', 'image', 'conversation', 'link', 'note', 'recording', 'document'];
const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024;

function AddEvidence({ open, onClose, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ kind: 'screenshot', title: '', occurred_at: '', platform: '', content: '', notes: '' });
  const [files, setFiles] = useState([]);
  const [state, setState] = useState({ busy: false, error: null });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const tooBig = files.find((f) => f.size > MAX_BYTES);
  const empty = !files.length && !form.content.trim() && !form.notes.trim();

  const submit = async (event) => {
    event.preventDefault();
    if (empty) {
      setState({ busy: false, error: { message: t('vault.form.need_something') } });
      return;
    }
    setState({ busy: true, error: null });
    const body = new FormData();
    body.set('kind', form.kind);
    body.set('title', form.title.trim());
    if (form.notes.trim()) body.set('notes', form.notes);
    if (form.content.trim()) body.set('content', form.content);
    if (form.platform.trim()) body.set('platform', form.platform.trim());
    if (form.occurred_at) body.set('occurred_at', new Date(form.occurred_at).toISOString());
    files.forEach((file) => body.append('files', file));
    try {
      const item = await api('/api/evidence', { method: 'POST', form: body });
      onSaved(item);
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={t('vault.form.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="add-evidence" loading={state.busy} disabled={!form.title.trim() || Boolean(tooBig)} icon={FolderLock}>
            {t('vault.form.submit')}
          </Button>
        </>
      }
    >
      <form id="add-evidence" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('vault.form.kind')} htmlFor="ev-kind">
            <Select id="ev-kind" value={form.kind} onChange={set('kind')}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`vault.kinds.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('vault.form.when')} htmlFor="ev-when" optional>
            <Input id="ev-when" type="datetime-local" value={form.occurred_at} onChange={set('occurred_at')} />
          </Field>
        </div>
        <Field label={t('vault.form.name')} htmlFor="ev-title">
          <Input id="ev-title" required maxLength={200} placeholder={t('vault.form.name_placeholder')} value={form.title} onChange={set('title')} />
        </Field>
        <Field label={t('vault.form.platform')} htmlFor="ev-platform" optional>
          <Input id="ev-platform" maxLength={40} placeholder={t('vault.form.platform_placeholder')} value={form.platform} onChange={set('platform')} />
        </Field>
        <Field label={t('vault.form.files')} hint={t('vault.form.files_help')} error={tooBig ? t('errors.generic') : null}>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-4 py-5 text-sm font-semibold text-ink-soft hover:border-brand-300">
            <Upload className="size-5 text-brand-600" aria-hidden />
            {t('check.image.choose')}
            <input
              type="file"
              multiple
              className="sr-only"
              accept="image/*,application/pdf,text/plain,audio/*,video/*"
              onChange={(e) => setFiles((current) => [...current, ...Array.from(e.target.files ?? [])].slice(0, MAX_FILES))}
            />
          </label>
          {files.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {files.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-lavender-50 px-3 py-1.5">
                  <span className={cx('truncate', file.size > MAX_BYTES && 'text-danger-700')}>
                    {file.name} · {formatBytes(file.size)}
                  </span>
                  <button type="button" className="text-muted hover:text-ink" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    {t('common.remove')}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Field>
        <Field label={t('vault.form.content')} htmlFor="ev-content" optional>
          <Textarea id="ev-content" rows={4} maxLength={100000} placeholder={t('vault.form.content_placeholder')} value={form.content} onChange={set('content')} />
        </Field>
        <Field label={t('vault.form.notes')} htmlFor="ev-notes" optional>
          <Textarea id="ev-notes" rows={3} maxLength={100000} placeholder={t('vault.form.notes_placeholder')} value={form.notes} onChange={set('notes')} />
        </Field>
        {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
      </form>
    </Dialog>
  );
}

export default function Vault() {
  const { t, language } = useI18n();
  useDocumentTitle(t('vault.title'));
  const { data, error, loading, reload } = useApi('/api/evidence');
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('all');
  const [saved, setSaved] = useState(false);

  const retention = data?.retention_days ?? 365;
  const items = (data?.items ?? []).filter((i) => filter === 'all' || i.kind === filter);
  const kindsPresent = [...new Set((data?.items ?? []).map((i) => i.kind))];

  return (
    <div>
      <PageHeader
        title={t('vault.title')}
        description={t('vault.description')}
        actions={
          <Button icon={Plus} onClick={() => setAdding(true)}>
            {t('vault.add')}
          </Button>
        }
      />
      <Notice tone="neutral" icon={ShieldCheck} className="mb-6">
        {t('vault.storage_note', { period: t(`vault.period.${retention ?? 0}`) })}{' '}
        <Link to="/settings" className="font-semibold text-brand-700 hover:underline">
          {t('vault.change_period')}
        </Link>
      </Notice>
      {saved ? <Notice tone="success" className="mb-4">{t('check.result.saved')}</Notice> : null}

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data.items.length ? (
        <EmptyState
          icon={FolderLock}
          title={t('vault.empty_title')}
          action={
            <Button icon={Plus} onClick={() => setAdding(true)}>
              {t('vault.add')}
            </Button>
          }
        >
          {t('vault.empty_body')}
        </EmptyState>
      ) : (
        <>
          {kindsPresent.length > 1 ? (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('vault.form.kind')}>
              {['all', ...kindsPresent].map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={filter === k}
                  onClick={() => setFilter(k)}
                  className={cx(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium',
                    filter === k ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-line-strong bg-surface text-ink-soft',
                  )}
                >
                  {k === 'all' ? t('vault.filter_all') : t(`vault.kinds.${k}`)}
                </button>
              ))}
            </div>
          ) : null}
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => {
              const Icon = KIND_ICONS[item.kind] ?? FileText;
              return (
                <li key={item.id}>
                  <Link to={`/vault/${item.id}`} className="card flex h-full gap-3 p-4 transition-shadow hover:shadow-[var(--shadow-lift)]">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {t(`vault.kinds.${item.kind}`)}
                        {item.platform ? ` · ${item.platform}` : ''}
                        {item.file_count ? ` · ${t('vault.files', { count: item.file_count })}` : ''}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {item.occurred_at ? t('vault.happened_on', { date: formatDate(item.occurred_at, language) }) : t('vault.saved_on', { date: formatDate(item.saved_at, language) })}
                        {item.expires_at ? ` · ${t('vault.expires_on', { date: formatDate(item.expires_at, language) })}` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {adding ? (
        <AddEvidence
          open={adding}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setSaved(true);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
