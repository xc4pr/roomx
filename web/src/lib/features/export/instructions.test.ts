import { describe, expect, it } from 'vitest';
import { lookup } from '#lib/catalog/index.ts';
import { RETAILERS } from '#lib/catalog/retailers.ts';
import { checkRoomItems } from '#lib/core/checks.ts';
import { buildExport } from '#lib/core/export.ts';
import { PlanSchema } from '#lib/core/plan.ts';
import { resolvePlan } from '#lib/core/planResolve.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import { rectangleRoom, sampleProject } from '#lib/core/fixtures.ts';
import type { Language } from '#lib/core/units.ts';
import {
	buildInstructions,
	buildPrompt,
	examplePlan,
	prettyJson,
	type PackageFileNames
} from './instructions.ts';
import { instructionTexts } from './instructionsText.ts';
import { furnishedProject } from './testing.ts';

const LANGUAGES: Language[] = ['de', 'en'];

const FORBIDDEN = [
	['Cla', 'ude'],
	['Anth', 'ropic'],
	['Chat', 'GPT'],
	['Open', 'AI'],
	['Gem', 'ini'],
	['Co', 'pilot'],
	['Mis', 'tral'],
	['Perp', 'lexity'],
	['Deep', 'Seek'],
	['Gr', 'ok'],
	['Goo', 'gle'],
	['Micro', 'soft'],
	['Me', 'ta AI'],
	['Lla', 'ma']
].map((parts) => parts.join('').toLowerCase());

function names(language: Language): PackageFileNames {
	const prefix = language === 'de' ? 'roomx-anleitung' : 'roomx-instructions';
	return {
		instructions: `${prefix}-wohnung-2026-10-15.md`,
		pdf: 'roomx-wohnung-2026-10-15.pdf',
		json: 'roomx-wohnung-2026-10-15.json',
		schema: 'roomx-plan.schema.json',
		catalog: 'roomx-katalog.json',
		plan: 'roomx-plan-wohnung.json'
	};
}

function instructionsFor(
	language: Language,
	partial = false,
	project = furnishedProject(),
	withoutPhotos = false
) {
	const document = buildExport(project, { exportedAt: '2026-10-15T12:00:00.000Z' });
	const text = buildInstructions({
		document,
		language,
		date: new Date(2026, 9, 15, 12),
		fileNames: names(language),
		pdfPages: 12,
		partial,
		withoutPhotos,
		lookup
	});
	return { document, text };
}

function placeholders(text: string): string[] {
	return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!))].sort();
}

describe('instruction texts', () => {
	it('have the same keys and placeholders in both languages', () => {
		expect(Object.keys(instructionTexts.en).sort()).toEqual(
			Object.keys(instructionTexts.de).sort()
		);
		for (const key of Object.keys(instructionTexts.de) as (keyof typeof instructionTexts.de)[]) {
			expect(placeholders(instructionTexts.en[key]), key).toEqual(
				placeholders(instructionTexts.de[key])
			);
		}
	});

	it('use Swiss spelling and no dashes as punctuation', () => {
		for (const language of LANGUAGES) {
			for (const [key, text] of Object.entries(instructionTexts[language])) {
				expect(text.includes('ß'), `${language}.${key}`).toBe(false);
				expect(/[—–]/.test(text), `${language}.${key}`).toBe(false);
			}
		}
	});
});

describe('retailers in the instructions', () => {
	it.each(LANGUAGES)('name every catalog retailer and no old ones (%s)', (language) => {
		const line = instructionTexts[language].step1.split('\n').find((row) => row.startsWith('5.'));
		expect(line).toBeDefined();
		for (const name of RETAILERS) expect(line).toContain(name);
		expect(line).not.toMatch(/Pfister|Micasa|Interio|Conforama/);
	});
});

