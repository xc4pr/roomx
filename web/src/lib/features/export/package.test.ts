import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ExportSchema } from '#lib/core/export.ts';
import { buildPackage } from './package.ts';
import { furnishedProject, loadTestFonts, testPng } from './testing.ts';

const deps = {
	loadFonts: async () => loadTestFonts(),
	loadPhoto: async () => testPng()
};

describe('buildPackage', () => {
	it('produces a PDF and a JSON that validates against the export schema', async () => {
		const project = furnishedProject();
		const date = new Date(2026, 9, 13, 12);
		const result = await buildPackage({ project, language: 'de', date }, deps);
		expect(result.pdf.name).toBe('roomx-wohnung-mueller-koehler-2026-10-13.pdf');
		expect(result.json.name).toBe('roomx-wohnung-mueller-koehler-2026-10-13.json');
		expect(result.tooLarge).toBe(false);
		const parsed = ExportSchema.parse(JSON.parse(new TextDecoder().decode(result.json.data)));
		expect(parsed.project.name).toBe('Wohnung Müller-Köhler');
		expect(parsed.rooms.map((room) => room.name)).toEqual(['Schlafzimmer', 'Wohnzimmer']);
		const pdf = await PDFDocument.load(result.pdf.data);
		expect(pdf.getPageCount()).toBe(result.pageCount);
		const photo = parsed.rooms[0].photos[0];
		expect(photo.pdfPage).toBe(result.pageCount);
	});

	it('exports a single room only', async () => {
		const project = furnishedProject();
		const result = await buildPackage({ project, roomIds: ['room-l'], language: 'en' }, deps);
		expect(result.document.rooms.map((room) => room.id)).toEqual(['room-l']);
		expect(result.document.variants[0].items).toEqual([]);
		expect(result.document.rooms[0].photos).toEqual([]);
	});

	it('reports progress from 0 to 1 and can be cancelled', async () => {
		const project = furnishedProject();
		const seen: number[] = [];
		await buildPackage({ project, language: 'de', onProgress: (value) => seen.push(value) }, deps);
		expect(seen[0]).toBe(0);
		expect(seen.at(-1)).toBe(1);
		expect(seen.every((value, index) => index === 0 || value >= seen[index - 1])).toBe(true);
		const controller = new AbortController();
		controller.abort();
		await expect(
			buildPackage({ project, language: 'de', signal: controller.signal }, deps)
		).rejects.toThrow();
	});
});
