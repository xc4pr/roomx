import { describe, expect, it } from 'vitest';
import { resolvePills, type PillSpec } from './pills.ts';

const pill = (id: string, x: number, y: number, extra: Partial<PillSpec> = {}): PillSpec => ({
	id,
	x,
	y,
	text: '34 cm',
	tone: 'normal',
	...extra
});

describe('resolvePills', () => {
	it('keeps separate pills untouched', () => {
		const result = resolvePills([pill('a', 10, 10), pill('b', 200, 10)]);
		expect(result.map((entry) => entry.y)).toEqual([10, 10]);
	});

	it('slides movable pills out of the way', () => {
		const result = resolvePills([pill('a', 30, 100), pill('b', 30, 104, { slide: true })]);
		expect(result).toHaveLength(2);
		expect(Math.abs(result[1].y - result[0].y)).toBeGreaterThanOrEqual(19);
	});

	it('drops fixed pills that would overlap an earlier one', () => {
		const result = resolvePills([pill('a', 50, 50), pill('b', 55, 52)]);
		expect(result.map((entry) => entry.id)).toEqual(['a']);
	});
});
