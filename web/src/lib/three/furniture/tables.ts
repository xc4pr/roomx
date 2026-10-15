import { Group, type MeshStandardMaterial } from 'three';
import type { Look } from '#lib/core/catalog.ts';
import { cabinet } from './cabinet.ts';
import { casters, standMaterial } from './feet.ts';
import { box, cyl, mat, strut, tube, type Palette } from './kit.ts';

type Build = (w: number, d: number, h: number, p: Palette, look?: Look) => Group;
type Feet = [number, number][];
type Leg = NonNullable<Look['legs']>;

interface Stand {
	feet: Feet;
	clearW: number;
	clearD: number;
}

interface Frame {
	g: Group;
	m: MeshStandardMaterial;
	w: number;
	d: number;
	y0: number;
	under: number;
	sides: readonly number[];
}

const RECT_LEGS: readonly Leg[] = [
	'four',
	'trestle',
	'pedestal',
	'sled',
	'panel',
	'cross',
	'tframe'
];
const METAL_LEGS: readonly Leg[] = ['sled', 'tframe'];
const SHELF_LEGS: readonly Leg[] = ['four', 'trestle', 'sled', 'panel'];

// A described table has its frame in the main colour (`accentColor` is the top when it differs);
// without a look the wooden legs stay dark as before.
function frameWood(look: Look, p: Palette): string {
	return Object.keys(look).length > 0 ? p.main : p.darkWood;
}

function legKind(look: Look, fallback: Leg): Leg {
	return look.legs && RECT_LEGS.includes(look.legs) ? look.legs : fallback;
}

function four(c: Frame, t: number): Stand {
	const { g, m, w, d, y0, under } = c;
	const leg = Math.min(0.06, w * 0.12, d * 0.12);
	const inset = Math.min(0.05, w * 0.08);
	const feet: Feet = [];
	for (const sx of c.sides) {
		for (const sz of [-1, 1]) {
			const x = sx * (w / 2 - inset - leg / 2);
			const z = sz * (d / 2 - inset - leg / 2);
			box(g, m, leg, under - y0, leg, x, y0, z);
			feet.push([x, z]);
		}
	}
	if (c.sides.length === 2) {
		const apron = Math.min(0.08, (under + t) * 0.12);
		const y = under - apron;
		box(g, m, w - inset * 2 - leg * 2, apron, 0.02, 0, y, d / 2 - inset - leg / 2);
		box(g, m, w - inset * 2 - leg * 2, apron, 0.02, 0, y, -(d / 2 - inset - leg / 2));
		box(g, m, 0.02, apron, d - inset * 2 - leg * 2, w / 2 - inset - leg / 2, y, 0);
		box(g, m, 0.02, apron, d - inset * 2 - leg * 2, -(w / 2 - inset - leg / 2), y, 0);
	}
	return { feet, clearW: w - inset * 2 - leg * 2, clearD: d - inset * 2 - leg * 2 };
}

function trestle(c: Frame): Stand {
	const { g, m, w, d, y0, under } = c;
	const inset = Math.min(0.08, w * 0.1);
	const feet: Feet = [];
	for (const sx of c.sides) {
		const x = sx * (w / 2 - inset);
		box(g, m, 0.05, 0.045, d * 0.86, x, y0, 0);
		for (const sz of [-1, 1]) box(g, m, 0.05, under - y0, 0.05, x, y0, sz * d * 0.3);
		feet.push([x, -d * 0.38], [x, d * 0.38]);
	}
	if (c.sides.length === 2) {
		box(g, m, w - inset * 2 - 0.05, 0.05, 0.045, 0, y0 + (under - y0) * 0.72, 0);
	}
	return { feet, clearW: w - inset * 2 - 0.1, clearD: d * 0.86 };
}

function pedestal(c: Frame): Stand {
	const { g, m, w, d, y0, under } = c;
	const foot = [Math.min(w * 0.62, 0.7), Math.min(d * 0.7, 0.7)] as const;
	box(g, m, foot[0], 0.035, foot[1], 0, y0, 0);
	cyl(
		g,
		m,
		Math.min(0.12, w * 0.16),
		under - y0 - 0.035,
		Math.min(0.12, d * 0.16),
		0,
		y0 + 0.035,
		0
	);
	return {
		feet: [
			[-foot[0] / 2 + 0.04, -foot[1] / 2 + 0.04],
			[foot[0] / 2 - 0.04, -foot[1] / 2 + 0.04],
			[-foot[0] / 2 + 0.04, foot[1] / 2 - 0.04],
			[foot[0] / 2 - 0.04, foot[1] / 2 - 0.04]
		],
		clearW: 0,
		clearD: 0
	};
}

