import { defineConfig, devices } from '@playwright/test';

const external = process.env.PAGES_URL?.replace(/\/?$/, '/');
const port = process.env.PAGES_PORT ?? '4274';
const baseURL = external ?? `http://127.0.0.1:${port}/roomx/`;

export default defineConfig({
	testDir: 'tests/pages',
	testMatch: '**/*.spec.ts',
	outputDir: process.env.PW_OUTPUT_DIR ?? 'test-results-pages',
	fullyParallel: true,
	workers: process.env.CI ? 2 : 3,
	retries: 0,
	timeout: 120_000,
	expect: { timeout: 10_000 },
	reporter: [
		['list'],
		[
			'html',
			{ open: 'never', outputFolder: process.env.PW_REPORT_DIR ?? 'playwright-report-pages' }
		]
	],
	use: {
		baseURL,
		locale: 'de-CH',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		serviceWorkers: 'allow'
	},
	webServer: external
		? undefined
		: {
				command: 'node tests/pages/server.mjs',
				url: `http://127.0.0.1:${port}/healthz`,
				reuseExistingServer: false,
				timeout: 30_000,
				gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 }
			},
	projects: [
		{ name: 'pages-chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'pages-webkit', use: { ...devices['Desktop Safari'] } }
	]
});
