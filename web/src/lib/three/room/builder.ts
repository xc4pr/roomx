import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three';

export type V3 = readonly [number, number, number];

const CUBE_FACES: readonly (readonly [number, number, number][])[] = [
	[
		[0, 0, 0],
		[0, 0, 1],
		[0, 1, 1],
		[0, 1, 0]
	],
	[
		[1, 0, 0],
		[1, 1, 0],
		[1, 1, 1],
		[1, 0, 1]
	],
	[
		[0, 0, 0],
		[1, 0, 0],
		[1, 0, 1],
		[0, 0, 1]
	],
	[
		[0, 1, 0],
		[0, 1, 1],
		[1, 1, 1],
		[1, 1, 0]
	],
	[
		[0, 0, 0],
		[0, 1, 0],
		[1, 1, 0],
		[1, 0, 0]
	],
	[
		[0, 0, 1],
		[1, 0, 1],
		[1, 1, 1],
		[0, 1, 1]
	]
];

export class GeometryBuilder {
	readonly #positions: number[][];
	readonly #normals: number[][];

	constructor(buckets = 1) {
		this.#positions = Array.from({ length: buckets }, () => []);
		this.#normals = Array.from({ length: buckets }, () => []);
	}

	get empty(): boolean {
		return this.#positions.every((positions) => positions.length === 0);
	}

	triangle(bucket: number, a: V3, b: V3, c: V3, hint: V3): void {
		const abx = b[0] - a[0];
		const aby = b[1] - a[1];
		const abz = b[2] - a[2];
		const acx = c[0] - a[0];
		const acy = c[1] - a[1];
		const acz = c[2] - a[2];
		let nx = aby * acz - abz * acy;
		let ny = abz * acx - abx * acz;
		let nz = abx * acy - aby * acx;
		const length = Math.hypot(nx, ny, nz);
		if (length < 1e-12) return;
		nx /= length;
		ny /= length;
		nz /= length;
		const flip = nx * hint[0] + ny * hint[1] + nz * hint[2] < 0;
		const positions = this.#positions[bucket];
		const normals = this.#normals[bucket];
		const order = flip ? [a, c, b] : [a, b, c];
		for (const point of order) positions.push(point[0], point[1], point[2]);
		const sign = flip ? -1 : 1;
		for (let i = 0; i < 3; i++) normals.push(nx * sign, ny * sign, nz * sign);
	}

	quad(bucket: number, a: V3, b: V3, c: V3, d: V3, hint: V3): void {
		this.triangle(bucket, a, b, c, hint);
		this.triangle(bucket, a, c, d, hint);
	}

	box(bucket: number, min: V3, max: V3, matrix?: Matrix4): void {
		const corner = (ix: number, iy: number, iz: number): V3 => {
			const point = new Vector3(ix ? max[0] : min[0], iy ? max[1] : min[1], iz ? max[2] : min[2]);
			if (matrix) point.applyMatrix4(matrix);
			return [point.x, point.y, point.z];
		};
		const center = new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
		if (matrix) center.applyMatrix4(matrix);
		for (const face of CUBE_FACES) {
			const points = face.map(([ix, iy, iz]) => corner(ix, iy, iz));
			const mid = points.reduce(
				(sum, point) => [sum[0] + point[0] / 4, sum[1] + point[1] / 4, sum[2] + point[2] / 4],
				[0, 0, 0]
			);
			const hint: V3 = [mid[0] - center.x, mid[1] - center.y, mid[2] - center.z];
			this.quad(bucket, points[0], points[1], points[2], points[3], hint);
		}
	}

	cylinder(
		bucket: number,
		center: V3,
		radius: number,
		length: number,
		axis: 'x' | 'y' | 'z',
		segments = 14,
		matrix?: Matrix4
	): void {
		const place = (a: number, b: number, along: number): V3 => {
			const local =
				axis === 'z'
					? new Vector3(a, b, along)
					: axis === 'y'
						? new Vector3(a, along, b)
						: new Vector3(along, a, b);
			local.add(new Vector3(center[0], center[1], center[2]));
			if (matrix) local.applyMatrix4(matrix);
			return [local.x, local.y, local.z];
		};
		const origin = place(0, 0, 0);
		const direction = (a: number, b: number, along: number): V3 => {
			const point = place(a, b, along);
			return [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
		};
		const half = length / 2;
		for (let i = 0; i < segments; i++) {
			const a0 = (i / segments) * Math.PI * 2;
			const a1 = ((i + 1) / segments) * Math.PI * 2;
			const p0 = place(Math.cos(a0) * radius, Math.sin(a0) * radius, -half);
			const p1 = place(Math.cos(a1) * radius, Math.sin(a1) * radius, -half);
			const p2 = place(Math.cos(a1) * radius, Math.sin(a1) * radius, half);
			const p3 = place(Math.cos(a0) * radius, Math.sin(a0) * radius, half);
			const mid = (a0 + a1) / 2;
			this.quad(bucket, p0, p1, p2, p3, direction(Math.cos(mid), Math.sin(mid), 0));
			const lowCenter = place(0, 0, -half);
			const highCenter = place(0, 0, half);
			this.triangle(bucket, lowCenter, p0, p1, direction(0, 0, -1));
			this.triangle(bucket, highCenter, p3, p2, direction(0, 0, 1));
		}
	}

	build(): BufferGeometry | undefined {
		if (this.empty) return undefined;
		const positions: number[] = [];
		const normals: number[] = [];
		const geometry = new BufferGeometry();
		let start = 0;
		this.#positions.forEach((bucketPositions, index) => {
			if (bucketPositions.length === 0) return;
			for (const value of bucketPositions) positions.push(value);
			for (const value of this.#normals[index]) normals.push(value);
			const count = bucketPositions.length / 3;
			geometry.addGroup(start, count, index);
			start += count;
		});
		geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
		geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		return geometry;
	}
}