function sled(c: Frame): Stand {
	const { g, m, w, d, y0, under } = c;
	const inset = Math.min(0.07, w * 0.08);
	const thick = 0.03;
	const feet: Feet = [];
	for (const sx of c.sides) {
		const x = sx * (w / 2 - inset);
		tube(g, m, 'z', d * 0.8, thick, x, y0 + thick / 2, 0);
		for (const sz of [-1, 1]) {
			tube(g, m, 'y', under - y0, thick, x, y0 + (under - y0) / 2, sz * d * 0.4);
			feet.push([x, sz * d * 0.38]);
		}
		tube(g, m, 'z', d * 0.8, thick, x, under - thick / 2, 0);
	}
	return { feet, clearW: w - inset * 2 - thick * 2, clearD: d * 0.8 - thick };
}

function panel(c: Frame): Stand {
	const { g, m, w, d, y0, under } = c;
	const feet: Feet = [];
	for (const sx of c.sides) {
		box(g, m, 0.025, under - y0, d - 0.06, sx * (w / 2 - 0.04), y0, 0);
		feet.push([sx * (w / 2 - 0.04), -(d / 2 - 0.08)], [sx * (w / 2 - 0.04), d / 2 - 0.08]);
	}
	return { feet, clearW: w - 0.08 - 0.025, clearD: d - 0.06 };
}

function cross(c: Frame): Stand {
	const { g, m, w, d, y0, under } = c;
	const inset = Math.min(0.08, w * 0.1);
	const zs = d / 2 - 0.06;
	const feet: Feet = [];
	for (const sx of c.sides) {
		const x = sx * (w / 2 - inset);
		strut(g, m, [x, y0, -zs], [x, under, zs], 0.045, false);
		strut(g, m, [x, y0, zs], [x, under, -zs], 0.045, false);
		feet.push([x, -zs], [x, zs]);
	}
	if (c.sides.length === 2) {
		box(g, m, w - inset * 2, 0.035, 0.035, 0, y0 + (under - y0) / 2 - 0.0175, 0);
	}
	return { feet, clearW: 0, clearD: 0 };
}

function tframe(c: Frame): Stand {
	const { g, m, w, d, y0, under } = c;
	const inset = Math.min(0.12, w * 0.1);
	const feet: Feet = [];
	for (const sx of c.sides) {
		const x = sx * (w / 2 - inset);
		box(g, m, 0.06, 0.04, d * 0.8, x, y0, 0);
		box(g, m, 0.06, under - y0 - 0.04, 0.06, x, y0 + 0.04, 0);
		feet.push([x, -d * 0.36], [x, d * 0.36]);
	}
	if (c.sides.length === 2) box(g, m, w - inset * 2, 0.04, 0.05, 0, under - 0.04, 0);
	return { feet, clearW: 0, clearD: 0 };
}

function stand(kind: Leg, c: Frame, t: number): Stand {
	switch (kind) {
		case 'trestle':
			return trestle(c);
		case 'pedestal':
			return pedestal(c);
		case 'sled':
			return sled(c);
		case 'panel':
			return panel(c);
		case 'cross':
			return cross(c);
		case 'tframe':
			return tframe(c);
		default:
			return four(c, t);
	}
}

function shelfBoard(g: Group, top: MeshStandardMaterial, kind: Leg, s: Stand, y: number): void {
	if (!SHELF_LEGS.includes(kind) || s.clearW < 0.1 || s.clearD < 0.1) return;
	box(g, top, s.clearW, 0.02, s.clearD, 0, y, 0);
}

function wheelLift(look: Look, under: number): number {
	return look.wheels ? Math.min(0.05, under * 0.2) : 0;
}

const table: Build = (w, d, h, p, look = {}) => {
	const g = new Group();
	const top = mat('wood', look.accentColor ?? p.main);
	const kind = legKind(look, 'four');
	const legs = standMaterial(look, p, METAL_LEGS.includes(kind), frameWood(look, p));
	const t = Math.min(0.035, h * 0.12);
	const under = h - t;
	const lift = wheelLift(look, under);
	box(g, top, w, t, d, 0, under, 0);
	const s = stand(kind, { g, m: legs, w, d, y0: lift, under, sides: [-1, 1] }, t);
	if (look.shelf) shelfBoard(g, top, kind, s, lift + (under - lift) * 0.2);
	if (lift > 0) casters(g, p, s.feet, lift);
	return g;
};

