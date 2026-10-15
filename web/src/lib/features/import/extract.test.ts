import { describe, expect, it } from 'vitest';
import { samplePlan } from '#lib/core/fixtures.ts';
import { LIMITS } from '#lib/security/limits.ts';
import { extractPlan } from './extract.ts';

const plan = samplePlan();
const json = JSON.stringify(plan, null, 2);

describe('extractPlan', () => {
	it('reads plain JSON', () => {
		expect(extractPlan(json)).toEqual({ ok: true, value: plan });
		expect(extractPlan(`﻿  ${json}\n\n`)).toEqual({ ok: true, value: plan });
	});

	it('reads JSON inside a code block with text around it', () => {
		const text = `Gerne, hier ist der Plan {Entwurf}:\n\n\`\`\`json\n${json}\n\`\`\`\n\nViel Freude! Fragen {gern} stellen.`;
		expect(extractPlan(text)).toEqual({ ok: true, value: plan });
	});

	it('finds the plan after other JSON objects', () => {
		const text = `Beispiel: {"a": 1}\nund dann:\n${json}`;
		expect(extractPlan(text)).toEqual({ ok: true, value: plan });
	});

	it('ignores braces and quotes inside strings', () => {
		const tricky = {
			...plan,
			variants: [{ ...plan.variants[0], name: 'A "ruhig" } { \\ Variante' }]
		};
		const text = `Text mit } Klammer\n\`\`\`\n${JSON.stringify(tricky)}\n\`\`\`\nEnde }`;
		expect(extractPlan(text)).toEqual({ ok: true, value: tricky });
	});

	it('returns another JSON object when no plan is mentioned, so validation can explain', () => {
		const result = extractPlan('Antwort: {"hello": "world"} fertig');
		expect(result).toEqual({ ok: true, value: { hello: 'world' } });
	});

	it('reports empty input and text without JSON', () => {
		expect(extractPlan('   ')).toEqual({ ok: false, reason: 'empty' });
		expect(extractPlan('Hier ist kein Plan.')).toEqual({ ok: false, reason: 'noJson' });
	});

	it('reports broken JSON', () => {
		const broken = json.replace('"schemaVersion": 1,', '"schemaVersion": 1 "projectId": 3,');
		expect(extractPlan(broken)).toEqual({ ok: false, reason: 'broken' });
		expect(extractPlan('{"format": "roomx-plan", nope}')).toEqual({ ok: false, reason: 'broken' });
	});

	it('reports a reply that stops in the middle', () => {
		const cut = `Hier:\n\`\`\`json\n${json.slice(0, Math.floor(json.length / 2))}`;
		expect(extractPlan(cut)).toEqual({ ok: false, reason: 'truncated' });
	});
});

