import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PasswordField, PasswordStrength } from './PasswordField';

describe('password controls', () => {
  it('toggles password visibility with an accessible button', () => {
    render(<PasswordField id="password" label="Password" autoComplete="new-password" value="Secret123!" onChange={() => undefined} />);
    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('type')).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input.getAttribute('type')).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input.getAttribute('type')).toBe('password');
  });

  it('renders strength labels using the defined password criteria', () => {
    const { rerender } = render(<PasswordStrength password="short" />);
    expect(screen.getByText('Weak')).toBeTruthy();

    rerender(<PasswordStrength password="Abcdefgh" />);
    expect(screen.getByText('Fair')).toBeTruthy();

    rerender(<PasswordStrength password="Abcdef12" />);
    expect(screen.getByText('Strong')).toBeTruthy();

    rerender(<PasswordStrength password="StrongPass123!" />);
    expect(screen.getByText('Very Strong')).toBeTruthy();
  });
});
