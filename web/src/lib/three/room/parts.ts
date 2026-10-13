import { Mesh, type Matrix4, type Object3D } from 'three';
import type { ElementStatus } from '#lib/core/schema.ts';
import { GeometryBuilder, type V3 } from './builder.ts';
import type { MaterialSet, MaterialSpec } from './materials.ts';

export function tinted(spec: MaterialSpec, status: ElementStatus): MaterialSpec {
	if (status !== 'suggested') return spec;
	return { ...spec, opacity: (spec.opacity ?? 1) * 0.5 };
}

export class Parts {
	readonly #entries = new Map<string, { spec: MaterialSpec; builder: GeometryBuilder }>();
	readonly #materials: MaterialSet;

	constructor(materials: MaterialSet) {
		this.#materials = materials;
	}

	#builder(spec: MaterialSpec): GeometryBuilder {
		const key = JSON.stringify(spec);
		let entry = this.#entries.get(key);
		if (!entry) {
			entry = { spec, builder: new GeometryBuilder() };
			this.#entries.set(key, entry);
		}
		return entry.builder;
	}

	box(spec: MaterialSpec, min: V3, max: V3, matrix?: Matrix4): void {
		this.#builder(spec).box(0, min, max, matrix);
	}

	cylinder(
		spec: MaterialSpec,
		center: V3,
		radius: number,
		length: number,
		axis: 'x' | 'y' | 'z',
		segments = 14,
		matrix?: Matrix4
	): void {
		this.#builder(spec).cylinder(0, center, radius, length, axis, segments, matrix);
	}

	attach(parent: Object3D, part: string): void {
		for (const { spec, builder } of this.#entries.values()) {
			const geometry = builder.build();
			if (!geometry) continue;
			const mesh = new Mesh(geometry, this.#materials.get(spec));
			mesh.userData.part = part;
			mesh.castShadow = (spec.opacity ?? 1) >= 1 && part !== 'ceilingLamp';
			mesh.receiveShadow = true;
			parent.add(mesh);
		}
	}
}
