import { expect, skipTour, startPage, test } from './helpers.ts';

test('Edition: keine Server-Felder, CSP erlaubt nur die eigene Origin', async ({ newProfile }) => {
	const context = await newProfile().open();
	const page = await startPage(context);
	await skipTour(page);

	const csp = await page
		.locator('meta[http-equiv="content-security-policy" i]')
		.getAttribute('content');
	expect(csp).toContain("connect-src 'self'");
	expect(csp).not.toMatch(/connect-src[^;]*(https?:|\*)/);

	await page.goto('settings');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(
		page.locator(
			'[data-testid="server-url"], [data-testid="server-token"], [data-testid="sync-now"]'
		)
	).toHaveCount(0);
});
