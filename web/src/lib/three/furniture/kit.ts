import {
	BoxGeometry,
	BufferGeometry,
	Color,
	CylinderGeometry,
	DoubleSide,
	Float32BufferAttribute,
	Group,
	IcosahedronGeometry,
	LatheGeometry,
	Mesh,
	MeshStandardMaterial,
	SphereGeometry,
	TorusGeometry,
	Vector2
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type Surface =
	| 'matte'
	| 'wood'
	| 'fabric'
	| 'metal'
	| 'glass'
	| 'plastic'
	| 'leaf'
	| 'light'
	| 'screen'
	| 'shade'
	| 'frost'
	| 'cloth'
	| 'ceramic';

const materials = new Map<string, MeshStandardMaterial>();
const geometries = new Map<string, BufferGeometry>();

function create(surface: Surface, color: string): MeshStandardMaterial {
	const base = { color: new Color(color) };
	switch (surface) {
		case 'wood':
			return new MeshStandardMaterial({ ...base, roughness: 0.7, metalness: 0 });
		case 'fabric':
			return new MeshStandardMaterial({ ...base, roughness: 1, metalness: 0 });
		case 'metal':
			return new MeshStandardMaterial({ ...base, roughness: 0.38, metalness: 0.65 });
		case 'glass':
			return new MeshStandardMaterial({
				...base,
				roughness: 0.08,
				metalness: 0.1,
				transparent: true,
				opacity: 0.38,
				depthWrite: false
			});
		case 'frost':
			return new MeshStandardMaterial({
				...base,
				roughness: 0.55,
				metalness: 0.05,
				transparent: true,
				opacity: 0.5,
				depthWrite: false
			});
		case 'plastic':
			return new MeshStandardMaterial({ ...base, roughness: 0.45, metalness: 0.05 });
		case 'leaf':
			return new MeshStandardMaterial({ ...base, roughness: 0.9, metalness: 0, flatShading: true });
		case 'light':
			return new MeshStandardMaterial({
				color: new Color(color).multiplyScalar(0.4),
				emissive: new Color(color),
				emissiveIntensity: 1,
				roughness: 0.6
			});
		case 'screen':
			return new MeshStandardMaterial({ ...base, roughness: 0.18, metalness: 0.2 });
		case 'ceramic':
			return new MeshStandardMaterial({
				...base,
				roughness: 0.35,
				metalness: 0.05,
				side: DoubleSide
			});
		case 'cloth':
			return new MeshStandardMaterial({ ...base, roughness: 1, metalness: 0, side: DoubleSide });
		case 'shade':
			return new MeshStandardMaterial({
				...base,
				roughness: 0.95,
				metalness: 0,
				side: DoubleSide,
				emissive: new Color(color),
				emissiveIntensity: 0.12
			});
		default:
			return new MeshStandardMaterial({ ...base, roughness: 0.85, metalness: 0 });
	}
}

export function mat(surface: Surface, color: string): MeshStandardMaterial {
	const key = `${surface}|${color}`;
	let material = materials.get(key);
	if (!material) {
		material = create(surface, color);
		materials.set(key, material);
	}
	return material;
}

function cached(key: string, make: () => BufferGeometry): BufferGeometry {
	let geometry = geometries.get(key);
	if (!geometry) {
		geometry = make();
		geometries.set(key, geometry);
	}
	return geometry;
}

export function disposeKit(): void {
	for (const material of materials.values()) material.dispose();
	for (const geometry of geometries.values()) geometry.dispose();
	materials.clear();
	geometries.clear();
}

export function hex(color: Color): string {
	return `#${color.getHexString()}`;
}

export function shade(color: string, lightness: number, saturation = 0): string {
	const c = new Color(color);
	const hsl = { h: 0, s: 0, l: 0 };
	c.getHSL(hsl);
	c.setHSL(
		hsl.h,
		Math.min(1, Math.max(0, hsl.s + saturation)),
		Math.min(0.97, Math.max(0.03, hsl.l + lightness))
	);
	return hex(c);
}

export function mix(a: string, b: string, t: number): string {
	return hex(new Color(a).lerp(new Color(b), t));
}

export function luminance(color: string): number {
	const hsl = { h: 0, s: 0, l: 0 };
	new Color(color).getHSL(hsl);
	return hsl.l;
}

export function accent(color: string, amount = 0.3): string {
	return luminance(color) > 0.45 ? shade(color, -amount) : shade(color, amount * 0.4);
}

export interface Palette {
	main: string;
	dark: string;
	light: string;
	edge: string;
	wood: string;
	darkWood: string;
	metal: string;
	darkMetal: string;
	cream: string;
}

export function palette(main: string): Palette {
	const l = luminance(main);
	return {
		main,
		dark: shade(main, -0.14),
		light: shade(main, l > 0.8 ? -0.03 : 0.1),
		edge: l > 0.45 ? shade(main, -0.3) : shade(main, 0.28),
		wood: l > 0.78 ? '#c19a6b' : l < 0.2 ? '#6b5440' : shade(main, -0.08),
		darkWood: l > 0.78 ? '#7a5b3e' : l < 0.2 ? '#2e2824' : shade(main, -0.25),
		metal: '#a3a8ad',
		darkMetal: '#3d4045',
		cream: '#efe9dc'
	};
}

export type Vec3 = readonly [number, number, number];

const MIN_SIZE = 0.0001;

function place(mesh: Mesh, size: Vec3, x: number, y: number, z: number): Mesh {
	const sx = Math.max(size[0], MIN_SIZE);
	const sy = Math.max(size[1], MIN_SIZE);
	const sz = Math.max(size[2], MIN_SIZE);
	mesh.scale.set(sx, sy, sz);
	mesh.position.set(x, y + sy / 2, z);
	return mesh;
}

export function box(
	parent: Group,
	material: MeshStandardMaterial,
	sx: number,
	sy: number,
	sz: number,
	x: number,
	y: number,
	z: number
): Mesh {
	const mesh = place(
		new Mesh(
			cached('box', () => new BoxGeometry(1, 1, 1)),
			material
		),
		[sx, sy, sz],
		x,
		y,
		z
	);
	parent.add(mesh);
	return mesh;
}

export function soft(
	parent: Group,
	material: MeshStandardMaterial,
	sx: number,
	sy: number,
	sz: number,
	x: number,
	y: number,
	z: number,
	roundness = 0.3
): Mesh {
	const key = `soft${roundness}`;
	const mesh = place(
		new Mesh(
			cached(key, () => new RoundedBoxGeometry(1, 1, 1, 2, roundness * 0.5)),
			material
		),
		[sx, sy, sz],
		x,
		y,
		z
	);
	parent.add(mesh);
	return mesh;
}

export function cyl(
	parent: Group,
	material: MeshStandardMaterial,
	dx: number,
	height: number,
	dz: number,
	x: number,
	y: number,
	z: number,
	topRatio = 1,
	segments = 12
): Mesh {
	const mesh = place(
		new Mesh(
			cached(
				`cyl${segments}|${topRatio}`,
				() => new CylinderGeometry(0.5 * topRatio, 0.5, 1, segments)
			),
			material
		),
		[dx, height, dz],
		x,
		y,
		z
	);
	parent.add(mesh);
	return mesh;
}

export function tube(
	parent: Group,
	material: MeshStandardMaterial,
	axis: 'x' | 'y' | 'z',
	length: number,
	thickness: number,
	x: number,
	y: number,
	z: number
): Mesh {
	const mesh = cyl(parent, material, thickness, length, thickness, x, y - length / 2, z, 1, 8);
	if (axis === 'x') mesh.rotation.z = Math.PI / 2;
	if (axis === 'z') mesh.rotation.x = Math.PI / 2;
	return mesh;
}

export function bead(
	parent: Group,
	material: MeshStandardMaterial,
	size: number,
	x: number,
	y: number,
	z: number
): Mesh {
	const mesh = place(
		new Mesh(
			cached('bead', () => new SphereGeometry(0.5, 8, 4)),
			material
		),
		[size, size, size],
		x,
		y - size / 2,
		z
	);
	parent.add(mesh);
	return mesh;
}

export function disc(
	parent: Group,
	material: MeshStandardMaterial,
	dx: number,
	dy: number,
	depth: number,
	x: number,
	yCenter: number,
	z: number,
	topRatio = 1,
	segments = 20
): Mesh {
	const mesh = new Mesh(
		cached(
			`cyl${segments}|${topRatio}`,
			() => new CylinderGeometry(0.5 * topRatio, 0.5, 1, segments)
		),
		material
	);
	mesh.scale.set(dx, depth, dy);
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.set(x, yCenter, z);
	parent.add(mesh);
	return mesh;
}

export function ball(
	parent: Group,
	material: MeshStandardMaterial,
	sx: number,
	sy: number,
	sz: number,
	x: number,
	y: number,
	z: number,
	faceted = true
): Mesh {
	const mesh = place(
		new Mesh(
			cached(faceted ? 'ico' : 'sphere', () =>
				faceted ? icosphere() : new SphereGeometry(0.5, 16, 12)
			),
			material
		),
		[sx, sy, sz],
		x,
		y,
		z
	);
	parent.add(mesh);
	return mesh;
}

export function ring(
	parent: Group,
	material: MeshStandardMaterial,
	dx: number,
	dy: number,
	depth: number,
	x: number,
	y: number,
	z: number,
	tube = 0.06
): Mesh {
	const mesh = place(
		new Mesh(
			cached(`ring${tube}`, () => new TorusGeometry(0.5 - tube, tube, 8, 28)),
			material
		),
		[dx, dy, depth / (tube * 2)],
		x,
		y,
		z
	);
	parent.add(mesh);
	return mesh;
}

export function lathe(
	parent: Group,
	material: MeshStandardMaterial,
	key: string,
	profile: readonly (readonly [number, number])[],
	dx: number,
	height: number,
	dz: number,
	x: number,
	y: number,
	z: number
): Mesh {
	const mesh = place(
		new Mesh(
			cached(
				`lathe|${key}`,
				() =>
					new LatheGeometry(
						profile.map(([r, v]) => new Vector2(r * 0.5, v)),
						16
					)
			),
			material
		),
		[dx, height, dz],
		x,
		y,
		z
	);
	mesh.position.y = y;
	parent.add(mesh);
	return mesh;
}

export function sheet(
	parent: Group,
	material: MeshStandardMaterial,
	waves: number,
	sx: number,
	sy: number,
	sz: number,
	x: number,
	y: number,
	z: number
): Mesh {
	const mesh = place(
		new Mesh(
			cached(`sheet${waves}`, () => waveSheet(waves)),
			material
		),
		[sx, sy, sz],
		x,
		y,
		z
	);
	parent.add(mesh);
	return mesh;
}

function icosphere(): BufferGeometry {
	const geometry = new IcosahedronGeometry(0.5, 1);
	geometry.computeBoundingBox();
	const max = geometry.boundingBox?.max;
	if (max) geometry.scale(0.5 / max.x, 0.5 / max.y, 0.5 / max.z);
	return geometry;
}

function waveSheet(waves: number): BufferGeometry {
	const columns = waves * 4;
	const rows = 6;
	const positions: number[] = [];
	const indices: number[] = [];
	for (let r = 0; r <= rows; r++) {
		for (let c = 0; c <= columns; c++) {
			const u = c / columns;
			const sag = 1 - 0.06 * Math.sin((r / rows) * Math.PI);
			positions.push((u - 0.5) * sag, r / rows - 0.5, 0.5 * Math.sin(u * waves * Math.PI * 2));
		}
	}
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < columns; c++) {
			const a = r * (columns + 1) + c;
			const b = a + 1;
			const d = a + columns + 1;
			indices.push(a, d, b, b, d, d + 1);
		}
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

export function seeded(seed: number): () => number {
	let state = seed >>> 0 || 1;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

export function split(total: number, parts: number): number[] {
	return Array.from({ length: parts }, (_, index) => ((index + 0.5) / parts - 0.5) * total);
}
