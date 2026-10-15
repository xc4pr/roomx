import { describe, expect, it } from 'vitest';
import { gridColumns, visibleRange } from './virtual.ts';

describe('gridColumns', () => {
	it('fits as many minimum-width columns as possible', () => {
		expect(gridColumns(0, 150, 8)).toBe(1);
		expect(gridColumns(150, 150, 8)).toBe(1);
		expect(gridColumns(316, 150, 8)).toBe(2);
		expect(gridColumns(480, 150, 8)).toBe(3);
	});
});

describe('visibleRange', () => {
	const base = { count: 8000, columns: 2, rowPitch: 300, viewport: 900, buffer: 2 };

	it('starts at the top with only the buffer below', () => {
		const range = visibleRange({ ...base, scrollTop: 0 });
		expect(range.start).toBe(0);
		expect(range.offset).toBe(0);
		expect(range.end).toBe((Math.ceil(900 / 300) + 2) * 2);
		expect(range.totalRows).toBe(4000);
	});

	it('keeps a buffer of rows around the viewport', () => {
		const range = visibleRange({ ...base, scrollTop: 30000 });
		expect(range.start).toBe((100 - 2) * 2);
		expect(range.offset).toBe(98 * 300);
		expect(range.end).toBe((100 + 3 + 2) * 2);
	});

	it('clamps at the end and handles negative scroll and empty lists', () => {
		const end = visibleRange({ ...base, scrollTop: 10_000_000 });
		expect(end.end).toBe(8000);
		expect(end.start).toBeLessThanOrEqual(8000);
		expect(visibleRange({ ...base, scrollTop: -500 }).start).toBe(0);
		const empty = visibleRange({ ...base, count: 0, scrollTop: 0 });
		expect([empty.start, empty.end, empty.totalRows]).toEqual([0, 0, 0]);
	});

	it('renders a small, bounded number of entries for 8000', () => {
		for (const scrollTop of [0, 5000, 250000, 1_190_000]) {
			const range = visibleRange({ ...base, scrollTop });
			expect(range.end - range.start).toBeLessThanOrEqual(16);
		}
	});
});
