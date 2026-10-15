import { describe, expect, it } from 'vitest';
import { messages as cameraMessages } from '../camera/i18n.ts';
import { messages as mirrorMessages } from './i18n.ts';

const sets = { camera: cameraMessages, mirror: mirrorMessages };
const plural = /\b1 (\S+ )?(Fotos|Räume|photos|rooms)/;

describe.each(Object.entries(sets))('Einzahltexte %s', (_name, bundle) => {
	for (const lang of ['de', 'en'] as const) {
		const dict: Record<string, string> = bundle[lang];
		const keys = Object.keys(dict).filter((k) => k.endsWith('One'));
		it(`${lang}: Einzahl ohne Mehrzahlwort, mit Grundschlüssel`, () => {
			expect(keys.length).toBeGreaterThan(0);
			for (const key of keys) {
				expect(dict[key], key).not.toMatch(plural);
				expect(dict[key.slice(0, -3)], key).toBeDefined();
			}
		});
	}
	it('DE und EN haben dieselben Einzahlschlüssel', () => {
		const one = (d: Record<string, string>) => Object.keys(d).filter((k) => k.endsWith('One'));
		expect(one(bundle.en).sort()).toEqual(one(bundle.de).sort());
	});
});
