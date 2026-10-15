import { defineConfig, devices } from '@playwright/test';

const ipadLandscape = { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true };
const ipadPortrait = { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true };
const port = process.env.PW_PORT ?? '4273';
const external = process.env.PW_EXTERNAL_SERVER === '1';

export default defineConfig({
	testDir: 'tests',
	testMatch: process.env.PW_VISUAL ? '**/visual.spec.ts' : '**/*.spec.ts',
	testIgnore: process.env.PW_VISUAL ? ['**/pages/**'] : ['**/visual.spec.ts', '**/pages/**'],
	outputDir: process.env.PW_OUTPUT_DIR ?? 'test-results',
	fullyParallel: true,
	workers: process.env.CI ? 2 : 3,
	retries: 0,
	timeout: 90_000,
	expect: { timeout: 10_000 },
	reporter: [
		['list'],
		['html', { open: 'never', outputFolder: process.env.PW_REPORT_DIR ?? 'playwright-report' }]
	],
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		locale: 'de-CH',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		serviceWorkers: 'allow'
	},
	webServer: external
		? undefined
		: {
				command: 'node tests/server.mjs',
				url: `http://127.0.0.1:${port}/api/health`,
				reuseExistingServer: false,
				timeout: 60_000,
				gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 }
			},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'ipad-landscape', use: { browserName: 'webkit', ...ipadLandscape } },
		{ name: 'ipad-portrait', use: { browserName: 'webkit', ...ipadPortrait } },
		{
			name: 'ipad-chromium',
			use: {
				browserName: 'chromium',
				...ipadLandscape,
				userAgent: devices['iPad Pro 11'].userAgent
			}
		}
	]
});
