import { expect, expectNoHorizontalOverflow, test, uniqueEmail } from './fixtures';

test('registration visibility, password confirmation, and password change security', async ({ page }) => {
  const email = uniqueEmail();
  const newPassword = 'VerySecurePassword123!';
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Aditi Sharma');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Target role').fill('Backend Developer');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await expect(page.getByText('Fair', { exact: true })).toBeVisible();

  const password = page.getByLabel('Password', { exact: true });
  const passwordToggle = password.locator('..').getByRole('button', { name: 'Show password' });
  await passwordToggle.click();
  await expect(password).toHaveAttribute('type', 'text');
  await password.locator('..').getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');

  const confirmation = page.getByLabel('Confirm password', { exact: true });
  await confirmation.fill('different123');
  await confirmation.locator('..').getByRole('button', { name: 'Show password' }).click();
  await expect(confirmation).toHaveAttribute('type', 'text');
  await confirmation.locator('..').getByRole('button', { name: 'Hide password' }).click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('New passwords do not match.');
  await confirmation.fill('password123');
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your candidate profile' })).toBeVisible();
  await page.goto('/profile');
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page);
  }

  await page.getByLabel('Current password', { exact: true }).fill('wrong-password');
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  const newPasswordField = page.getByLabel('New password', { exact: true });
  const newPasswordConfirmField = page.getByLabel('Confirm new password', { exact: true });
  await newPasswordField.locator('..').getByRole('button', { name: 'Show password' }).click();
  await expect(newPasswordField).toHaveAttribute('type', 'text');
  await newPasswordField.locator('..').getByRole('button', { name: 'Hide password' }).click();
  await newPasswordConfirmField.fill(`${newPassword}different`);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('alert')).toContainText('New passwords do not match.');
  await newPasswordConfirmField.fill(newPassword);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('alert')).toContainText('Current password is incorrect.');

  const current = page.getByLabel('Current password', { exact: true });
  await current.locator('..').getByRole('button', { name: 'Show password' }).click();
  await expect(current).toHaveAttribute('type', 'text');
  await current.locator('..').getByRole('button', { name: 'Hide password' }).click();
  await current.fill('password123');
  await expect(page.getByText('Very Strong')).toBeVisible();
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('Password changed successfully.');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expectNoHorizontalOverflow(page);
});
