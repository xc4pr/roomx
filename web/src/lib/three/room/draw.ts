import { Matrix4 } from 'three';
import type { V3 } from './builder.ts';
import type { MaterialSpec } from './materials.ts';
import type { Parts } from './parts.ts';

export interface Draw {
	box(spec: MaterialSpec, min: V3, max: V3, matrix?: Matrix4): void;
	cylinder(
		spec: MaterialSpec,
		center: V3,
		radius: number,
		length: number,
		axis: 'x' | 'y' | 'z',
		segments?: number
	): void;
}

export function drawOf(parts: Parts, placement?: Matrix4): Draw {
	return {
		box(spec, min, max, matrix) {
			const combined =
				matrix && placement ? placement.clone().multiply(matrix) : (matrix ?? placement);
			parts.box(spec, min, max, combined);
		},
		cylinder(spec, center, radius, length, axis, segments = 14) {
			parts.cylinder(spec, center, radius, length, axis, segments, placement);
		}
	};
}
