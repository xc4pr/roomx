import { describe, expect, it } from 'vitest';
import { messages } from './i18n.ts';
import { SHORTCUT_GROUPS, isApplePlatform } from './shortcuts.ts';

describe('shortcuts', () => {
	it('has a label in both languages for every entry and group', () => {
		for (const group of SHORTCUT_GROUPS) {
			for (const language of ['de', 'en'] as const) {
				const table = messages[language] as Record<string, string>;
				expect(table[`shortcutGroup_${group.id}`]).toBeTruthy();
				for (const entry of group.entries) expect(table[`shortcut_${entry.id}`]).toBeTruthy();
			}
		}
	});

	it('uses unique entry ids', () => {
		const ids = SHORTCUT_GROUPS.flatMap((group) => group.entries.map((entry) => entry.id));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('detects Apple platforms', () => {
		expect(isApplePlatform('MacIntel')).toBe(true);
		expect(isApplePlatform('iPad')).toBe(true);
		expect(isApplePlatform('Linux x86_64')).toBe(false);
	});
});
