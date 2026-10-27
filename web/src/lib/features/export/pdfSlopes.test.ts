import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { walls } from '#lib/core/geometry.ts';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import type { Room } from '#lib/core/schema.ts';
import { messages } from './i18n.ts';
import { PAPER_PALETTE } from './palette.ts';
import { buildPdf } from './pdf.ts';
import type { PdfContext } from './pdfKit.ts';
import { planLegend } from './pdfPlan.ts';
import {
	hasSlopes,
	planSlopes,
	slopeLegend,
	slopeSummary,
	wallSlopeLabels,
	zoneHatch
} from './pdfSlopes.ts';
import { translator } from './text.ts';
import { furnishedProject, loadTestFonts } from './testing.ts';

const fonts = loadTestFonts();
const ctx = (language: 'de' | 'en' = 'de') =>
	({ language, palette: PAPER_PALETTE, tr: translator(messages, language) }) as PdfContext;

function room(slopes: Room['slopes']): Room {
	return { ...rectangleRoom(), elements: [], slopes };
}

function area(points: readonly { x: number; y: number }[]): number {
	let sum = 0;
	points.forEach((p, i) => {
		const q = points[(i + 1) % points.length]!;
		sum += p.x * q.y - q.x * p.y;
	});
	return Math.abs(sum) / 2;
}

describe('slopes in open air', () => {
	const slope = [{ id: 's', wall: 1, kneeHeight: 1000, angle: 45 }];

	it('are neither hatched nor listed for a balcony, terrace or garden, but kept for a conservatory', () => {
		for (const type of ['balcony', 'terrace', 'garden'] as const) {
			const open = { ...room(slope), type };
			expect(planSlopes(open)).toEqual([]);
			expect(hasSlopes(open)).toBe(false);
			expect(slopeSummary(ctx(), open)).toBeUndefined();
		}
		const glass = { ...room(slope), type: 'winterGarden' as const };
		expect(planSlopes(glass).length).toBeGreaterThan(0);
		expect(hasSlopes(glass)).not.toBe(false);
	});
});

describe('plan slopes', () => {
	it('hatches only the section and draws cheeks at its ends', () => {
		const [shape] = planSlopes(
			room([{ id: 's', wall: 1, kneeHeight: 1000, angle: 45, from: 1000, to: 3000 }])
		);
		expect(shape!.run).toBeCloseTo(1500);
		expect(shape!.pieces).toHaveLength(1);
		expect(area(shape!.pieces[0]!)).toBeCloseTo(2000 * 1500);
		expect(shape!.cheeks).toHaveLength(2);
	});

	it('keeps the whole wall for a slope without a section and draws no cheeks', () => {
		const [shape] = planSlopes(room([{ id: 's', wall: 1, kneeHeight: 1000, angle: 45 }]));
		expect(shape!.cheeks).toHaveLength(0);
		expect(shape!.pieces).toHaveLength(1);
		expect(shape!.span).toEqual({ from: 0, to: 4000 });
	});

	it('leaves a gap for a dormer and outlines it', () => {
		const [shape] = planSlopes(
			room([
				{
					id: 's',
					wall: 1,
					kneeHeight: 1000,
					angle: 45,
					dormers: [{ id: 'd', from: 1000, to: 2000, height: 1500 }]
				}
			])
		);
		expect(shape!.pieces).toHaveLength(3);
		expect(shape!.pieces.map((piece) => Math.round(area(piece))).sort()).toContain(1000 * 1000);
		expect(shape!.dormers).toHaveLength(1);
		expect(shape!.dormers[0]!.cut).toBe(false);
		expect(shape!.standing.length).toBeGreaterThan(0);
	});

	it('lists section, depth, angle and dormers in the room summary', () => {
		const sloped = room([
			{
				id: 's',
				wall: 1,
				kneeHeight: 1000,
				angle: 45,
				from: 500,
				to: 3500,
				dormers: [{ id: 'd', from: 1000, to: 2000, height: 2000 }]
			}
		]);
		const de = slopeSummary(ctx('de'), sloped)!;
		expect(de).toContain('Abschnitt 500 bis 3500 mm');
		expect(de).toContain('volle Höhe ab 1500 mm');
		expect(de).toContain('Gauben: 1000 bis 2000 mm, Höhe 2000 mm');
		expect(slopeSummary(ctx('en'), sloped)).toContain('dormers: 1000 to 2000 mm, height 2000 mm');
	});

	it('adds the dormer legend entry only when a dormer or cut exists', () => {
		const plain = room([{ id: 's', wall: 1, kneeHeight: 1000, angle: 45 }]);
		const dormer = room([
			{
				id: 's',
				wall: 1,
				kneeHeight: 1000,
				angle: 45,
				dormers: [{ id: 'd', from: 1000, to: 2000, height: 2000 }]
			}
		]);
		expect(hasSlopes(room(undefined))).toBe(false);
		expect(hasSlopes(plain)).toEqual({ dormers: false });
		expect(slopeLegend([plain, dormer])).toEqual({ dormers: true });
		const base = planLegend(ctx(), false, hasSlopes(plain)).length;
		expect(planLegend(ctx(), false, hasSlopes(dormer)).length).toBe(base + 1);
		expect(planLegend(ctx(), false, false).length).toBe(base - 2);
	});

	it('labels every slope section of a wall, not only the first', () => {
		const sectioned = room([
			{ id: 'a', wall: 1, kneeHeight: 1000, angle: 45, from: 0, to: 1500 },
			{ id: 'b', wall: 1, kneeHeight: 700, angle: 30, from: 2500, to: 4000 }
		]);
		const target = walls(sectioned.polygon)[0]!;
		const labels = wallSlopeLabels(sectioned, target);
		expect(labels.map((label) => label.slope.id)).toEqual(['a', 'b']);
		expect(labels.map((label) => label.along)).toEqual([750, 3250]);
	});

	it('hatches in a stable grid', () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 },
			{ x: 0, y: 100 }
		];
		expect(zoneHatch(square, 10).length).toBeGreaterThan(5);
	});

	it('renders a pdf with section, dormer and roof window', async () => {
		const project = furnishedProject();
		const target = project.rooms.find((candidate) => candidate.id === 'room-rect')!;
		target.slopes = [
			{
				id: 's1',
				wall: 1,
				kneeHeight: 1000,
				angle: 45,
				from: 500,
				to: 3500,
				dormers: [{ id: 'd1', from: 1500, to: 2500, height: 2300 }]
			}
		];
		target.elements.push({
			id: 'rw1',
			kind: 'roofWindow',
			status: 'existing',
			wall: 1,
			offset: 2800,
			width: 600,
			length: 900,
			elevation: 1100
		});
		for (const language of ['de', 'en'] as const) {
			const result = await buildPdf({ project, roomIds: ['room-rect'], language, fonts });
			const doc = await PDFDocument.load(result.bytes);
			expect(doc.getPageCount()).toBe(result.pageCount);
		}
	});
});
