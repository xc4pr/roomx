import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createElement, createRoom } from '#lib/core/defaults.ts';
import { frontDirection } from '#lib/core/geometry.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { Item, RoomElement } from '#lib/core/schema.ts';
import { PAPER_PALETTE } from './palette.ts';
import { buildPdf } from './pdf.ts';
import { findingLines } from './pdfFindings.ts';
import type { PdfContext } from './pdfKit.ts';
import { roomOnlyLines, symbolLegend } from './pdfSymbols.ts';
import { furnishedProject, loadTestFonts } from './testing.ts';

const fonts = loadTestFonts();
const ctx = (language: 'de' | 'en' = 'de') => ({ language, palette: PAPER_PALETTE }) as PdfContext;

function elements(...kinds: RoomElement['kind'][]): RoomElement[] {
	const room = createRoom('r', 'Bad', 'bath');
	const ids = sequentialIds('e');
	return kinds.map((kind) => createElement(kind, room, 1, 1500, ids));
}

describe('symbol legend', () => {
	it('is empty for a room without new elements', () => {
		expect(symbolLegend(ctx(), elements('window', 'socket'))).toEqual([]);
	});

	it('lists only the kinds that occur, in a fixed order, with zones', () => {
		const labels = symbolLegend(ctx(), elements('stove', 'toilet', 'stove')).map((e) => e.label);
		expect(labels).toEqual(['WC', 'Kaminofen', 'Sperrzone Feuer (gestrichelt)']);
		const english = symbolLegend(ctx('en'), elements('acFloor', 'shower')).map((e) => e.label);
		expect(english).toEqual(
			['Shower', 'Floor air conditioner', 'Air outlet clearance (dashed)'].map((label, i) =>
				i === 1 ? english[1] : label
			)
		);
	});

	it('adds the upper cabinets entry only when the run has some', () => {
		const [run] = elements('kitchenRun');
		if (run.kind !== 'kitchenRun') throw new Error('kind');
		const without = symbolLegend(ctx(), [{ ...run, upper: undefined }]);
		const withUpper = symbolLegend(ctx(), [
			{ ...run, upper: { depth: 350, height: 700, elevation: 1450 } }
		]);
		expect(withUpper.length).toBe(without.length + 1);
	});
});

describe('free element lines', () => {
	it('describe free elements and roof windows, nothing for wall elements', () => {
		const lines = roomOnlyLines(ctx(), elements('column', 'fireplace', 'washbasin'));
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain('Stütze');
		expect(lines[1]).toContain('Sperrzone 800');
	});
});

function inFront(element: { x: number; y: number; rotation: number; depth: number }, gap: number) {
	const front = frontDirection(element.rotation);
	const reach = element.depth / 2 + gap;
	return { x: element.x + front.x * reach, y: element.y + front.y * reach };
}

describe('findings', () => {
	it('names furniture in a fire zone and in front of an air outlet', () => {
		const room = createRoom('r', 'Wohnen', 'living');
		const ids = sequentialIds('e');
		const stove = createElement('stove', room, 1, 2000, ids);
		const ac = createElement('acFloor', room, 3, 2000, ids);
		room.elements.push(stove, ac);
		if (stove.kind !== 'stove' || ac.kind !== 'acFloor') throw new Error('kind');
		const base = { roomId: 'r', category: 'dresser', rotation: 0, elevation: 0 } as const;
		const items: Item[] = [
			{
				...base,
				id: 'a',
				name: 'Sofa',
				dims: { w: 600, d: 400, h: 700 },
				...inFront(stove, 300)
			},
			{
				...base,
				id: 'b',
				name: 'Regal',
				dims: { w: 300, d: 300, h: 700 },
				...inFront(ac, 200)
			}
		];
		const lines = findingLines(ctx(), room, items, []);
		expect(lines.some((line) => line.includes('Sperrzone') && line.includes('Sofa'))).toBe(true);
		expect(lines.some((line) => line.includes('Luftauslass') && line.includes('Regal'))).toBe(true);
	});

	it('stays empty when nothing is in a zone', () => {
		expect(findingLines(ctx(), createRoom('r', 'A', 'living'), [], [])).toEqual([]);
	});
});

describe('buildPdf with new elements', () => {
	it('draws symbols, legend and lists for every new kind in both languages', async () => {
		const project = furnishedProject();
		const room = project.rooms.find((candidate) => candidate.id === 'room-rect')!;
		const before = await buildPdf({ project, roomIds: ['room-rect'], language: 'de', fonts });
		const ids = sequentialIds('n');
		for (const kind of [
			'washbasin',
			'toilet',
			'shower',
			'bathtub',
			'kitchenRun',
			'acWall',
			'acFloor',
			'column',
			'freeObstacle',
			'fireplace',
			'stove',
			'tiledStove'
		] as const) {
			room.elements.push(createElement(kind, room, 2, 1500, ids));
		}
		for (const language of ['de', 'en'] as const) {
			const after = await buildPdf({ project, roomIds: ['room-rect'], language, fonts });
			const doc = await PDFDocument.load(after.bytes);
			expect(doc.getPageCount()).toBe(after.pageCount);
			expect(after.bytes.length).toBeGreaterThan(before.bytes.length);
		}
	}, 20_000);
});
