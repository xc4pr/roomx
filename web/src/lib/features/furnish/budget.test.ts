import { describe, expect, it } from 'vitest';
import { sampleLookup } from '#lib/core/fixtures.ts';
import type { Item } from '#lib/core/schema.ts';
import { budgetState, nextVariantName, variantTotal } from './budget.ts';

function item(id: string, partial: Partial<Item> = {}): Item {
	return {
		id,
		roomId: 'r',
		name: id,
		category: 'table',
		dims: { w: 100, d: 100, h: 100 },
		x: 0,
		y: 0,
		rotation: 0,
		elevation: 0,
		...partial
	};
}

describe('variantTotal', () => {
	it('sums item prices, falls back to catalogue prices and counts unpriced items', () => {
		const total = variantTotal(
			[item('a', { priceChf: 100.5 }), item('b', { catalogId: 'generic-desk-160x80' }), item('c')],
			sampleLookup
		);
		expect(total.sum).toBe(399.5);
		expect(total.unpriced).toBe(1);
		expect(total.estimated).toBe(true);
		expect(total.count).toBe(3);
	});

	it('is exact when only own prices are used', () => {
		expect(variantTotal([item('a', { priceChf: 10 })], sampleLookup).estimated).toBe(false);
	});
});

describe('budgetState', () => {
	it('has no budget when unset or zero', () => {
		expect(budgetState(100, undefined).budget).toBeUndefined();
		expect(budgetState(100, 0).over).toBe(false);
	});
	it('flags overspending', () => {
		expect(budgetState(1200, 1000)).toMatchObject({ over: true, ratio: 1, remaining: -200 });
		expect(budgetState(250, 1000)).toMatchObject({ over: false, ratio: 0.25, remaining: 750 });
	});
});

describe('nextVariantName', () => {
	it('uses the next free letter', () => {
		expect(nextVariantName([])).toBe('A');
		expect(nextVariantName([{ name: 'A' }, { name: 'b' }])).toBe('C');
		expect(nextVariantName([{ name: 'A' }, { name: 'C' }])).toBe('B');
	});
});
