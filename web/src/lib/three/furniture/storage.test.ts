import { Box3, Mesh, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { LookSchema, type Look } from '#lib/core/catalog.ts';
import type { ModelType } from '#lib/core/schema.ts';
import baseline from './storage-baseline.json';
import { build, CABINET_DIMS, CABINET_MODELS, stats } from './snapshot.helper.ts';

interface Sample {
	name: string;
	model: ModelType;
	dims: { w: number; d: number; h: number };
	look: Look;
}

const SAMPLES: Sample[] = [
	{
		name: 'MALM',
		model: 'dresser',
		dims: { w: 800, d: 480, h: 1000 },
		look: { base: 'none', handle: 'recessTop' }
	},
	{
		name: 'HEMNES',
		model: 'dresser',
		dims: { w: 1600, d: 500, h: 960 },
		look: {
			base: 'plinth',
			handle: 'knob',
			frontStyle: 'frame',
			top: 'overhang',
			accentColor: '#b89466',
			rows: Array.from({ length: 4 }, () => ({ kind: 'drawer' as const, cols: 2 }))
		}
	},
	{
		name: 'CN3',
		model: 'sideboard',
		dims: { w: 1200, d: 450, h: 900 },
		look: {
			base: 'frame',
			wheels: true,
			handle: 'bar',
			rows: [
				{ kind: 'flap', cols: 3, weight: 1 },
				{ kind: 'open', cols: 3, weight: 1.2 },
				{ kind: 'drawer', cols: 3, weight: 1 }
			]
		}
	},
	{
		name: 'PAX',
		model: 'wardrobe',
		dims: { w: 1500, d: 580, h: 2010 },
		look: { base: 'plinth', handle: 'none', rows: [{ kind: 'slide', cols: 3 }] }
	},
	{
		name: 'IVAR',
		model: 'shelf',
		dims: { w: 800, d: 300, h: 1790 },
		look: {
			sides: 'ladder',
			rows: [
				{ kind: 'open', cols: 1, weight: 3 },
				{ kind: 'door', cols: 2, weight: 2 }
			]
		}
	},
	{
		name: 'sections sideboard',
		model: 'sideboard',
		dims: { w: 1800, d: 400, h: 600 },
		look: {
			base: 'legs',
			sections: [
				{ weight: 2, rows: [{ kind: 'door', cols: 2 }] },
				{ rows: [{ kind: 'open', cols: 1 }] },
				{
					rows: [
						{ kind: 'drawer', cols: 1 },
						{ kind: 'drawer', cols: 1 },
						{ kind: 'drawer', cols: 1 }
					]
				}
			]
		}
	},
	{
		name: 'KALLAX',
		model: 'cubeShelf',
		dims: { w: 1470, d: 390, h: 1470 },
		look: { rows: Array.from({ length: 4 }, () => ({ kind: 'open' as const, cols: 4 })) }
	},
	{
		name: 'BILLY',
		model: 'shelf',
		dims: { w: 800, d: 280, h: 2020 },
		look: {
			base: 'plinth',
			books: true,
			rows: [
				{ kind: 'open', cols: 1, weight: 3 },
				{ kind: 'door', cols: 2, weight: 1 }
			]
		}
	}
];

const TRIANGLE_BUDGET = 6000;

function size(object: Object3D): Vector3 {
	object.updateMatrixWorld(true);
	return new Box3().setFromObject(object, true).getSize(new Vector3());
}

function fingerprint(object: Object3D): string {
	const colors = new Set<string>();
	object.traverse((node) => {
		if (node instanceof Mesh && !Array.isArray(node.material)) {
			colors.add(`${node.material.type}${node.material.color.getHexString()}`);
		}
	});
	return JSON.stringify([stats(object), [...colors].sort()]);
}

describe('cabinet builders without look', () => {
	for (const model of CABINET_MODELS) {
		it(`${model} keeps meshes, triangles and bounds`, () => {
			CABINET_DIMS.forEach((dims, i) => {
				const expected = (baseline as Record<string, unknown>)[`${model}#${i}`];
				expect(stats(build(model, dims)), `${model}#${i}`).toEqual(expected);
				expect(stats(build(model, dims, {})), `${model}#${i} empty`).toEqual(expected);
			});
		});
	}
});

describe('cabinet builders with look', () => {
	for (const s of SAMPLES) {
		it(`${s.name} is valid, exact and within budget`, () => {
			expect(LookSchema.safeParse(s.look).success).toBe(true);
			const object = build(s.model, s.dims, s.look);
			const dims = size(object);
			expect(Math.abs(dims.x - s.dims.w / 1000)).toBeLessThan(0.0005);
			expect(Math.abs(dims.y - s.dims.h / 1000)).toBeLessThan(0.0005);
			expect(Math.abs(dims.z - s.dims.d / 1000)).toBeLessThan(0.0005);
			expect(object.children[0].scale.toArray()).toEqual([1, 1, 1]);
			expect(new Box3().setFromObject(object, true).min.y).toBeCloseTo(0, 4);
			expect(stats(object).triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET);
		});
	}

	it('stays exact for every base, handle and row kind', () => {
		const kinds = ['drawer', 'door', 'flap', 'open', 'glass', 'slide'] as const;
		for (const base of ['none', 'plinth', 'feet', 'legs', 'frame'] as const) {
			for (const handle of ['none', 'bar', 'knob', 'recessTop', 'hole'] as const) {
				const look: Look = {
					base,
					handle,
					wheels: base === 'frame',
					rows: kinds.map((kind) => ({ kind, cols: 2 }))
				};
				const dims = { w: 1000, d: 450, h: 1400 };
				const object = build('wardrobe', dims, look);
				const got = size(object);
				expect(object.children[0].scale.toArray(), `${base} ${handle}`).toEqual([1, 1, 1]);
				expect(Math.abs(got.x - 1)).toBeLessThan(0.0005);
				expect(Math.abs(got.y - 1.4)).toBeLessThan(0.0005);
				expect(Math.abs(got.z - 0.45)).toBeLessThan(0.0005);
			}
		}
	});
});

describe('every look field changes the model', () => {
	const dresser = { w: 1000, d: 450, h: 900 };
	const shelf = { w: 800, d: 300, h: 1800 };
	const frame: Look = { base: 'frame' };
	const rows = [
		{ kind: 'drawer', cols: 1 },
		{ kind: 'door', cols: 2 }
	] as const;
	const cases: [string, ModelType, Sample['dims'], Look, Look][] = [
		['base none', 'dresser', dresser, {}, { base: 'none' }],
		['base plinth', 'dresser', dresser, {}, { base: 'plinth' }],
		['base feet', 'dresser', dresser, {}, { base: 'feet' }],
		['base legs', 'sideboard', dresser, {}, { base: 'legs' }],
		['base frame', 'dresser', dresser, {}, frame],
		['baseHeight', 'dresser', dresser, { base: 'legs' }, { base: 'legs', baseHeight: 250 }],
		['baseMaterial', 'dresser', dresser, { base: 'legs' }, { base: 'legs', baseMaterial: 'metal' }],
		['handle none', 'dresser', dresser, {}, { handle: 'none' }],
		['handle knob', 'dresser', dresser, {}, { handle: 'knob' }],
		['handle recessTop', 'dresser', dresser, {}, { handle: 'recessTop' }],
		['handle hole', 'dresser', dresser, {}, { handle: 'hole' }],
		['rows', 'dresser', dresser, {}, { rows: [...rows] }],
		[
			'row flap',
			'dresser',
			dresser,
			{ rows: [{ kind: 'drawer', cols: 1 }] },
			{ rows: [{ kind: 'flap', cols: 1 }] }
		],
		[
			'row open',
			'dresser',
			dresser,
			{ rows: [{ kind: 'drawer', cols: 1 }] },
			{ rows: [{ kind: 'open', cols: 1 }] }
		],
		[
			'row glass',
			'dresser',
			dresser,
			{ rows: [{ kind: 'door', cols: 2 }] },
			{ rows: [{ kind: 'glass', cols: 2 }] }
		],
		[
			'row slide',
			'dresser',
			dresser,
			{ rows: [{ kind: 'door', cols: 2 }] },
			{ rows: [{ kind: 'slide', cols: 2 }] }
		],
		[
			'handleless slide',
			'wardrobe',
			dresser,
			{ rows: [{ kind: 'slide', cols: 2 }] },
			{ handle: 'none', rows: [{ kind: 'slide', cols: 2 }] }
		],
		[
			'sections',
			'sideboard',
			dresser,
			{ rows: [{ kind: 'door', cols: 2 }] },
			{
				sections: [
					{ rows: [{ kind: 'door', cols: 1 }] },
					{
						rows: [
							{ kind: 'drawer', cols: 1 },
							{ kind: 'drawer', cols: 1 }
						]
					}
				]
			}
		],
		['frontStyle', 'dresser', dresser, {}, { frontStyle: 'frame' }],
		[
			'sides',
			'shelf',
			shelf,
			{ rows: [{ kind: 'open', cols: 1 }] },
			{ sides: 'ladder', rows: [{ kind: 'open', cols: 1 }] }
		],
		['wheels', 'dresser', dresser, frame, { ...frame, wheels: true }],
		['top', 'dresser', dresser, {}, { top: 'overhang' }],
		['books', 'shelf', shelf, { books: false }, { books: true }],
		['frameColor', 'dresser', dresser, frame, { ...frame, frameColor: '#202020' }],
		[
			'accentColor',
			'dresser',
			dresser,
			{ top: 'overhang' },
			{ top: 'overhang', accentColor: '#aa5500' }
		],
		['bodyColor', 'dresser', dresser, { top: 'flush' }, { top: 'flush', bodyColor: '#aa5500' }]
	];
	for (const [name, model, dims, before, after] of cases) {
		it(name, () => {
			expect(LookSchema.safeParse(after).success).toBe(true);
			expect(fingerprint(build(model, dims, after))).not.toEqual(
				fingerprint(build(model, dims, before))
			);
		});
	}
});

describe('sections run from the left as seen from the front', () => {
	it('puts the first section on the viewer side +x (front faces -z)', () => {
		const object = build(
			'sideboard',
			{ w: 1600, d: 450, h: 800 },
			{
				sections: [
					{ rows: [{ kind: 'drawer', cols: 1 }] },
					{ rows: [{ kind: 'open', cols: 1 }] },
					{ rows: [{ kind: 'open', cols: 1 }] }
				]
			}
		);
		object.updateMatrixWorld(true);
		const fronts: number[] = [];
		object.traverse((node) => {
			if (!(node instanceof Mesh)) return;
			const box = new Box3().setFromObject(node, true);
			const width = box.max.x - box.min.x;
			if (box.min.z < -0.185 && box.max.z - box.min.z < 0.05 && width > 0.2 && width < 0.8) {
				fronts.push((box.min.x + box.max.x) / 2);
			}
		});
		expect(fronts.length).toBeGreaterThan(0);
		for (const x of fronts) expect(x).toBeGreaterThan(0.2);
	});
});
