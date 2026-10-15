import { describe, expect, it } from 'vitest';
import { CatalogEntrySchema, LookSchema, type CatalogEntry } from '#lib/core/catalog.ts';
import type { Item } from '#lib/core/schema.ts';
import { furnitureSpec } from '#lib/three/types.ts';
import { catalog } from '../index.ts';
import { entryLooks, lookKey, seriesLooks, withLooks, withSeriesLooks } from './looks.ts';

const entry = (patch: Partial<CatalogEntry> = {}): CatalogEntry => ({
	id: 'test-dresser-80x48x100',
	brand: 'TEST',
	series: 'ALPHA',
	name: { de: 'ALPHA Kommode', en: 'ALPHA chest' },
	category: 'dresser',
	model: 'dresser',
	dims: { w: 800, d: 480, h: 1000 },
	colors: ['#ffffff'],
	mount: 'floor',
	power: 0,
	clearance: { front: 900, side: 0 },
	verified: false,
	...patch
});

const item = (patch: Partial<Item> = {}): Item =>
	({
		id: 'i1',
		roomId: 'r1',
		name: 'Kommode',
		category: 'dresser',
		x: 0,
		y: 0,
		rotation: 0,
		dims: { w: 800, d: 480, h: 1000 },
		elevation: 0,
		catalogId: 'test-dresser-80x48x100',
		...patch
	}) as Item;

describe('look', () => {
	it('rejects unknown fields and out-of-range values', () => {
		expect(
			LookSchema.safeParse({ handle: 'recessTop', rows: [{ kind: 'drawer', cols: 1 }] }).success
		).toBe(true);
		expect(LookSchema.safeParse({ handel: 'bar' }).success).toBe(false);
		expect(LookSchema.safeParse({ rows: [{ kind: 'drawer', cols: 0 }] }).success).toBe(false);
		expect(LookSchema.safeParse({ baseHeight: 900 }).success).toBe(false);
		expect(LookSchema.safeParse({ frameColor: 'chrome' }).success).toBe(false);
	});

	it('describes tables, seating, beds, mirrors and lamps', () => {
		expect(
			LookSchema.safeParse({
				legs: 'cantilever',
				drawers: 2,
				shelf: true,
				arms: 'rolled',
				back: 'wing',
				cushions: 3,
				headboard: 'upholstered',
				footboard: false,
				shape: 'round',
				border: 'thin',
				shade: 'drum',
				shadeColor: '#efe6d2',
				stem: 'arc'
			}).success
		).toBe(true);
		expect(LookSchema.safeParse({ legs: 'six' }).success).toBe(false);
		expect(LookSchema.safeParse({ drawers: 9 }).success).toBe(false);
		expect(LookSchema.safeParse({ cushions: 0 }).success).toBe(false);
	});

	it('merges series look, own look and override in that order', () => {
		const series = { [lookKey(entry())]: { base: 'plinth', handle: 'bar', top: 'flush' } as const };
		const overrides = { 'test-dresser-80x48x100': { handle: 'recessTop' } as const };
		const [merged] = withLooks([entry({ look: { top: 'overhang' } })], series, overrides);
		expect(merged.look).toEqual({ base: 'plinth', handle: 'recessTop', top: 'overhang' });
	});

	it('leaves entries without a matching look untouched', () => {
		const plain = entry({ series: undefined });
		const series = { [lookKey(entry())]: { base: 'legs' } as const };
		expect(withLooks([plain], series, {})[0]).toBe(plain);
		expect(withLooks([entry({ model: 'nightstand' })], series, {})[0].look).toBeUndefined();
	});

	it('every look in the catalog data is valid and points at existing entries', () => {
		const ids = new Set(catalog.map((e) => e.id));
		for (const id of Object.keys(entryLooks)) expect(ids.has(id), id).toBe(true);
		const keys = new Set(catalog.map(lookKey));
		for (const key of Object.keys(seriesLooks)) expect(keys.has(key), key).toBe(true);
		for (const e of catalog) expect(CatalogEntrySchema.safeParse(e).success, e.id).toBe(true);
	});

	it('reaches the builder only while the item keeps the catalog model', () => {
		const looked = entry({ look: { handle: 'knob' } });
		expect(furnitureSpec(item(), looked).look).toEqual({ handle: 'knob' });
		expect(furnitureSpec(item({ model: 'sideboard' }), looked).look).toBeUndefined();
		expect(furnitureSpec(item(), entry()).look).toBeUndefined();
	});
});

describe('series looks for the full catalog', () => {
	const series = {
		'TEST|ALPHA|dresser': {
			base: 'plinth' as const,
			handle: 'knob' as const,
			rows: [{ kind: 'drawer' as const, cols: 1 }]
		}
	};

	it('keeps the shared features and leaves the fronts to the size', () => {
		const [out] = withSeriesLooks([entry()], series);
		expect(out.look).toEqual({ base: 'plinth', handle: 'knob' });
	});

	it('leaves entries of other series and models unchanged', () => {
		const other = entry({ series: 'BETA' });
		const shelf = entry({ model: 'shelf' });
		expect(withSeriesLooks([other, shelf], series)).toEqual([other, shelf]);
	});
});