describe('buildInstructions', () => {
	it.each(LANGUAGES)(
		'calls catalogue dimensions guide values and asks for a check (%s)',
		(language) => {
			const { text } = instructionsFor(language);
			const lower = text.toLowerCase();
			expect(lower).not.toContain(language === 'de' ? 'verbindlich' : 'binding');
			expect(text).toContain('verified: false');
			expect(lower).toContain(language === 'de' ? 'richtwerte' : 'guide values');
			expect(lower).toContain(language === 'de' ? 'beim händler prüfen' : 'check the dimensions');
		}
	);

	it.each(LANGUAGES)('says so when the package has no photos (%s)', (language) => {
		const without = instructionsFor(language, false, furnishedProject(), true).text;
		const withPhotos = instructionsFor(language).text;
		expect(without.length).toBeGreaterThan(withPhotos.length);
		expect(without).toContain(language === 'de' ? 'keine Fotos' : 'no photos');
		expect(withPhotos).not.toContain(language === 'de' ? 'keine Fotos' : 'no photos');
	});

	it.each(LANGUAGES)('contains the project id and every room id (%s)', (language) => {
		const { document, text } = instructionsFor(language);
		expect(text).toContain(document.project.id);
		expect(document.rooms.length).toBeGreaterThan(1);
		for (const room of document.rooms) {
			expect(text).toContain(`\`${room.id}\``);
			expect(text).toContain(room.name);
		}
	});

	it.each(LANGUAGES)('names no assistant and no maker (%s)', (language) => {
		const { text } = instructionsFor(language);
		const lower = text.toLowerCase();
		for (const word of FORBIDDEN) expect(lower.includes(word), word).toBe(false);
		expect(text.includes('ß')).toBe(false);
		expect(/[—–]/.test(text)).toBe(false);
	});

	it.each(LANGUAGES)('lists all files and the six steps in order (%s)', (language) => {
		const { text } = instructionsFor(language);
		const fileNames = names(language);
		for (const name of Object.values(fileNames)) expect(text).toContain(name);
		const marker = language === 'de' ? 'Schritt' : 'Step';
		const positions = [1, 2, 3, 4, 5, 6].map((n) => text.indexOf(`### ${marker} ${n}:`));
		expect(positions.every((position) => position > 0)).toBe(true);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
		expect(text).toContain('12');
	});

	it('starts with the prompt, then explains the questions, checks and delivery', () => {
		const de = instructionsFor('de').text;
		expect(de.indexOf(buildPrompt('de', names('de').instructions))).toBeGreaterThan(0);
		expect(de.indexOf('## Startprompt')).toBeLessThan(de.indexOf('## 1. Rolle und Ziel'));
		for (const part of [
			'EINER Nachricht',
			'Personen',
			'Haustiere',
			'160x200',
			'Arbeitsplätze',
			'Budget',
			'Händler',
			'bleiben',
			'`brief`',
			'`freeSpans`',
			'`anchor {wall, offset, gap?, side?}`',
			'`elevation`',
			'`on`',
			'1,5 m',
			'Türschwenk',
			'Dachschrägen',
			'`locked: true`',
			'Richtpreis',
			'«Plan importieren»',
			'genau einen JSON-Codeblock'
		]) {
			expect(de, part).toContain(part);
		}
		const en = instructionsFor('en').text;
		for (const part of [
			'ONE message',
			'Budget',
			'`anchor {wall, offset, gap?, side?}`',
			'1.5 m',
			'door swing',
			'exactly one JSON code block',
			'"Import plan"',
			'guide price'
		]) {
			expect(en, part).toContain(part);
		}
	});

	it('mentions the partial scope only for a partial export', () => {
		expect(instructionsFor('de', true).text).toContain(instructionTexts.de.partialNote);
		expect(instructionsFor('de', false).text).not.toContain(instructionTexts.de.partialNote);
	});

	it('escapes table cells and keeps the project name on one line', () => {
		const project = furnishedProject();
		project.name = 'Haus\nSüd';
		project.rooms[0]!.name = 'Bad | Gäste';
		const { text } = instructionsFor('de', false, project);
		expect(text).toContain('Bad \\| Gäste');
		expect(text).toContain('**Haus Süd**');
	});
});

