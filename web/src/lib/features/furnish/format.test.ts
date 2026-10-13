import { describe, expect, it } from 'vitest';
import { parseCount, parseDegrees, parsePrice, safeUrl } from './format.ts';

describe('parsePrice', () => {
	it('accepts comma and point', () => {
		expect(parsePrice('199,90')).toBe(199.9);
		expect(parsePrice(' 12.5 CHF')).toBe(12.5);
		expect(parsePrice('')).toBeUndefined();
		expect(parsePrice('abc')).toBeUndefined();
	});
});

describe('parseCount and parseDegrees', () => {
	it('parses numbers', () => {
		expect(parseCount('3')).toBe(3);
		expect(parseCount('-1')).toBeUndefined();
		expect(parseDegrees('45,5°')).toBe(45.5);
		expect(parseDegrees('x')).toBeUndefined();
	});
});

describe('safeUrl', () => {
	it('only lets http and https through', () => {
		expect(safeUrl('https://www.ikea.com/ch/de/p/1')).toBe('https://www.ikea.com/ch/de/p/1');
		expect(safeUrl('javascript:alert(1)')).toBeUndefined();
		expect(safeUrl('nonsense')).toBeUndefined();
		expect(safeUrl(undefined)).toBeUndefined();
	});
});
