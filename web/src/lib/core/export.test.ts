import { describe, expect, it } from 'vitest';
import { buildExport, ExportSchema } from './export.ts';
import { createElement } from './defaults.ts';
import { sequentialIds } from './ids.ts';
import { rectangleRoom, sampleProject } from './fixtures.ts';
import type { Project, RoomElement } from './schema.ts';

function withElements(...kinds: [RoomElement['kind'], number, number][]): Project {
	const project = sampleProject();
	const room = project.rooms[0]!;
	const newId = sequentialIds('new');
	room.elements.push(
		...kinds.map(([kind, wall, along]) => createElement(kind, room, wall, along, newId))
	);
	return project;
}

const NOW = '2026-10-27T00:00:00.000Z';

describe('buildExport with fixed built-ins', () => {
	it('exports a project without new elements as before', () => {
		const document = buildExport(sampleProject(), { exportedAt: NOW });
		const room = document.rooms[0]!;
		expect(room.freeElements).toBeUndefined();
		expect(room.keepClear).toBeUndefined();
		expect(room.kitchen).toBeUndefined();
		expect(ExportSchema.parse(JSON.parse(JSON.stringify(document)))).toEqual(document);
	});

	it('lists wall built-ins with depth and kitchen modules from the start of the run', () => {
		const project = withElements(['kitchenRun', 3, 1500], ['shower', 4, 400]);
		const room = project.rooms[0]!;
		room.type = 'living';
		room.kitchen = { open: true, mode: 'builtin' };
		const document = buildExport(project, { exportedAt: NOW });
		const exported = document.rooms[0]!;
		const elements = exported.walls.flatMap((wall) => wall.elements);
		const run = elements.find((element) => element.kind === 'kitchenRun')!;
		expect(run.depth).toBeGreaterThan(0);
		expect(run.grid).toBeDefined();
		expect(run.tallHeight).toBeGreaterThan(0);
		const modules = run.modules!;
		expect(modules.length).toBeGreaterThan(0);
		expect(modules[0]!.from).toBe(0);
		for (const [index, module] of modules.entries()) {
			expect(module.to - module.from).toBe(module.width);
			if (index > 0) expect(module.from).toBe(modules[index - 1]!.to);
		}
		expect(elements.find((element) => element.kind === 'shower')?.depth).toBeGreaterThan(0);
		expect(exported.kitchen).toEqual({ open: true, mode: 'builtin' });
		expect(exported.keepClear!.fixtures.map((fixture) => fixture.elementId)).toContain(run.id);
		expect(ExportSchema.parse(JSON.parse(JSON.stringify(document)))).toEqual(document);
		room.type = 'bedroom';
		expect(buildExport(project, { exportedAt: NOW }).rooms[0]!.kitchen).toBeUndefined();
	});

	it('lists free elements with top and footprint and the keep-clear zones', () => {
		const project = withElements(['column', 1, 2000], ['fireplace', 3, 2000], ['acFloor', 2, 1500]);
		const document = buildExport(project, { exportedAt: NOW });
		const exported = document.rooms[0]!;
		const free = exported.freeElements!;
		expect(free.map((element) => element.kind)).toEqual(['column', 'fireplace', 'acFloor']);
		const column = free[0]!;
		expect(column.shape).toBe('round');
		expect(column.top).toBe(rectangleRoom().height);
		expect(column.footprint).toHaveLength(16);
		expect(free[1]!.footprint).toHaveLength(4);
		const keep = exported.keepClear!;
		expect(keep.fixtures).toHaveLength(3);
		expect(keep.zones.map((zone) => zone.kind).sort()).toEqual(['airflow', 'fire']);
		for (const zone of keep.zones) {
			expect(zone.polygon.length).toBeGreaterThanOrEqual(3);
			expect(zone.top).toBeGreaterThan(zone.bottom);
		}
		expect(ExportSchema.parse(JSON.parse(JSON.stringify(document)))).toEqual(document);
	});
});

describe('buildExport with roof slopes', () => {
	function sloped(): Project {
		const project = sampleProject();
		const room = project.rooms[0]!;
		room.slopes = [
			{
				id: 'slope-1',
				wall: 1,
				kneeHeight: 1000,
				angle: 45,
				from: 1500,
				to: 3500,
				dormers: [{ id: 'dormer-1', from: 2000, to: 2800, height: 2200 }]
			},
			{ id: 'slope-2', wall: 3, kneeHeight: 700, angle: 30 }
		];
		room.elements.push(
			{
				id: 'roof-1',
				kind: 'roofWindow',
				status: 'planned',
				wall: 1,
				offset: 2100,
				width: 780,
				length: 1180,
				elevation: 1200
			},
			{
				id: 'window-tall',
				kind: 'window',
				status: 'existing',
				wall: 3,
				offset: 1000,
				width: 1000,
				height: 1600,
				elevation: 600,
				windowType: 'tiltTurn'
			}
		);
		return project;
	}

	it('lists the section, dormers, opening cuts and roof windows', () => {
		const document = buildExport(sloped(), { exportedAt: NOW });
		const room = document.rooms[0]!;
		const [partial, whole] = room.slopes!;
		expect(partial).toMatchObject({
			id: 'slope-1',
			wall: 1,
			from: 1500,
			to: 3500,
			fullHeightAt: 1500
		});
		expect(partial!.dormers).toEqual([{ id: 'dormer-1', from: 2000, to: 2800, height: 2200 }]);
		expect(whole!.from).toBeUndefined();
		const cut = whole!.dormers!.find((dormer) => dormer.id === 'window-tall#cut');
		expect(cut).toEqual({
			id: 'window-tall#cut',
			from: 1000,
			to: 2000,
			height: 2200,
			openingCut: true
		});
		const [roof] = room.roofWindows!;
		expect(roof).toMatchObject({ id: 'roof-1', status: 'planned', wall: 1, offsetFromStart: 2100 });
		expect(roof!.top).toBeGreaterThan(roof!.elevation);
		expect(roof!.floorPolygon).toHaveLength(4);
		expect(room.walls.flatMap((wall) => wall.elements).some((e) => e.kind === 'roofWindow')).toBe(
			false
		);
		expect(ExportSchema.parse(JSON.parse(JSON.stringify(document)))).toEqual(document);
	});

	it('leaves slopes without anything new as before', () => {
		const project = sampleProject();
		project.rooms[0]!.slopes = [{ id: 's', wall: 1, kneeHeight: 2100, angle: 45 }];
		const room = buildExport(project, { exportedAt: NOW }).rooms[0]!;
		expect(room.slopes![0]!.from).toBeUndefined();
		expect(room.slopes![0]!.dormers).toBeUndefined();
		expect(room.roofWindows).toBeUndefined();
	});
});
