import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { sequentialIds } from '#lib/core/ids.ts';
import { sampleLookup, samplePlan, sampleProject } from '#lib/core/fixtures.ts';
import { ProjectStore } from '#lib/state/project.svelte.ts';
import {
	analyzePlanText,
	briefDiffers,
	importable,
	pickVariants,
	type AnalyzeOptions
} from './analyze.ts';
import { roomSummary } from './preview.ts';
import { translator } from '#lib/features/export/text.ts';
import { messages } from './i18n.ts';

function options(language: 'de' | 'en' = 'de'): AnalyzeOptions {
	return {
		project: sampleProject(),
		lookup: sampleLookup,
		language,
		unit: 'cm',
		newId: sequentialIds('n')
	};
}

const planJson = (mutate?: (plan: Record<string, any>) => void) => {
	const plan = JSON.parse(JSON.stringify(samplePlan())) as Record<string, any>;
	mutate?.(plan);
	return JSON.stringify(plan, null, 2);
};

describe('analyzePlanText', () => {
	it('counts furniture, decor, devices and new sockets per room', () => {
		const result = analyzePlanText(
			`Hier:\n\`\`\`json\n${planJson()}\n\`\`\`\nViel Spass`,
			options()
		);
		if (result.status !== 'ready') throw new Error(result.status);
		expect(result.preview).toHaveLength(1);
		const variant = result.preview[0];
		expect(variant.name).toBe('A: ruhig');
		expect(variant.rooms).toHaveLength(1);
		const room = variant.rooms[0];
		expect(room.name).toBe('Schlafzimmer');
		expect([room.furniture, room.decor, room.devices, room.sockets, room.electrical]).toEqual([
			3, 1, 1, 1, 0
		]);
		expect(room.summary).toBe('3 Möbel, 1 Deko, 1 Gerät, 1 neue Steckdose');
		expect(variant.totalChf).toBe(249 + 299 + 250 + 199);
		expect(variant.unpriced).toBe(1);
		expect(result.skipped).toBe(0);
	});

	it('keeps electrical suggestions as suggested', () => {
		const result = analyzePlanText(planJson(), options());
		if (result.status !== 'ready') throw new Error(result.status);
		const suggestion = result.resolved.variants[0].suggestions[0];
		expect(suggestion.element.status).toBe('suggested');
	});

	it('separates conflicts into errors and warnings with readable texts', () => {
		const result = analyzePlanText(
			planJson((plan) => {
				plan.variants[0].rooms[0].items.push({
					id: 'big',
					name: 'Schrank',
					category: 'wardrobe',
					dims: { w: 1200, d: 600, h: 2000 },
					x: 2000,
					y: 300
				});
			}),
			options()
		);
		if (result.status !== 'ready') throw new Error(result.status);
		const room = result.preview[0].rooms[0];
		expect(room.errors.length).toBeGreaterThan(0);
		expect(room.errors.every((conflict) => conflict.severity === 'error')).toBe(true);
		expect(room.warnings.every((conflict) => conflict.severity === 'warning')).toBe(true);
		expect(room.errors.some((conflict) => conflict.text.includes('Schrank'))).toBe(true);
		const clean = analyzePlanText(planJson(), options('en'));
		if (clean.status !== 'ready') throw new Error(clean.status);
		const all = [...clean.preview[0].rooms[0].errors, ...clean.preview[0].rooms[0].warnings];
		for (const conflict of all) expect(conflict.text).not.toMatch(/\{\w+\}/);
	});

	it('imports the valid parts and lists the skipped ones', () => {
		const result = analyzePlanText(
			planJson((plan) => {
				plan.variants[0].rooms[0].items[0].anchor.wall = 9;
				plan.variants[0].rooms.push({ roomId: 'gibt-es-nicht', items: [] });
			}),
			options()
		);
		if (result.status !== 'ready') throw new Error(result.status);
		const variant = result.preview[0];
		expect(variant.skipped).toBe(2);
		expect(variant.issues.map((issue) => issue.severity)).toEqual(['error', 'error']);
		expect(variant.itemCount).toBe(4);
		expect(variant.rooms.map((room) => room.name)).toEqual(['Schlafzimmer']);
		expect(importable(result.resolved.variants[0])).toBe(true);
	});

	it('reports schema errors with readable paths', () => {
		const result = analyzePlanText(
			planJson((plan) => {
				plan.variants[0].rooms[0].items[0].anchor.offset = 'viel';
			}),
			options()
		);
		if (result.status !== 'invalid') throw new Error(result.status);
		expect(result.errors[0]).toMatch(/^Variante 1 › Schlafzimmer › .* › anchor\.offset: /);
	});

	it('distinguishes empty and unreadable input', () => {
		expect(analyzePlanText('', options())).toEqual({ status: 'empty' });
		expect(analyzePlanText('hallo', options())).toEqual({ status: 'unreadable', reason: 'noJson' });
		expect(analyzePlanText('{"format": "roomx-plan",', options())).toEqual({
			status: 'unreadable',
			reason: 'truncated'
		});
	});
});

describe('importing', () => {
	it('picks variants and the brief', () => {
		const result = analyzePlanText(planJson(), options());
		if (result.status !== 'ready') throw new Error(result.status);
		expect(pickVariants(result.resolved, new Set([0]), false).brief).toBeUndefined();
		const picked = pickVariants(result.resolved, new Set([0]), true);
		expect(picked.variants).toHaveLength(1);
		expect(picked.brief?.budgetChf).toBe(3000);
		expect(pickVariants(result.resolved, new Set(), true).variants).toEqual([]);
		expect(briefDiffers(sampleProject(), result.plan.brief)).toBe(true);
		expect(briefDiffers(sampleProject(), undefined)).toBe(false);
	});

	it('adds the variants as new, active variants via the store', () => {
		const store = new ProjectStore();
		store.replace(sampleProject());
		const result = analyzePlanText(planJson(), options());
		if (result.status !== 'ready') throw new Error(result.status);
		const { variants, brief } = pickVariants(result.resolved, new Set([0]), true);
		store.importVariants(variants, brief);
		expect(store.project?.variants).toHaveLength(1);
		expect(store.activeVariant?.source).toBe('ai');
		expect(store.project?.brief?.budgetChf).toBe(3000);
		expect(store.activeVariant?.suggestions.every((s) => s.element.status === 'suggested')).toBe(
			true
		);
	});
});

describe('roomSummary', () => {
	it('uses singular and plural forms in both languages', () => {
		const counts = { furniture: 1, decor: 4, devices: 0, sockets: 2, electrical: 1 };
		expect(roomSummary(counts, translator(messages, 'de'))).toBe(
			'1 Möbel, 4 Deko, 2 neue Steckdosen, 1 weiterer Elektro-Vorschlag'
		);
		expect(roomSummary(counts, translator(messages, 'en'))).toBe(
			'1 piece of furniture, 4 decor items, 2 new sockets, 1 more electrical suggestion'
		);
		expect(
			roomSummary(
				{ ...counts, furniture: 0, decor: 0, sockets: 0, electrical: 0 },
				translator(messages, 'en')
			)
		).toBe('No furniture');
	});
});
