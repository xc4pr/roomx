import { type Group, type MeshStandardMaterial } from 'three';
import type { Look } from '#lib/core/catalog.ts';
import { box, cyl, mat, tube, type Palette } from './kit.ts';

export type Footing = 'none' | 'plinth' | 'feet' | 'legs' | 'frame';

export interface FootSpec {
	// true: neither `base` nor `baseHeight` is set, the builder keeps its original legs.
	legacy: boolean;
	kind: Footing;
	height: number;
}

// The stand of a seat or bed from the look; `defaults` are the heights in metres per kind, `cap` the highest allowed.
export function footSpec(
	look: Look,
	defaults: Record<Footing, number>,
	original: number,
	cap: number
): FootSpec {
	if (look.base === undefined && look.baseHeight === undefined) {
		return { legacy: true, kind: 'legs', height: original };
	}
	const kind = look.base ?? 'legs';
	const mm = look.baseHeight;
	const height = kind === 'none' ? 0 : mm === undefined ? defaults[kind] : mm / 1000;
	return { legacy: false, kind, height: Math.min(height, cap) };
}

// Wood or metal material of a stand: `baseMaterial` and `frameColor` of the look, else the given defaults.
export function standMaterial(
	look: Look,
	p: Palette,
	defaultMetal: boolean,
	wood = p.darkWood
): MeshStandardMaterial {
	const metal = look.baseMaterial ? look.baseMaterial === 'metal' : defaultMetal;
	return metal ? mat('metal', look.frameColor ?? p.metal) : mat('wood', look.frameColor ?? wood);
}

export interface Footprint {
	w: number;
	d: number;
	inset: number;
}

export function corners(w: number, d: number, inset: number): [number, number][] {
	return [-1, 1].flatMap((sx) =>
		[-1, 1].map((sz): [number, number] => [sx * (w / 2 - inset), sz * (d / 2 - inset)])
	);
}

// Plinth, feet, tall legs or a metal frame under a rectangular body whose floor is y = 0.
export function footing(
	g: Group,
	spec: FootSpec,
	material: MeshStandardMaterial,
	area: Footprint,
	metal: boolean
): void {
	const { kind, height } = spec;
	if (height <= 0 || kind === 'none') return;
	const { w, d, inset } = area;
	if (kind === 'plinth') {
		box(g, material, w - inset * 1.2, height, d - inset * 1.2, 0, 0, 0);
		return;
	}
	const points = corners(w, d, inset);
	if (kind === 'frame') {
		for (const [x, z] of points) box(g, material, 0.03, height, 0.03, x, 0, z);
		const rail = Math.min(0.025, height * 0.4);
		for (const sz of [-1, 1])
			box(g, material, w - inset * 2, rail, 0.02, 0, height - rail, sz * (d / 2 - inset));
		for (const sx of [-1, 1])
			box(g, material, 0.02, rail, d - inset * 2, sx * (w / 2 - inset), height - rail, 0);
		return;
	}
	const dia = kind === 'feet' ? 0.045 : metal ? 0.032 : 0.05;
	const taper = kind === 'feet' ? 1.3 : metal ? 1 : 1.5;
	for (const [x, z] of points) cyl(g, material, dia, height, dia, x, 0, z, taper, 10);
}

// Legs of an L-shaped body: single posts at the given points and a plinth per rectangle.
export function postFooting(
	g: Group,
	spec: FootSpec,
	material: MeshStandardMaterial,
	points: readonly (readonly [number, number])[],
	rects: readonly { w: number; d: number; x: number; z: number }[],
	metal: boolean
): void {
	const { kind, height } = spec;
	if (height <= 0 || kind === 'none') return;
	if (kind === 'plinth') {
		for (const r of rects) box(g, material, r.w - 0.06, height, r.d - 0.06, r.x, 0, r.z);
		return;
	}
	if (kind === 'frame') {
		for (const [x, z] of points) box(g, material, 0.03, height, 0.03, x, 0, z);
		return;
	}
	const dia = kind === 'feet' ? 0.045 : metal ? 0.032 : 0.05;
	const taper = kind === 'feet' ? 1.3 : metal ? 1 : 1.5;
	for (const [x, z] of points) cyl(g, material, dia, height, dia, x, 0, z, taper, 10);
}

// Small castors under the given foot points; they carry the body `lift` above the floor.
export function casters(
	g: Group,
	p: Palette,
	feet: readonly (readonly [number, number])[],
	lift: number
): void {
	const dia = lift * 0.72;
	const rubber = mat('plastic', p.darkMetal);
	const stem = mat('metal', p.metal);
	for (const [x, z] of feet) {
		tube(g, rubber, 'x', 0.016, dia, x, dia / 2, z);
		cyl(g, stem, 0.014, lift - dia, 0.014, x, dia, z, 1, 8);
	}
}
