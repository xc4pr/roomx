import { BackSide, DoubleSide, Mesh, Vector3, type Material, type Object3D } from 'three';

// Faces closer than this count as one plane: the depth buffer cannot tell them apart and they flicker (z-fighting).
const PLANE_TOLERANCE = 0.0005;
const NORMAL_TOLERANCE = 1e-4;
const MIN_AREA = 1e-5;

interface Face {
	mesh: number;
	normal: Vector3;
	offset: number;
	points: Vector3[];
}

export interface Clash {
	a: string;
	b: string;
	area: number;
	normal: [number, number, number];
	at: [number, number, number];
}

function label(mesh: Mesh): string {
	const names: string[] = [];
	for (let node: Object3D | null = mesh; node; node = node.parent) {
		const name = node.userData.part ?? node.name;
		if (name) names.unshift(String(name));
	}
	const material = mesh.material as Material & { color?: { getHexString(): string } };
	return `${names.join('/')}#${material.color?.getHexString() ?? material.type}`;
}

function facesOf(mesh: Mesh, index: number): Face[] {
	const position = mesh.geometry.getAttribute('position');
	const order = mesh.geometry.index;
	const count = order ? order.count : position.count;
	const material = mesh.material as Material;
	const faces: Face[] = [];
	for (let i = 0; i < count; i += 3) {
		const points = [0, 1, 2].map((k) =>
			new Vector3()
				.fromBufferAttribute(position, order ? order.getX(i + k) : i + k)
				.applyMatrix4(mesh.matrixWorld)
		);
		const normal = new Vector3()
			.subVectors(points[1], points[0])
			.cross(new Vector3().subVectors(points[2], points[0]));
		if (normal.length() < 1e-9) continue;
		normal.normalize();
		const sides = material.side === DoubleSide ? [1, -1] : material.side === BackSide ? [-1] : [1];
		for (const sign of sides) {
			const facing = normal.clone().multiplyScalar(sign);
			faces.push({
				mesh: index,
				normal: facing,
				offset: facing.dot(points[0]),
				points: sign > 0 ? points : [...points].reverse()
			});
		}
	}
	return faces;
}

// Drops the axis the normal points along most; keeps the winding counter-clockwise.
function flat(face: Face): [number, number][] {
	const n = face.normal;
	const axis =
		Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z)
			? 'x'
			: Math.abs(n.y) >= Math.abs(n.z)
				? 'y'
				: 'z';
	const [u, v] =
		axis === 'x'
			? (['y', 'z'] as const)
			: axis === 'y'
				? (['z', 'x'] as const)
				: (['x', 'y'] as const);
	const points = face.points.map((p) => [p[u], p[v]] as [number, number]);
	return n[axis] < 0 ? points.reverse() : points;
}

function area(polygon: [number, number][]): number {
	let sum = 0;
	for (let i = 0; i < polygon.length; i++) {
		const [ax, ay] = polygon[i];
		const [bx, by] = polygon[(i + 1) % polygon.length];
		sum += ax * by - bx * ay;
	}
	return sum / 2;
}

function clip(subject: [number, number][], clipper: [number, number][]): [number, number][] {
	let output = subject;
	for (let i = 0; i < clipper.length && output.length > 0; i++) {
		const [ax, ay] = clipper[i];
		const [bx, by] = clipper[(i + 1) % clipper.length];
		const side = ([x, y]: [number, number]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
		const input = output;
		output = [];
		for (let k = 0; k < input.length; k++) {
			const p = input[k];
			const q = input[(k + 1) % input.length];
			const sp = side(p);
			const sq = side(q);
			if (sp >= 0) output.push(p);
			if (sp >= 0 !== sq >= 0) {
				const t = sp / (sp - sq);
				output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
			}
		}
	}
	return output;
}

/**
 * Visible faces of different materials that lie in one plane, face the same way and overlap.
 * These flicker with the viewing angle (z-fighting). Pairs are summed per mesh pair.
 */
export function coplanarClashes(root: Object3D): Clash[] {
	root.updateMatrixWorld(true);
	const meshes: Mesh[] = [];
	root.traverse((node) => {
		if (node instanceof Mesh && node.visible && !Array.isArray(node.material)) meshes.push(node);
	});
	const faces = meshes.flatMap((mesh, index) => facesOf(mesh, index));
	faces.sort((p, q) => p.offset - q.offset);
	const found = new Map<string, Clash>();
	for (let i = 0; i < faces.length; i++) {
		const a = faces[i];
		for (let k = i + 1; k < faces.length && faces[k].offset - a.offset < PLANE_TOLERANCE; k++) {
			const b = faces[k];
			const [first, second] = [
				meshes[a.mesh].material as Material,
				meshes[b.mesh].material as Material
			];
			if (a.mesh === b.mesh || first === second) continue;
			// A polygon offset on one of them settles which face wins.
			if (first.polygonOffset !== second.polygonOffset) continue;
			if (a.normal.dot(b.normal) < 1 - NORMAL_TOLERANCE) continue;
			const overlap = Math.abs(area(clip(flat(a), flat(b))));
			if (overlap < MIN_AREA) continue;
			const [labelA, labelB] = [label(meshes[a.mesh]), label(meshes[b.mesh])].sort();
			const key = `${labelA}|${labelB}`;
			const entry = found.get(key);
			if (entry) entry.area += overlap;
			else {
				const round = (n: number) => Math.round(n * 1000) / 1000;
				const [p, n] = [a.points[0], a.normal];
				found.set(key, {
					a: labelA,
					b: labelB,
					area: overlap,
					normal: [round(n.x), round(n.y), round(n.z)],
					at: [round(p.x), round(p.y), round(p.z)]
				});
			}
		}
	}
	return [...found.values()];
}
