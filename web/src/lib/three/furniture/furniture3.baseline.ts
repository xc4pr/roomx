import type { ModelType } from '#lib/core/schema.ts';
import { CABINET_DIMS } from './snapshot.helper.ts';

export const STAGE3_MODELS = [
	'table',
	'roundTable',
	'sofa',
	'cornerSofa',
	'armchair',
	'chair',
	'officeChair',
	'stool',
	'bed',
	'mirror',
	'floorLamp',
	'tableLamp',
	'pendantLamp',
	'wallLamp'
] as const satisfies readonly ModelType[];

type D = { w: number; d: number; h: number };

const EXTRA: Partial<Record<ModelType, D[]>> = {
	table: [
		{ w: 1400, d: 800, h: 740 },
		{ w: 2200, d: 1000, h: 750 }
	],
	roundTable: [{ w: 1100, d: 1100, h: 750 }],
	sofa: [
		{ w: 2200, d: 950, h: 850 },
		{ w: 1500, d: 880, h: 800 }
	],
	cornerSofa: [{ w: 2800, d: 1700, h: 850 }],
	armchair: [{ w: 800, d: 850, h: 900 }],
	chair: [{ w: 420, d: 500, h: 900 }],
	officeChair: [{ w: 640, d: 640, h: 1100 }],
	stool: [{ w: 350, d: 350, h: 650 }],
	bed: [
		{ w: 1400, d: 2000, h: 900 },
		{ w: 900, d: 2000, h: 800 },
		{ w: 1800, d: 2100, h: 1000 }
	],
	mirror: [
		{ w: 500, d: 30, h: 500 },
		{ w: 400, d: 25, h: 1400 },
		{ w: 500, d: 400, h: 1600 }
	],
	floorLamp: [{ w: 300, d: 300, h: 1500 }],
	tableLamp: [{ w: 250, d: 250, h: 450 }],
	pendantLamp: [{ w: 450, d: 450, h: 1200 }],
	wallLamp: [{ w: 150, d: 250, h: 200 }]
};

export function stage3Dims(model: ModelType): D[] {
	return [...CABINET_DIMS, ...(EXTRA[model] ?? [])];
}
