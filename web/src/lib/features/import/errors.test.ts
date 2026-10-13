import { describe, expect, it } from 'vitest';
import { sampleLookup, samplePlan, sampleProject } from '#lib/core/fixtures.ts';
import { PlanSchema } from '#lib/core/plan.ts';
import { resolvePlan } from '#lib/core/planResolve.ts';
import {
	describePath,
	describePlanIssue,
	describeZodError,
	type DescribeContext
} from './errors.ts';

const project = sampleProject();
const context = (language: 'de' | 'en'): DescribeContext => ({
	project,
	lookup: sampleLookup,
	language
});

function broken() {
	const plan = JSON.parse(JSON.stringify(samplePlan())) as ReturnType<typeof samplePlan>;
	return plan as unknown as Record<string, any>;
}

function errors(raw: unknown, language: 'de' | 'en' = 'de') {
	const parsed = PlanSchema.safeParse(raw);
	if (parsed.success) throw new Error('expected failure');
	return describeZodError(parsed.error, raw, context(language));
}

describe('describePath', () => {
	it('names variant, room, item and field', () => {
		const raw = broken();
		expect(
			describePath(['variants', 0, 'rooms', 0, 'items', 0, 'anchor', 'wall'], raw, context('de'))
		).toBe('Variante 1 › Schlafzimmer › MALM Bettgestell 160×200 › anchor.wall');
		expect(
			describePath(['variants', 0, 'rooms', 0, 'items', 4, 'dims', 'w'], raw, context('en'))
		).toBe('Variant 1 › Schlafzimmer › Wandregal › dims.w');
		expect(
			describePath(['variants', 0, 'rooms', 0, 'electrical', 0, 'kind'], raw, context('de'))
		).toBe('Variante 1 › Schlafzimmer › Steckdose 1 › kind');
		expect(describePath(['projectId'], raw, context('de'))).toBe('projectId');
	});

	it('falls back to the room id and item position', () => {
		const raw = broken();
		raw.variants[0].rooms[0].roomId = 'room-unbekannt';
		delete raw.variants[0].rooms[0].items[1].id;
		delete raw.variants[0].rooms[0].items[1].catalogId;
		expect(
			describePath(['variants', 0, 'rooms', 0, 'items', 1, 'offset'], raw, context('de'))
		).toBe('Variante 1 › room-unbekannt › Möbel 2 › offset');
	});
});

describe('describeZodError', () => {
	it('explains missing fields, wrong types and wrong values in German', () => {
		const raw = broken();
		delete raw.projectId;
		raw.variants[0].rooms[0].items[0].anchor.wall = 'zwei';
		raw.variants[0].rooms[0].items[1].anchor.offset = 12.5;
		raw.variants[0].rooms[0].items[3].category = 'sofaa';
		raw.variants[0].rooms[0].items[3].priceChf = -2;
		raw.variants[0].name = '';
		const lines = errors(raw);
		expect(lines).toContain('projectId: fehlt');
		expect(lines).toContain(
			'Variante 1 › Schlafzimmer › MALM Bettgestell 160×200 › anchor.wall: hat den falschen Typ (erwartet: Zahl, erhalten: Text)'
		);
		expect(lines).toContain(
			'Variante 1 › Schlafzimmer › Schreibtisch 160×80 › anchor.offset: muss eine ganze Zahl sein (Millimeter, ohne Komma)'
		);
		expect(
			lines.some((line) => /category: muss einer dieser Werte sein: bed, sofa/.test(line))
		).toBe(true);
		expect(lines).toContain(
			'Variante 1 › Schlafzimmer › Teppich 200×300 › priceChf: muss mindestens 0 sein'
		);
		expect(lines).toContain('Variante 1 › name: darf nicht kürzer als 1 Zeichen sein');
	});

	it('speaks English too', () => {
		const raw = broken();
		raw.variants[0].rooms[0].items[0].anchor.wall = null;
		raw.variants[0].rooms[0].items[2].dims = { w: 100 };
		const lines = errors(raw, 'en');
		expect(lines).toContain(
			'Variant 1 › Schlafzimmer › MALM bed frame 160×200 › anchor.wall: is missing'
		);
		expect(lines).toContain('Variant 1 › Schlafzimmer › Monitor 27" › dims.d: is missing');
	});

	it('recognises documents that are not a plan', () => {
		const raw = broken();
		raw.format = 'roomx-export';
		raw.schemaVersion = 2;
		const lines = errors(raw);
		expect(lines).toContain('format: ist nicht «roomx-plan»: Das ist kein Einrichtungsplan');
		expect(lines).toContain('schemaVersion: Version 2 wird nicht unterstützt (erwartet: 1)');
	});

	it('names missing lists and empty arrays', () => {
		const raw = broken();
		raw.variants = [];
		expect(errors(raw)).toContain('variants: braucht mindestens 1 Einträge');
	});
});

describe('describePlanIssue', () => {
	it('turns resolver issues into readable lines', () => {
		const plan = PlanSchema.parse(samplePlan());
		plan.variants[0].rooms[0].items[0].anchor = { wall: 9, offset: 0 };
		plan.variants[0].rooms.push({ roomId: 'room-x', items: [], electrical: [] });
		plan.projectId = 'anderes-projekt';
		const resolved = resolvePlan(plan, project, sampleLookup);
		const lines = resolved.issues.map((issue) => describePlanIssue(issue, context('de'), plan));
		const wall = lines.find((line) => line.message.includes('Wand'));
		expect(wall?.severity).toBe('error');
		expect(wall?.where).toBe('Variante 1 › Schlafzimmer › MALM Bettgestell 160×200 (anchor.wall)');
		expect(lines.find((line) => line.message.includes('room-x'))?.message).toBe(
			'Raum «room-x» gibt es in diesem Projekt nicht. Der Raum wird übersprungen.'
		);
		expect(lines.find((line) => line.severity === 'warning')?.message).toContain('anderen Projekt');
	});
});
