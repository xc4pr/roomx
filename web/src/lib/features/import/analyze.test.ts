import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { sequentialIds } from '#lib/core/ids.ts';
import { LIMITS } from '#lib/security/limits.ts';
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

	it('names the cover, not the room, when an item is too tall in an open-air area', () => {
		const make = (type: 'bedroom' | 'terrace', cover: boolean) => {
			const opts = options();
			const room = opts.project.rooms[0]!;
			room.type = type;
			if (cover) room.cover = { polygon: room.polygon, height: 2400 };
			const result = analyzePlanText(
				planJson((plan) => {
					plan.variants[0].rooms[0].items = [
						{
							id: 'tall',
							name: 'Schrank',
							category: 'wardrobe',
							dims: { w: 600, d: 400, h: 2900 },
							x: 2000,
							y: 1500
						}
					];
				}),
				opts
			);
			if (result.status !== 'ready') throw new Error(result.status);
			return result.preview[0].rooms[0].errors.map((conflict) => conflict.text).join(' ');
		};
		expect(make('terrace', true)).toContain('höher als die Überdachung');
		expect(make('bedroom', false)).toContain('höher als der Raum');
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

describe('analyzePlanText on messy answers', () => {
	it('reads comments, trailing commas, a code block and surrounding text', () => {
		const json = planJson().replace(
			'"format": "roomx-plan",',
			'"format": "roomx-plan", // Pflicht'
		);
		const messy = json.replace(/\n(\s*)\}/g, ',\n$1}');
		const result = analyzePlanText(
			`Hier ist dein Plan:\n\n\`\`\`json\n${messy}\n\`\`\`\nViel Freude!`,
			options()
		);
		if (result.status !== 'ready') throw new Error(result.status);
		expect(result.preview[0].itemCount).toBe(5);
		expect(result.skipped).toBe(0);
	});

	it('imports an unknown catalogue id as custom article and says so', () => {
		const result = analyzePlanText(
			planJson((plan) => {
				plan.variants[0].rooms[0].items.push({
					catalogId: 'gibt-es-nicht',
					name: 'Eigenes Regal',
					category: 'shelf',
					dims: { w: 600, d: 300, h: 1200 },
					anchor: { wall: 1, offset: 100 }
				});
			}),
			options()
		);
		if (result.status !== 'ready') throw new Error(result.status);
		expect(result.preview[0].itemCount).toBe(6);
		expect(result.skipped).toBe(0);
		const note = result.preview[0].issues.find((issue) => issue.severity === 'info');
		expect(note?.message).toContain('«gibt-es-nicht»');
		expect(note?.message).toContain('eigener Artikel');
	});

	it('tells which fields an unknown catalogue id still needs', () => {
		const result = analyzePlanText(
			planJson((plan) => {
				plan.variants[0].rooms[0].items.push({
					catalogId: 'gibt-es-nicht',
					dims: { w: 600, d: 300, h: 1200 },
					anchor: { wall: 1, offset: 100 }
				});
			}),
			options()
		);
		if (result.status !== 'ready') throw new Error(result.status);
		const error = result.preview[0].issues.find((issue) => issue.severity === 'error');
		expect(error?.message).toBe(
			'Katalog-ID «gibt-es-nicht» ist unbekannt. Als eigener Artikel fehlen: name, category. Das Möbel wird übersprungen.'
		);
		expect(error?.where).toBe('Variante 1 › Schlafzimmer › gibt-es-nicht (catalogId)');
	});

	it('rejects links that are not http or https with a readable message', () => {
		const result = analyzePlanText(
			planJson((plan) => {
				plan.variants[0].rooms[0].items[0].url = 'javascript:alert(1)';
				plan.variants[0].shoppingList[0].url = 'data:text/html,hi';
			}),
			options()
		);
		if (result.status !== 'invalid') throw new Error(result.status);
		expect(result.errors).toContain(
			'Variante 1 › Schlafzimmer › MALM Bettgestell 160×200 › url: muss ein Link sein, der mit http:// oder https:// beginnt (erhalten: "javascript:alert(1)")'
		);
		expect(result.errors.some((line) => line.includes('Einkaufsliste 1 › url'))).toBe(true);
	});

	it('names the list and the maximum when a plan has too many items', () => {
		const result = analyzePlanText(
			planJson((plan) => {
				const items = plan.variants[0].rooms[0].items;
				plan.variants[0].rooms[0].items = Array.from(
					{ length: LIMITS.planItemsPerRoom + 1 },
					() => items[3]
				);
			}),
			options()
		);
		if (result.status !== 'invalid') throw new Error(result.status);
		expect(result.errors).toEqual([
			`Variante 1 › Schlafzimmer › items: darf höchstens ${LIMITS.planItemsPerRoom} Einträge haben`
		]);
	});

	it('names the field and the maximum for over-long text', () => {
		const result = analyzePlanText(
			planJson((plan) => {
				plan.variants[0].rooms[0].notes = 'x'.repeat(LIMITS.text + 1);
			}),
			options('en')
		);
		if (result.status !== 'invalid') throw new Error(result.status);
		expect(result.errors).toEqual([
			`Variant 1 › Schlafzimmer › notes: must not be longer than ${LIMITS.text} characters`
		]);
	});

	it('caps the error list and counts the rest', () => {
		const result = analyzePlanText(
			planJson((plan) => {
				plan.variants[0].rooms[0].items = Array.from({ length: 120 }, (_, index) => ({
					name: `Ding ${index}`,
					category: 'sofaa',
					dims: { w: 1, d: 1, h: 1 },
					x: 0,
					y: 0
				}));
			}),
			options()
		);
		if (result.status !== 'invalid') throw new Error(result.status);
		expect(result.errors).toHaveLength(LIMITS.reportedIssues + 1);
		expect(result.errors.at(-1)).toBe(`… und ${120 - LIMITS.reportedIssues} weitere Probleme`);
	});

	it('refuses pasted text above the limit', () => {
		expect(analyzePlanText('x'.repeat(LIMITS.planText + 1), options())).toEqual({
			status: 'unreadable',
			reason: 'tooLarge'
		});
	});
});

describe('fixed built-ins in the preview', () => {
	it('reports collisions with built-ins and fire zones', () => {
		const withBuiltIns = options();
		const room = withBuiltIns.project.rooms[0]!;
		room.elements.push(
			{
				id: 'pillar',
				kind: 'column',
				status: 'existing',
				shape: 'square',
				x: 1000,
				y: 1500,
				rotation: 0,
				width: 3000,
				depth: 3000,
				height: 2500,
				elevation: 0
			},
			{
				id: 'oven',
				kind: 'stove',
				status: 'existing',
				x: 2400,
				y: 1400,
				rotation: 270,
				width: 500,
				depth: 450,
				height: 1100,
				elevation: 0,
				clearance: 1500
			}
		);
		const result = analyzePlanText(planJson(), withBuiltIns);
		if (result.status !== 'ready') throw new Error(result.status);
		const errors = result.preview[0]!.rooms[0]!.errors;
		const codes = errors.map((conflict) => conflict.code);
		expect(codes).toContain('elementCollision');
		expect(codes).toContain('fireZone');
		expect(errors.find((conflict) => conflict.code === 'elementCollision')!.text).toMatch(
			/kollidiert/
		);
	});
});
