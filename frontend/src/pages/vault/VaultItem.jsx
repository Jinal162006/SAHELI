import { ArrowLeft, Download, FileText, Play, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge, Button, Card, ConfirmDialog, ErrorState, Loading, Notice, PageHeader, errorMessage } from '../../components/ui';
import { api, apiBlob, saveBlob } from '../../lib/api';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useApi, useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf',
  'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'text/plain': 'txt',
};

/** Fetches the decrypted file with the session token and shows it from a local blob URL. */
function FilePreview({ itemId, file }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const isImage = file.mime_type.startsWith('image/');

  useEffect(() => {
    if (!isImage) return undefined;
    let objectUrl;
    apiBlob(`/api/evidence/${itemId}/files/${file.id}`)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setFailed(true));
    return () => objectUrl && URL.revokeObjectURL(objectUrl);
  }, [itemId, file.id, isImage]);

  if (!isImage) return null;
  if (failed) return <p className="text-sm text-muted">{t('vault.detail.preview_failed')}</p>;
  if (!url) return <div className="h-40 animate-pulse rounded-xl bg-lavender-100" />;
  return <img src={url} alt="" className="max-h-[28rem] w-auto rounded-xl border border-line" />;
}

function RecordingPlayer({ item }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(null);
  const [state, setState] = useState({ busy: false, error: null });
  const mime = item.files[0]?.mime_type ?? 'audio/webm';
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  const load = async () => {
    setState({ busy: true, error: null });
    try {
      const blob = await apiBlob(`/api/evidence/${item.id}/recording`);
      setUrl(URL.createObjectURL(blob));
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  return (
    <Card className="space-y-3 p-5">
      <p className="font-semibold">{t('vault.detail.recording')}</p>
      {url ? (
        mime.startsWith('video/') ? (
          <video src={url} controls className="w-full rounded-xl" />
        ) : (
          <audio src={url} controls className="w-full" />
        )
      ) : (
        <Button variant="secondary" icon={Play} onClick={load} loading={state.busy}>
          {state.busy ? t('vault.detail.opening') : t('vault.detail.play')}
        </Button>
      )}
      {url ? (
        <Button
          variant="ghost"
          size="sm"
          icon={Download}
          onClick={async () => saveBlob(await (await fetch(url)).blob(), `saheli-recording.${EXT[mime] ?? 'webm'}`)}
        >
          {t('common.download')}
        </Button>
      ) : null}
      {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
    </Card>
  );
}

export default function VaultItem() {
  const { id } = useParams();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { data: item, error, loading, reload } = useApi(`/api/evidence/${id}`);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  useDocumentTitle(item?.title ?? t('vault.title'));

  const download = async (file) => {
    const blob = await apiBlob(`/api/evidence/${id}/files/${file.id}`);
    saveBlob(blob, file.name || `saheli-evidence-${file.part + 1}.${EXT[file.mime_type] ?? 'bin'}`);
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/api/evidence/${id}`, { method: 'DELETE' });
      navigate('/vault', { replace: true });
    } catch (err) {
      setDeleteError(err);
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/vault" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t('vault.title')}
      </Link>
      <PageHeader
        title={item.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{t(`vault.kinds.${item.kind}`)}</Badge>
            {item.platform ? <Badge>{item.platform}</Badge> : null}
            <span className="text-sm text-muted">{t('vault.saved_on', { date: formatDateTime(item.saved_at, language) })}</span>
          </span>
        }
      />
      {item.occurred_at ? <p className="-mt-4 text-sm text-ink-soft">{t('vault.happened_on', { date: formatDateTime(item.occurred_at, language) })}</p> : null}
      {deleteError ? <Notice tone="danger">{errorMessage(t, deleteError)}</Notice> : null}

      {item.kind === 'recording' && item.files.length ? <RecordingPlayer item={item} /> : null}

      {item.notes ? (
        <Card className="p-5">
          <p className="font-semibold">{t('vault.detail.notes')}</p>
          <p className="mt-2 whitespace-pre-wrap text-ink-soft">{item.notes}</p>
        </Card>
      ) : null}

      {item.content ? (
        <Card className="p-5">
          <p className="font-semibold">{t('vault.detail.content')}</p>
          <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-lavender-50 p-3 font-sans text-sm text-ink">{item.content}</pre>
        </Card>
      ) : null}

      {item.files.length && item.kind !== 'recording' ? (
        <section className="space-y-3">
          <h2 className="font-semibold">{t('vault.detail.files')}</h2>
          {item.files.map((file) => (
            <Card key={file.id} className="space-y-3 p-4">
              <FilePreview itemId={item.id} file={file} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="truncate">{file.name || file.mime_type}</span>
                  <span className="text-muted">· {formatBytes(file.size_bytes)}</span>
                </span>
                <Button variant="secondary" size="sm" icon={Download} onClick={() => download(file)}>
                  {t('common.download')}
                </Button>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-ink-soft">{t('vault.detail.fingerprint')}</summary>
                <p className="mt-1 break-all font-mono text-xs text-ink">{file.sha256}</p>
                <p className="mt-1 text-muted">{t('vault.detail.fingerprint_help')}</p>
              </details>
            </Card>
          ))}
        </section>
      ) : null}

      <div className="border-t border-line pt-5">
        <Button variant="danger-soft" icon={Trash2} onClick={() => setConfirming(true)}>
          {t('vault.detail.delete')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
        loading={deleting}
        title={t('vault.detail.delete')}
        confirmLabel={t('common.delete')}
      >
        {t('vault.detail.delete_confirm')}
      </ConfirmDialog>
    </div>
  );
}
