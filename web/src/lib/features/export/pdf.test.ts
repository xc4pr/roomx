import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { rectangleRoom, sampleLookup } from '#lib/core/fixtures.ts';
import { wholeCover } from '#lib/core/outdoor.ts';
import type { CatalogLookup } from '#lib/core/catalog.ts';
import { buildPdf } from './pdf.ts';
import { furnishedProject, loadTestFonts, testPng } from './testing.ts';

const fonts = loadTestFonts();

describe('buildPdf', () => {
	it('creates a valid document with title, room, wall and furnishing pages', async () => {
		const project = furnishedProject();
		const result = await buildPdf({
			project,
			language: 'de',
			fonts,
			date: new Date(2026, 9, 13),
			loadPhoto: async () => testPng()
		});
		const doc = await PDFDocument.load(result.bytes);
		expect(doc.getPageCount()).toBe(result.pageCount);
		expect(result.pageCount).toBeGreaterThanOrEqual(7);
		expect(result.photoPages['photo-1']).toBe(result.pageCount);
		expect(doc.getTitle()).toContain('Wohnung');
	});

	it('draws sloped ceilings in plans and wall views and lists them in the room data', async () => {
		const project = furnishedProject();
		const flat = await buildPdf({ project, roomIds: ['room-rect'], language: 'de', fonts });
		const room = project.rooms.find((candidate) => candidate.id === 'room-rect')!;
		room.slopes = [
			{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45 },
			{ id: 's3', wall: 3, kneeHeight: 800, angle: 30 }
		];
		for (const language of ['de', 'en'] as const) {
			const sloped = await buildPdf({ project, roomIds: ['room-rect'], language, fonts });
			const doc = await PDFDocument.load(sloped.bytes);
			expect(doc.getPageCount()).toBe(sloped.pageCount);
			expect(sloped.bytes.length).toBeGreaterThan(flat.bytes.length);
		}
	});

	it('adds the footnote for articles whose dimensions are unverified', async () => {
		const project = furnishedProject();
		const lookupWith =
			(verified: boolean): CatalogLookup =>
			(id) => {
				const entry = sampleLookup(id);
				return entry ? { ...entry, verified } : undefined;
			};
		const checked = await buildPdf({
			project,
			roomIds: ['room-rect'],
			language: 'de',
			fonts,
			lookup: lookupWith(true)
		});
		const unchecked = await buildPdf({
			project,
			roomIds: ['room-rect'],
			language: 'de',
			fonts,
			lookup: lookupWith(false)
		});
		expect(unchecked.pageCount).toBe(checked.pageCount);
		expect(unchecked.bytes.length).toBeGreaterThan(checked.bytes.length);
	});

	it('labels connected rooms and still produces the same pages', async () => {
		const apart = furnishedProject();
		const joined = furnishedProject();
		const rect = joined.rooms.find((candidate) => candidate.id === 'room-rect')!;
		const other = joined.rooms.find((candidate) => candidate.id === 'room-l')!;
		other.boardPos = { x: 4000 + 150, y: 0, rot: 0 };
		rect.elements.push({
			id: 'pass',
			kind: 'door',
			status: 'existing',
			wall: 2,
			offset: 600,
			width: 900,
			height: 2000,
			elevation: 0,
			hinge: 'start',
			swing: 'out'
		});
		const before = await buildPdf({ project: apart, language: 'de', fonts });
		const after = await buildPdf({ project: joined, language: 'de', fonts });
		expect(after.pageCount).toBe(before.pageCount);
		expect(after.bytes.length).toBeGreaterThan(before.bytes.length);
	});

	it('limits the document to the requested rooms and counts photo pages', async () => {
		const project = furnishedProject();
		const only = await buildPdf({ project, roomIds: ['room-l'], language: 'en', fonts });
		const both = await buildPdf({ project, language: 'en', fonts });
		expect(only.pageCount).toBeLessThan(both.pageCount);
		expect(only.photoPages).toEqual({});
	});

	it('embeds images returned by the view renderer', async () => {
		const project = furnishedProject();
		const without = await buildPdf({ project, roomIds: ['room-rect'], language: 'de', fonts });
		const png = testPng(300, 300);
		const withViews = await buildPdf({
			project,
			roomIds: ['room-rect'],
			language: 'de',
			fonts,
			renderViews: async () => ({ top: png, iso: [png, png, png, png] })
		});
		expect(withViews.pageCount).toBe(without.pageCount + 1);
		expect(withViews.bytes.length).toBeGreaterThan(without.bytes.length);
	});

	it('marks missing photos without a page number', async () => {
		const project = furnishedProject();
		const result = await buildPdf({
			project,
			roomIds: ['room-rect'],
			language: 'de',
			fonts,
			loadPhoto: async () => undefined
		});
		expect(result.photoPages).toEqual({});
	});

	it('reports progress and honours cancellation', async () => {
		const project = furnishedProject();
		const steps: number[] = [];
		await buildPdf({
			project,
			language: 'de',
			fonts,
			onProgress: ({ done }) => steps.push(done)
		});
		expect(steps[0]).toBe(0);
		expect(steps.at(-1)).toBeGreaterThan(3);
		const controller = new AbortController();
		controller.abort();
		await expect(
			buildPdf({ project, language: 'de', fonts, signal: controller.signal })
		).rejects.toThrow();
	});

	it('draws outdoor areas with railing and cover and lists the areas', async () => {
		const project = furnishedProject();
		const base = await buildPdf({ project, language: 'de', fonts });
		const balcony = rectangleRoom('room-balcony', 3000, 1200);
		balcony.type = 'balcony';
		balcony.boardPos = { x: 0, y: 9000, rot: 0 };
		balcony.railing = { height: 1000 };
		balcony.cover = wholeCover(balcony, 2300);
		project.rooms.push(balcony);
		for (const language of ['de', 'en'] as const) {
			const result = await buildPdf({ project, language, fonts });
			const doc = await PDFDocument.load(result.bytes);
			expect(doc.getPageCount()).toBe(result.pageCount);
			expect(result.pageCount).toBeGreaterThan(base.pageCount);
		}
		const withBalcony = await buildPdf({
			project,
			roomIds: ['room-balcony'],
			language: 'de',
			fonts
		});
		const without = await buildPdf({
			project: { ...project, rooms: project.rooms.filter((room) => room.id !== 'room-balcony') },
			language: 'de',
			fonts
		});
		expect(withBalcony.pageCount).toBeLessThan(without.pageCount);
	});
});
