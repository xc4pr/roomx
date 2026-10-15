import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { sampleLookup, samplePlan, sampleProject } from '#lib/core/fixtures.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import { LIMITS } from '#lib/security/limits.ts';
import { analyzePlanText, type AnalyzeOptions } from './analyze.ts';
import { correctionText } from './feedback.ts';

function options(language: 'de' | 'en' = 'de'): AnalyzeOptions {
	return {
		project: sampleProject(),
		lookup: sampleLookup,
		language,
		unit: 'cm',
		newId: sequentialIds('n')
	};
}

type Mutate = (plan: Record<string, any>) => void;

function analyze(mutate?: Mutate, language: 'de' | 'en' = 'de') {
	const plan = JSON.parse(JSON.stringify(samplePlan())) as Record<string, any>;
	mutate?.(plan);
	return analyzePlanText(JSON.stringify(plan), options(language));
}

describe('correctionText', () => {
	it('stays silent for a clean plan and for text that is no plan at all', () => {
		expect(correctionText(analyze(), 'de')).toBeUndefined();
		expect(correctionText(analyzePlanText('', options()), 'de')).toBeUndefined();
		expect(correctionText(analyzePlanText('Hallo zusammen', options()), 'de')).toBeUndefined();
	});

	it('lists skipped parts and conflicts with room, item, field and problem', () => {
		const result = analyze((plan) => {
			const room = plan.variants[0].rooms[0];
			room.items[0].anchor.wall = 9;
			room.items.push({
				id: 'schrank',
				name: 'Schrank',
				category: 'wardrobe',
				dims: { w: 1200, d: 600, h: 2000 },
				x: 2000,
				y: 300
			});
			plan.variants[0].rooms.push({ roomId: 'gibt-es-nicht', items: [] });
		});
		const text = correctionText(result, 'de');
		expect(text).toBeDefined();
		const lines = text!.split('\n');
		expect(lines[0]).toBe('Bitte korrigiere den Plan:');
		expect(text).toContain('Nicht übernommen:');
		expect(text).toContain(
			'- Variante 1 › Schlafzimmer › MALM Bettgestell 160×200 (anchor.wall) [bed]: Diese Wand gibt es im Raum nicht. Der Eintrag wird übersprungen.'
		);
		expect(text).toContain(
			'- Variante 1 › gibt-es-nicht: Raum «gibt-es-nicht» gibt es in diesem Projekt nicht. Der Raum wird übersprungen.'
		);
		expect(text).toContain('Konflikte:');
		expect(text).toMatch(/- Variante 1 › Schlafzimmer: .*«Schrank»/);
		expect(lines.at(-1)).toContain('roomx-plan');
	});

	it('explains unknown catalogue ids and missing fields', () => {
		const text = correctionText(
			analyze((plan) => {
				plan.variants[0].rooms[0].items.push({
					catalogId: 'gibt-es-nicht',
					anchor: { wall: 1, offset: 100 }
				});
			}),
			'de'
		);
		expect(text).toContain(
			'- Variante 1 › Schlafzimmer › gibt-es-nicht (catalogId): Katalog-ID «gibt-es-nicht» ist unbekannt. Als eigener Artikel fehlen: name, category, dims. Das Möbel wird übersprungen.'
		);
	});

	it('does not ask for corrections when the only note is an imported custom article', () => {
		const result = analyze((plan) => {
			plan.variants[0].rooms[0].electrical = [];
			plan.variants[0].rooms[0].items = [];
			plan.variants[0].rooms[0].items.push({
				catalogId: 'gibt-es-nicht',
				name: 'Eigenes Regal',
				category: 'shelf',
				dims: { w: 600, d: 300, h: 1200 },
				x: 2000,
				y: 1500
			});
		});
		expect(correctionText(result, 'de')).toBeUndefined();
	});

	it('repeats the validation errors of an invalid plan', () => {
		const result = analyze((plan) => {
			plan.variants[0].rooms[0].items[0].anchor.offset = 'viel';
			plan.variants[0].rooms[0].items[1].url = 'javascript:alert(1)';
		});
		const text = correctionText(result, 'de');
		expect(text?.startsWith('Bitte korrigiere den Plan:\n\nDer Plan ist nicht gültig:\n')).toBe(
			true
		);
		expect(text).toContain(
			'- Variante 1 › Schlafzimmer › MALM Bettgestell 160×200 › anchor.offset: hat den falschen Typ (erwartet: Zahl, erhalten: Text)'
		);
		expect(text).toContain('Schreibtisch 160×80 › url: muss ein Link sein');
	});

	it('speaks English when the app does', () => {
		const result = analyze((plan) => {
			plan.variants[0].rooms[0].items[0].anchor.wall = 9;
		}, 'en');
		const text = correctionText(result, 'en');
		expect(text?.startsWith('Please correct the plan:')).toBe(true);
		expect(text).toContain('Not imported:');
		expect(text).toContain(
			'- Variant 1 › Schlafzimmer › MALM bed frame 160×200 (anchor.wall) [bed]: This wall does not exist in the room. The entry is skipped.'
		);
		expect(text).toContain('Output the whole corrected plan again as JSON');
		expect(text).not.toMatch(/\{\w+\}/);
	});

	it('covers answers that could not be read, except when there is no JSON', () => {
		const broken = correctionText(
			analyzePlanText('{"format": "roomx-plan", "a": nope}', options()),
			'de'
		);
		expect(broken).toContain('Bitte korrigiere den Plan:');
		expect(broken).toContain('Das JSON ist fehlerhaft');
		const cut = correctionText(analyzePlanText('{"format": "roomx-plan",', options()), 'en');
		expect(cut).toContain('The reply stops in the middle of the JSON.');
		const huge = correctionText(analyzePlanText('x'.repeat(LIMITS.planText + 1), options()), 'de');
		expect(huge).toContain('zu lang');
	});

	it('shortens very long lists and says how many were left out', () => {
		const result = analyze((plan) => {
			plan.variants[0].rooms[0].items = Array.from({ length: 250 }, (_, index) => ({
				id: `n${index}`,
				catalogId: 'generic-desk-160x80',
				anchor: { wall: 9, offset: 0 }
			}));
		});
		const text = correctionText(result, 'de')!;
		const bullets = text.split('\n').filter((line) => line.startsWith('- '));
		expect(bullets).toHaveLength(2 * LIMITS.reportedIssues + 1);
		expect(bullets.at(-1)).toBe(`- … und ${250 - 2 * LIMITS.reportedIssues} weitere`);
	});
});
