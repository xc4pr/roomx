import { Group, type Mesh, type MeshStandardMaterial } from 'three';
import type { Look } from '#lib/core/catalog.ts';
import {
	ball,
	bead,
	box,
	cyl,
	lathe,
	luminance,
	mat,
	strut,
	type Palette,
	type Vec3
} from './kit.ts';

type Build = (w: number, d: number, h: number, p: Palette, look: Look) => Group;
type Shade = NonNullable<Look['shade']>;

const BULB = '#ffe7b0';
const SHADE = '#efe6d2';
const GLOW = '#fff4d8';

export const DOME: readonly (readonly [number, number])[] = [
	[1, 0],
	[0.99, 0.12],
	[0.94, 0.3],
	[0.83, 0.5],
	[0.65, 0.7],
	[0.4, 0.88],
	[0.12, 1]
];

export function markLight(mesh: Mesh): void {
	mesh.userData.light = true;
	mesh.castShadow = false;
}

export function tones(p: Palette): { stand: string; shade: string } {
	const bright = luminance(p.main) > 0.6;
	return { stand: bright ? '#8a8d90' : p.main, shade: bright ? p.main : SHADE };
}

export function styled(look: Look): boolean {
	return (
		look.shade !== undefined ||
		look.shadeColor !== undefined ||
		look.stem !== undefined ||
		look.frameColor !== undefined
	);
}

interface Look3 {
	stand: string;
	shade: string;
	kind: Shade | undefined;
	stem: NonNullable<Look['stem']>;
}

function resolve(p: Palette, look: Look): Look3 {
	const t = tones(p);
	return {
		stand: look.frameColor ?? t.stand,
		shade: look.shadeColor ?? t.shade,
		kind: look.shade,
		stem: look.stem ?? 'straight'
	};
}

// The shade between y and y + hh, w by d wide; `up` flips the cone so that it opens upwards (wall lamps).
function shadeBody(
	g: Group,
	kind: Shade | undefined,
	color: string,
	size: readonly [number, number, number],
	at: readonly [number, number, number],
	up = false
): void {
	const [w, hh, d] = size;
	const [x, y, z] = at;
	const side = mat('shade', color);
	switch (kind) {
		case 'none':
			return;
		case 'dome':
			lathe(g, side, 'dome', DOME, w, hh, d, x, y, z);
			return;
		case 'globe':
			ball(g, side, w, hh, d, x, y, z, false);
			return;
		default: {
			const ratio = kind === 'cone' ? 0.42 : kind === 'drum' ? 1 : 0.72;
			const body = cyl(g, side, w, hh, d, x, y, z, ratio, 24);
			body.material = [side, side, mat('shade', GLOW)];
			if (up) body.rotation.x = Math.PI;
		}
	}
}

function shadeHeight(kind: Shade | undefined, w: number, d: number, base: number): number {
	return kind === 'globe' ? Math.min(w, d, base * 1.6) : base;
}

// Arc or articulated arm from a to b; the arm rises first and then reaches out (elbow = joint as fractions).
function reach(
	g: Group,
	m: MeshStandardMaterial,
	kind: 'arc' | 'adjustable',
	a: Vec3,
	b: Vec3,
	elbow: readonly [number, number],
	thick: number
): void {
	const hx = b[0] - a[0];
	const hz = b[2] - a[2];
	const v = b[1] - a[1];
	if (kind === 'arc') {
		const steps = 10;
		let prev: Vec3 = a;
		for (let i = 1; i <= steps; i++) {
			const t = (i / steps) * (Math.PI / 2);
			const q = 1 - Math.cos(t);
			const next: Vec3 = [a[0] + hx * q, a[1] + v * Math.sin(t), a[2] + hz * q];
			strut(g, m, prev, next, thick);
			prev = next;
		}
		return;
	}
	const joint: Vec3 = [a[0] + hx * elbow[0], a[1] + v * elbow[1], a[2] + hz * elbow[0]];
	strut(g, m, a, joint, thick);
	strut(g, m, joint, b, thick * 0.85);
	bead(g, m, thick * 2.2, joint[0], joint[1] + thick * 1.1, joint[2]);
}

