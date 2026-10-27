import { BufferGeometry, Float32BufferAttribute, Mesh, type Object3D } from 'three';
import type { MaterialSet, MaterialSpec } from '../room/materials.ts';

export type Point3 = readonly [number, number, number];
export interface Ground {
	x: number;
	z: number;
}

interface Bucket {
	spec: MaterialSpec;
	positions: number[];
}

export interface BakedPart {
	spec: MaterialSpec;
	geometry: BufferGeometry;
}

// Collects flat-shaded triangles per material; metres, Y up.
export class Soup {
	readonly #buckets = new Map<string, Bucket>();

	#bucket(spec: MaterialSpec): number[] {
		const key = JSON.stringify(spec);
		let bucket = this.#buckets.get(key);
		if (!bucket) {
			bucket = { spec, positions: [] };
			this.#buckets.set(key, bucket);
		}
		return bucket.positions;
	}

	triangles(spec: MaterialSpec): number {
		return (this.#buckets.get(JSON.stringify(spec))?.positions.length ?? 0) / 9;
	}

	get triangleCount(): number {
		let sum = 0;
		for (const bucket of this.#buckets.values()) sum += bucket.positions.length / 9;
		return sum;
	}

	quad(spec: MaterialSpec, a: Point3, b: Point3, c: Point3, d: Point3): void {
		const out = this.#bucket(spec);
		out.push(...a, ...b, ...c, ...a, ...c, ...d);
	}

	// Convex polygon (fan) as a closed prism from y0 to y1; the bottom is optional.
	prism(
		spec: MaterialSpec,
		polygon: readonly Ground[],
		y0: number,
		y1: number,
		bottom = true
	): void {
		const n = polygon.length;
		if (n < 3 || y1 <= y0) return;
		const out = this.#bucket(spec);
		const area = polygon.reduce((sum, p, i) => {
			const q = polygon[(i + 1) % n];
			return sum + (p.x * q.z - q.x * p.z);
		}, 0);
		// Faces wind counter-clockwise seen from outside; a clockwise outline in (x, z) is the one to keep.
		const ring = area < 0 ? [...polygon].reverse() : polygon;
		for (let i = 1; i + 1 < n; i++) {
			const [a, b, c] = [ring[0], ring[i], ring[i + 1]];
			out.push(a.x, y1, a.z, c.x, y1, c.z, b.x, y1, b.z);
			if (bottom) out.push(a.x, y0, a.z, b.x, y0, b.z, c.x, y0, c.z);
		}
		for (let i = 0; i < n; i++) {
			const a = ring[i];
			const b = ring[(i + 1) % n];
			out.push(a.x, y0, a.z, b.x, y1, b.z, b.x, y0, b.z, a.x, y0, a.z, a.x, y1, a.z, b.x, y1, b.z);
		}
	}

	// Bar of square cross-section between two points.
	bar(spec: MaterialSpec, a: Point3, b: Point3, half: number): void {
		const dx = b[0] - a[0];
		const dz = b[2] - a[2];
		const flat = Math.hypot(dx, dz);
		if (flat < 1e-6 && Math.abs(b[1] - a[1]) < 1e-6) return;
		const nx = flat < 1e-6 ? half : (-dz / flat) * half;
		const nz = flat < 1e-6 ? 0 : (dx / flat) * half;
		const corner = (p: Point3, side: number, up: number): Point3 => [
			p[0] + nx * side,
			p[1] + half * up,
			p[2] + nz * side
		];
		const ring = (p: Point3): Point3[] => [
			corner(p, -1, -1),
			corner(p, 1, -1),
			corner(p, 1, 1),
			corner(p, -1, 1)
		];
		const [r0, r1] = [ring(a), ring(b)];
		for (let i = 0; i < 4; i++) {
			const j = (i + 1) % 4;
			this.quad(spec, r0[i], r1[i], r1[j], r0[j]);
		}
		this.quad(spec, r0[0], r0[1], r0[2], r0[3]);
		this.quad(spec, r1[3], r1[2], r1[1], r1[0]);
	}

	post(spec: MaterialSpec, at: Ground, y0: number, y1: number, half: number): void {
		this.prism(
			spec,
			[
				{ x: at.x - half, z: at.z - half },
				{ x: at.x + half, z: at.z - half },
				{ x: at.x + half, z: at.z + half },
				{ x: at.x - half, z: at.z + half }
			],
			y0,
			y1,
			false
		);
	}

	cylinder(
		spec: MaterialSpec,
		at: Ground,
		radius: number,
		y0: number,
		y1: number,
		segments = 14
	): void {
		const ring = Array.from({ length: segments }, (_, i) => {
			const angle = (i / segments) * Math.PI * 2;
			return { x: at.x + Math.cos(angle) * radius, z: at.z - Math.sin(angle) * radius };
		});
		this.prism(spec, ring, y0, y1, false);
	}

	bake(): BakedPart[] {
		const parts: BakedPart[] = [];
		for (const { spec, positions } of this.#buckets.values()) {
			if (positions.length === 0) continue;
			const geometry = new BufferGeometry();
			geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
			geometry.computeVertexNormals();
			parts.push({ spec, geometry });
		}
		return parts;
	}
}

export function attachParts(
	parent: Object3D,
	parts: readonly BakedPart[],
	materials: MaterialSet,
	part: string
): void {
	for (const { spec, geometry } of parts) {
		const mesh = new Mesh(geometry, materials.get(spec));
		mesh.userData.part = part;
		mesh.castShadow = (spec.opacity ?? 1) >= 1;
		mesh.receiveShadow = true;
		parent.add(mesh);
	}
}
