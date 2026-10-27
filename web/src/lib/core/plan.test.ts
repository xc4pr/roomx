import { describe, expect, it } from 'vitest';
import { checkRoomItems, validateRoom } from './checks.ts';
import { buildExport, ExportSchema } from './export.ts';
import { sampleLookup, samplePlan, sampleProject } from './fixtures.ts';
import { sequentialIds } from './ids.ts';
import { migrateProject, UnsupportedVersionError } from './migrations.ts';
import { planJsonSchema, PlanSchema } from './plan.ts';
import { resolvePlan } from './planResolve.ts';
import { ProjectSchema, SCHEMA_VERSION, type Item } from './schema.ts';
import { formatArea, formatChf, formatLength, parseLength } from './units.ts';

function resolveSample() {
	const project = sampleProject();
	const resolved = resolvePlan(samplePlan(), project, sampleLookup, { newId: sequentialIds() });
	return { project, resolved, items: resolved.variants[0].items };
}

const byName = (items: Item[], name: string) => items.find((item) => item.name.includes(name))!;

describe('plan schema', () => {
	it('accepts the sample plan and exposes a JSON schema', () => {
		expect(PlanSchema.safeParse(samplePlan()).success).toBe(true);
		const schema = planJsonSchema() as { properties: Record<string, unknown> };
		expect(Object.keys(schema.properties)).toContain('variants');
	});

	it('rejects a wrong format marker', () => {
		expect(PlanSchema.safeParse({ ...samplePlan(), format: 'other' }).success).toBe(false);
	});
});

describe('resolvePlan', () => {
	it('resolves anchors, stacking and absolute positions', () => {
		const { resolved, items } = resolveSample();
		expect(resolved.issues).toEqual([]);
		expect(items).toHaveLength(5);
		expect(byName(items, 'MALM')).toMatchObject({ x: 1045, y: 1820, rotation: 270, elevation: 0 });
		const desk = byName(items, 'Schreibtisch');
		expect(desk).toMatchObject({ x: 3580, y: 2000, rotation: 90, elevation: 0 });
		expect(byName(items, 'Monitor')).toMatchObject({
			x: 3880,
			y: 2000,
			rotation: 90,
			elevation: 740,
			onItemId: desk.id,
			power: 1
		});
		expect(byName(items, 'Teppich')).toMatchObject({ x: 2100, y: 1600, rotation: 90 });
		expect(byName(items, 'Wandregal')).toMatchObject({ x: 2350, y: 130, elevation: 1500 });
	});

	it('turns electrical entries into suggestions', () => {
		const { resolved } = resolveSample();
		expect(resolved.variants[0].suggestions).toHaveLength(1);
		expect(resolved.variants[0].suggestions[0].element).toMatchObject({
			kind: 'socket',
			status: 'suggested',
			wall: 4,
			offset: 300,
			elevation: 300,
			gang: 3,
			width: 240,
			reason: 'Nachttisch links'
		});
		expect(resolved.brief?.budgetChf).toBe(3000);
		expect(resolved.variants[0].roomNotes).toEqual({ 'room-rect': 'Bett an der ruhigen Wand.' });
	});

	it('reports problems with room, item and field', () => {
		const plan = samplePlan();
		plan.variants[0].rooms[0].items = [
			{ catalogId: 'does-not-exist', anchor: { wall: 1, offset: 0 } },
			{ id: 'x', catalogId: 'generic-desk-160x80', anchor: { wall: 9, offset: 0 } },
			{ catalogId: 'generic-monitor-27', on: 'missing' },
			{ catalogId: 'generic-desk-160x80' }
		];
		plan.variants[0].rooms.push({ roomId: 'nope', items: [], electrical: [] });
		const { issues } = resolvePlan(plan, sampleProject(), sampleLookup);
		expect(issues.map((issue) => issue.code).sort()).toEqual(
			['missingPosition', 'unknownCarrier', 'unknownCatalogId', 'unknownRoom', 'unknownWall'].sort()
		);
		expect(issues.find((issue) => issue.code === 'unknownWall')).toMatchObject({
			roomId: 'room-rect',
			itemRef: 'x',
			field: 'anchor.wall'
		});
	});

	it('keeps locked items of the active variant', () => {
		const { project, items } = resolveSample();
		const lockedBed = { ...byName(items, 'MALM'), id: 'my-bed', locked: true, x: 2000 };
		project.variants = [
			{ id: 'v1', name: 'Mein Stand', source: 'user', items: [lockedBed], suggestions: [] }
		];
		project.activeVariantId = 'v1';
		const plan = samplePlan();
		plan.variants[0].rooms[0].items[0].id = 'my-bed';
		const resolved = resolvePlan(plan, project, sampleLookup);
		const beds = resolved.variants[0].items.filter((item) => item.category === 'bed');
		expect(beds).toHaveLength(1);
		expect(beds[0]).toMatchObject({ id: 'my-bed', x: 2000, locked: true });
		expect(resolved.issues.map((issue) => issue.code)).toEqual(['lockedKept']);
	});
});

