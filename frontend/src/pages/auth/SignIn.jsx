import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Field, Input, Notice } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { AuthLayout, authErrorMessage } from './AuthLayout';

export default function SignIn() {
  const t = useT();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      const next = params.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/home', { replace: true });
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t('auth.sign_in_title')}
      description={t('auth.sign_in_body')}
      footer={
        <>
          {t('auth.no_account')}{' '}
          <Link to={`/sign-up${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`} className="font-semibold text-brand-700 hover:underline">
            {t('auth.sign_up')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
        <Field label={t('auth.email')} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
            {t('auth.forgot')}
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={busy} disabled={!email || !password}>
          {t('auth.sign_in')}
        </Button>
      </form>
    </AuthLayout>
  );
}
