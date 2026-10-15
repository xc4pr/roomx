import { describe, expect, it } from 'vitest';
import { wallLinks } from '#lib/core/adjacency.ts';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import type { Vec } from '#lib/core/geometry.ts';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import type { BoardPos } from '#lib/core/schema.ts';
import { boardPolygon } from './rooms.ts';
import { magnetRange, magnetSnap, slideDecay, type MagnetNeighbour } from './magnet.ts';

const rect = (x: number, y: number, w: number, h: number): Vec[] => [
	{ x, y },
	{ x: x + w, y },
	{ x: x + w, y: y + h },
	{ x, y: y + h }
];

const base: MagnetNeighbour = { id: 'base', polygon: rect(0, 0, 4000, 3000) };

describe('magnetRange', () => {
	it('is at least 300 mm and grows when zoomed far out', () => {
		expect(magnetRange(0.15)).toBe(300);
		expect(magnetRange(0.05)).toBeCloseTo(560);
	});
});

describe('magnetSnap', () => {
	it('does nothing outside the capture range', () => {
		const result = magnetSnap(rect(0, 3600, 2000, 2000), [base], { range: 300 });
		expect(result.kind).toBe('none');
		expect(result.delta).toEqual({ x: 0, y: 0 });
		expect(result.held).toEqual([]);
	});

	it('docks to the edge at exactly one wall thickness and slides freely along it', () => {
		const result = magnetSnap(rect(700, 3350, 2000, 2000), [base], { range: 300 });
		expect(result.kind).toBe('edge');
		expect(result.delta.x).toBeCloseTo(0);
		expect(result.delta.y).toBeCloseTo(WALL_THICKNESS - 350);
		const contact = result.contacts[0];
		expect(contact.kind).toBe('wall');
		expect(contact.a.y).toBeCloseTo(3000 + WALL_THICKNESS);
		expect(Math.min(contact.a.x, contact.b.x)).toBeCloseTo(700);
		expect(Math.max(contact.a.x, contact.b.x)).toBeCloseTo(2700);
	});

	it('also pulls a room in that overlaps the wall zone', () => {
		const result = magnetSnap(rect(700, 2900, 2000, 2000), [base], { range: 300 });
		expect(result.delta.y).toBeCloseTo(WALL_THICKNESS + 100);
	});

	it('needs a real overlap along the wall', () => {
		expect(magnetSnap(rect(3950, 3350, 2000, 2000), [base], { range: 300 }).kind).toBe('none');
	});

	it('does not dock a room that sits inside another one', () => {
		const result = magnetSnap(rect(500, 1000, 1000, 1000), [base], { range: 300 });
		expect(result.kind).toBe('none');
	});

	it('prefers the edge and adds the flush corner only along that edge', () => {
		const result = magnetSnap(rect(-80, 3350, 2000, 2000), [base], { range: 300 });
		expect(result.kind).toBe('corner');
		expect(result.delta.x).toBeCloseTo(80);
		expect(result.delta.y).toBeCloseTo(WALL_THICKNESS - 350);
		expect(result.contacts.map((contact) => contact.kind)).toEqual(['wall', 'flush']);
	});

	it('never docks on a corner alone', () => {
		const result = magnetSnap(rect(-2100, 3100, 2000, 2000), [base], { range: 300 });
		expect(result.kind).toBe('none');
	});

	it('keeps the edge only when the flush position is out of range', () => {
		const result = magnetSnap(rect(500, 3350, 2000, 2000), [base], { range: 300 });
		expect(result.kind).toBe('edge');
		expect(result.delta.x).toBeCloseTo(0);
	});

	it('aligns the far sides when the moving room is the wider one', () => {
		const result = magnetSnap(rect(-1900, 3350, 5800, 2000), [base], { range: 300 });
		expect(result.kind).toBe('corner');
		expect(result.delta.x).toBeCloseTo(100);
	});

	it('docks against two neighbours at once and satisfies both walls', () => {
		const left: MagnetNeighbour = { id: 'left', polygon: rect(-3000, 3200, 2000, 2000) };
		const result = magnetSnap(rect(-760, 3250, 2000, 2000), [base, left], { range: 300 });
		expect(result.kind).toBe('corner');
		expect(result.delta.x).toBeCloseTo(-90);
		expect(result.delta.y).toBeCloseTo(-100);
		expect(result.contacts.map((contact) => contact.kind)).toEqual(['wall', 'wall']);
		expect(new Set(result.contacts.map((contact) => contact.otherId))).toEqual(
			new Set(['base', 'left'])
		);
	});

	it('picks the nearer of two parallel neighbours', () => {
		const high: MagnetNeighbour = { id: 'high', polygon: rect(0, 3900, 4000, 1000) };
		const result = magnetSnap(rect(400, 3200, 2000, 300), [base, high], { range: 300 });
		expect(result.delta.y).toBeCloseTo(WALL_THICKNESS - 200);
		expect(result.contacts[0].otherId).toBe('base');
	});

	it('sticks until the room is pulled clearly away, then lets go', () => {
		const docked = magnetSnap(rect(700, 3350, 2000, 2000), [base], { range: 300 });
		const pulled = (y: number, held: readonly string[]) =>
			magnetSnap(rect(700, y, 2000, 2000), [base], { range: 300, held });
		expect(pulled(3700, []).kind).toBe('none');
		const still = pulled(3700, docked.held);
		expect(still.kind).toBe('edge');
		expect(still.delta.y).toBeCloseTo(WALL_THICKNESS - 700);
		expect(pulled(3000 + WALL_THICKNESS + 590, docked.held).kind).toBe('edge');
		expect(pulled(3000 + WALL_THICKNESS + 640, docked.held).kind).toBe('none');
	});

	it('forgets a held contact once the room slides past the end of the wall', () => {
		const docked = magnetSnap(rect(700, 3350, 2000, 2000), [base], { range: 300 });
		const away = magnetSnap(rect(4200, 3350, 2000, 2000), [base], {
			range: 300,
			held: docked.held
		});
		expect(away.kind).toBe('none');
	});

	it('creates real wall links for unrotated, quarter-turned and tilted rooms', () => {
		for (const rot of [0, 90, 30]) {
			const anchor = { ...rectangleRoom('a', 4000, 3000), elements: [] };
			anchor.boardPos = { x: 0, y: 0, rot };
			const mover = { ...rectangleRoom('b', 3000, 2500), elements: [] };
			const rad = (rot * Math.PI) / 180;
			const start: BoardPos = {
				x: 600 * Math.cos(rad) - 3230 * Math.sin(rad),
				y: 600 * Math.sin(rad) + 3230 * Math.cos(rad),
				rot
			};
			mover.boardPos = start;
			const snap = magnetSnap(
				boardPolygon(mover),
				[{ id: anchor.id, polygon: boardPolygon(anchor) }],
				{ range: 300 }
			);
			expect(snap.kind).not.toBe('none');
			mover.boardPos = {
				...start,
				x: Math.round(start.x + snap.delta.x),
				y: Math.round(start.y + snap.delta.y)
			};
			const links = wallLinks([anchor, mover]);
			expect(links.some((link) => link.roomId === 'a' && link.otherRoomId === 'b')).toBe(true);
		}
	});
});

describe('slideDecay', () => {
	it('shrinks the offset smoothly and snaps to zero', () => {
		const first = slideDecay({ x: 200, y: -100 }, 0.05);
		expect(first.x).toBeGreaterThan(0);
		expect(first.x).toBeLessThan(200);
		expect(first.y).toBeLessThan(0);
		expect(slideDecay(first, 0.4)).toEqual({ x: 0, y: 0 });
	});
});
