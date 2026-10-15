import { describe, expect, it } from 'vitest';
import { syntheticCatalog } from '../../../../tests/helpers/syntheticCatalog.ts';
import { filterCatalog, widthClassOf } from './filter.ts';

const entries = syntheticCatalog(8000);
const all = { category: 'all', brand: 'all', width: 'all' } as const;

describe('filterCatalog with 8000 entries', () => {
	it('finds one article by number and by name', () => {
		const target = entries[4321];
		expect(
			filterCatalog(entries, { ...all, query: target.articleNo! }, 'de').map((e) => e.id)
		).toEqual([target.id]);
		expect(
			filterCatalog(entries, { ...all, query: `${target.name.en}`.toUpperCase() }, 'en')[0].id
		).toBe(target.id);
	});

	it('stays fast for typing, filters and an empty query', () => {
		filterCatalog(entries, { ...all, query: '' }, 'de');
		const runs = [
			{ ...all, query: 'moebel' },
			{ ...all, query: 'alm 12' },
			{ ...all, query: '', brand: 'JYSK', category: 'table' as const, width: 'wide' as const },
			{ ...all, query: '' }
		];
		for (const filter of runs) {
			const started = performance.now();
			filterCatalog(entries, filter, 'de');
			expect(performance.now() - started).toBeLessThan(50);
		}
	});

	it('filters by width class and keeps verified articles first', () => {
		const wide = filterCatalog(entries, { ...all, query: '', width: 'wide' }, 'de');
		expect(wide.length).toBeGreaterThan(0);
		for (const entry of wide) expect(widthClassOf(entry.dims.w)).toBe('wide');
		const firstUnverified = wide.findIndex((entry) => !entry.verified);
		expect(wide.slice(firstUnverified).some((entry) => entry.verified)).toBe(false);
	});
});

describe('widthClassOf', () => {
	it('splits at 60, 100 and 160 cm', () => {
		expect([500, 600, 601, 1000, 1001, 1600, 1601].map(widthClassOf)).toEqual([
			'narrow',
			'narrow',
			'medium',
			'medium',
			'wide',
			'wide',
			'extraWide'
		]);
	});
});
