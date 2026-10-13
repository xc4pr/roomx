import { describe, expect, it } from 'vitest';
import { samplePlan } from '#lib/core/fixtures.ts';
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
