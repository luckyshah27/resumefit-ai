import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginUser } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Field } from '../components/ui';
import { PasswordField } from '../components/PasswordField';

export const AuthShell = ({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) => (
  <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-5xl items-center justify-center px-4 py-10 sm:px-6">
    <div className="w-full max-w-md rounded-[28px] border border-brand-100 bg-white p-6 shadow-[0_24px_60px_rgba(45,62,120,0.12)] sm:p-8">
      <div className="mb-6 text-center">
        <img
          src="/logo.png"
          alt="RESUMEFIT"
          className="mx-auto block h-auto w-[168px] max-w-full object-contain"
        />
      </div>
      <h1 className="text-3xl font-semibold tracking-[-0.05em] text-ink">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-3">{subtitle}</p>
      <div className="mt-8">{children}</div>
      <p className="mt-6 text-center text-[13px] text-ink-3">{footer}</p>
    </div>
  </div>
);

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, notice } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await loginUser(form);
      login(response.user, response.token);
      navigate((location.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Continue tailoring your resume to the roles you want."
      footer={
        <>
          New to RESUMEFIT?{' '}
          <Link to="/register" className="font-medium text-ink underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {notice && <Alert tone="warn">{notice}</Alert>}
        {(location.state as { passwordChanged?: boolean } | null)?.passwordChanged && (
          <Alert tone="good">Password changed successfully. Sign in with your new password.</Alert>
        )}
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="input" />
        </Field>
        <PasswordField id="password" label="Password" autoComplete="current-password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
};