describe('checks', () => {
	it('finds no errors in the sample plan', () => {
		const { project, resolved, items } = resolveSample();
		const suggested = resolved.variants[0].suggestions.map((suggestion) => suggestion.element);
		const issues = checkRoomItems(project.rooms[0], items, suggested);
		expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
	});

	it('flags collisions, blocked doors, walls and far sockets', () => {
		const { project, items } = resolveSample();
		const bed = byName(items, 'MALM');
		const desk = byName(items, 'Schreibtisch');
		const monitor = byName(items, 'Monitor');
		const moved = [
			{ ...bed, x: 900, y: 1050 },
			{ ...desk, x: 1500, y: 2000 },
			{ ...monitor, x: 1500, y: 2900 },
			{ ...byName(items, 'Wandregal'), x: 3900, y: 130 }
		];
		const room = { ...project.rooms[0], elements: project.rooms[0].elements.slice(0, 2) };
		const codes = checkRoomItems(room, moved).map((issue) => issue.code);
		expect(codes).toContain('doorBlocked');
		expect(codes).toContain('collision');
		expect(codes).toContain('outsideRoom');
		expect(codes).toContain('socketFar');
	});

	it('ignores rugs and stacked items for collisions', () => {
		const { project, items } = resolveSample();
		const collisions = checkRoomItems(project.rooms[0], items).filter(
			(issue) => issue.code === 'collision'
		);
		expect(collisions).toEqual([]);
	});

	it('validates rooms', () => {
		const room = sampleProject().rooms[0];
		expect(validateRoom(room)).toEqual([]);
		const broken = structuredClone(room);
		const door = broken.elements[0];
		if (door.kind === 'door') door.offset = 3600;
		const windowElement = broken.elements[1];
		if (windowElement.kind === 'window') windowElement.elevation = 1500;
		broken.elements.push({ ...broken.elements[2], id: 'socket-2' });
		expect(
			validateRoom(broken)
				.map((issue) => issue.code)
				.sort()
		).toEqual(['elementOutsideWall', 'elementOverlap', 'elementTooHigh']);
	});
});

describe('export', () => {
	it('derives walls, spans and zones', () => {
		const { project, resolved } = resolveSample();
		project.variants = resolved.variants;
		project.activeVariantId = resolved.variants[0].id;
		const doc = buildExport(project, { exportedAt: '2026-01-02T00:00:00.000Z' });
		expect(ExportSchema.safeParse(doc).success).toBe(true);
		const room = doc.rooms[0];
		expect(room.areaM2).toBe(12);
		expect(room.perimeter).toBe(14000);
		expect(room.walls[0]).toMatchObject({ number: 1, from: 'A', to: 'B', length: 4000 });
		expect(room.walls[0].elements[0]).toMatchObject({
			kind: 'door',
			offsetFromStart: 200,
			offsetFromEnd: 3000,
			top: 2000
		});
		expect(room.walls[0].freeSpans).toEqual([
			{ from: 0, to: 200, length: 200 },
			{ from: 1000, to: 4000, length: 3000 }
		]);
		expect(room.walls[3]).toMatchObject({ from: 'D', to: 'A', directionDeg: 270 });
		expect(room.doorSwings).toHaveLength(1);
		expect(room.windowZones[0].sillHeight).toBe(900);
		expect(doc.variants[0].active).toBe(true);
		expect(doc.variants[0].items[0].footprint).toHaveLength(4);
		expect(doc.variants[0].totalChf).toBe(249 + 299 + 250 + 199);
	});

	it('limits the export to selected rooms', () => {
		const doc = buildExport(sampleProject(), { roomIds: ['room-l'] });
		expect(doc.rooms.map((room) => room.id)).toEqual(['room-l']);
		expect(doc.rooms[0].corners).toHaveLength(6);
	});
});

describe('migrations and units', () => {
	it('round-trips the current version and upgrades old documents', () => {
		const project = sampleProject();
		expect(migrateProject(project)).toEqual(ProjectSchema.parse(project));
		const { schemaVersion: _version, createdAt: _created, variants: _variants, ...old } = project;
		const migrated = migrateProject(old);
		expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
		expect(migrated.variants).toEqual([]);
		expect(() => migrateProject({ ...project, schemaVersion: 99 })).toThrow(
			UnsupportedVersionError
		);
	});

	it('formats and parses lengths', () => {
		expect(formatLength(4205, 'cm', 'de')).toBe('420,5 cm');
		expect(formatLength(4205, 'cm', 'en')).toBe('420.5 cm');
		expect(formatLength(4000, 'cm', 'de')).toBe('400 cm');
		expect(formatLength(4205, 'm', 'de')).toBe('4,205 m');
		expect(parseLength('420,5', 'cm')).toBe(4205);
		expect(parseLength('4.2 m', 'm')).toBe(4200);
		expect(parseLength('abc', 'cm')).toBeUndefined();
		expect(formatArea(12_345_000, 'de')).toBe('12,35 m²');
		expect(formatChf(1299, 'de')).toContain('CHF');
	});
});

describe('roof slopes in checks and export', () => {
	it('flags furniture that does not fit under a slope', () => {
		const { project, items } = resolveSample();
		const room = {
			...project.rooms[0],
			slopes: [{ id: 's2', wall: 2, kneeHeight: 600, angle: 30 }]
		};
		const codes = checkRoomItems(room, items).map((issue) => issue.code);
		expect(codes).toContain('underSlope');
		expect(validateRoom(room).map((issue) => issue.code)).toContain('elementTooHigh');
	});

	it('exports slopes with derived distances', () => {
		const project = sampleProject();
		project.rooms[0].slopes = [{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45 }];
		const doc = buildExport(project);
		expect(ExportSchema.safeParse(doc).success).toBe(true);
		expect(doc.rooms[0].slopes).toEqual([
			{ wall: 1, kneeHeight: 1000, angleDeg: 45, fullHeightAt: 1500, standingHeightAt: 1000 }
		]);
		expect(doc.rooms[1].slopes).toBeUndefined();
	});
});
