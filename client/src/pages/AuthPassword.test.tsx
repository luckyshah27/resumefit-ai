import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

const { loginUser, registerUser, login } = vi.hoisted(() => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  login: vi.fn(),
}));

vi.mock('../api/client', () => ({ loginUser, registerUser }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login, notice: null }) }));

describe('authentication password UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows the login password to be shown and hidden', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    const password = screen.getByLabelText('Password');
    expect(password.getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.getAttribute('type')).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password.getAttribute('type')).toBe('password');
  });

  it('keeps registration visibility controls independent and rejects mismatched passwords', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Aditi Sharma' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'aditi@example.com' } });
    const password = screen.getByLabelText('Password');
    const confirmation = screen.getByLabelText('Confirm password');
    fireEvent.change(password, { target: { value: 'StrongPass123!' } });
    fireEvent.change(confirmation, { target: { value: 'DifferentPass123!' } });

    const passwordGroup = within(password.parentElement!);
    const confirmationGroup = within(confirmation.parentElement!);
    fireEvent.click(passwordGroup.getByRole('button', { name: 'Show password' }));
    expect(password.getAttribute('type')).toBe('text');
    expect(confirmation.getAttribute('type')).toBe('password');
    fireEvent.click(confirmationGroup.getByRole('button', { name: 'Show password' }));
    expect(confirmation.getAttribute('type')).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert').textContent).toBe('New passwords do not match.');
    expect(registerUser).not.toHaveBeenCalled();
  });
});