describe('examplePlan', () => {
	it.each(LANGUAGES)('is a valid plan with the real ids that resolves cleanly (%s)', (language) => {
		const project = furnishedProject();
		const document = buildExport(project);
		const plan = examplePlan(document, language, lookup);
		expect(plan).toBeDefined();
		const parsed = PlanSchema.parse(JSON.parse(JSON.stringify(plan)));
		expect(parsed.projectId).toBe(project.id);
		expect(parsed.variants[0]!.rooms[0]!.roomId).toBe(project.rooms[0]!.id);
		expect(parsed.brief).toEqual(project.brief);
		const resolved = resolvePlan(parsed, project, lookup, { newId: sequentialIds('x'), language });
		expect(resolved.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
		const room = project.rooms[0]!;
		const problems = checkRoomItems(
			room,
			resolved.variants[0]!.items,
			resolved.variants[0]!.suggestions.map((suggestion) => suggestion.element)
		).filter((issue) => issue.severity === 'error');
		expect(problems).toEqual([]);
	});

	it('uses a sample brief when the project has none and fits a small room', () => {
		const project = sampleProject();
		project.rooms = [rectangleRoom('tiny', 2000, 1800)];
		const plan = examplePlan(buildExport(project), 'en', lookup);
		expect(plan?.brief?.budgetChf).toBe(2000);
		const resolved = resolvePlan(PlanSchema.parse(plan), project, lookup, {
			newId: sequentialIds('x')
		});
		expect(resolved.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
	});

	it('has no example for a project without rooms', () => {
		const project = sampleProject();
		project.rooms = [];
		expect(examplePlan(buildExport(project), 'de', lookup)).toBeUndefined();
	});
});

describe('buildPrompt', () => {
	it.each(LANGUAGES)(
		'is three to six sentences and names the file and the format (%s)',
		(language) => {
			const prompt = buildPrompt(language, 'anleitung.md');
			const sentences = prompt.split(/(?<=[.!?])\s+/).filter(Boolean);
			expect(sentences.length).toBeGreaterThanOrEqual(3);
			expect(sentences.length).toBeLessThanOrEqual(6);
			expect(prompt).toContain('anleitung.md');
			expect(prompt).toContain('roomx-plan');
			const lower = prompt.toLowerCase();
			for (const word of FORBIDDEN) expect(lower.includes(word), word).toBe(false);
		}
	);

	it('asks for all questions in one message', () => {
		expect(buildPrompt('de', 'a.md')).toContain('einer einzigen Nachricht');
		expect(buildPrompt('en', 'a.md')).toContain('one single message');
	});

	it('is German or English', () => {
		expect(buildPrompt('de', 'a.md')).toContain('Du bist mein Einrichtungsplaner');
		expect(buildPrompt('en', 'a.md')).toContain('You are my interior planner');
	});
});

describe('prettyJson', () => {
	it('keeps short values on one line and breaks long ones', () => {
		expect(prettyJson({ a: 1, b: [1, 2] })).toBe('{ "a": 1, "b": [1, 2] }');
		const long = { text: 'x'.repeat(120), other: 1 };
		expect(prettyJson(long)).toBe(`{\n  "text": "${'x'.repeat(120)}",\n  "other": 1\n}`);
		expect(JSON.parse(prettyJson({ list: Array.from({ length: 40 }, (_, i) => ({ i })) }))).toEqual(
			{
				list: Array.from({ length: 40 }, (_, i) => ({ i }))
			}
		);
	});
});

describe('fixed built-ins in the instructions', () => {
	it.each(LANGUAGES)('state the rules for built-ins and keep-clear zones (%s)', (language) => {
		const { text } = instructionsFor(language);
		for (const word of [
			'keepClear',
			'freeElements',
			'fixtures',
			'fire',
			'airflow',
			'kitchen.mode',
			'catalog',
			'builtin'
		]) {
			expect(text).toContain(word);
		}
	});

	it.each(LANGUAGES)('name no vendor for built-ins (%s)', (language) => {
		const { text } = instructionsFor(language);
		const lower = text.toLowerCase();
		for (const word of FORBIDDEN) expect(lower).not.toContain(word);
	});
});