const roundTable: Build = (w, d, h, p, look = {}) => {
	const g = new Group();
	const top = mat('wood', look.accentColor ?? p.main);
	const base = standMaterial(look, p, false, frameWood(look, p));
	const t = Math.min(0.035, h * 0.12);
	cyl(g, top, w, t, d, 0, h - t, 0, 1, 28);
	if (look.legs === 'four') {
		const leg = Math.min(0.055, w * 0.08);
		for (let i = 0; i < 4; i++) {
			const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
			const x = Math.cos(a) * (w / 2 - leg * 1.6);
			const z = Math.sin(a) * (d / 2 - leg * 1.6);
			cyl(g, base, leg, h - t, leg, x, 0, z, 1.25, 10);
		}
		if (look.shelf) cyl(g, top, w * 0.6, 0.02, d * 0.6, 0, (h - t) * 0.2, 0, 1, 24);
		return g;
	}
	if (look.legs === 'cross') {
		const bar = Math.min(0.07, w * 0.08);
		box(g, base, w * 0.72, 0.035, bar, 0, 0, 0);
		box(g, base, bar, 0.035, d * 0.72, 0, 0, 0);
		cyl(g, base, w * 0.1, h - t - 0.035, d * 0.1, 0, 0.035, 0);
		return g;
	}
	cyl(g, base, w * 0.1, h - t - 0.03, d * 0.1, 0, 0.03, 0);
	cyl(g, base, w * 0.45, 0.03, d * 0.45, 0, 0, 0, 0.85, 20);
	return g;
};

// A look that names the stand also names the drawers, so none are added by default.
function deskDrawers(look: Look, w: number): { block: number; flat: number } {
	const n = look.drawers ?? (look.legs ? 0 : w >= 1.1 ? 2 : 0);
	if (n >= 2 && w >= 1.1) return { block: n, flat: 0 };
	return { block: 0, flat: n };
}

const desk: Build = (w, d, h, p, look = {}) => {
	const g = new Group();
	const top = mat('wood', look.accentColor ?? p.main);
	const kind = legKind(look, 'panel');
	const legs = standMaterial(look, p, METAL_LEGS.includes(kind), frameWood(look, p));
	const t = Math.min(0.03, h * 0.06);
	box(g, top, w, t, d, 0, h - t, 0);
	const under = h - t;
	const lift = wheelLift(look, under);
	const modesty = Math.min(0.25, under * 0.35);
	const { block, flat } = deskDrawers(look, w);
	const unitW = Math.min(0.42, w * 0.32);
	const sides = block > 0 ? [-1] : [-1, 1];
	const s = stand(kind, { g, m: legs, w, d, y0: lift, under, sides }, t);
	if (block > 0) {
		const rows = Array.from({ length: block }, (_, i) => ({
			kind: 'drawer' as const,
			weight: i === 0 ? 1 : 1.3,
			cols: 1
		}));
		cabinet(g, p, {
			x: w / 2 - unitW / 2 - 0.02,
			w: unitW,
			d: d - 0.03,
			h: under,
			legH: 0,
			rows,
			handle: 'bar',
			...(lift > 0 ? { look: { base: 'none' as const, wheels: true } } : {})
		});
		if (kind === 'panel') {
			box(
				g,
				top,
				w - unitW - 0.1,
				modesty,
				0.015,
				-(unitW / 2) + 0.01,
				under - modesty,
				d / 2 - 0.05
			);
		}
	} else if (kind === 'panel') {
		box(g, top, w - 0.1, modesty, 0.015, 0, under - modesty, d / 2 - 0.05);
	}
	if (flat > 0) {
		const flatH = Math.min(0.12, under * 0.2);
		const part = new Group();
		cabinet(part, p, {
			w: Math.max(0.2, s.clearW > 0 ? s.clearW : w * 0.6),
			d: d - 0.1,
			h: flatH,
			legH: 0,
			rows: [{ kind: 'drawer', weight: 1, cols: Math.min(flat, 4) }],
			handle: 'bar'
		});
		part.position.set(0, under - flatH, 0.01);
		g.add(part);
	}
	if (look.shelf && block === 0) shelfBoard(g, top, kind, s, lift + (under - lift) * 0.2);
	if (lift > 0) casters(g, p, s.feet, lift);
	return g;
};

export const tables = { table, roundTable, desk };
