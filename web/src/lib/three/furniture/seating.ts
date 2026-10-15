import { Group, type MeshStandardMaterial } from 'three';
import type { Look } from '#lib/core/catalog.ts';
import { footing, footSpec, postFooting, standMaterial, type FootSpec } from './feet.ts';
import { ball, box, cyl, mat, soft, split, tube, type Palette } from './kit.ts';

type Build = (w: number, d: number, h: number, p: Palette, look?: Look) => Group;

function cushionCount(width: number): number {
	return Math.max(1, Math.min(4, Math.round(width / 0.7)));
}

interface SofaOptions {
	arms: boolean;
	seats?: number;
}

const SOFA_FEET = { none: 0, plinth: 0.06, feet: 0.04, legs: 0.15, frame: 0.12 } as const;

interface Arm {
	width: number;
	top: number;
	roll: boolean;
}

// Arm width and top; `base` is the width of the original arm, undefined `arms` keeps it.
function armOf(look: Look, original: boolean, base: number, h: number, seatTop: number): Arm {
	const top = look.back === undefined ? h * 0.64 : seatTop + h * 0.12;
	switch (look.arms) {
		case 'none':
			return { width: 0, top, roll: false };
		case 'slim':
			return {
				width: Math.min(0.09, base * 0.45),
				top: Math.min(top, seatTop + h * 0.09),
				roll: false
			};
		case 'wide':
			return { width: base * 1.35, top, roll: false };
		case 'rolled':
			return { width: base, top, roll: true };
		default:
			return { width: original ? base : 0, top, roll: false };
	}
}

function arm(
	g: Group,
	m: MeshStandardMaterial,
	a: Arm,
	x: number,
	z: number,
	depth: number,
	legH: number
): void {
	if (a.width <= 0) return;
	if (a.roll) {
		box(g, m, a.width, a.top - legH - a.width / 2, depth, x, legH, z);
		tube(g, m, 'z', depth, a.width, x, a.top - a.width / 2, z);
	} else {
		box(g, m, a.width, a.top - legH, depth, x, legH, z);
	}
}

function seatRatio(back: Look['back']): number {
	switch (back) {
		case 'low':
			return 0.64;
		case 'medium':
			return 0.56;
		case 'wing':
			return 0.46;
		default:
			return 0.52;
	}
}

function backTop(back: Look['back'], h: number, seatTop: number): number {
	if (back === undefined) return h * 0.9;
	return back === 'wing' ? h : seatTop + (h - seatTop) * 0.8;
}

function sofaFooting(
	look: Look,
	p: Palette,
	h: number
): { spec: FootSpec; m: MeshStandardMaterial; metal: boolean } {
	const original = Math.min(0.1, h * 0.12);
	return {
		spec: footSpec(look, SOFA_FEET, original, h * 0.3),
		m: standMaterial(look, p, look.base === 'frame'),
		metal: (look.baseMaterial ?? (look.base === 'frame' ? 'metal' : 'wood')) === 'metal'
	};
}

function sofaBody(
	w: number,
	d: number,
	h: number,
	p: Palette,
	options: SofaOptions,
	look: Look
): Group {
	const g = new Group();
	const fabric = mat('fabric', p.main);
	const cushion = mat('fabric', p.light);
	const legs = mat('wood', p.darkWood);
	const stand = sofaFooting(look, p, h);
	const legH = stand.spec.height;
	const seatTop = h * seatRatio(look.back);
	const a = armOf(look, options.arms, Math.min(0.2, w * 0.14), h, seatTop);
	const armW = a.width;
	const backD = Math.min(
		look.back === 'wing' ? 0.3 : 0.24,
		d * (look.back === 'wing' ? 0.32 : 0.28)
	);
	const inner = w - armW * 2;

	if (stand.spec.legacy) {
		for (const sx of [-1, 1]) {
			for (const sz of [-1, 1]) {
				box(g, legs, 0.05, legH, 0.05, sx * (w / 2 - 0.07), 0, sz * (d / 2 - 0.07));
			}
		}
	} else {
		footing(g, stand.spec, stand.m, { w, d, inset: 0.07 }, stand.metal);
	}
	box(g, fabric, w, seatTop - legH - h * 0.1, d, 0, legH, 0);
	box(g, fabric, w, backTop(look.back, h, seatTop) - legH, backD, 0, legH, d / 2 - backD / 2);
	for (const sx of [-1, 1]) arm(g, fabric, a, sx * (w / 2 - armW / 2), 0, d, legH);
	if (look.back === 'wing') {
		const wing = Math.min(0.4, d * 0.5);
		for (const sx of [-1, 1]) {
			box(
				g,
				fabric,
				0.1,
				h * 0.97 - seatTop,
				wing,
				sx * (inner / 2 - 0.05),
				seatTop,
				d / 2 - wing / 2
			);
		}
	}
	const seats = look.cushions ?? options.seats ?? cushionCount(inner);
	const seatDepth = d - backD;
	const centres = split(inner, seats);
	for (const cx of centres) {
		box(
			g,
			cushion,
			inner / seats - 0.012,
			h * 0.1,
			seatDepth - 0.01,
			cx,
			seatTop - h * 0.1,
			-d / 2 + seatDepth / 2
		);
		box(g, cushion, inner / seats - 0.012, h - seatTop, 0.16, cx, seatTop, d / 2 - backD - 0.08);
	}
	return g;
}

