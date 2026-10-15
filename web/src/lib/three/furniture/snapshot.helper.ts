import { Box3, Mesh, Vector3, type Object3D } from 'three';
import type { Look } from '#lib/core/catalog.ts';
import type { ModelType } from '#lib/core/schema.ts';
import { buildFurniture } from './index.ts';

export const CABINET_MODELS = [
	'wardrobe',
	'dresser',
	'sideboard',
	'nightstand',
	'shelf',
	'cubeShelf',
	'wallShelf',
	'desk'
] as const satisfies readonly ModelType[];

export const CABINET_DIMS = [
	{ w: 1000, d: 600, h: 800 },
	{ w: 500, d: 350, h: 2010 },
	{ w: 2000, d: 580, h: 2360 },
	{ w: 1600, d: 450, h: 450 },
	{ w: 400, d: 300, h: 40 },
	{ w: 1400, d: 700, h: 750 }
];

export interface Stats {
	meshes: number;
	triangles: number;
	min: number[];
	max: number[];
	sig: number;
}

const round = (n: number): number => Math.round(n * 1e5) / 1e5;

export function stats(object: Object3D): Stats {
	object.updateMatrixWorld(true);
	let meshes = 0;
	let triangles = 0;
	let sig = 0;
	const v = new Vector3();
	object.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		meshes++;
		const g = node.geometry;
		triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
		v.setFromMatrixPosition(node.matrixWorld);
		sig += v.x + v.y * 3 + v.z * 7;
		sig +=
			node.matrixWorld.elements[0] +
			node.matrixWorld.elements[5] * 2 +
			node.matrixWorld.elements[10] * 3;
	});
	const box = new Box3().setFromObject(object, true);
	return {
		meshes,
		triangles,
		min: box.min.toArray().map(round),
		max: box.max.toArray().map(round),
		sig: round(sig)
	};
}

export function build(model: ModelType, dims: { w: number; d: number; h: number }, look?: Look) {
	return buildFurniture({ model, dims, color: '#c8a572', ...(look ? { look } : {}) });
}
