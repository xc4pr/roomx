import { createProject, projectIdOf } from './helpers/app.ts';
import { test, expect } from './helpers/fixtures.ts';

const TEXT = 'Zeile eins\nZeile zwei';

test('Klick auf den aktiven Link lässt Fokus, Text und Scrollposition in Ruhe', async ({
	page
}) => {
	await createProject(page, 'Aktiver Link');
	await page.getByTestId('seg-share').click();
	await expect(page).toHaveURL(/\/share$/);
	const field = page.getByTestId('import-text');
	await expect(field).toBeVisible();

	await field.focus();
	await field.pressSequentially('abc');
	await expect(field).toHaveValue('abc');
	const main = page.locator('main');
	// Let any smooth scrolling triggered by the typing settle, then park the page mid-way.
	await expect
		.poll(async () => {
			const before = await main.evaluate((el) => el.scrollTop);
			await page.waitForTimeout(150);
			return before === (await main.evaluate((el) => el.scrollTop));
		})
		.toBe(true);
	const top = await main.evaluate((el) => {
		el.scrollTo({ top: Math.floor((el.scrollHeight - el.clientHeight) / 2), behavior: 'instant' });
		return el.scrollTop;
	});
	expect(top).toBeGreaterThan(0);

	// dispatchEvent leaves the focus alone (a real press would focus the link itself),
	// so only the navigation can take it away from the field.
	await page.getByTestId('seg-share').dispatchEvent('click');

	// SvelteKit finishes its (asynchronous) navigation within a few frames; watch for 1 s.
	const seen = await page.evaluate(
		() =>
			new Promise<{ focused: boolean; scroll: number }[]>((done) => {
				const samples: { focused: boolean; scroll: number }[] = [];
				const started = performance.now();
				const timer = setInterval(() => {
					samples.push({
						focused: document.activeElement?.id === 'import-text',
						scroll: document.querySelector('main')!.scrollTop
					});
					if (performance.now() - started > 1000) {
						clearInterval(timer);
						done(samples);
					}
				}, 25);
			})
	);
	expect(seen.length).toBeGreaterThan(10);
	expect(seen.every((sample) => sample.focused)).toBe(true);
	// A reset to the top is what a same-URL navigation does; later drift downwards is the layout settling.
	expect(seen.every((sample) => sample.scroll >= top)).toBe(true);
	await expect(field).toBeFocused();
	await expect(field).toHaveValue('abc');
});

test('Klick auf einen aktiven Link mit anderer Query navigiert weiter', async ({ page }) => {
	const name = 'Aktiver Link Query';
	await createProject(page, name);
	const id = projectIdOf(page);
	await page.goto(`/p/${id}/3d?build=1`);
	const link = page.getByTestId('seg-3d');
	await expect(link).toHaveAttribute('aria-current', 'page');
	await link.click();
	await expect(page).toHaveURL(new RegExp(`/p/${id}/3d$`));
});

test('Klick auf den aktiven Link: nur der schlichte Linksklick wird abgefangen', async ({
	page
}) => {
	await createProject(page, 'Aktiver Link Modifier');
	await page.getByTestId('seg-share').click();
	await expect(page).toHaveURL(/\/share$/);
	const result = await page.getByTestId('seg-share').evaluate((el) => {
		const out: Record<string, boolean> = {};
		const cases: [string, MouseEventInit][] = [
			['plain', {}],
			['ctrl', { ctrlKey: true }],
			['meta', { metaKey: true }],
			['shift', { shiftKey: true }],
			['alt', { altKey: true }],
			['middle', { button: 1 }]
		];
		for (const [name, init] of cases) {
			const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
			el.dispatchEvent(event);
			out[name] = event.defaultPrevented;
		}
		return out;
	});
	expect(result).toEqual({
		plain: true,
		ctrl: false,
		meta: false,
		shift: false,
		alt: false,
		middle: false
	});
});

test('Wackler: Klick auf aktiven Link, sofort fill', async ({ page, browserName }) => {
	test.skip(!process.env.ROOMX_REPRO_FOCUS, 'nur mit ROOMX_REPRO_FOCUS=1');
	test.skip(browserName !== 'chromium', 'CDP-Drosselung nur in Chromium');
	test.setTimeout(240_000);
	const rate = Number(process.env.ROOMX_REPRO_RATE ?? 6);
	const runs = Number(process.env.ROOMX_REPRO_RUNS ?? 30);
	await createProject(page, 'Wackler');
	await page.getByTestId('seg-share').click();
	await expect(page).toHaveURL(/\/share$/);
	const field = page.getByTestId('import-text');
	await expect(field).toBeVisible();
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate });

	let empty = 0;
	for (let i = 0; i < runs; i++) {
		await field.evaluate((el: HTMLTextAreaElement) => {
			el.value = '';
			el.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await page.getByTestId('seg-share').click();
		await field.fill(TEXT);
		const value = await field.inputValue();
		if (value === '') empty++;
	}
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	console.log(`REPRO leer=${empty} von ${runs} (Rate ${rate})`);
	expect(empty).toBe(0);
});
