import type { Download, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import type { ExportDocument } from '#lib/core/export.ts';

export interface Exported {
	json: ExportDocument;
	jsonText: string;
	pdf: Buffer;
	pdfName: string;
	jsonName: string;
}

export async function exportPackage(page: Page): Promise<Exported> {
	await page.getByTestId('seg-share').click();
	await expect(page.getByTestId('export-panel')).toBeVisible();
	const downloads: Download[] = [];
	page.on('download', (download) => downloads.push(download));
	await page.getByTestId('create-package').click();
	await expect(page.getByTestId('package-ready')).toBeVisible({ timeout: 60_000 });
	await page.getByTestId('download-package').click();
	await expect.poll(() => downloads.length, { timeout: 15_000 }).toBe(2);
	const files = await Promise.all(
		downloads.map(async (download) => ({
			name: download.suggestedFilename(),
			data: readFileSync(await download.path())
		}))
	);
	const pdf = files.find((file) => file.name.endsWith('.pdf'));
	const json = files.find((file) => file.name.endsWith('.json'));
	if (!pdf || !json) throw new Error(`unexpected downloads: ${files.map((f) => f.name).join()}`);
	const jsonText = json.data.toString('utf8');
	return {
		json: JSON.parse(jsonText),
		jsonText,
		pdf: pdf.data,
		pdfName: pdf.name,
		jsonName: json.name
	};
}

export async function pdfPages(pdf: Buffer): Promise<number> {
	expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
	return (await PDFDocument.load(pdf)).getPageCount();
}