function tripod(
	g: Group,
	m: MeshStandardMaterial,
	w: number,
	d: number,
	apexY: number,
	thick: number
): void {
	for (let i = 0; i < 3; i++) {
		const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
		strut(g, m, [0, apexY, 0], [Math.cos(a) * w * 0.46, thick / 2, Math.sin(a) * d * 0.46], thick);
	}
	bead(g, m, thick * 2, 0, apexY + thick, 0);
}

function bareBulb(g: Group, size: number, x: number, y: number, z: number): void {
	markLight(ball(g, mat('light', BULB), size * 0.7, size, size * 0.7, x, y, z, false));
}

const floorLamp: Build = (w, d, h, p, look) => {
	const g = new Group();
	const t = resolve(p, look);
	const metal = mat('metal', t.stand);
	const none = t.kind === 'none';
	const shadeH = none ? 0.09 : shadeHeight(t.kind, w, d, Math.min(h * 0.22, w * 1.0));
	if (t.stem === 'tripod') {
		tripod(g, metal, w, d, h - shadeH - 0.01, 0.02);
		shadeBody(g, t.kind, t.shade, [w, shadeH, d], [0, h - shadeH, 0]);
		bareBulbOrInner(g, none, shadeH, h, w);
		return g;
	}
	if (t.stem === 'arc' || t.stem === 'adjustable') {
		const baseD = Math.min(0.32, w * 0.32, d);
		const sw = Math.min(w * 0.4, 0.5);
		const x0 = -w / 2 + baseD / 2;
		const x1 = w / 2 - sw / 2;
		const sh = none ? 0.09 : Math.min(shadeH, h * 0.14, sw * 0.8);
		const topY = h - 0.04 - sh;
		cyl(g, metal, baseD, 0.04, baseD, x0, 0, 0, 1, 24);
		reach(g, metal, t.stem, [x0, 0.04, 0], [x1, h - 0.012, 0], [0.12, 0.62], 0.022);
		cyl(g, metal, 0.012, 0.03, 0.012, x1, h - 0.045, 0, 1, 6);
		shadeBody(g, t.kind, t.shade, [sw, sh, none ? sw : d], [x1, topY, 0]);
		bareBulbOrInner(g, none, sh, topY + sh, sw, x1);
		return g;
	}
	cyl(g, metal, none ? w : w * 0.62, 0.025, none ? d : d * 0.62, 0, 0, 0, 1, 24);
	cyl(g, metal, 0.022, h - shadeH, 0.022, 0, 0.025, 0);
	shadeBody(g, t.kind, t.shade, [w, shadeH, d], [0, h - shadeH, 0]);
	bareBulbOrInner(g, none, shadeH, h, w);
	return g;
};

// A bare bulb at the top of the lamp, or the bulb hidden inside the shade.
function bareBulbOrInner(
	g: Group,
	none: boolean,
	shadeH: number,
	top: number,
	w: number,
	x = 0
): void {
	if (none) bareBulb(g, Math.min(0.1, w * 0.4), x, top - 0.09, 0);
	else markLight(ball(g, mat('light', BULB), 0.07, 0.09, 0.07, x, top - shadeH * 0.7, 0, false));
}