// Cantilever frame (POÄNG): per side a floor runner, front riser, rear post up to the top and a seat rail.
function cantilever(
	g: Group,
	m: MeshStandardMaterial,
	w: number,
	d: number,
	h: number,
	seatY: number
): number {
	const t = 0.03;
	for (const sx of [-1, 1]) {
		const x = sx * (w / 2 - t / 2);
		box(g, m, t, t, d, x, 0, 0);
		box(g, m, t, seatY, t, x, 0, -d / 2 + t / 2);
		box(g, m, t, h, t, x, 0, d / 2 - t / 2);
		box(g, m, t, t, d, x, seatY - t, 0);
	}
	return w - t * 2 - 0.01;
}

function cantileverArmchair(w: number, d: number, h: number, p: Palette, look: Look): Group {
	const g = new Group();
	const frame = standMaterial(look, p, false);
	const fabric = mat('fabric', p.main);
	const seatY = h * 0.36;
	const inner = cantilever(g, frame, w, d, h, seatY);
	soft(g, fabric, inner, h * 0.1, d * 0.86, 0, seatY, -0.02, 0.4);
	const backY = seatY + h * 0.08;
	soft(g, fabric, inner, h - backY, 0.1, 0, backY, d / 2 - 0.03 - 0.05, 0.4);
	return g;
}

const sofa: Build = (w, d, h, p, look = {}) => sofaBody(w, d, h, p, { arms: true }, look);

const armchair: Build = (w, d, h, p, look = {}) =>
	look.legs === 'cantilever'
		? cantileverArmchair(w, d, h, p, look)
		: sofaBody(w, d, h, p, { arms: true, seats: 1 }, look);

const cornerSofa: Build = (w, d, h, p, look = {}) => {
	const g = new Group();
	const fabric = mat('fabric', p.main);
	const cushion = mat('fabric', p.light);
	const legs = mat('wood', p.darkWood);
	const stand = sofaFooting(look, p, h);
	const legH = stand.spec.height;
	const seatTop = h * seatRatio(look.back);
	const a = armOf(look, true, Math.min(0.18, w * 0.07), h, seatTop);
	const armW = a.width;
	const backD = Math.min(0.24, d * 0.18);
	const mainD = Math.min(0.95, d * 0.55);
	const chaiseW = Math.min(1.1, w * 0.36);
	const mainW = w - chaiseW;
	const chaiseX = w / 2 - chaiseW / 2;

	const points = [
		[-w / 2 + 0.08, -d / 2 + mainD - 0.08],
		[-w / 2 + 0.08, d / 2 - 0.08],
		[w / 2 - 0.08, -d / 2 + 0.08],
		[w / 2 - 0.08, d / 2 - 0.08],
		[w / 2 - chaiseW + 0.08, -d / 2 + 0.08]
	] as const;
	if (stand.spec.legacy) {
		for (const [x, z] of points) box(g, legs, 0.05, legH, 0.05, x, 0, z);
	} else {
		postFooting(
			g,
			stand.spec,
			stand.m,
			points,
			[
				{ w: mainW, d: mainD, x: -w / 2 + mainW / 2, z: d / 2 - mainD / 2 },
				{ w: chaiseW, d, x: chaiseX, z: 0 }
			],
			stand.metal
		);
	}
	const baseH = seatTop - legH - h * 0.1;
	box(g, fabric, mainW, baseH, mainD, -w / 2 + mainW / 2, legH, d / 2 - mainD / 2);
	box(g, fabric, chaiseW, baseH, d, chaiseX, legH, 0);
	box(g, fabric, w, backTop(look.back, h, seatTop) - legH, backD, 0, legH, d / 2 - backD / 2);
	arm(g, fabric, a, -w / 2 + armW / 2, d / 2 - mainD / 2, mainD, legH);
	arm(g, fabric, a, w / 2 - armW / 2, 0, d, legH);

	const seatsW = mainW - armW;
	const seats = look.cushions ?? Math.max(1, Math.round(seatsW / 0.7));
	for (const cx of split(seatsW, seats)) {
		box(
			g,
			cushion,
			seatsW / seats - 0.012,
			h * 0.1,
			mainD - backD - 0.01,
			-w / 2 + armW + seatsW / 2 + cx,
			seatTop - h * 0.1,
			d / 2 - backD - (mainD - backD) / 2
		);
	}
	const chaiseSeat = chaiseW - armW;
	box(
		g,
		cushion,
		chaiseSeat - 0.012,
		h * 0.1,
		d - backD - 0.01,
		chaiseX - armW / 2,
		seatTop - h * 0.1,
		-backD / 2
	);
	const backs = Math.max(2, Math.round((w - armW * 2) / 0.7));
	for (const cx of split(w - armW * 2, backs)) {
		box(
			g,
			cushion,
			(w - armW * 2) / backs - 0.012,
			h - seatTop,
			0.16,
			cx,
			seatTop,
			d / 2 - backD - 0.08
		);
	}
	return g;
};