describe('extractPlan tolerance', () => {
	const value = {
		format: 'roomx-plan',
		schemaVersion: 1,
		note: 'a // b, } /* c */ “d”',
		list: [1, 2]
	};

	it('ignores line and block comments outside of strings but not inside', () => {
		const text = `{
  // Kopf des Plans
  "format": "roomx-plan", /* Format */
  "schemaVersion": 1, // Version
  "note": "a // b, } /* c */ “d”",
  /* mehrzeilig
     } { " */
  "list": [1, 2]
}`;
		expect(extractPlan(text)).toEqual({ ok: true, value });
	});

	it('removes trailing commas in objects and lists but keeps commas in strings', () => {
		const text =
			'{"format": "roomx-plan", "schemaVersion": 1, "note": "a // b, } /* c */ “d”", "list": [1, 2,\n],}';
		expect(extractPlan(text)).toEqual({ ok: true, value });
		expect(extractPlan('{"format": "roomx-plan", "a": [ ],  \n }')).toEqual({
			ok: true,
			value: { format: 'roomx-plan', a: [] }
		});
	});

	it('reads typographic quotes used as string delimiters', () => {
		const mixed = '{“format”: “roomx-plan”, „schemaVersion“: 1, "name": "ok"}';
		expect(extractPlan(mixed)).toEqual({
			ok: true,
			value: { format: 'roomx-plan', schemaVersion: 1, name: 'ok' }
		});
		const plain = '{“format”: “roomx-plan”, “title”: “Wohnzimmer”}';
		expect(extractPlan(plain)).toEqual({
			ok: true,
			value: { format: 'roomx-plan', title: 'Wohnzimmer' }
		});
		const inside = '{"format": "roomx-plan", "title": "Das „beste“ Bett"}';
		expect(extractPlan(inside)).toEqual({
			ok: true,
			value: { format: 'roomx-plan', title: 'Das „beste“ Bett' }
		});
	});

	it('reads odd spaces, raw line breaks in strings and escaped apostrophes', () => {
		const text = '{"format":\u00a0"roomx-plan",\u200b "note": "zwei\nZeilen\tTab \\\' ok"}';
		expect(extractPlan(text)).toEqual({
			ok: true,
			value: { format: 'roomx-plan', note: "zwei\nZeilen\tTab ' ok" }
		});
	});

	it('combines code block, text around, comments and trailing commas', () => {
		const text = `Gerne! Hier der Plan {Entwurf} mit "Anführungszeichen:

\`\`\`json
{
  "format": "roomx-plan", // Pflicht
  "schemaVersion": 1,
  "variants": [
    { "name": "A", "rooms": [ { "roomId": "r", "items": [ {"id": "x"}, ], }, ], },
  ],
}
\`\`\`

Noch Fragen? {gern}`;
		const result = extractPlan(text);
		expect(result).toEqual({
			ok: true,
			value: {
				format: 'roomx-plan',
				schemaVersion: 1,
				variants: [{ name: 'A', rooms: [{ roomId: 'r', items: [{ id: 'x' }] }] }]
			}
		});
	});

	it('still reports broken and cut-off JSON clearly', () => {
		expect(extractPlan('{"format": "roomx-plan", "a": nope, }')).toEqual({
			ok: false,
			reason: 'broken'
		});
		expect(extractPlan('{"format": "roomx-plan", "a": [1, 2, // offen\n')).toEqual({
			ok: false,
			reason: 'truncated'
		});
		expect(extractPlan('{"format": "roomx-plan" /* nie zu')).toEqual({
			ok: false,
			reason: 'truncated'
		});
		expect(extractPlan('Das ist {kein} Plan')).toEqual({ ok: false, reason: 'noJson' });
	});

	it('refuses text above the size limit without reading it', () => {
		const huge = `{"format": "roomx-plan", "x": "${'a'.repeat(LIMITS.planText)}"}`;
		expect(extractPlan(huge)).toEqual({ ok: false, reason: 'tooLarge' });
		const edge = `{"x": "${'a'.repeat(LIMITS.planText - 20)}"}`;
		expect(extractPlan(edge).ok).toBe(true);
	});
});

describe('extractPlan on hostile input', () => {
	function time(input: string): number {
		const started = performance.now();
		extractPlan(input);
		return performance.now() - started;
	}

	it('does not slow down on thousands of opening braces', () => {
		expect(time('{"a":'.repeat(150_000))).toBeLessThan(1500);
		expect(time('{'.repeat(1_000_000))).toBeLessThan(1500);
		expect(time('{"'.repeat(400_000))).toBeLessThan(1500);
		expect(time('{ /* '.repeat(150_000))).toBeLessThan(1500);
		expect(time('{ // x\n'.repeat(100_000))).toBeLessThan(1500);
	});

	it('does not slow down on many small objects or deep nesting', () => {
		expect(time('{"a": 1} '.repeat(200_000))).toBeLessThan(1500);
		expect(time(`${'{"a":'.repeat(5000)}1${'}'.repeat(5000)}`)).toBeLessThan(1500);
		expect(time(`${'['.repeat(300_000)}`)).toBeLessThan(1500);
		expect(time(`{"format": "roomx-plan", "a": "${'\\'.repeat(900_000)}`)).toBeLessThan(1500);
	});

	it('gives up on absurdly deep nesting with a clear failure', () => {
		const deep = `${'{"a":'.repeat(500)}1${'}'.repeat(500)}`;
		expect(extractPlan(`roomx-plan ${deep}`)).toMatchObject({ ok: false });
	});
});
