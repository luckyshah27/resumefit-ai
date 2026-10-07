import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerUser } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Field } from '../components/ui';
import { PasswordField, PasswordStrength } from '../components/PasswordField';
import { AuthShell } from './LoginPage';

export const RegisterPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', targetRole: '' });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await registerUser({ ...form, targetRole: form.targetRole || undefined });
      login(response.user, response.token);
      navigate('/profile?welcome=1');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Score your resume against real job descriptions and see exactly what to fix."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-ink underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name" htmlFor="name">
          <input id="name" autoComplete="name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input" />
        </Field>
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="input" />
        </Field>
        <Field label="Target role" htmlFor="role" hint="Optional — e.g. Frontend Developer, Data Analyst">
          <input id="role" value={form.targetRole} onChange={(event) => setForm({ ...form, targetRole: event.target.value })} className="input" />
        </Field>
        <div>
          <PasswordField id="password" label="Password" autoComplete="new-password" hint="Password must be at least 8 characters." value={form.password} onChange={(password) => setForm({ ...form, password })} />
          <PasswordStrength password={form.password} />
        </div>
        <PasswordField id="confirmPassword" label="Confirm password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} />
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
};
