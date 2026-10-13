import { describe, expect, it } from 'vitest';
import { planLabel, uprightAngle } from './labels.ts';

const measure = (text: string, size: number) => text.length * size * 0.6;

function plan(text: string, w: number, d: number, rotation = 0, pxPerMm = 0.2) {
	return planLabel({ text, w, d, rotation, pxPerMm, measure });
}

describe('planLabel', () => {
	it('keeps a short name whole', () => {
		expect(plan('Sofa', 2000, 900)?.text).toBe('Sofa');
	});

	it('shortens a long name so that it stays inside the item', () => {
		const result = plan('Schreibtisch 160x80 cm Eiche', 1600, 800, 0, 0.1);
		expect(result?.text.endsWith('…')).toBe(true);
		expect(measure(result?.text ?? '', result?.size ?? 0)).toBeLessThanOrEqual(1600 * 0.1 - 8);
	});

	it('hides the name when the item is too small', () => {
		expect(plan('Sofa', 300, 300, 0, 0.05)).toBeNull();
		expect(plan('Sofa', 2000, 100, 0, 0.1)).toBeNull();
		expect(plan('Schreibtisch', 400, 400, 0, 0.02)).toBeNull();
	});

	it('runs along the long side, upright, for tall narrow items', () => {
		expect(plan('Regal', 400, 2000)?.angle).toBe(-90);
		expect(plan('Regal', 2000, 400)?.angle).toBe(0);
		expect(plan('Regal', 400, 2000, 0)?.text).toBe('Regal');
		expect(plan('Regal', 2000, 400, 90)?.angle).toBe(-90);
		expect(plan('Regal', 2000, 400, 270)?.angle).toBe(-90);
		expect(plan('Regal', 2000, 400, 30)?.angle).toBe(30);
	});

	it('limits the font size by zoom', () => {
		expect(plan('Sofa', 2000, 900, 0, 0.05)?.size).toBeGreaterThanOrEqual(9);
		expect(plan('Sofa', 2000, 900, 0, 1)?.size).toBe(13);
	});

	it('normalises angles into the upright range', () => {
		expect(uprightAngle(180)).toBe(0);
		expect(uprightAngle(135)).toBe(-45);
		expect(uprightAngle(-100)).toBe(80);
	});
});
