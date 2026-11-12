import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Field, Input, Loading, Notice } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { AuthLayout, authErrorMessage } from './AuthLayout';

// Reached from the email link. supabase-js exchanges the code in the URL for a short
// recovery session, after which the person can choose a new password.
export default function ResetPassword() {
  const t = useT();
  const { status, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) return setError(t('auth.password_short'));
    if (password !== confirm) return setError(t('auth.passwords_differ'));
    setBusy(true);
    try {
      await updatePassword(password);
      navigate('/home', { replace: true, state: { notice: t('auth.reset_done') } });
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading' || (status !== 'signed_in' && !waited)) {
    return (
      <AuthLayout title={t('auth.reset_title')}>
        <Loading />
      </AuthLayout>
    );
  }

  if (status !== 'signed_in') {
    return (
      <AuthLayout title={t('auth.reset_title')}>
        <Notice tone="warning" action={<Link to="/forgot-password" className="font-semibold text-brand-700 hover:underline">{t('auth.send_link')}</Link>}>
          {t('auth.reset_invalid')}
        </Notice>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.reset_title')} description={t('auth.reset_body')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
        <Field label={t('auth.new_password')} hint={t('auth.password_hint')} htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t('auth.confirm_password')} htmlFor="confirm">
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" loading={busy} disabled={!password || !confirm}>
          {t('auth.reset_save')}
        </Button>
      </form>
    </AuthLayout>
  );
}