const tableLamp: Build = (w, d, h, p, look) => {
	const g = new Group();
	const t = resolve(p, look);
	const none = t.kind === 'none';
	const bodyColor = t.stand;
	const rod = mat('metal', look.frameColor ?? '#8a8d90');
	const shadeH = none ? 0.07 : shadeHeight(t.kind, w, d, h * 0.4);
	if (t.stem === 'tripod') {
		tripod(g, mat('wood', bodyColor), w, d, h - shadeH - 0.01, 0.018);
		shadeBody(g, t.kind, t.shade, [w, shadeH, d], [0, h - shadeH, 0]);
		bareBulbOrInner(g, none, shadeH, h, w);
		return g;
	}
	if (t.stem === 'arc' || t.stem === 'adjustable') {
		const body = mat('metal', bodyColor);
		const baseD = Math.min(0.18, w * 0.4, d);
		const sw = Math.min(w * 0.5, 0.3);
		const x0 = -w / 2 + baseD / 2;
		const x1 = w / 2 - sw / 2;
		const sh = none ? 0.07 : Math.min(shadeH, h * 0.3, sw * 0.8);
		const topY = h - 0.025 - sh;
		cyl(g, body, baseD, 0.025, baseD, x0, 0, 0, 1, 20);
		reach(g, body, t.stem, [x0, 0.025, 0], [x1, h - 0.008, 0], [0.12, 0.6], 0.014);
		shadeBody(g, t.kind, t.shade, [sw, sh, none ? sw : d], [x1, topY, 0]);
		bareBulbOrInner(g, none, sh, topY + sh, sw, x1);
		return g;
	}
	const baseH = h * 0.42;
	const body = mat('ceramic', bodyColor);
	cyl(g, body, none ? w : w * 0.5, baseH * 0.2, none ? d : d * 0.5, 0, 0, 0, 0.6, 20);
	ball(
		g,
		body,
		none ? w * 0.9 : w * 0.46,
		baseH * 0.9,
		none ? d * 0.9 : d * 0.46,
		0,
		baseH * 0.1,
		0,
		false
	);
	cyl(g, rod, 0.016, h - baseH - shadeH + 0.04, 0.016, 0, baseH, 0, 1, 8);
	shadeBody(g, t.kind, t.shade, [w, shadeH, d], [0, h - shadeH, 0]);
	if (none) bareBulb(g, Math.min(0.09, w * 0.35), 0, h - 0.09, 0);
	else markLight(ball(g, mat('light', BULB), 0.055, 0.07, 0.055, 0, h - shadeH * 0.75, 0, false));
	return g;
};

const pendantLamp: Build = (w, d, h, p, look) => {
	const g = new Group();
	const t = resolve(p, look);
	const metal = mat('metal', t.stand);
	const none = t.kind === 'none';
	const base = Math.min(w * 0.55, h * 0.72);
	const shadeH = none ? Math.min(w * 1.25, h * 0.5) : shadeHeight(t.kind ?? 'dome', w, d, base);
	if (none) {
		markLight(ball(g, mat('light', BULB), w, shadeH, d, 0, 0, 0, false));
		cyl(g, metal, 0.035, 0.05, 0.035, 0, shadeH, 0, 1, 10);
	} else {
		shadeBody(g, t.kind ?? 'dome', t.shade, [w, shadeH, d], [0, 0, 0]);
		const inner = t.kind === 'globe' ? shadeH * 0.5 - w * 0.11 : shadeH * 0.18;
		markLight(ball(g, mat('light', BULB), w * 0.22, w * 0.26, d * 0.22, 0, inner, 0, false));
	}
	const cordFrom = shadeH + (none ? 0.05 : 0);
	cyl(g, metal, 0.008, h - cordFrom - 0.02, 0.008, 0, cordFrom, 0, 1, 6);
	cyl(g, metal, 0.07, 0.02, 0.07, 0, h - 0.02, 0, 1, 16);
	return g;
};

const wallLamp: Build = (w, d, h, p, look) => {
	const g = new Group();
	const t = resolve(p, look);
	const metal = mat('metal', t.stand);
	const none = t.kind === 'none';
	const shadeD = none ? 0.07 : Math.min(w, d - 0.03);
	const shadeH = none ? 0.09 : shadeHeight(t.kind, shadeD, shadeD, h * 0.5);
	box(g, metal, w, h * 0.55, 0.012, 0, 0, d / 2 - 0.006);
	const armY = h * 0.38;
	const zPlate = d / 2 - 0.012;
	const zShade = -d / 2 + shadeD / 2;
	if (t.stem === 'arc' || t.stem === 'adjustable') {
		reach(g, metal, t.stem, [0, armY, zPlate], [0, h - shadeH * 0.5, zShade], [0.55, 0.2], 0.018);
	} else {
		box(g, metal, 0.02, 0.02, zPlate - zShade, 0, armY, (zPlate + zShade) / 2);
	}
	const y = h - shadeH;
	shadeBody(g, t.kind, t.shade, [shadeD, shadeH, shadeD], [0, y, zShade], true);
	if (none) bareBulb(g, 0.09, 0, y, zShade);
	else
		markLight(
			ball(
				g,
				mat('light', BULB),
				shadeD * 0.3,
				shadeD * 0.3,
				shadeD * 0.3,
				0,
				h - shadeH * 0.8,
				zShade,
				false
			)
		);
	return g;
};

export const lamps = { floorLamp, tableLamp, pendantLamp, wallLamp };
