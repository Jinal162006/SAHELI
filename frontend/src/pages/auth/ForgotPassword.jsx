import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Field, Input, Notice } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { AuthLayout, authErrorMessage } from './AuthLayout';

export default function ForgotPassword() {
  const t = useT();
  const { sendReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await sendReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={sent ? t('auth.link_sent_title') : t('auth.forgot_title')}
      description={sent ? null : t('auth.forgot_body')}
      footer={
        <Link to="/sign-in" className="font-semibold text-brand-700 hover:underline">
          {t('auth.sign_in')}
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            <MailCheck className="size-7" aria-hidden />
          </span>
          <p className="text-ink-soft">{t('auth.link_sent_body')}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
          <Field label={t('auth.email')} htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={busy} disabled={!email.includes('@')}>
            {t('auth.send_link')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
