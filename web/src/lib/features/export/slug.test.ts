import { describe, expect, it } from 'vitest';
import { dateStamp, exportFileName, slugify } from './slug.ts';

describe('slugify', () => {
	it('transliterates umlauts and sharp s', () => {
		expect(slugify('Wohnung Müller-Köhler Größe')).toBe('wohnung-mueller-koehler-groesse');
		expect(slugify('Äpfel & Öl')).toBe('aepfel-oel');
	});

	it('removes accents and symbols', () => {
		expect(slugify('Café  «Zürich» / 3. Stock')).toBe('cafe-zuerich-3-stock');
		expect(slugify('  --Haus--  ')).toBe('haus');
	});

	it('falls back for empty or non-latin names', () => {
		expect(slugify('')).toBe('projekt');
		expect(slugify('東京')).toBe('projekt');
		expect(slugify('!!!', 'x')).toBe('x');
	});

	it('limits the length without a trailing dash', () => {
		const slug = slugify('a'.repeat(47) + ' bbbbbb');
		expect(slug.length).toBeLessThanOrEqual(48);
		expect(slug.endsWith('-')).toBe(false);
	});
});

describe('file names', () => {
	it('formats the date as YYYY-MM-DD in local time', () => {
		expect(dateStamp(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
	});

	it('builds roomx-<slug>-<date>.<ext>', () => {
		expect(exportFileName('Wohnung Süd', 'pdf', new Date(2026, 9, 13))).toBe(
			'roomx-wohnung-sued-2026-10-13.pdf'
		);
	});
});
