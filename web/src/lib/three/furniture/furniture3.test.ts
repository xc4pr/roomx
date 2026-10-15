import { Box3, Mesh, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import {
	LOOK_ARMS,
	LOOK_BACKS,
	LOOK_BASES,
	LOOK_HEADBOARDS,
	LOOK_SHADES,
	LOOK_SHAPES,
	LOOK_STEMS,
	LookSchema,
	type Look
} from '#lib/core/catalog.ts';
import type { ModelType } from '#lib/core/schema.ts';
import { build, stats } from './snapshot.helper.ts';

type Dims = { w: number; d: number; h: number };

const TRIANGLE_BUDGET = 6000;

const DIMS: Partial<Record<ModelType, Dims>> = {
	table: { w: 1400, d: 800, h: 740 },
	roundTable: { w: 1000, d: 1000, h: 740 },
	desk: { w: 1500, d: 700, h: 740 },
	sofa: { w: 2000, d: 900, h: 850 },
	cornerSofa: { w: 2800, d: 1700, h: 850 },
	armchair: { w: 800, d: 850, h: 950 },
	chair: { w: 420, d: 500, h: 900 },
	officeChair: { w: 640, d: 640, h: 1100 },
	stool: { w: 350, d: 350, h: 650 },
	bed: { w: 1600, d: 2000, h: 900 },
	mirror: { w: 600, d: 25, h: 900 },
	floorLamp: { w: 350, d: 350, h: 1500 },
	tableLamp: { w: 250, d: 250, h: 450 },
	pendantLamp: { w: 450, d: 450, h: 1200 },
	wallLamp: { w: 150, d: 250, h: 200 }
};

function dimsOf(model: ModelType): Dims {
	const dims = DIMS[model];
	if (!dims) throw new Error(`no dims for ${model}`);
	return dims;
}

function size(object: Object3D): Vector3 {
	object.updateMatrixWorld(true);
	return new Box3().setFromObject(object, true).getSize(new Vector3());
}

function fingerprint(object: Object3D): string {
	const colors = new Set<string>();
	const shapes = new Set<string>();
	object.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		shapes.add(node.geometry.uuid);
		const list = Array.isArray(node.material) ? node.material : [node.material];
		for (const m of list) colors.add(`${m.color.getHexString()}${m.metalness}${m.roughness}`);
	});
	return JSON.stringify([stats(object), [...colors].sort(), [...shapes].sort()]);
}

function expectExact(model: ModelType, dims: Dims, look: Look, label: string): void {
	expect(LookSchema.safeParse(look).success, label).toBe(true);
	const object = build(model, dims, look);
	const got = size(object);
	expect(Math.abs(got.x - dims.w / 1000), `${label} w`).toBeLessThan(0.0005);
	expect(Math.abs(got.y - dims.h / 1000), `${label} h`).toBeLessThan(0.0005);
	expect(Math.abs(got.z - dims.d / 1000), `${label} d`).toBeLessThan(0.0005);
	expect(new Box3().setFromObject(object, true).min.y, `${label} floor`).toBeCloseTo(0, 4);
	expect(stats(object).triangles, `${label} triangles`).toBeLessThanOrEqual(TRIANGLE_BUDGET);
}

const everything: Partial<Record<ModelType, Look>> = {
	table: {
		legs: 'cross',
		shelf: true,
		baseMaterial: 'metal',
		frameColor: '#202020',
		accentColor: '#aa8855',
		wheels: true
	},
	roundTable: {
		legs: 'four',
		shelf: true,
		baseMaterial: 'metal',
		frameColor: '#202020',
		accentColor: '#aa8855'
	},
	desk: {
		legs: 'tframe',
		drawers: 8,
		shelf: true,
		frameColor: '#202020',
		accentColor: '#aa8855',
		wheels: true
	},
	sofa: {
		arms: 'rolled',
		back: 'wing',
		cushions: 6,
		base: 'frame',
		baseHeight: 200,
		frameColor: '#202020'
	},
	cornerSofa: { arms: 'wide', back: 'low', cushions: 6, base: 'legs', baseMaterial: 'metal' },
	armchair: { legs: 'cantilever', arms: 'wide', back: 'wing', cushions: 3, frameColor: '#d8b878' },
	chair: { legs: 'cantilever', baseMaterial: 'metal', frameColor: '#202020' },
	officeChair: { arms: 'none', frameColor: '#202020' },
	stool: { baseMaterial: 'metal', frameColor: '#202020' },
	bed: {
		headboard: 'slats',
		footboard: true,
		drawers: 8,
		base: 'frame',
		baseHeight: 250,
		frameColor: '#303030'
	},
	mirror: { shape: 'arch', border: 'wide', frameColor: '#303030' },
	floorLamp: { shade: 'globe', shadeColor: '#ffffff', stem: 'adjustable', frameColor: '#303030' },
	tableLamp: { shade: 'dome', shadeColor: '#ffffff', stem: 'arc', frameColor: '#303030' },
	pendantLamp: { shade: 'globe', shadeColor: '#ffffff', frameColor: '#303030' },
	wallLamp: { shade: 'cone', shadeColor: '#ffffff', stem: 'adjustable', frameColor: '#303030' }
};

