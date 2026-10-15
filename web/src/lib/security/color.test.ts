import { describe, expect, it } from 'vitest';
import { safeColor } from './color.ts';

describe('safeColor', () => {
	it('keeps plain colour values', () => {
		expect(safeColor('#d8c3a5')).toBe('#d8c3a5');
		expect(safeColor(' #FFF ')).toBe('#FFF');
		expect(safeColor('oak')).toBe('oak');
		expect(safeColor('rgb(10, 20, 30)')).toBe('rgb(10, 20, 30)');
		expect(safeColor('hsla(120 50% 50% / 0.5)')).toBe('hsla(120 50% 50% / 0.5)');
	});

	it('drops values that could smuggle more CSS into a style attribute', () => {
		expect(safeColor('red; background-image: url(https://evil.example/x)')).toBeUndefined();
		expect(safeColor('url(https://evil.example/x)')).toBeUndefined();
		expect(safeColor('red" onload="x')).toBeUndefined();
		expect(safeColor('var(--x)')).toBeUndefined();
		expect(safeColor('Eiche natur')).toBeUndefined();
		expect(safeColor(5)).toBeUndefined();
		expect(safeColor('a'.repeat(100))).toBeUndefined();
	});
});
