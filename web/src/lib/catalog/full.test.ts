import { afterEach, describe, expect, it } from 'vitest';
import { syntheticCatalog } from '../../../tests/helpers/syntheticCatalog.ts';
import { ensureFullCatalog, fullCatalog, resetFullCatalog } from './full.svelte.ts';
import { allEntries, catalog, clearRegistered, lookup, registerEntries } from './index.ts';

afterEach(() => {
	clearRegistered();
	resetFullCatalog();
});

describe('registerEntries', () => {
	it('adds valid entries, drops invalid ones one by one', () => {
		const good = syntheticCatalog(3);
		const result = registerEntries([...good, { id: 'Broken Entry' }, 42]);
		expect(result.accepted).toHaveLength(3);
		expect(result.rejected).toBe(2);
		expect(allEntries()).toHaveLength(catalog.length + 3);
	});

	it('looks up registered entries only after registering', () => {
		const [entry] = syntheticCatalog(1);
		expect(lookup(entry.id)).toBeUndefined();
		registerEntries([entry]);
		expect(lookup(entry.id)).toEqual(entry);
		expect(lookup(catalog[0].id)).toBe(catalog[0]);
	});

	it('lets curated ids and article numbers win', () => {
		const curated = catalog.find((entry) => entry.articleNo)!;
		const [a, b, c] = syntheticCatalog(3);
		const result = registerEntries([
			{ ...a, id: curated.id },
			{ ...b, brand: curated.brand, articleNo: curated.articleNo },
			c
		]);
		expect(result.accepted.map((entry) => entry.id)).toEqual([c.id]);
		expect(result.duplicates).toBe(2);
		expect(lookup(curated.id)).toBe(curated);
	});

	it('compares article numbers without dots', () => {
		const curated = catalog.find((entry) => entry.articleNo?.includes('.'))!;
		const [a] = syntheticCatalog(1);
		const result = registerEntries([
			{ ...a, brand: curated.brand, articleNo: curated.articleNo!.replaceAll('.', '') }
		]);
		expect(result.duplicates).toBe(1);
	});

	it('drops duplicates inside the list and on a second registration', () => {
		const list = syntheticCatalog(5);
		expect(registerEntries([...list, list[0]]).accepted).toHaveLength(5);
		expect(registerEntries(list).accepted).toHaveLength(0);
		expect(allEntries()).toHaveLength(catalog.length + 5);
	});

	it('keeps a stable order with curated entries first', () => {
		const list = syntheticCatalog(4);
		registerEntries(list);
		const all = allEntries();
		expect(all.slice(0, catalog.length)).toEqual(catalog);
		expect(all.slice(catalog.length).map((entry) => entry.id)).toEqual(list.map((e) => e.id));
	});
});

describe('ensureFullCatalog', () => {
	it('loads once and reports rejected entries', async () => {
		let calls = 0;
		const source = async () => {
			calls += 1;
			return [...syntheticCatalog(4), { nope: true }];
		};
		await Promise.all([ensureFullCatalog(source), ensureFullCatalog(source)]);
		await ensureFullCatalog(source);
		expect(calls).toBe(1);
		expect(fullCatalog.ready).toBe(true);
		expect(fullCatalog.count).toBe(4);
		expect(fullCatalog.error).toContain('1');
	});

	it('reports a failure without throwing and retries next time', async () => {
		await ensureFullCatalog(async () => {
			throw new Error('offline');
		});
		expect(fullCatalog.error).not.toBeNull();
		expect(allEntries()).toBe(catalog);
		await ensureFullCatalog(async () => syntheticCatalog(2));
		expect(fullCatalog.count).toBe(2);
		expect(fullCatalog.error).toBeNull();
	});

	it('loads the bundled file (empty by default) in the default source', async () => {
		await ensureFullCatalog();
		expect(fullCatalog.ready).toBe(true);
		expect(fullCatalog.error).toBeNull();
	});
});
