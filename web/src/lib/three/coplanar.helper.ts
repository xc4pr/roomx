import {
	BackSide,
	DoubleSide,
	Mesh,
	Vector3,
	type BufferGeometry,
	type Material,
	type Object3D
} from 'three';

// Faces closer than this count as one plane: the depth buffer cannot tell them apart and they flicker (z-fighting).
const PLANE_TOLERANCE = 0.0005;
const NORMAL_TOLERANCE = 1e-4;
const MIN_AREA = 1e-5;

// One material of one mesh: a mesh with a material array has one surface per geometry group.
interface Surface {
	material: Material;
	label: string;
}

interface Face {
	surface: number;
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

function label(mesh: Mesh, material: Material): string {
	const names: string[] = [];
	for (let node: Object3D | null = mesh; node; node = node.parent) {
		const name = node.userData.part ?? node.name;
		if (name) names.unshift(String(name));
	}
	const color = (material as Material & { color?: { getHexString(): string } }).color;
	return `${names.join('/')}#${color?.getHexString() ?? material.type}`;
}

function facesOf(
	mesh: Mesh,
	surface: number,
	from: number,
	to: number,
	material: Material
): Face[] {
	const position = mesh.geometry.getAttribute('position');
	const order = mesh.geometry.index;
	const faces: Face[] = [];
	for (let i = from; i + 2 < to; i += 3) {
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
				surface,
				normal: facing,
				offset: facing.dot(points[0]),
				points: sign > 0 ? points : [...points].reverse()
			});
		}
	}
	return faces;
}

function collect(root: Object3D): { surfaces: Surface[]; faces: Face[] } {
	const surfaces: Surface[] = [];
	const faces: Face[] = [];
	root.traverse((node) => {
		if (!(node instanceof Mesh) || !node.visible) return;
		const geometry: BufferGeometry = node.geometry;
		const count = geometry.index ? geometry.index.count : geometry.getAttribute('position').count;
		const parts = Array.isArray(node.material)
			? geometry.groups.map((group) => ({
					material: (node.material as Material[])[group.materialIndex ?? 0],
					from: group.start,
					to: Math.min(count, group.start + group.count)
				}))
			: [{ material: node.material as Material, from: 0, to: count }];
		for (const part of parts) {
			if (!part.material) continue;
			surfaces.push({ material: part.material, label: label(node, part.material) });
			faces.push(...facesOf(node, surfaces.length - 1, part.from, part.to, part.material));
		}
	});
	return { surfaces, faces };
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
 * These flicker with the viewing angle (z-fighting). Overlaps are summed per pair of surfaces and
 * plane; pairs below MIN_AREA in total are left out.
 */
export function coplanarClashes(root: Object3D): Clash[] {
	root.updateMatrixWorld(true);
	const { surfaces, faces } = collect(root);
	faces.sort((p, q) => p.offset - q.offset);
	const round = (n: number) => Math.round(n * 1000) / 1000;
	const found = new Map<string, Clash>();
	for (let i = 0; i < faces.length; i++) {
		const a = faces[i];
		for (let k = i + 1; k < faces.length && faces[k].offset - a.offset < PLANE_TOLERANCE; k++) {
			const b = faces[k];
			const [first, second] = [surfaces[a.surface], surfaces[b.surface]];
			if (a.surface === b.surface || first.material === second.material) continue;
			// A polygon offset on one of them settles which face wins.
			if (first.material.polygonOffset !== second.material.polygonOffset) continue;
			if (a.normal.dot(b.normal) < 1 - NORMAL_TOLERANCE) continue;
			const overlap = Math.abs(area(clip(flat(a), flat(b))));
			if (overlap < 1e-9) continue;
			const [labelA, labelB] = [first.label, second.label].sort();
			const [p, n] = [a.points[0], a.normal];
			const normal: Clash['normal'] = [round(n.x), round(n.y), round(n.z)];
			const key = `${labelA}|${labelB}|${normal.join()}|${Math.round(a.offset * 1000)}`;
			const entry = found.get(key);
			if (entry) entry.area += overlap;
			else
				found.set(key, {
					a: labelA,
					b: labelB,
					area: overlap,
					normal,
					at: [round(p.x), round(p.y), round(p.z)]
				});
		}
	}
	return [...found.values()].filter((clash) => clash.area >= MIN_AREA);
}
