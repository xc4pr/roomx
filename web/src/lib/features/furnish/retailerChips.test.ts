import { describe, expect, it } from 'vitest';
import { retailerChips, toggleRetailer } from './retailerChips.ts';

const LIST = ['AAA', 'BBB', 'CCC'];

describe('retailerChips', () => {
	it('shows catalog retailers, none selected without saved values', () => {
		expect(retailerChips(LIST, undefined)).toEqual(
			LIST.map((label) => ({ label, selected: false }))
		);
	});

	it('keeps old saved retailers as extra selected chips', () => {
		const chips = retailerChips(LIST, ['Old', 'old', 'AAA']);
		expect(chips.map((chip) => chip.label)).toEqual([...LIST, 'Old']);
		expect(chips.filter((chip) => chip.selected).map((chip) => chip.label)).toEqual(['AAA', 'Old']);
	});

	it('matches case-insensitively without duplicates', () => {
		const chips = retailerChips(LIST, ['bbb']);
		expect(chips).toHaveLength(3);
		expect(chips[1]).toEqual({ label: 'BBB', selected: true });
	});
});

describe('toggleRetailer', () => {
	it('adds when missing', () => {
		expect(toggleRetailer(['x'], 'AAA')).toEqual(['x', 'AAA']);
		expect(toggleRetailer(undefined, 'AAA')).toEqual(['AAA']);
	});

	it('removes all spellings', () => {
		expect(toggleRetailer(['bbb', 'BBB', 'x'], 'BBB')).toEqual(['x']);
	});
});
