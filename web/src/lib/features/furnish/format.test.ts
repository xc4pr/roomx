import { describe, expect, it } from 'vitest';
import { formatMonthYear, parseCount, parseDegrees, parseLinkInput, parsePrice } from './format.ts';

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

describe('parseLinkInput', () => {
	it('accepts http and https links', () => {
		expect(parseLinkInput('https://www.ikea.com/ch/de/p/1')).toEqual({
			kind: 'ok',
			url: 'https://www.ikea.com/ch/de/p/1'
		});
		expect(parseLinkInput(' http://example.ch/a ')).toEqual({
			kind: 'ok',
			url: 'http://example.ch/a'
		});
	});

	it('adds https when the scheme is missing', () => {
		expect(parseLinkInput('www.ikea.com/ch/de/p/1')).toEqual({
			kind: 'ok',
			url: 'https://www.ikea.com/ch/de/p/1'
		});
	});

	it('refuses other schemes and nonsense', () => {
		for (const text of [
			'javascript:alert(1)',
			'data:text/html,x',
			'ftp://example.ch',
			'nonsense'
		]) {
			expect(parseLinkInput(text), text).toEqual({ kind: 'invalid' });
		}
	});

	it('treats an empty field as no link', () => {
		expect(parseLinkInput('')).toEqual({ kind: 'empty' });
		expect(parseLinkInput('   ')).toEqual({ kind: 'empty' });
	});
});

describe('formatMonthYear', () => {
	it('writes the month in the language of the app', () => {
		expect(formatMonthYear('2026-10', 'de')).toBe('Oktober 2026');
		expect(formatMonthYear('2026-10', 'en')).toBe('October 2026');
		expect(formatMonthYear('broken', 'de')).toBe('broken');
	});
});
