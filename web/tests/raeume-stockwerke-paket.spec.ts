import { fillChecked } from './helpers/app.ts';
import { contract } from './helpers/contract.ts';
import { exportPackage } from './helpers/export.ts';
import { test, expect } from './helpers/fixtures.ts';
import { planMessage } from './helpers/plan.ts';
import { validate } from './helpers/schema.ts';
import { addStairOnFloor, buildHouse } from './helpers/raeume.ts';

const DESK = 'generic-desk-160x80';

test('KI-Paket und Plan-Import: Stockwerke, Treppen, Treppenzonen, Konflikt im Klartext', async ({
	page
}) => {
	const house = await buildHouse(page, 'Paket Stockwerke E2E', 6000, 6000);
	const stair = await addStairOnFloor(page, house.id, 'EG');

	const exported = await exportPackage(page);
	const { exportSchema, planSchema } = contract();
	expect(validate(exported.json, exportSchema)).toEqual([]);
	const json = exported.json;
	expect(json.floors?.map((floor) => floor.name)).toEqual(['EG', '1. OG']);
	expect(json.stairs).toHaveLength(1);
	const exportedStair = json.stairs![0];
	expect(exportedStair.id).toBe(stair.id);
	expect(exportedStair.fromFloorId).toBe(house.lowerFloorId);
	expect(exportedStair.toFloorId).toBe(house.upperFloorId);
	expect(exportedStair.steps).toBeGreaterThan(10);

	const lower = json.rooms.find((room) => room.id === house.lowerId)!;
	const upper = json.rooms.find((room) => room.id === house.upperId)!;
	expect(lower.floorName).toBe('EG');
	expect(upper.floorName).toBe('1. OG');
	expect(lower.stairZones?.some((zone) => zone.kind === 'stair')).toBe(true);
	expect(upper.stairZones?.some((zone) => zone.kind === 'stairwell')).toBe(true);
	expect(exported.instructions).toMatch(/stairZones/);
	expect(exported.instructions).toMatch(/floorName/);

	const centre = (points: { x: number; y: number }[]) => ({
		x: Math.round(points.reduce((sum, p) => sum + p.x, 0) / points.length),
		y: Math.round(points.reduce((sum, p) => sum + p.y, 0) / points.length)
	});
	const treads = lower.stairZones!.find((zone) => zone.kind === 'stair')!;
	const plan = {
		format: 'roomx-plan',
		schemaVersion: 1,
		projectId: json.project.id,
		variants: [
			{
				name: 'A: Treppe',
				rooms: [
					{
						roomId: house.lowerId,
						items: [{ id: 'desk', catalogId: DESK, ...centre(treads.polygon), rotation: 0 }]
					}
				]
			}
		]
	};
	expect(validate(plan, planSchema)).toEqual([]);
	await fillChecked(page.getByTestId('import-text'), planMessage(plan));
	await expect(page.getByTestId('import-preview')).toBeVisible();
	await expect(page.getByTestId('import-conflicts')).toContainText('steht auf der Treppe');
});
