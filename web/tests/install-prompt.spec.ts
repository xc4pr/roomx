import { devices } from '@playwright/test';
import { openProjects } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

test('Installationsaufforderung erscheint vor dem ersten Projekt und lässt sich überspringen', async ({
	context,
	page,
	browserName
}) => {
	test.skip(browserName !== 'webkit', 'Nur auf iPad-Safari relevant');

	await context.addInitScript((userAgent) => {
		Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => userAgent });
	}, devices['iPad Pro 11'].userAgent);

	await openProjects(page);
	await page.evaluate(() => {
		localStorage.setItem(
			'roomx.settings',
			JSON.stringify({ tourSeen: true, language: 'de', unit: 'cm' })
		);
	});
	await page.reload();
	await expect(page.getByText('Zum Home-Bildschirm hinzufügen')).toBeVisible();

	await page.getByTestId('empty-create').click();
	await expect(page.getByTestId('install-gate')).toBeVisible();
	await expect(page.getByTestId('project-name')).toHaveCount(0);

	await page.getByTestId('gate-skip').click();
	await expect(page.getByTestId('install-gate')).toHaveCount(0);
	await page.getByTestId('project-name').fill('Nach dem Überspringen');
	await page.getByTestId('create-project').click();
	await expect(page).toHaveURL(/\/p\/[^/]+$/);

	await page.goto('/');
	await expect(page.getByTestId('project-card')).toHaveCount(1);
	await expect(page.getByText('Zum Home-Bildschirm hinzufügen')).toHaveCount(0);
	await page.getByTestId('new-project').click();
	await expect(page.getByTestId('project-name')).toBeVisible();
	await expect(page.getByTestId('install-gate')).toHaveCount(0);

	await page.reload();
	await expect(page.getByText('Zum Home-Bildschirm hinzufügen')).toHaveCount(0);
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem('roomx.settings')))
		.toContain('"installHintSeen":true');
});
