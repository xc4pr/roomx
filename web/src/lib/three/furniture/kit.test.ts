import { describe, expect, it } from 'vitest';
import { mat, metalMat } from './kit.ts';
import { CHROME } from './plan.ts';

describe('metalMat', () => {
	it('renders white frames powder-coated, not as grey metal', () => {
		for (const color of ['#f4f4f0', '#ffffff']) {
			expect(metalMat(color)).toBe(mat('plastic', color));
		}
	});

	it('keeps chrome and dark frames metallic', () => {
		for (const color of [CHROME, '#4a4a4a']) {
			expect(metalMat(color)).toBe(mat('metal', color));
		}
		expect(metalMat(CHROME).metalness).toBeGreaterThan(metalMat('#f4f4f0').metalness);
	});
});
