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
	instructions: string;
	instructionsName: string;
	schemaText: string;
	catalogText: string;
	fileNames: string[];
}

export const PACKAGE_FILES = 5;

export async function exportPackage(page: Page): Promise<Exported> {
	await page.getByTestId('seg-share').click();
	await expect(page.getByTestId('export-panel')).toBeVisible();
	const downloads: Download[] = [];
	page.on('download', (download) => downloads.push(download));
	await page.getByTestId('create-package').click();
	const proceed = page.getByTestId('check-proceed');
	const ready = page.getByTestId('package-ready');
	await expect(proceed.or(ready)).toBeVisible({ timeout: 60_000 });
	if (await proceed.isVisible()) await proceed.click();
	await expect(ready).toBeVisible({ timeout: 60_000 });
	await expect(page.getByTestId('package-files').locator('li')).toHaveCount(PACKAGE_FILES);
	await expect(page.getByTestId('prompt-text')).toContainText('roomx-plan');
	await page.getByTestId('download-package').click();
	await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(PACKAGE_FILES);
	const files = await Promise.all(
		downloads.map(async (download) => ({
			name: download.suggestedFilename(),
			data: readFileSync(await download.path())
		}))
	);
	const pdf = files.find((file) => file.name.endsWith('.pdf'));
	const instructions = files.find((file) =>
		/^roomx-(anleitung|instructions)-.+\.md$/.test(file.name)
	);
	const schema = files.find((file) => file.name === 'roomx-plan.schema.json');
	const catalog = files.find((file) => file.name === 'roomx-katalog.json');
	const json = files.find(
		(file) => file.name.endsWith('.json') && file !== schema && file !== catalog
	);
	if (!pdf || !json || !instructions || !schema || !catalog) {
		throw new Error(`unexpected downloads: ${files.map((f) => f.name).join()}`);
	}
	const jsonText = json.data.toString('utf8');
	return {
		json: JSON.parse(jsonText),
		jsonText,
		pdf: pdf.data,
		pdfName: pdf.name,
		jsonName: json.name,
		instructions: instructions.data.toString('utf8'),
		instructionsName: instructions.name,
		schemaText: schema.data.toString('utf8'),
		catalogText: catalog.data.toString('utf8'),
		fileNames: files.map((file) => file.name)
	};
}

export async function pdfPages(pdf: Buffer): Promise<number> {
	expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
	return (await PDFDocument.load(pdf)).getPageCount();
}
