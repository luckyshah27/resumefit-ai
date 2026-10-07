import { test as base, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../samples');

/** Every test fails on any browser console error or uncaught page error. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));
    await use(errors);
    expect(errors, 'browser console errors').toEqual([]);
  },
});

export { expect };

export const expectNoHorizontalOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
};

/** Fails on serious/critical WCAG 2 A/AA violations. */
export const expectAccessible = async (page: Page, exclude: string[] = []) => {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const serious = violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
};

export const uniqueEmail = () => `student+${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;

export const register = async (page: Page, email = uniqueEmail()) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Aditi Sharma');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Target role').fill('Backend Developer');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your candidate profile' })).toBeVisible();
  return email;
};

/** Uploads the sample PDF against the given JD and waits for the results page. */
export const analyzeSample = async (page: Page, jobDescription?: string) => {
  await page.goto('/analyze');
  if (jobDescription) await page.getByLabel('Job description').fill(jobDescription);
  else await page.getByRole('button', { name: 'Use example' }).click();
  await page.locator('input[type=file]').setInputFiles(path.join(SAMPLES, 'sample-resume.pdf'));
  await expect(page.getByText('sample-resume.pdf')).toBeVisible();
  await page.getByRole('button', { name: 'Analyze resume' }).click();
  await page.waitForURL(/\/results\/[a-f0-9]{24}$/);
  await expect(page.locator('#score-heading')).toBeVisible();
};
