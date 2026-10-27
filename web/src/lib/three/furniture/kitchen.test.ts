import { Box3, Mesh, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { ModelType } from '#lib/core/schema.ts';
import { build, stats } from './snapshot.helper.ts';

const BUDGET = 400;

const DIMS: Partial<Record<ModelType, { w: number; d: number; h: number }[]>> = {
	kitchenBase: [
		{ w: 550, d: 600, h: 900 },
		{ w: 600, d: 600, h: 900 }
	],
	kitchenSink: [{ w: 800, d: 600, h: 900 }],
	kitchenWall: [{ w: 600, d: 350, h: 700 }],
	kitchenTall: [{ w: 600, d: 600, h: 2100 }],
	hob: [{ w: 600, d: 520, h: 50 }],
	oven: [{ w: 600, d: 550, h: 600 }],
	fridge: [{ w: 600, d: 650, h: 1850 }]
};

const MODELS = Object.keys(DIMS) as ModelType[];

function geometries(object: Object3D): Set<string> {
	const ids = new Set<string>();
	object.traverse((node) => {
		if (node instanceof Mesh) ids.add(node.geometry.uuid);
	});
	return ids;
}

describe('kitchen furniture builders', () => {
	for (const model of MODELS) {
		it(`${model} has exact size, stands on the floor and stays in budget`, () => {
			for (const dims of DIMS[model] ?? []) {
				const object = build(model, dims, undefined);
				object.updateMatrixWorld(true);
				const box = new Box3().setFromObject(object, true);
				const size = box.getSize(new Vector3());
				expect(size.x).toBeCloseTo(dims.w / 1000, 3);
				expect(size.y).toBeCloseTo(dims.h / 1000, 3);
				expect(size.z).toBeCloseTo(dims.d / 1000, 3);
				expect(box.min.y).toBeCloseTo(0, 4);
				const { triangles, meshes } = stats(object);
				expect(meshes).toBeGreaterThan(1);
				expect(triangles).toBeLessThanOrEqual(BUDGET);
			}
		});

		it(`${model} shares its geometries between builds`, () => {
			const dims = (DIMS[model] ?? [])[0];
			const first = geometries(build(model, dims));
			const second = geometries(build(model, { ...dims, w: dims.w + 100 }));
			for (const id of first) expect(second.has(id)).toBe(true);
		});
	}

	it('tints with the given colour', () => {
		const object = build('kitchenBase', DIMS.kitchenBase![0]);
		const colours = new Set<string>();
		object.traverse((node) => {
			if (node instanceof Mesh && !Array.isArray(node.material)) {
				colours.add(node.material.color.getHexString());
			}
		});
		expect(colours.has('c8a572')).toBe(true);
	});

	it('gives each model its own shape', () => {
		const shapes = new Set(
			MODELS.map((model) => JSON.stringify(stats(build(model, (DIMS[model] ?? [])[0])).triangles))
		);
		expect(shapes.size).toBeGreaterThan(4);
	});
});
