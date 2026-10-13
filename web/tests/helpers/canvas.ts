import type { Locator, Page } from '@playwright/test';

export interface CanvasStats {
	distinctColors: number;
	luminanceDeviation: number;
}

export async function canvasStats(page: Page, canvas: Locator): Promise<CanvasStats> {
	const shot = await canvas.screenshot();
	return page.evaluate(async (base64) => {
		const image = new Image();
		image.src = `data:image/png;base64,${base64}`;
		await image.decode();
		const probe = document.createElement('canvas');
		probe.width = 160;
		probe.height = 120;
		const context = probe.getContext('2d');
		if (!context) throw new Error('no 2d context');
		context.drawImage(image, 0, 0, probe.width, probe.height);
		const { data } = context.getImageData(0, 0, probe.width, probe.height);
		const colors = new Set<number>();
		let sum = 0;
		let sumSquares = 0;
		const count = data.length / 4;
		for (let i = 0; i < data.length; i += 4) {
			colors.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
			const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
			sum += luminance;
			sumSquares += luminance * luminance;
		}
		const mean = sum / count;
		return {
			distinctColors: colors.size,
			luminanceDeviation: Math.sqrt(Math.max(0, sumSquares / count - mean * mean))
		};
	}, shot.toString('base64'));
}
