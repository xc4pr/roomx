import type { Point } from './schema.ts';

export const TEMPLATE_IDS = ['l', 'u', 't', 'chamfer', 'bay', 'notch'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];
export type TemplateParams = Record<string, number>;

export interface RoomTemplate {
	id: TemplateId;
	defaults: TemplateParams;
	build(params: TemplateParams): Point[];
	isValid(params: TemplateParams): boolean;
}

const positive = (params: TemplateParams) => Object.values(params).every((value) => value > 0);

export const ROOM_TEMPLATES: Record<TemplateId, RoomTemplate> = {
	l: {
		id: 'l',
		defaults: { a: 5000, b: 4000, c: 2500, d: 2000 },
		build: ({ a, b, c, d }) => [
			{ x: 0, y: 0 },
			{ x: a, y: 0 },
			{ x: a, y: d },
			{ x: c, y: d },
			{ x: c, y: b },
			{ x: 0, y: b }
		],
		isValid: (p) => positive(p) && p.c < p.a && p.d < p.b
	},
	u: {
		id: 'u',
		defaults: { a: 6000, b: 4000, c: 2000, d: 2000, e: 1500 },
		build: ({ a, b, c, d, e }) => [
			{ x: 0, y: 0 },
			{ x: a, y: 0 },
			{ x: a, y: b },
			{ x: a - d, y: b },
			{ x: a - d, y: b - e },
			{ x: c, y: b - e },
			{ x: c, y: b },
			{ x: 0, y: b }
		],
		isValid: (p) => positive(p) && p.c + p.d < p.a && p.e < p.b
	},
	t: {
		id: 't',
		defaults: { a: 6000, b: 4500, c: 2500, d: 2000 },
		build: ({ a, b, c, d }) => {
			const overhang = Math.round((a - c) / 2);
			return [
				{ x: 0, y: 0 },
				{ x: c, y: 0 },
				{ x: c, y: d },
				{ x: c + overhang, y: d },
				{ x: c + overhang, y: b },
				{ x: c + overhang - a, y: b },
				{ x: c + overhang - a, y: d },
				{ x: 0, y: d }
			];
		},
		isValid: (p) => positive(p) && p.c < p.a && p.d < p.b
	},
	chamfer: {
		id: 'chamfer',
		defaults: { a: 4000, b: 3000, c: 1000, d: 1000 },
		build: ({ a, b, c, d }) => [
			{ x: 0, y: 0 },
			{ x: a, y: 0 },
			{ x: a, y: b - d },
			{ x: a - c, y: b },
			{ x: 0, y: b }
		],
		isValid: (p) => positive(p) && p.c < p.a && p.d < p.b
	},
	bay: {
		id: 'bay',
		defaults: { a: 4000, b: 3000, c: 1500, d: 600, e: 1250 },
		build: ({ a, b, c, d, e }) => [
			{ x: 0, y: 0 },
			{ x: a, y: 0 },
			{ x: a, y: b },
			{ x: e + c, y: b },
			{ x: e + c, y: b + d },
			{ x: e, y: b + d },
			{ x: e, y: b },
			{ x: 0, y: b }
		],
		isValid: (p) => positive(p) && p.e + p.c < p.a
	},
	notch: {
		id: 'notch',
		defaults: { a: 4000, b: 3000, c: 1000, d: 400, e: 1500 },
		build: ({ a, b, c, d, e }) => [
			{ x: 0, y: 0 },
			{ x: a, y: 0 },
			{ x: a, y: b },
			{ x: e + c, y: b },
			{ x: e + c, y: b - d },
			{ x: e, y: b - d },
			{ x: e, y: b },
			{ x: 0, y: b }
		],
		isValid: (p) => positive(p) && p.e + p.c < p.a && p.d < p.b
	}
};
