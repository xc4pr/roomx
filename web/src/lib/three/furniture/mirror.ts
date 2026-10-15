import { Group } from 'three';
import type { Look } from '#lib/core/catalog.ts';
import { arch, box, disc, mat, ring, strut, type Palette } from './kit.ts';

const GLASS = '#cfdde6';

export function shaped(look: Look): boolean {
	return (
		look.shape !== undefined ||
		look.border !== undefined ||
		look.frameColor !== undefined ||
		look.legs === 'trestle' ||
		look.base === 'frame'
	);
}

function frameWidth(border: Look['border'], w: number): number {
	switch (border) {
		case 'none':
			return 0;
		case 'thin':
			return Math.min(0.012, w * 0.03);
		case 'wide':
			return Math.min(0.06, w * 0.12);
		default:
			return Math.min(0.03, w * 0.07);
	}
}

const RING_TUBE = { none: 0, thin: 0.02, wide: 0.07 } as const;

export function framedMirror(w: number, d: number, h: number, p: Palette, look: Look): Group {
	const g = new Group();
	const standing = d > 0.12;
	const shape = look.shape ?? (!standing && Math.abs(w - h) < 0.02 ? 'round' : 'rect');
	const frame =
		look.border === 'thin'
			? mat('metal', look.frameColor ?? p.darkMetal)
			: mat('wood', look.frameColor ?? p.main);
	const glass = mat('metal', GLASS);
	const fw = frameWidth(look.border, w);
	const depth = standing ? 0.035 : d;
	const ph = standing ? Math.max(h - 0.03, 0.01) : h;
	const panel = new Group();
	if (shape === 'round' || shape === 'oval') {
		const tube = fw > 0 ? (RING_TUBE[look.border as keyof typeof RING_TUBE] ?? 0.05) : 0;
		if (tube > 0) ring(panel, frame, w, ph, depth, 0, 0, 0, tube);
		const inner = 1 - 3.2 * tube;
		disc(
			panel,
			glass,
			w * inner,
			ph * inner,
			depth * (tube > 0 ? 0.3 : 0.6),
			0,
			ph / 2,
			depth * 0.35
		);
	} else if (shape === 'arch') {
		if (fw > 0) {
			arch(panel, frame, w, ph, depth, 0, 0, 0, fw);
			arch(panel, glass, w - fw * 2, ph - fw * 2, depth * 0.3, 0, fw, depth * 0.3);
		} else {
			arch(panel, glass, w, ph, depth * 0.6, 0, 0, depth * 0.3);
		}
	} else if (fw > 0) {
		box(panel, frame, w, fw, depth, 0, ph - fw, 0);
		box(panel, frame, w, fw, depth, 0, 0, 0);
		box(panel, frame, fw, ph - fw * 2, depth, -w / 2 + fw / 2, fw, 0);
		box(panel, frame, fw, ph - fw * 2, depth, w / 2 - fw / 2, fw, 0);
		box(panel, glass, w - fw * 2, ph - fw * 2, depth * 0.3, 0, fw, depth * 0.3);
	} else {
		box(panel, glass, w, ph, depth * 0.6, 0, 0, depth * 0.3);
	}
	if (!standing) {
		g.add(panel);
		return g;
	}
	const tilt = Math.asin(Math.max(0, Math.min(0.9, (d - 0.12) / ph)));
	const z0 = -d / 2 + 0.06 + depth / 2;
	panel.rotation.x = tilt;
	panel.position.set(0, 0.03, z0);
	g.add(panel);
	const metal = look.base === 'frame';
	const stand = metal ? mat('metal', look.frameColor ?? p.metal) : frame;
	for (const sx of [-1, 1]) box(g, stand, 0.04, 0.03, d * 0.7, sx * (w / 2 - 0.05), 0, -d * 0.15);
	if (look.legs === 'trestle' || metal) {
		const at = ph * 0.7;
		const y = 0.03 + at * Math.cos(tilt) - (depth / 2) * Math.sin(tilt);
		const z = z0 + at * Math.sin(tilt) + (depth / 2) * Math.cos(tilt);
		for (const sx of [-1, 1]) {
			strut(
				g,
				stand,
				[sx * (w / 2 - 0.05), y, z],
				[sx * (w / 2 - 0.05), 0.015, d / 2 - 0.02],
				0.025
			);
		}
	}
	return g;
}