describe('stage 3 builders with every feature', () => {
	for (const [model, look] of Object.entries(everything) as [ModelType, Look][]) {
		it(`${model} stays exact and within the triangle budget`, () => {
			expectExact(model, dimsOf(model), look, model);
		});
	}
});

describe('stage 3 typical looks', () => {
	const samples: [string, ModelType, Dims, Look][] = [
		[
			'POÄNG',
			'armchair',
			{ w: 680, d: 820, h: 1000 },
			{ legs: 'cantilever', cushions: 1, arms: 'none' }
		],
		[
			'STRANDMON',
			'armchair',
			{ w: 820, d: 960, h: 1010 },
			{ back: 'wing', arms: 'wide', base: 'feet' }
		],
		['KIVIK', 'sofa', { w: 2280, d: 950, h: 830 }, { arms: 'wide', cushions: 3, base: 'feet' }],
		[
			'MALM bed',
			'bed',
			{ w: 1600, d: 2090, h: 380 },
			{ headboard: 'panel', footboard: false, drawers: 4, base: 'none' }
		],
		[
			'arc lamp',
			'floorLamp',
			{ w: 1100, d: 350, h: 1900 },
			{ stem: 'arc', shade: 'dome', frameColor: '#202020' }
		],
		[
			'round mirror',
			'mirror',
			{ w: 600, d: 30, h: 600 },
			{ shape: 'round', border: 'wide', frameColor: '#202020' }
		],
		[
			'standing mirror',
			'mirror',
			{ w: 500, d: 450, h: 1600 },
			{ shape: 'arch', border: 'thin', legs: 'trestle' }
		],
		[
			'BEKANT',
			'desk',
			{ w: 1600, d: 800, h: 740 },
			{ legs: 'tframe', drawers: 3, baseMaterial: 'metal', wheels: false }
		],
		['trestle table', 'table', { w: 1800, d: 900, h: 740 }, { legs: 'trestle', shelf: true }],
		[
			'sled chair table',
			'roundTable',
			{ w: 1100, d: 1100, h: 750 },
			{ legs: 'cross', accentColor: '#f0f0f0' }
		]
	];
	for (const [name, model, dims, look] of samples) {
		it(`${name} is exact and within budget`, () => {
			expectExact(model, dims, look, name);
		});
	}
});

describe('every enum value keeps the model exact', () => {
	const ranges: [ModelType, Partial<Record<keyof Look, readonly unknown[]>>][] = [
		['table', { legs: ['four', 'trestle', 'pedestal', 'sled', 'panel', 'cross', 'tframe'] }],
		['desk', { legs: ['four', 'trestle', 'pedestal', 'sled', 'panel', 'cross', 'tframe'] }],
		['sofa', { arms: LOOK_ARMS, back: LOOK_BACKS, base: LOOK_BASES }],
		['cornerSofa', { arms: LOOK_ARMS, back: LOOK_BACKS, base: LOOK_BASES }],
		['armchair', { arms: LOOK_ARMS, back: LOOK_BACKS, base: LOOK_BASES }],
		['bed', { headboard: LOOK_HEADBOARDS, base: LOOK_BASES }],
		['mirror', { shape: LOOK_SHAPES, border: ['none', 'thin', 'wide'] }],
		['floorLamp', { shade: LOOK_SHADES, stem: LOOK_STEMS }],
		['tableLamp', { shade: LOOK_SHADES, stem: LOOK_STEMS }],
		['pendantLamp', { shade: LOOK_SHADES }],
		['wallLamp', { shade: LOOK_SHADES, stem: LOOK_STEMS }]
	];
	for (const [model, fields] of ranges) {
		it(model, () => {
			for (const [field, values] of Object.entries(fields)) {
				for (const value of values) {
					expectExact(
						model,
						dimsOf(model),
						{ [field]: value } as Look,
						`${model} ${field}=${String(value)}`
					);
				}
			}
		});
	}
});

