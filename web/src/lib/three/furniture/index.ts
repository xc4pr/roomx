import { Box3, Group, Mesh, Vector3, type Material, type Object3D } from 'three';
import type { Look } from '#lib/core/catalog.ts';
import type { ModelType } from '#lib/core/schema.ts';
import { MM } from '../coords.ts';
import type { FurnitureBuilder } from '../types.ts';
import { bed } from './bed.ts';
import { decor } from './decor.ts';
import { devices } from './devices.ts';
import { box, disposeKit, mat, palette, type Palette } from './kit.ts';
import { lighting } from './lighting.ts';
import { seating } from './seating.ts';
import { storage } from './storage.ts';
import { tables } from './tables.ts';

type Build = (w: number, d: number, h: number, p: Palette, look?: Look) => Group;

const plainBox: Build = (w, d, h, p) => {
	const g = new Group();
	box(g, mat('matte', p.main), w, h, d, 0, 0, 0);
	return g;
};

const builders: Record<ModelType, Build> = {
	box: plainBox,
	bed,
	...seating,
	...tables,
	...storage,
	...devices,
	...decor,
	...lighting,
	kitchenBase: storage.sideboard,
	kitchenWall: storage.sideboard,
	kitchenTall: storage.wardrobe,
	kitchenSink: storage.sideboard,
	hob: plainBox,
	oven: plainBox,
	fridge: storage.wardrobe
};

const FLAT: ReadonlySet<string> = new Set(['rug', 'roundRug', 'throw', 'ledStrip']);
const EPSILON = 0.0005;

function transparent(material: Material | Material[]): boolean {
	return Array.isArray(material) ? material.every(transparent) : material.transparent;
}

function finish(root: Object3D, model: string): void {
	root.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		node.receiveShadow = true;
		node.castShadow =
			!FLAT.has(model) && !transparent(node.material) && node.userData.light !== true;
	});
}

function fit(body: Group, size: Vector3): void {
	const box3 = new Box3().setFromObject(body, true);
	const current = box3.getSize(new Vector3());
	const scale = new Vector3(
		current.x > 1e-6 ? size.x / current.x : 1,
		current.y > 1e-6 ? size.y / current.y : 1,
		current.z > 1e-6 ? size.z / current.z : 1
	);
	if (
		Math.abs(current.x - size.x) > EPSILON ||
		Math.abs(current.y - size.y) > EPSILON ||
		Math.abs(current.z - size.z) > EPSILON
	) {
		body.scale.copy(scale);
	}
	body.updateMatrixWorld(true);
	const fitted = new Box3().setFromObject(body, true);
	const centre = fitted.getCenter(new Vector3());
	body.position.set(-centre.x, -fitted.min.y, -centre.z);
}

export const buildFurniture: FurnitureBuilder = (spec) => {
	const build = Object.hasOwn(builders, spec.model) ? builders[spec.model] : plainBox;
	const w = Math.max(spec.dims.w, 1) * MM;
	const d = Math.max(spec.dims.d, 1) * MM;
	const h = Math.max(spec.dims.h, 1) * MM;
	const body = build(w, d, h, palette(spec.color), spec.look);
	finish(body, spec.model);
	const root = new Group();
	root.name = spec.model;
	root.add(body);
	fit(body, new Vector3(w, h, d));
	root.updateMatrixWorld(true);
	return root;
};

export function disposeFurnitureCache(): void {
	disposeKit();
}
