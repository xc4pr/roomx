import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { catalog } from '#lib/catalog/index.ts';
import { ExportSchema } from '#lib/core/export.ts';
import { PlanSchema, planJsonSchema } from '#lib/core/plan.ts';
import { zipPackage } from './deliver.ts';
import { PACKAGE_FILE_COUNT } from './layout.ts';
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

	it('leaves the photos out on request', async () => {
		const project = furnishedProject();
		const date = new Date(2026, 9, 13, 12);
		const full = await buildPackage({ project, language: 'de', date }, deps);
		const bare = await buildPackage({ project, language: 'de', date, includePhotos: false }, deps);
		expect(bare.pageCount).toBe(full.pageCount - 1);
		expect(bare.pdf.data.length).toBeLessThan(full.pdf.data.length);
		expect(bare.document.rooms[0].photos[0]?.pdfPage).toBeUndefined();
		expect(full.document.rooms[0].photos[0]?.pdfPage).toBe(full.pageCount);
		expect(new TextDecoder().decode(bare.instructions.data)).toContain('keine Fotos');
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

describe('package contents', () => {
	const date = new Date(2026, 9, 13, 12);

	it('holds the instructions, PDF, JSON, plan schema and compact catalog', async () => {
		const result = await buildPackage({ project: furnishedProject(), language: 'de', date }, deps);
		expect(result.files).toHaveLength(PACKAGE_FILE_COUNT);
		expect(result.files.map((file) => file.name)).toEqual([
			'roomx-anleitung-wohnung-mueller-koehler-2026-10-13.md',
			'roomx-wohnung-mueller-koehler-2026-10-13.pdf',
			'roomx-wohnung-mueller-koehler-2026-10-13.json',
			'roomx-plan.schema.json',
			'roomx-katalog.json'
		]);
		expect(new Set(result.files.map((file) => file.name)).size).toBe(PACKAGE_FILE_COUNT);
		expect(result.files.every((file) => file.data.length > 0)).toBe(true);
		expect(result.instructions.type).toBe('text/markdown');
		const decoder = new TextDecoder();
		const text = decoder.decode(result.instructions.data);
		expect(text).toContain(result.document.project.id);
		expect(text).toContain(`${result.pageCount} Seiten`);
		expect(text).toContain(result.prompt);
		expect(result.prompt).toContain(result.instructions.name);
		expect(JSON.parse(decoder.decode(result.schema.data))).toEqual(
			JSON.parse(JSON.stringify(planJsonSchema()))
		);
		const parsedCatalog = JSON.parse(decoder.decode(result.catalog.data));
		expect(parsedCatalog.items).toHaveLength(catalog.length);
		expect(parsedCatalog.language).toBe('de');
	});

	it('writes everything in English for the English app', async () => {
		const result = await buildPackage({ project: furnishedProject(), language: 'en', date }, deps);
		expect(result.instructions.name).toBe(
			'roomx-instructions-wohnung-mueller-koehler-2026-10-13.md'
		);
		const text = new TextDecoder().decode(result.instructions.data);
		expect(text).toContain('# roomx: Instructions for the AI assistant');
		expect(result.prompt).toContain('You are my interior planner');
		expect(JSON.parse(new TextDecoder().decode(result.catalog.data)).language).toBe('en');
		expect(result.zipName).toBe('roomx-ai-package-wohnung-mueller-koehler-2026-10-13.zip');
	});

	it('limits the instructions to the exported rooms and says so', async () => {
		const result = await buildPackage(
			{ project: furnishedProject(), roomIds: ['room-l'], language: 'de', date },
			deps
		);
		const text = new TextDecoder().decode(result.instructions.data);
		expect(text).toContain('`room-l`');
		expect(text).not.toContain('`room-rect`');
		expect(text).toContain('Das Paket enthält nur diese Räume');
	});

	it('gives an example plan that the plan schema accepts', async () => {
		const result = await buildPackage({ project: furnishedProject(), language: 'de', date }, deps);
		const text = new TextDecoder().decode(result.instructions.data);
		const block = /```json\n([\s\S]*?)\n```/.exec(text)?.[1];
		expect(block).toBeDefined();
		const plan = PlanSchema.parse(JSON.parse(block!));
		expect(plan.projectId).toBe(result.document.project.id);
	});

	it('packs all files into a ZIP', async () => {
		const result = await buildPackage({ project: furnishedProject(), language: 'de', date }, deps);
		const blob = zipPackage(result.files);
		expect(blob.type).toBe('application/zip');
		const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
		expect(Object.keys(entries).sort()).toEqual(result.files.map((file) => file.name).sort());
		for (const file of result.files) expect(entries[file.name]).toEqual(file.data);
	});
});