describe('every stage 3 look field changes the model', () => {
	const T = 'table';
	const cases: [string, ModelType, Look, Look][] = [
		...(['trestle', 'pedestal', 'sled', 'panel', 'cross', 'tframe'] as const).map(
			(legs): [string, ModelType, Look, Look] => [
				`table legs ${legs}`,
				T,
				{ legs: 'four' },
				{ legs }
			]
		),
		['table legs four', T, { legs: 'trestle' }, { legs: 'four' }],
		['table shelf', T, { legs: 'four' }, { legs: 'four', shelf: true }],
		['table baseMaterial', T, { legs: 'four' }, { legs: 'four', baseMaterial: 'metal' }],
		['table frameColor', T, { legs: 'four' }, { legs: 'four', frameColor: '#202020' }],
		['table accentColor', T, { legs: 'four' }, { legs: 'four', accentColor: '#aa8855' }],
		['table wheels', T, { legs: 'four' }, { legs: 'four', wheels: true }],
		['roundTable legs four', 'roundTable', {}, { legs: 'four' }],
		['roundTable legs cross', 'roundTable', {}, { legs: 'cross' }],
		['roundTable shelf', 'roundTable', { legs: 'four' }, { legs: 'four', shelf: true }],
		['roundTable accentColor', 'roundTable', {}, { accentColor: '#aa8855' }],
		['roundTable frameColor', 'roundTable', {}, { frameColor: '#202020' }],
		['desk drawers block', 'desk', {}, { drawers: 4 }],
		['desk drawers none', 'desk', {}, { drawers: 0 }],
		['desk legs tframe', 'desk', {}, { legs: 'tframe' }],
		['desk legs sled', 'desk', {}, { legs: 'sled' }],
		['desk shelf', 'desk', { legs: 'four', drawers: 0 }, { legs: 'four', drawers: 0, shelf: true }],
		['desk wheels', 'desk', {}, { wheels: true }],
		['desk accentColor', 'desk', {}, { accentColor: '#aa8855' }],
		['desk baseMaterial', 'desk', {}, { baseMaterial: 'metal' }],
		...(['none', 'slim', 'wide', 'rolled'] as const).map(
			(arms): [string, ModelType, Look, Look] => [`sofa arms ${arms}`, 'sofa', {}, { arms }]
		),
		...(['low', 'medium', 'wing'] as const).map((back): [string, ModelType, Look, Look] => [
			`sofa back ${back}`,
			'sofa',
			{},
			{ back }
		]),
		['sofa cushions', 'sofa', {}, { cushions: 5 }],
		...(['none', 'plinth', 'feet', 'legs', 'frame'] as const).map(
			(base): [string, ModelType, Look, Look] => [`sofa base ${base}`, 'sofa', {}, { base }]
		),
		['sofa baseHeight', 'sofa', { base: 'legs' }, { base: 'legs', baseHeight: 300 }],
		['sofa baseMaterial', 'sofa', { base: 'legs' }, { base: 'legs', baseMaterial: 'metal' }],
		['sofa frameColor', 'sofa', { base: 'legs' }, { base: 'legs', frameColor: '#202020' }],
		['cornerSofa arms', 'cornerSofa', {}, { arms: 'none' }],
		['cornerSofa arms rolled', 'cornerSofa', {}, { arms: 'rolled' }],
		['cornerSofa back', 'cornerSofa', {}, { back: 'low' }],
		['cornerSofa cushions', 'cornerSofa', {}, { cushions: 5 }],
		['cornerSofa base plinth', 'cornerSofa', {}, { base: 'plinth' }],
		['cornerSofa base legs', 'cornerSofa', {}, { base: 'legs' }],
		['armchair wing', 'armchair', {}, { back: 'wing' }],
		['armchair cantilever', 'armchair', {}, { legs: 'cantilever' }],
		[
			'armchair cantilever frameColor',
			'armchair',
			{ legs: 'cantilever' },
			{ legs: 'cantilever', frameColor: '#d8b878' }
		],
		[
			'armchair cantilever baseMaterial',
			'armchair',
			{ legs: 'cantilever' },
			{ legs: 'cantilever', baseMaterial: 'metal' }
		],
		['chair cantilever', 'chair', {}, { legs: 'cantilever' }],
		['chair frameColor', 'chair', {}, { frameColor: '#202020' }],
		['officeChair arms', 'officeChair', {}, { arms: 'none' }],
		['officeChair frameColor', 'officeChair', {}, { frameColor: '#aa5500' }],
		['stool frameColor', 'stool', {}, { frameColor: '#202020' }],
		...(['none', 'panel', 'upholstered', 'slats', 'frame'] as const).map(
			(headboard): [string, ModelType, Look, Look] => [
				`bed headboard ${headboard}`,
				'bed',
				{},
				{ headboard }
			]
		),
		['bed footboard off', 'bed', {}, { footboard: false }],
		[
			'bed footboard upholstered',
			'bed',
			{ headboard: 'upholstered', footboard: false },
			{ headboard: 'upholstered', footboard: true }
		],
		['bed drawers', 'bed', {}, { drawers: 4 }],
		['bed drawers count', 'bed', { drawers: 2 }, { drawers: 3 }],
		...(['none', 'plinth', 'feet', 'legs', 'frame'] as const).map(
			(base): [string, ModelType, Look, Look] => [`bed base ${base}`, 'bed', {}, { base }]
		),
		['bed baseHeight', 'bed', { base: 'legs' }, { base: 'legs', baseHeight: 100 }],
		['bed frameColor', 'bed', {}, { frameColor: '#303030' }],
		['bed baseMaterial', 'bed', { base: 'legs' }, { base: 'legs', baseMaterial: 'metal' }],
		['mirror shape rect', 'mirror', {}, { shape: 'rect' }],
		['mirror shape round', 'mirror', {}, { shape: 'round' }],
		['mirror shape oval', 'mirror', {}, { shape: 'oval' }],
		['mirror shape arch', 'mirror', {}, { shape: 'arch' }],
		['mirror border none', 'mirror', {}, { border: 'none' }],
		['mirror border thin', 'mirror', {}, { border: 'thin' }],
		['mirror border wide', 'mirror', {}, { border: 'wide' }],
		['mirror frameColor', 'mirror', {}, { frameColor: '#202020' }],
		[
			'round mirror border',
			'mirror',
			{ shape: 'round', border: 'thin' },
			{ shape: 'round', border: 'wide' }
		],
		[
			'arch mirror border',
			'mirror',
			{ shape: 'arch', border: 'thin' },
			{ shape: 'arch', border: 'wide' }
		],
		...(['none', 'drum', 'cone', 'dome', 'globe'] as const).map(
			(shade): [string, ModelType, Look, Look] => [
				`floorLamp shade ${shade}`,
				'floorLamp',
				{},
				{ shade }
			]
		),
		['floorLamp shadeColor', 'floorLamp', {}, { shadeColor: '#aa3322' }],
		['floorLamp frameColor', 'floorLamp', {}, { frameColor: '#202020' }],
		...(['arc', 'adjustable', 'tripod'] as const).map((stem): [string, ModelType, Look, Look] => [
			`floorLamp stem ${stem}`,
			'floorLamp',
			{},
			{ stem }
		]),
		...(['none', 'drum', 'cone', 'dome', 'globe'] as const).map(
			(shade): [string, ModelType, Look, Look] => [
				`tableLamp shade ${shade}`,
				'tableLamp',
				{},
				{ shade }
			]
		),
		...(['arc', 'adjustable', 'tripod'] as const).map((stem): [string, ModelType, Look, Look] => [
			`tableLamp stem ${stem}`,
			'tableLamp',
			{},
			{ stem }
		]),
		['tableLamp shadeColor', 'tableLamp', {}, { shadeColor: '#aa3322' }],
		['tableLamp frameColor', 'tableLamp', {}, { frameColor: '#202020' }],
		...(['none', 'drum', 'cone', 'globe'] as const).map(
			(shade): [string, ModelType, Look, Look] => [
				`pendantLamp shade ${shade}`,
				'pendantLamp',
				{},
				{ shade }
			]
		),
		['pendantLamp shadeColor', 'pendantLamp', {}, { shadeColor: '#aa3322' }],
		['pendantLamp frameColor', 'pendantLamp', {}, { frameColor: '#202020' }],
		...(['none', 'drum', 'cone', 'dome', 'globe'] as const).map(
			(shade): [string, ModelType, Look, Look] => [
				`wallLamp shade ${shade}`,
				'wallLamp',
				{},
				{ shade }
			]
		),
		...(['arc', 'adjustable'] as const).map((stem): [string, ModelType, Look, Look] => [
			`wallLamp stem ${stem}`,
			'wallLamp',
			{},
			{ stem }
		]),
		['wallLamp shadeColor', 'wallLamp', {}, { shadeColor: '#aa3322' }],
		['wallLamp frameColor', 'wallLamp', {}, { frameColor: '#202020' }]
	];
	for (const [name, model, before, after] of cases) {
		it(name, () => {
			const dims =
				name.startsWith('mirror') ||
				name.startsWith('round mirror') ||
				name.startsWith('arch mirror')
					? mirrorDims(name)
					: dimsOf(model);
			expect(LookSchema.safeParse(after).success).toBe(true);
			expect(fingerprint(build(model, dims, after))).not.toEqual(
				fingerprint(build(model, dims, before))
			);
		});
	}

	it('standing mirror trestle and frame', () => {
		const dims = { w: 500, d: 450, h: 1600 };
		const plain = fingerprint(build('mirror', dims, { shape: 'rect' }));
		expect(fingerprint(build('mirror', dims, { shape: 'rect', legs: 'trestle' }))).not.toEqual(
			plain
		);
		expect(fingerprint(build('mirror', dims, { shape: 'rect', base: 'frame' }))).not.toEqual(plain);
	});
});

function mirrorDims(name: string): Dims {
	return name === 'mirror shape rect' ? { w: 500, d: 25, h: 500 } : { w: 600, d: 25, h: 900 };
}