const chair: Build = (w, d, h, p, look = {}) => {
	const g = new Group();
	const frame = standMaterial(look, p, false);
	const seat = mat('wood', p.main);
	const seatY = h * 0.5;
	if (look.legs === 'cantilever') {
		const inner = cantilever(g, frame, w, d, h, seatY - 0.04);
		box(g, seat, inner, 0.04, d * 0.9, 0, seatY - 0.04, -0.01);
		box(g, seat, inner, (h - seatY) * 0.5, 0.02, 0, h - (h - seatY) * 0.55, d / 2 - 0.03 - 0.01);
		return g;
	}
	const leg = Math.min(0.045, w * 0.12);
	for (const sx of [-1, 1]) {
		box(g, frame, leg, seatY, leg, sx * (w / 2 - leg / 2), 0, -(d / 2 - leg / 2));
		box(g, frame, leg, h, leg, sx * (w / 2 - leg / 2), 0, d / 2 - leg / 2);
	}
	box(g, seat, w, 0.04, d, 0, seatY - 0.04, 0);
	box(g, frame, w - leg * 2, 0.04, 0.02, 0, seatY - 0.12, d / 2 - leg / 2);
	box(g, seat, w - leg * 2, (h - seatY) * 0.45, 0.025, 0, h - (h - seatY) * 0.45, d / 2 - leg / 2);
	box(g, frame, w - leg * 2, 0.025, 0.02, 0, seatY + (h - seatY) * 0.2, d / 2 - leg / 2);
	return g;
};

const officeChair: Build = (w, d, h, p, look = {}) => {
	const g = new Group();
	const fabric = mat('fabric', p.main);
	const metal = mat('metal', look.frameColor ?? p.metal);
	const dark = mat('plastic', look.frameColor ?? p.darkMetal);
	const star = Math.min(w, d);
	const seatY = h * 0.42;
	cyl(g, dark, 0.05, seatY - 0.12, 0.05, 0, 0.06, 0);
	cyl(g, dark, 0.07, 0.08, 0.07, 0, seatY - 0.12, 0);
	for (let i = 0; i < 5; i++) {
		const angle = (i / 5) * Math.PI * 2 + Math.PI / 2;
		const spoke = box(g, dark, 0.045, 0.035, star / 2 - 0.02, 0, 0.045, 0);
		spoke.position.x = (Math.cos(angle) * (star / 2 - 0.02)) / 2;
		spoke.position.z = (Math.sin(angle) * (star / 2 - 0.02)) / 2;
		spoke.rotation.y = Math.PI / 2 - angle;
		ball(
			g,
			mat('plastic', '#18191b'),
			0.05,
			0.05,
			0.05,
			Math.cos(angle) * (star / 2 - 0.025),
			0,
			Math.sin(angle) * (star / 2 - 0.025),
			false
		);
	}
	box(g, fabric, w * 0.92, 0.1, d * 0.88, 0, seatY - 0.04, -d * 0.04);
	const backH = h - seatY - 0.02;
	box(g, fabric, w * 0.86, backH, 0.07, 0, seatY + 0.02, d / 2 - 0.045);
	box(g, metal, 0.04, 0.2, 0.04, 0, seatY - 0.02, d / 2 - 0.09);
	if (look.arms === 'none') return g;
	for (const sx of [-1, 1]) {
		box(g, dark, 0.04, 0.2, 0.04, sx * (w / 2 - 0.035), seatY + 0.06, 0);
		box(g, dark, 0.07, 0.03, d * 0.4, sx * (w / 2 - 0.035), seatY + 0.26, -d * 0.04);
	}
	return g;
};

const stool: Build = (w, d, h, p, look = {}) => {
	const g = new Group();
	const top = mat('wood', p.main);
	const legs = standMaterial(look, p, false);
	cyl(g, top, w, 0.045, d, 0, h - 0.045, 0);
	const leg = Math.min(0.04, w * 0.1);
	for (let i = 0; i < 4; i++) {
		const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
		box(
			g,
			legs,
			leg,
			h - 0.045,
			leg,
			Math.cos(angle) * (w / 2 - leg * 1.3),
			0,
			Math.sin(angle) * (d / 2 - leg * 1.3)
		);
	}
	box(g, legs, w - leg * 4.5, 0.02, 0.02, 0, h * 0.3, 0);
	box(g, legs, 0.02, 0.02, d - leg * 4.5, 0, h * 0.3, 0);
	return g;
};

export const seating = { sofa, cornerSofa, armchair, chair, officeChair, stool };
