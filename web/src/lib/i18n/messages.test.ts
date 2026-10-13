import { describe, expect, it } from 'vitest';
import { common, categoryNames, elementKindNames, roomTypeNames } from './common.ts';

type Dictionary = Record<string, string>;
interface Bundle {
	source: string;
	name: string;
	de: Dictionary;
	en: Dictionary;
}

function isDictionary(value: unknown): value is Dictionary {
	return (
		typeof value === 'object' &&
		value !== null &&
		Object.values(value).every((entry) => typeof entry === 'string')
	);
}

function isBundle(value: unknown): value is { de: Dictionary; en: Dictionary } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'de' in value &&
		'en' in value &&
		isDictionary(value.de) &&
		isDictionary(value.en)
	);
}

const modules = import.meta.glob<Record<string, unknown>>('../**/i18n.ts', { eager: true });

const bundles: Bundle[] = [];

for (const [source, module] of Object.entries(modules)) {
	for (const [name, value] of Object.entries(module)) {
		if (isBundle(value)) bundles.push({ source, name, de: value.de, en: value.en });
	}
}

for (const [name, value] of Object.entries({
	common,
	categoryNames,
	elementKindNames,
	roomTypeNames
})) {
	bundles.push({ source: '../i18n/common.ts', name, de: value.de, en: value.en });
}

const FORBIDDEN = [
	['Cla', 'ude'],
	['Anth', 'ropic'],
	['Chat', 'GPT'],
	['Open', 'AI'],
	['Gem', 'ini']
].map((parts) => parts.join(''));

function placeholders(text: string): string[] {
	return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!))].sort();
}

function label(bundle: Bundle): string {
	return `${bundle.source}#${bundle.name}`;
}

function entries(bundle: Bundle): [string, string, string][] {
	return Object.keys(bundle.de).map((key) => [key, bundle.de[key]!, bundle.en[key] ?? '']);
}

describe('messages', () => {
	it('finds the message bundles', () => {
		expect(bundles.length).toBeGreaterThan(10);
		expect(Object.keys(modules).length).toBeGreaterThanOrEqual(9);
	});

	describe.each(bundles.map((bundle) => [label(bundle), bundle] as const))(
		'%s',
		(_name, bundle) => {
			it('has the same keys in German and English', () => {
				expect(Object.keys(bundle.en).sort()).toEqual(Object.keys(bundle.de).sort());
			});

			it('has no empty text', () => {
				for (const language of ['de', 'en'] as const) {
					for (const [key, text] of Object.entries(bundle[language])) {
						expect(text.trim(), `${language}.${key}`).not.toBe('');
					}
				}
			});

			it('uses identical placeholders in both languages', () => {
				for (const [key, de, en] of entries(bundle)) {
					expect(placeholders(en), key).toEqual(placeholders(de));
				}
			});

			it('uses Swiss spelling without the sharp s', () => {
				for (const language of ['de', 'en'] as const) {
					for (const [key, text] of Object.entries(bundle[language])) {
						expect(text.includes('ß'), `${language}.${key}`).toBe(false);
					}
				}
			});

			it('uses no dashes as punctuation', () => {
				for (const language of ['de', 'en'] as const) {
					for (const [key, text] of Object.entries(bundle[language])) {
						expect(/[—–]/.test(text), `${language}.${key}`).toBe(false);
					}
				}
			});

			it('does not name the assistant or its maker', () => {
				for (const language of ['de', 'en'] as const) {
					for (const [key, text] of Object.entries(bundle[language])) {
						for (const word of FORBIDDEN) {
							expect(
								text.toLowerCase().includes(word.toLowerCase()),
								`${language}.${key}: ${word}`
							).toBe(false);
						}
					}
				}
			});
		}
	);
});
