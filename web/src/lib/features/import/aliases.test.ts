import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { sequentialIds } from '#lib/core/ids.ts';
import { sampleProject } from '#lib/core/fixtures.ts';
import { catalogAliases, lookup } from '#lib/catalog/index.ts';
import { analyzePlanText, type AnalyzeOptions } from './analyze.ts';

function options(): AnalyzeOptions {
	return {
		project: sampleProject(),
		lookup,
		language: 'de',
		unit: 'cm',
		newId: sequentialIds('n')
	};
}

function planWith(catalogId: string): string {
	return JSON.stringify({
		format: 'roomx-plan',
		schemaVersion: 1,
		projectId: 'project-1',
		variants: [
			{
				name: 'A: alt',
				rooms: [{ roomId: 'room-rect', items: [{ catalogId, x: 2000, y: 1500 }] }]
			}
		]
	});
}

describe('plan import with old catalog ids', () => {
	it('resolves every alias to its new entry', () => {
		const entries = Object.entries(catalogAliases);
		expect(entries.length).toBeGreaterThan(0);
		for (const [oldId, newId] of entries) {
			const result = analyzePlanText(planWith(oldId), options());
			if (result.status !== 'ready') throw new Error(`${oldId}: ${result.status}`);
			const variant = result.resolved.variants[0];
			expect(variant.items, oldId).toHaveLength(1);
			expect(variant.items[0].catalogId, oldId).toBe(newId);
			const unknown = result.resolved.issues.filter((issue) => issue.field === 'catalogId');
			expect(unknown, oldId).toEqual([]);
		}
	});

	it('takes name and price from the new entry', () => {
		const result = analyzePlanText(planWith('ikea-malm-vanity-100x41x78'), options());
		if (result.status !== 'ready') throw new Error(result.status);
		const item = result.resolved.variants[0].items[0];
		const entry = lookup('ikea-malm-vanity-120x41x78');
		expect(entry).toBeDefined();
		expect(item.catalogId).toBe(entry!.id);
		expect(item.name).toBe(entry!.name.de);
		expect(item.priceChf).toBe(entry!.priceChf);
		expect(item.dims.w).toBe(entry!.dims.w);
	});

	it('still reports an id that is neither current nor an alias', () => {
		const result = analyzePlanText(planWith('ikea-gibt-es-nicht-1x1x1'), options());
		if (result.status !== 'ready') throw new Error(result.status);
		expect(result.resolved.variants[0].items[0]?.catalogId).toBeUndefined();
	});
});
