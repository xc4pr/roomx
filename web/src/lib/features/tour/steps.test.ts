import { describe, expect, it } from 'vitest';
import { messages } from './i18n.ts';
import { textKey, titleKey } from './logic.ts';
import { TOUR_STEPS, TOUR_STEP_IDS } from './steps.ts';

describe('tour steps', () => {
	it('has unique ids in the declared order', () => {
		expect(TOUR_STEPS.map((step) => step.id)).toEqual([...TOUR_STEP_IDS]);
		expect(new Set(TOUR_STEP_IDS).size).toBe(TOUR_STEP_IDS.length);
	});

	it('gives every project step a screen and at least one anchor', () => {
		for (const step of TOUR_STEPS) {
			if (step.id === 'welcome') {
				expect(step.screen).toBeNull();
				expect(step.anchors).toEqual([]);
			} else {
				expect(step.screen).not.toBeNull();
				expect(step.anchors.length).toBeGreaterThan(0);
				for (const anchor of step.anchors) expect(anchor).toMatch(/^\[data-testid="[\w-]+"\]$/);
			}
		}
	});

	it('has a title and short text in both languages for every step', () => {
		for (const language of ['de', 'en'] as const) {
			const texts = messages[language] as Record<string, string>;
			for (const id of TOUR_STEP_IDS) {
				expect(texts[`title_${id}`]).toBeTruthy();
				expect(texts[`text_${id}`].length).toBeGreaterThan(20);
				expect(texts[`text_${id}`].length).toBeLessThan(260);
			}
		}
	});

	it('keeps every text variant short and present in both languages', () => {
		for (const language of ['de', 'en'] as const) {
			const texts = messages[language] as Record<string, string>;
			for (const id of TOUR_STEP_IDS) {
				for (const localOnly of [false, true]) {
					for (const keyboard of [false, true]) {
						const text = texts[textKey(id, localOnly, keyboard)];
						expect(text.length).toBeGreaterThan(20);
						expect(text.length).toBeLessThan(260);
					}
					expect(texts[titleKey(id, localOnly)]).toBeTruthy();
				}
			}
		}
	});

	it('does not mention a server in the local-only texts', () => {
		for (const language of ['de', 'en'] as const) {
			const texts = messages[language] as Record<string, string>;
			const local = `${texts[titleKey('safe', true)]} ${texts[textKey('safe', true, true)]}`;
			expect(local).not.toMatch(/server|abgleich|sync/i);
		}
	});

	it('has the same keys in German and English', () => {
		expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.de).sort());
	});
});
