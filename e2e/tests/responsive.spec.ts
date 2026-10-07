import { analyzeSample, expect, expectAccessible, expectNoHorizontalOverflow, register, test } from './fixtures';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const viewport of VIEWPORTS) {
  test(`key screens fit the ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await register(page);
    await analyzeSample(page);
    await expectNoHorizontalOverflow(page);
    // Score cards stay readable.
    await expect(page.getByRole('img', { name: /Job Fit \d+ out of 100/ })).toBeVisible();

    // Navigation works at this size (hamburger on mobile).
    if (viewport.width < 1024) {
      await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Applications' }).click();
    } else {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Applications' }).click();
    }
    await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();

    // Modals fit the screen.
    await page.getByRole('button', { name: 'Add application' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press('Escape');

    for (const route of ['/dashboard', '/resumes', '/research', '/profile']) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    await expectAccessible(page);
  });
}

test('keyboard users can reach the main actions', async ({ page }) => {
  await register(page);
  await page.goto('/analyze');
  await page.keyboard.press('Tab');
  // The first focusable element is in the header and has a visible focus ring.
  const focused = page.locator(':focus');
  await expect(focused).toBeVisible();
  const outline = await focused.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(outline).not.toBe('none');
});
