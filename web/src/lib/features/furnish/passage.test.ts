import { describe, expect, it } from 'vitest';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import type { Item } from '#lib/core/schema.ts';
import { clearances, narrowPassages, shapeDistance } from './passage.ts';

const room = { ...rectangleRoom(), elements: [] };

function item(id: string, partial: Partial<Item> = {}): Item {
	return {
		id,
		roomId: room.id,
		name: id,
		category: 'sideboard',
		mount: 'floor',
		dims: { w: 1000, d: 500, h: 800 },
		x: 2000,
		y: 1500,
		rotation: 0,
		elevation: 0,
		...partial
	};
}

describe('shapeDistance', () => {
	it('measures the gap between parallel edges', () => {
		const a = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 },
			{ x: 0, y: 100 }
		];
		const b = a.map((p) => ({ x: p.x + 250, y: p.y }));
		expect(shapeDistance(a, b).distance).toBe(150);
	});
});

describe('narrowPassages', () => {
	it('reports a narrow gap between two long pieces', () => {
		const a = item('a', { x: 2000, y: 1000 });
		const b = item('b', { x: 2000, y: 1000 + 500 + 450 });
		const found = narrowPassages(room, [a, b]);
		expect(found.some((p) => p.itemIds.length === 2 && p.gap === 450)).toBe(true);
	});

	it('ignores wide passages, joints and chairs', () => {
		const a = item('a', { x: 2000, y: 1000 });
		expect(
			narrowPassages(room, [a, item('b', { x: 2000, y: 2300 })]).filter(
				(p) => p.itemIds.length === 2
			)
		).toEqual([]);
		expect(
			narrowPassages(room, [a, item('b', { x: 2000, y: 1530 })]).filter(
				(p) => p.itemIds.length === 2
			)
		).toEqual([]);
		const chair = item('c', {
			x: 2000,
			y: 1800,
			category: 'chair',
			dims: { w: 450, d: 450, h: 900 }
		});
		expect(narrowPassages(room, [a, chair]).filter((p) => p.itemIds.length === 2)).toEqual([]);
	});

	it('reports a narrow gap to a wall', () => {
		const a = item('a', { x: 2000, y: 250 + 300 });
		const found = narrowPassages(room, [a]);
		expect(found.some((p) => p.itemIds.length === 1 && p.gap === 300)).toBe(true);
	});

	it('ignores low or stacked things', () => {
		const rug = item('rug', { category: 'rug', dims: { w: 1000, d: 500, h: 10 } });
		const stacked = item('s', { x: 2000, y: 1950, onItemId: 'a', elevation: 800 });
		expect(
			narrowPassages(room, [item('a', { x: 2000, y: 1000 }), rug, stacked]).filter(
				(p) => p.itemIds.length === 2
			)
		).toEqual([]);
	});
});

describe('clearances', () => {
	it('measures free distance to walls and neighbours', () => {
		const target = item('t', { x: 2000, y: 1500 });
		const neighbour = item('n', { x: 3300, y: 1500, dims: { w: 400, d: 500, h: 800 } });
		const result = clearances(room.polygon, target, [target, neighbour]);
		const by = Object.fromEntries(result.map((entry) => [entry.side, entry.distance]));
		expect(by).toMatchObject({ front: 1250, back: 1250, left: 1500, right: 600 });
	});

	it('leaves out flush sides', () => {
		const target = item('t', { x: 2000, y: 250 });
		expect(clearances(room.polygon, target, [target]).map((c) => c.side)).not.toContain('back');
	});
});
