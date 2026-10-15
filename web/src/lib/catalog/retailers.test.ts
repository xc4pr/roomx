import { describe, expect, it } from 'vitest';
import { catalogRetailers, RETAILERS } from './retailers.ts';

const entry = (brand: string) => ({ brand });

describe('catalogRetailers', () => {
	it('lists unique brands without Generic, IKEA first, rest alphabetical', () => {
		const entries = ['Generic', 'zeta', 'Beta', 'IKEA', 'alpha', 'Beta', 'Generic', 'IKEA'].map(
			entry
		);
		expect(catalogRetailers(entries)).toEqual(['IKEA', 'alpha', 'Beta', 'zeta']);
	});

	it('works without IKEA and with an empty catalog', () => {
		expect(catalogRetailers([entry('Generic'), entry('b'), entry('A')])).toEqual(['A', 'b']);
		expect(catalogRetailers([])).toEqual([]);
	});

	it('derives the real list from the catalog', () => {
		expect(RETAILERS).not.toContain('Generic');
		expect(RETAILERS[0]).toBe('IKEA');
		expect(new Set(RETAILERS).size).toBe(RETAILERS.length);
	});
});
