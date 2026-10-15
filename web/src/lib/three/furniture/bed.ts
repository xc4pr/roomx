import { Group, type MeshStandardMaterial } from 'three';
import type { Look } from '#lib/core/catalog.ts';
import { footing, footSpec, standMaterial } from './feet.ts';
import { box, mat, soft, split, type Palette } from './kit.ts';

const BED_FEET = { none: 0, plinth: 0.08, feet: 0.04, legs: 0.22, frame: 0.2 } as const;

interface Parts {
	g: Group;
	frame: MeshStandardMaterial;
	fabric: MeshStandardMaterial;
	metal: MeshStandardMaterial;
	w: number;
	d: number;
	h: number;
	y: number;
}

function headboard(c: Parts, kind: NonNullable<Look['headboard']>): void {
	const { g, frame, fabric, metal, w, d, h, y } = c;
	const z = d / 2;
	switch (kind) {
		case 'panel':
			box(g, frame, w, h - y, 0.04, 0, y, z - 0.02);
			break;
		case 'upholstered':
			soft(g, fabric, w, h - y, 0.1, 0, y, z - 0.05, 0.3);
			break;
		case 'slats': {
			const count = Math.max(5, Math.min(14, Math.round(w / 0.1)));
			const inner = w - 0.1;
			for (const sx of [-1, 1])
				box(g, frame, 0.05, h - y, 0.05, sx * (w / 2 - 0.025), y, z - 0.025);
			box(g, frame, w, 0.05, 0.05, 0, h - 0.05, z - 0.025);
			for (const x of split(inner, count)) {
				box(g, frame, (inner / count) * 0.62, h - y - 0.17, 0.03, x, y + 0.12, z - 0.025);
			}
			break;
		}
		case 'frame': {
			const count = Math.max(4, Math.min(12, Math.round(w / 0.12)));
			const inner = w - 0.06;
			for (const sx of [-1, 1])
				box(g, metal, 0.03, h - y, 0.03, sx * (w / 2 - 0.015), y, z - 0.015);
			box(g, metal, w, 0.03, 0.03, 0, h - 0.03, z - 0.015);
			box(g, metal, inner, 0.025, 0.025, 0, y + (h - y) * 0.38, z - 0.015);
			for (const x of split(inner, count))
				box(g, metal, 0.012, h - y - 0.06, 0.012, x, y + 0.03, z - 0.015);
			break;
		}
		default:
			break;
	}
}

function underDrawers(
	c: Parts,
	count: number,
	legH: number,
	frameH: number,
	front: MeshStandardMaterial
): void {
	const { g, w, d } = c;
	const zone = d - 0.18;
	const zMid = (-d / 2 + 0.08 + d / 2 - 0.1) / 2;
	const dark = mat('matte', '#2a2724');
	for (const [index, sx] of ([1, -1] as const).entries()) {
		const n = Math.floor((count + 1 - index) / 2);
		if (n === 0) continue;
		const len = zone / n;
		for (let i = 0; i < n; i++) {
			const zc = zMid - zone / 2 + len * (i + 0.5);
			box(g, front, 0.018, frameH - 0.012, len - 0.006, sx * (w / 2 - 0.009), legH + 0.006, zc);
			box(
				g,
				dark,
				0.002,
				0.012,
				Math.min(0.16, len * 0.4),
				sx * (w / 2 - 0.001),
				legH + frameH - 0.04,
				zc
			);
		}
	}
}

export const bed = (w: number, d: number, h: number, p: Palette, look: Look = {}): Group => {
	const g = new Group();
	const frame = mat('wood', look.frameColor ?? p.main);
	const legs = mat('wood', p.darkWood);
	const mattress = mat('fabric', '#ece8e0');
	const duvet = mat('fabric', '#9fb2c0');
	const duvetEdge = mat('fabric', '#8296a6');
	const pillow = mat('fabric', '#f6f3ee');

	// Without a headboard the soft layers fill the height that the headboard would have given.
	const k = look.headboard === 'none' ? 1.4 : 1;
	const stand = footSpec(look, BED_FEET, Math.min(0.1, h * 0.12) * k, h * 0.45);
	const legH = stand.height;
	const frameH = Math.min(0.17, h * 0.2) * k;
	const mattH = Math.min(0.22, h * 0.26) * k;
	const rail = 0.04;
	const top = legH + frameH;
	const drawers = look.drawers ?? 0;
	const bodyW = drawers > 0 ? w - 0.036 : w;

	if (stand.legacy) {
		for (const sx of [-1, 1]) {
			for (const sz of [-1, 1]) {
				box(g, legs, 0.06, legH, 0.06, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05));
			}
		}
	} else {
		const metal = (look.baseMaterial ?? (stand.kind === 'frame' ? 'metal' : 'wood')) === 'metal';
		footing(g, stand, standMaterial(look, p, stand.kind === 'frame'), { w, d, inset: 0.05 }, metal);
	}
	box(g, frame, bodyW, frameH, d, 0, legH, 0);
	if (drawers > 0) {
		const parts = { g, frame, fabric: frame, metal: frame, w, d, h, y: 0 };
		underDrawers(parts, drawers, legH, frameH, mat('wood', p.light));
	}

	const lowY = legH * 0.4;
	const kind = look.headboard;
	if (kind === undefined) {
		box(g, frame, w, h - lowY, 0.07, 0, lowY, d / 2 - 0.035);
		box(g, legs, w - 0.12, 0.05, 0.03, 0, h * 0.62, d / 2 - 0.085);
	} else {
		headboard(
			{
				g,
				frame,
				fabric: mat('fabric', p.main),
				metal: mat('metal', look.frameColor ?? p.darkMetal),
				w,
				d,
				h,
				y: lowY
			},
			kind
		);
	}
	if (look.footboard !== false) {
		const footH = Math.min(h * 0.32, top + 0.1) - lowY;
		if (kind === 'upholstered')
			soft(g, mat('fabric', p.main), w, footH, 0.05, 0, lowY, -d / 2 + 0.025, 0.3);
		else box(g, frame, w, footH, 0.05, 0, lowY, -d / 2 + 0.025);
	}

	const inner = w - rail * 2;
	const length = d - 0.07 - 0.05;
	const zMid = (d / 2 - 0.07 + -d / 2 + 0.05) / 2;
	soft(g, mattress, inner, mattH, length, 0, top, zMid, 0.15);

	const duvetLength = length * 0.68;
	const duvetZ = -d / 2 + 0.05 + duvetLength / 2 + 0.01;
	const duvetH = Math.min(0.08, h * 0.1) * k;
	soft(g, duvet, inner + 0.02, duvetH, duvetLength, 0, top + mattH * 0.55, duvetZ, 0.4);
	box(
		g,
		duvetEdge,
		inner + 0.022,
		duvetH * 0.5,
		0.02,
		0,
		top + mattH * 0.55 + duvetH * 0.15,
		duvetZ + duvetLength / 2 - 0.05
	);

	const pillows = w > 1.3 ? 2 : 1;
	const pillowW = Math.min(0.62, (inner / pillows) * 0.82);
	const pillowH = Math.min(0.12, h * 0.14) * k;
	for (const px of split(inner, pillows)) {
		soft(g, pillow, pillowW, pillowH, 0.36, px, top + mattH, d / 2 - 0.07 - 0.25, 0.5);
	}
	return g;
};
