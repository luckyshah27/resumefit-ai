import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { changePassword, updateProfile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Card, CardHeader, Field, PageHeader } from '../components/ui';
import { PasswordField, PasswordStrength } from '../components/PasswordField';
import type { CandidateProfile } from '../types';

export const ProfilePage = () => {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const [name, setName] = useState(user?.name ?? '');
  const [targetRole, setTargetRole] = useState(user?.targetRole ?? '');
  const [profile, setProfile] = useState<CandidateProfile>(user?.profile ?? {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const set = (key: keyof CandidateProfile) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setProfile((current) => ({ ...current, [key]: key === 'graduationYear' ? (event.target.value ? Number(event.target.value) : undefined) : event.target.value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const cleaned = Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== '' && value !== undefined && !(typeof value === 'number' && Number.isNaN(value))));
      const { user: updated } = await updateProfile({ name, targetRole, profile: cleaned });
      updateUser(updated);
      if (welcome) navigate('/analyze');
      else setMessage({ tone: 'good', text: 'Profile saved.' });
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save profile' });
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage(null);
    if (passwordForm.newPassword.length < 8) {
      setPasswordMessage({ tone: 'bad', text: 'Password must be at least 8 characters.' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ tone: 'bad', text: 'New passwords do not match.' });
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      await logout();
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (e) {
      setPasswordMessage({ tone: 'bad', text: e instanceof Error ? e.message : 'Unable to change password. Please try again.' });
    } finally {
      setChangingPassword(false);
    }
  };

  const text = (key: keyof CandidateProfile, label: string, placeholder?: string, type = 'text') => (
    <Field label={label} htmlFor={key}>
      <input id={key} type={type} className="input" placeholder={placeholder} value={(profile[key] as string | number | undefined) ?? ''} onChange={set(key)} />
    </Field>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={welcome ? 'Step 1 of 2' : 'Account'}
        title={welcome ? 'Set up your candidate profile' : 'Candidate profile'}
        description="Used to personalise analysis and interview preparation. Scores are always computed from your resume and the job description — never from this profile."
      />
      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader title="Basics" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name">
              <input id="name" className="input" required value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Target role" htmlFor="targetRole">
              <input id="targetRole" className="input" placeholder="e.g. Backend Developer" value={targetRole} onChange={(event) => setTargetRole(event.target.value)} />
            </Field>
            {text('phone', 'Phone', '+91 …')}
            {text('location', 'Location', 'City, State')}
          </div>
        </Card>
        <Card>
          <CardHeader title="Education" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {text('college', 'College / university')}
            {text('degree', 'Degree', 'B.Tech, BCA, …')}
            {text('branch', 'Branch / major', 'Computer Science')}
            {text('graduationYear', 'Graduation year', '2026', 'number')}
            {text('cgpa', 'CGPA / percentage', '8.4 / 10')}
          </div>
        </Card>
        <Card>
          <CardHeader title="Links" description="Add only profiles you actively maintain." />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            {text('linkedin', 'LinkedIn', 'linkedin.com/in/…')}
            {text('github', 'GitHub', 'github.com/…')}
            {text('portfolio', 'Portfolio', 'yourname.dev')}
          </div>
          <div className="px-5 pb-5">
            <Field label="Short bio" htmlFor="bio" hint="Up to 600 characters">
              <textarea id="bio" rows={3} maxLength={600} className="input resize-y" value={profile.bio ?? ''} onChange={set('bio')} />
            </Field>
          </div>
        </Card>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="flex justify-end gap-2">
          {welcome && (
            <Button variant="ghost" onClick={() => navigate('/analyze')}>
              Skip for now
            </Button>
          )}
          <Button type="submit" variant="primary" loading={saving}>
            {welcome ? 'Save and analyze a resume' : 'Save profile'}
          </Button>
        </div>
      </form>
      {!welcome && (
        <Card className="mt-8">
          <CardHeader title="Security" description="Change your password. You'll need to sign in again afterward." />
          <form onSubmit={savePassword} className="space-y-4 p-5">
            <PasswordField
              id="currentPassword"
              label="Current password"
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={(currentPassword) => setPasswordForm((current) => ({ ...current, currentPassword }))}
            />
            <div>
              <PasswordField
                id="newPassword"
                label="New password"
                autoComplete="new-password"
                hint="Password must be at least 8 characters."
                value={passwordForm.newPassword}
                onChange={(newPassword) => setPasswordForm((current) => ({ ...current, newPassword }))}
              />
              <PasswordStrength password={passwordForm.newPassword} />
            </div>
            <PasswordField
              id="confirmNewPassword"
              label="Confirm new password"
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(confirmPassword) => setPasswordForm((current) => ({ ...current, confirmPassword }))}
            />
            {passwordMessage && <Alert tone={passwordMessage.tone}>{passwordMessage.text}</Alert>}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={changingPassword}>Change password</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
};
