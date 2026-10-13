import type { Exported } from './export.ts';

export const PLAN_ITEMS = {
	bed: { catalogId: 'ikea-malm-bed-160x200', anchor: { wall: 2, offset: 200 } },
	desk: { catalogId: 'generic-desk-160x80', anchor: { wall: 6, offset: 600 } },
	monitor: { catalogId: 'generic-monitor-27', on: 'desk' },
	rug: { catalogId: 'generic-rug-120x180', x: 2400, y: 1400, rotation: 90 }
};

export const EXPECTED = {
	bed: { x: 4355, y: 1080, rotation: 90, elevation: 0 },
	desk: { x: 400, y: 2800, rotation: 270, elevation: 0 },
	monitor: { x: 100, y: 2800, rotation: 270, elevation: 740 },
	rug: { x: 2400, y: 1400, rotation: 90, elevation: 0 }
};

export function buildPlan(exported: Exported) {
	const room = exported.json.rooms[0];
	return {
		format: 'roomx-plan',
		schemaVersion: 1,
		projectId: exported.json.project.id,
		variants: [
			{
				name: 'A: E2E',
				rooms: [
					{
						roomId: room.id,
						items: [
							{ id: 'bed', ...PLAN_ITEMS.bed },
							{ id: 'desk', ...PLAN_ITEMS.desk },
							{ ...PLAN_ITEMS.monitor },
							{ ...PLAN_ITEMS.rug }
						],
						electrical: [
							{
								kind: 'socket',
								wall: 6,
								offset: 1000,
								elevation: 300,
								gang: 2,
								reason: 'Schreibtisch'
							}
						],
						notes: 'Bett an der ruhigen Wand.'
					}
				]
			}
		]
	};
}

export function planMessage(plan: unknown): string {
	return [
		'Hier ist mein Vorschlag für die Einrichtung:',
		'',
		'```json',
		JSON.stringify(plan, null, 2),
		'```',
		'',
		'Sag Bescheid, wenn du etwas verschieben möchtest.'
	].join('\n');
}
