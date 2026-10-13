import { describe, expect, it } from 'vitest';
import { sampleProject } from '#lib/core/fixtures.ts';
import type { Item, Project } from '#lib/core/schema.ts';
import { diffScene, signatureOf } from './diff.ts';

function item(partial: Partial<Item> & Pick<Item, 'id'>): Item {
	return {
		roomId: 'room-rect',
		name: partial.id,
		category: 'other',
		dims: { w: 600, d: 400, h: 800 },
		x: 1000,
		y: 1000,
		rotation: 0,
		elevation: 0,
		...partial
	};
}

function projectWith(items: Item[], patch: Partial<Project> = {}): Project {
	const base = sampleProject();
	return {
		...base,
		activeVariantId: 'v1',
		variants: [{ id: 'v1', name: 'A', source: 'user', items, suggestions: [] }],
		...patch
	};
}

function sig(project: Project, roomIds = ['room-rect']) {
	return signatureOf({ project, roomIds });
}

describe('diffScene', () => {
	const base = projectWith([item({ id: 'a' }), item({ id: 'b', x: 2000 })]);

	it('rebuilds without a previous scene', () => {
		expect(diffScene(null, sig(base)).kind).toBe('rebuild');
	});

	it('reports nothing for an identical project', () => {
		expect(diffScene(sig(base), sig(structuredClone(base))).kind).toBe('none');
	});

	it('turns pure transforms into moves', () => {
		const moved = projectWith([
			item({ id: 'a', x: 1500, rotation: 90 }),
			item({ id: 'b', x: 2000 })
		]);
		const change = diffScene(sig(base), sig(moved));
		expect(change.kind).toBe('incremental');
		if (change.kind !== 'incremental') return;
		expect(change.moves).toHaveLength(1);
		expect(change.moves[0].id).toBe('a');
		expect(change.moves[0].transform).toMatchObject({ x: 1500, rotation: 90, onItemId: null });
		expect(change.added).toHaveLength(0);
	});

	it('detects stacking changes as moves', () => {
		const stacked = projectWith([
			item({ id: 'a' }),
			item({ id: 'b', x: 2000, onItemId: 'a', elevation: 800 })
		]);
		const change = diffScene(sig(base), sig(stacked));
		expect(change.kind).toBe('incremental');
		if (change.kind === 'incremental') {
			expect(change.moves[0].transform).toMatchObject({ onItemId: 'a', elevation: 800 });
		}
	});

	it('handles a few added and removed items incrementally', () => {
		const next = projectWith([item({ id: 'b', x: 2000 }), item({ id: 'c' })]);
		const change = diffScene(sig(base), sig(next));
		expect(change.kind).toBe('incremental');
		if (change.kind !== 'incremental') return;
		expect(change.added.map((entry) => entry.id)).toEqual(['c']);
		expect(change.removed).toEqual(['a']);
	});

	it('rebuilds when the look of an item changes', () => {
		const recoloured = projectWith([
			item({ id: 'a', color: '#ff0000' }),
			item({ id: 'b', x: 2000 })
		]);
		expect(diffScene(sig(base), sig(recoloured)).kind).toBe('rebuild');
	});

	it('rebuilds when a room changes or the variant switches', () => {
		const rooms = base.rooms.map((room, index) => (index === 0 ? { ...room, height: 2700 } : room));
		expect(diffScene(sig(base), sig({ ...base, rooms })).kind).toBe('rebuild');
		expect(diffScene(sig(base), sig({ ...base, activeVariantId: 'other' })).kind).toBe('rebuild');
		expect(diffScene(sig(base), sig(base, ['room-rect', 'room-l'])).kind).toBe('rebuild');
	});

	it('rebuilds for a large batch of new items', () => {
		const many = Array.from({ length: 12 }, (_, index) => item({ id: `n${index}` }));
		const change = diffScene(sig(base), sig(projectWith(many)));
		expect(change.kind).toBe('rebuild');
	});

	it('ignores items in rooms that are not shown', () => {
		const other = projectWith([item({ id: 'a' }), item({ id: 'far', roomId: 'room-l' })]);
		const change = diffScene(sig(other), sig(projectWith([item({ id: 'a' })])));
		expect(change.kind).toBe('none');
	});
});
