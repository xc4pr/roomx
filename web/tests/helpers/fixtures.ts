import { test as base, expect, type BrowserContext } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SEED = { tourSeen: true, installHintSeen: true, language: 'de', unit: 'cm' };

type LaunchContext = (options?: { colorScheme?: 'light' | 'dark' }) => Promise<BrowserContext>;

async function seed(context: BrowserContext): Promise<void> {
	await context.addInitScript((value) => {
		try {
			if (!localStorage.getItem('roomx.settings')) {
				localStorage.setItem('roomx.settings', JSON.stringify(value));
			}
		} catch {
			return;
		}
	}, SEED);
}

// WebKit logs this when an image load is cancelled by navigation; nothing is broken.
const BENIGN_ERRORS = [/due to access control checks/];

export const test = base.extend<{ errors: string[]; launchContext: LaunchContext }>({
	// Playwright's WebKit uses an ephemeral store in which IndexedDB cannot hold Blobs,
	// so photos would never be saved. A persistent profile behaves like the installed app.
	launchContext: async (
		{
			browser,
			browserName,
			playwright,
			viewport,
			hasTouch,
			isMobile,
			locale,
			userAgent,
			deviceScaleFactor,
			baseURL,
			colorScheme: defaultScheme
		},
		use
	) => {
		const opened: BrowserContext[] = [];
		const folders: string[] = [];
		const launch: LaunchContext = async ({ colorScheme = defaultScheme } = {}) => {
			const options = {
				viewport,
				hasTouch,
				isMobile,
				locale,
				userAgent,
				deviceScaleFactor,
				baseURL,
				colorScheme,
				serviceWorkers: 'allow' as const,
				acceptDownloads: true
			};
			let context: BrowserContext;
			if (browserName === 'webkit') {
				const folder = mkdtempSync(join(tmpdir(), 'roomx-wk-'));
				folders.push(folder);
				context = await playwright.webkit.launchPersistentContext(folder, options);
			} else {
				context = await browser.newContext(options);
			}
			await seed(context);
			opened.push(context);
			return context;
		};
		await use(launch);
		await Promise.all(opened.map((context) => context.close().catch(() => undefined)));
		for (const folder of folders) rmSync(folder, { recursive: true, force: true });
	},
	context: async ({ launchContext }, use) => {
		await use(await launchContext());
	},
	errors: [
		async ({ page }, use) => {
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await use(errors);
			const relevant = errors.filter(
				(message) => !BENIGN_ERRORS.some((pattern) => pattern.test(message))
			);
			expect(relevant, 'uncaught page errors').toEqual([]);
		},
		{ auto: true }
	]
});

export { expect };
