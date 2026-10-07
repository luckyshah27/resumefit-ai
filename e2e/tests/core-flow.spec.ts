import fs from 'node:fs';
import path from 'node:path';
import { SAMPLES, analyzeSample, expect, expectAccessible, expectNoHorizontalOverflow, register, test } from './fixtures';

/**
 * The complete student journey on the production build:
 * register → login → profile → JD + PDF → analysis → gaps → fix → new version → re-score →
 * interview prep → application → status change → compare versions → exports → analytics.
 */
test('complete resume optimisation journey', async ({ page, consoleErrors }) => {
  // Register, sign out, sign back in.
  const email = await register(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

  // Candidate profile.
  await page.goto('/profile');
  await page.getByLabel('College / university').fill('RV College of Engineering');
  await page.getByLabel('Graduation year').fill('2026');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();

  // JD + real PDF upload → deterministic analysis (verified example JD).
  const fullStackJd = fs.readFileSync(path.join(SAMPLES, 'sample-job-description-fullstack.txt'), 'utf8');
  await analyzeSample(page, fullStackJd);
  const hero = page.locator('section[aria-labelledby="score-heading"]');
  await expect(hero).toContainText('69');
  await expect(page.getByText('ATS Readiness').first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'ATS Readiness 99 out of 100' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Resume Quality 84 out of 100' })).toBeVisible();
  const firstUrl = page.url();

  // Why this score: categories sum to the score.
  await expect(page.locator('#why')).toContainText('= 68.5');

  // Requirement gaps.
  await page.getByRole('tab', { name: /Missing/ }).click();
  await expect(page.locator('#requirements tbody')).toContainText('Go');
  await page.getByRole('tab', { name: /Weak evidence/ }).click();
  await expect(page.locator('#requirements tbody')).toContainText('PostgreSQL');
  await expect(page.locator('#costing')).toContainText('Mandatory skill missing');
  await expectAccessible(page);

  // Fix my resume: ready fixes + one real evidence bullet (confirmed) → new version → re-score.
  await page.getByRole('button', { name: /Select all ready/ }).click();
  const pgCard = page.locator('#fix li', { hasText: 'Show where you used PostgreSQL' });
  await pgCard.getByRole('textbox').fill('- Designed the PostgreSQL schema for orders and wrote the migrations');
  await pgCard.getByLabel(/I confirm this text is true/).check();
  await page.getByLabel('Version label', { exact: true }).fill('Targeted for Acme');
  await page.getByRole('button', { name: 'Apply & re-score' }).click();
  await page.waitForURL((url) => url.href !== firstUrl && /\/results\//.test(url.href));
  const comparison = page.locator('#comparison');
  await expect(comparison).toContainText('Version 1 → Version 2');
  await expect(comparison).toContainText('68.5');
  await expect(comparison).toContainText('73.7');
  await expect(comparison).toContainText('+5.2');
  await expect(comparison).toContainText('What caused these changes');
  const fixedUrl = page.url();

  // Downloads of the selected version and the report.
  const [docx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click().then(() => page.getByRole('menuitem', { name: /Resume \(DOCX\)/ }).click())]);
  expect(docx.suggestedFilename()).toMatch(/-v2\.docx$/);
  const [report] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click().then(() => page.getByRole('menuitem', { name: /Analysis report/ }).click())]);
  expect(report.suggestedFilename()).toMatch(/\.pdf$/);

  // Interview preparation with priorities and practice tracking.
  await page.getByRole('link', { name: 'Interview prep' }).click();
  await expect(page.getByText('Preparation priority')).toBeVisible();
  await expect(page.getByText('HIGH priority').first()).toBeVisible();
  const evidence = page.getByText(/Resume evidence/);
  const before = await evidence.innerText();
  await page.getByRole('button', { name: 'Mark as practised' }).first().click();
  await expect(evidence).not.toHaveText(before);

  // Save application and move it to Interview.
  await page.goto(fixedUrl);
  await page.getByRole('button', { name: 'Save application' }).click();
  await page.getByRole('dialog').getByLabel('Status').selectOption('APPLIED');
  await page.getByRole('dialog').getByRole('button', { name: 'Save application' }).click();
  await expect(page.getByText('Application saved')).toBeVisible();
  await page.getByRole('link', { name: 'Open tracker' }).click();
  await page.locator('select[id^="status-"]').first().selectOption('INTERVIEW');
  await expect(page.getByRole('region', { name: 'Interview' })).toContainText('Acme Fintech');

  // Compare versions.
  await page.goto('/resumes');
  const boxes = page.getByRole('checkbox', { name: /Select version/ });
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole('button', { name: /^Compare/ }).click();
  await expect(page.getByText('Text changes')).toBeVisible();
  await expect(page.getByText('Why the scores changed')).toBeVisible();

  // Analytics reflect the stored records.
  await page.goto('/dashboard');
  await expect(page.getByText('Scores over time')).toBeVisible();
  const pipeline = page.getByRole('region', { name: 'Application pipeline' });
  await expect(pipeline).toContainText('Interviews');
  await expect(pipeline).toContainText('100%');
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);

  expect(consoleErrors).toEqual([]);
});

test('rejects an invalid upload with a clear message', async ({ page }) => {
  await register(page);
  await page.goto('/analyze');
  await page.getByRole('button', { name: 'Use example' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 not really a pdf'.padEnd(500, 'x')) });
  await page.getByRole('button', { name: 'Analyze resume' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be read');
});

test('protected pages require a session and show a clear error for unknown analyses', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await register(page);
  await page.goto('/results/000000000000000000000000');
  await expect(page.getByRole('alert')).toContainText('Analysis not found');
});
