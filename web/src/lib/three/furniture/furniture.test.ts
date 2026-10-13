import { Box3, Mesh, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { catalog } from '#lib/catalog/index.ts';
import { MODEL_TYPES, type Dims, type ModelType } from '#lib/core/schema.ts';
import { buildFurniture } from './index.ts';

const VARIANTS: Dims[] = [
	{ w: 1000, d: 600, h: 800 },
	{ w: 500, d: 350, h: 2010 },
	{ w: 2800, d: 1700, h: 850 },
	{ w: 300, d: 30, h: 400 },
	{ w: 3000, d: 10, h: 10 },
	{ w: 1200, d: 1200, h: 15 },
	{ w: 120, d: 90, h: 60 }
];

function measure(object: Object3D): Box3 {
	object.updateMatrixWorld(true);
	return new Box3().setFromObject(object, true);
}

function meshCount(object: Object3D): number {
	let count = 0;
	object.traverse((node) => {
		if (node instanceof Mesh) count++;
	});
	return count;
}

describe('buildFurniture', () => {
	for (const model of MODEL_TYPES) {
		it(`${model} matches its dimensions`, () => {
			for (const dims of VARIANTS) {
				const object = buildFurniture({ model, dims, color: '#c8a572' });
				const box = measure(object);
				const size = box.getSize(new Vector3());
				const centre = box.getCenter(new Vector3());
				expect(meshCount(object)).toBeGreaterThan(0);
				expect(size.x).toBeCloseTo(dims.w / 1000, 3);
				expect(size.y).toBeCloseTo(dims.h / 1000, 3);
				expect(size.z).toBeCloseTo(dims.d / 1000, 3);
				expect(box.min.y).toBeCloseTo(0, 3);
				expect(centre.x).toBeCloseTo(0, 3);
				expect(centre.z).toBeCloseTo(0, 3);
			}
		});
	}

	it('falls back to a box for unknown models', () => {
		const object = buildFurniture({
			model: 'nonsense' as ModelType,
			dims: { w: 400, d: 300, h: 200 },
			color: '#ffffff'
		});
		expect(measure(object).getSize(new Vector3()).y).toBeCloseTo(0.2, 3);
	});

	it('marks light sources on lamps', () => {
		for (const model of [
			'floorLamp',
			'tableLamp',
			'pendantLamp',
			'wallLamp',
			'ledStrip'
		] as const) {
			const object = buildFurniture({ model, dims: { w: 300, d: 300, h: 500 }, color: '#222222' });
			let lights = 0;
			object.traverse((node) => {
				if (node.userData.light === true) lights++;
			});
			expect(lights).toBeGreaterThan(0);
		}
	});

	it('builds every catalog entry to its dimensions', () => {
		for (const entry of catalog) {
			const object = buildFurniture({
				model: entry.model,
				dims: entry.dims,
				color: entry.colors[0]
			});
			const size = measure(object).getSize(new Vector3());
			expect(size.x, entry.id).toBeCloseTo(entry.dims.w / 1000, 3);
			expect(size.y, entry.id).toBeCloseTo(entry.dims.h / 1000, 3);
			expect(size.z, entry.id).toBeCloseTo(entry.dims.d / 1000, 3);
		}
	});
});
