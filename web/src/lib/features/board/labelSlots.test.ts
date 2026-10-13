import { describe, expect, it } from 'vitest';
import { pickLabelAlong } from './labelSlots.ts';

describe('pickLabelAlong', () => {
	it('uses the middle when it is free', () => {
		expect(pickLabelAlong(4000, [], 600)).toBe(2000);
		expect(pickLabelAlong(4000, [{ from: 0, to: 800 }], 600)).toBe(2000);
	});

	it('moves to the nearest free spot beside an element', () => {
		const pos = pickLabelAlong(4000, [{ from: 1800, to: 2200 }], 600);
		expect(pos).not.toBeNull();
		const centre = pos ?? 0;
		expect(centre + 300 <= 1800 || centre - 300 >= 2200).toBe(true);
		expect(Math.abs(centre - 2000)).toBeLessThanOrEqual(700);
	});

	it('hides the label when nothing fits', () => {
		expect(pickLabelAlong(1000, [{ from: 100, to: 900 }], 600)).toBeNull();
		expect(pickLabelAlong(500, [], 600)).toBeNull();
	});
});
