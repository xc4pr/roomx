import type { Page } from '@playwright/test';
import {
	createJob,
	expect,
	openLink,
	openRoomCapture,
	prepareProject,
	test
} from './mirror/helpers.ts';

// The helpers seed a finished tour; this script runs after the seed and puts a fresh phone back.
async function freshTour(phone: Page): Promise<void> {
	await phone.context().addInitScript(() => {
		try {
			localStorage.setItem(
				'roomx.settings',
				JSON.stringify({ installHintSeen: true, language: 'de', unit: 'cm' })
			);
		} catch {
			return;
		}
	});
}

async function pairedPhone(
	world: Parameters<Parameters<typeof test>[2]>[0]['world'],
	fresh = false
): Promise<{ phone: Page; link: string }> {
	const desktop = await world.desktop();
	await prepareProject(desktop);
	const link = await createJob(desktop);
	const phone = await world.phone();
	if (fresh) await freshTour(phone);
	return { phone, link };
}

test('Frisches Handy: Pair-Link zeigt die Foto-Seite ohne Tour, die Tour startet auf der Startseite', async ({
	world
}) => {
	test.setTimeout(120_000);
	const { phone, link } = await pairedPhone(world, true);
	await openLink(phone, link);
	await expect(phone.getByTestId('camera-mode')).toBeVisible();
	// Absence cannot be awaited, so the overlay gets a fixed grace period before the check.
	await phone.waitForTimeout(2000);
	await expect(phone.getByTestId('guide-card')).toHaveCount(0);
	expect(phone.url()).not.toContain('#pair=');

	await phone.goto('/');
	await expect(phone.getByTestId('guide-card')).toBeVisible();
});

test('Querformat: Bedienleiste steht rechts neben der Kamera', async ({ world }) => {
	test.setTimeout(120_000);
	const { phone, link } = await pairedPhone(world);
	await openLink(phone, link);
	await openRoomCapture(phone, 'now');
	await phone.setViewportSize({ width: 844, height: 390 });
	const shutter = phone.getByTestId('camera-shutter');
	await expect(shutter).toBeVisible();
	await expect.poll(async () => (await shutter.boundingBox())?.x ?? 0).toBeGreaterThan(844 / 2);
	const video = phone.getByTestId('camera-capture').locator('video');
	await expect
		.poll(async () => (await video.boundingBox())?.height ?? 0)
		.toBeGreaterThanOrEqual(300);
});

test('Schmales Handy: Schrittanzeige ist einzeilig und kompakt', async ({ world }) => {
	test.setTimeout(120_000);
	const { phone, link } = await pairedPhone(world);
	await phone.setViewportSize({ width: 360, height: 740 });
	await openLink(phone, link);
	await openRoomCapture(phone, 'now');
	const step = phone.getByTestId('camera-step');
	await expect(step).toBeVisible();
	await expect(step).toHaveText(/1\s*\/\s*\d/);
	const { height, line } = await step.evaluate((element) => {
		const style = getComputedStyle(element);
		const parsed = parseFloat(style.lineHeight);
		return {
			height: element.getBoundingClientRect().height,
			line: Number.isNaN(parsed) ? parseFloat(style.fontSize) * 1.5 : parsed
		};
	});
	expect(height).toBeLessThanOrEqual(line * 1.3);
	expect(height).toBeGreaterThan(0);
});

test('Ein-Raum-Auftrag: Hinweis nennt «1 Raum»', async ({ world }) => {
	test.setTimeout(120_000);
	const { phone, link } = await pairedPhone(world);
	await openLink(phone, link);
	await expect(phone.getByTestId('camera-mode')).toContainText('1 Raum wartet auf Fotos');
});
