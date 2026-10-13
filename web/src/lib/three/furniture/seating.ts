import { Group } from 'three';
import { ball, box, cyl, mat, split, type Palette } from './kit.ts';

type Build = (w: number, d: number, h: number, p: Palette) => Group;

function cushionCount(width: number): number {
	return Math.max(1, Math.min(4, Math.round(width / 0.7)));
}

interface SofaOptions {
	arms: boolean;
	seats?: number;
}

function sofaBody(w: number, d: number, h: number, p: Palette, options: SofaOptions): Group {
	const g = new Group();
	const fabric = mat('fabric', p.main);
	const cushion = mat('fabric', p.light);
	const legs = mat('wood', p.darkWood);
	const legH = Math.min(0.1, h * 0.12);
	const seatTop = h * 0.52;
	const armW = options.arms ? Math.min(0.2, w * 0.14) : 0;
	const backD = Math.min(0.24, d * 0.28);
	const inner = w - armW * 2;

	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			box(g, legs, 0.05, legH, 0.05, sx * (w / 2 - 0.07), 0, sz * (d / 2 - 0.07));
		}
	}
	box(g, fabric, w, seatTop - legH - h * 0.1, d, 0, legH, 0);
	box(g, fabric, w, h * 0.9 - legH, backD, 0, legH, d / 2 - backD / 2);
	if (options.arms) {
		for (const sx of [-1, 1]) {
			box(g, fabric, armW, h * 0.64 - legH, d, sx * (w / 2 - armW / 2), legH, 0);
		}
	}
	const seats = options.seats ?? cushionCount(inner);
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

const sofa: Build = (w, d, h, p) => sofaBody(w, d, h, p, { arms: true });

const armchair: Build = (w, d, h, p) => sofaBody(w, d, h, p, { arms: true, seats: 1 });

const cornerSofa: Build = (w, d, h, p) => {
	const g = new Group();
	const fabric = mat('fabric', p.main);
	const cushion = mat('fabric', p.light);
	const legs = mat('wood', p.darkWood);
	const legH = Math.min(0.1, h * 0.12);
	const seatTop = h * 0.52;
	const armW = Math.min(0.18, w * 0.07);
	const backD = Math.min(0.24, d * 0.18);
	const mainD = Math.min(0.95, d * 0.55);
	const chaiseW = Math.min(1.1, w * 0.36);
	const mainW = w - chaiseW;
	const chaiseX = w / 2 - chaiseW / 2;

	for (const [x, z] of [
		[-w / 2 + 0.08, -d / 2 + mainD - 0.08],
		[-w / 2 + 0.08, d / 2 - 0.08],
		[w / 2 - 0.08, -d / 2 + 0.08],
		[w / 2 - 0.08, d / 2 - 0.08],
		[w / 2 - chaiseW + 0.08, -d / 2 + 0.08]
	] as const) {
		box(g, legs, 0.05, legH, 0.05, x, 0, z);
	}
	const baseH = seatTop - legH - h * 0.1;
	box(g, fabric, mainW, baseH, mainD, -w / 2 + mainW / 2, legH, d / 2 - mainD / 2);
	box(g, fabric, chaiseW, baseH, d, chaiseX, legH, 0);
	box(g, fabric, w, h * 0.9 - legH, backD, 0, legH, d / 2 - backD / 2);
	box(g, fabric, armW, h * 0.64 - legH, mainD, -w / 2 + armW / 2, legH, d / 2 - mainD / 2);
	box(g, fabric, armW, h * 0.64 - legH, d, w / 2 - armW / 2, legH, 0);

	const seatsW = mainW - armW;
	const seats = Math.max(1, Math.round(seatsW / 0.7));
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

const chair: Build = (w, d, h, p) => {
	const g = new Group();
	const frame = mat('wood', p.darkWood);
	const seat = mat('wood', p.main);
	const seatY = h * 0.5;
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

const officeChair: Build = (w, d, h, p) => {
	const g = new Group();
	const fabric = mat('fabric', p.main);
	const metal = mat('metal', p.metal);
	const dark = mat('plastic', p.darkMetal);
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
	for (const sx of [-1, 1]) {
		box(g, dark, 0.04, 0.2, 0.04, sx * (w / 2 - 0.035), seatY + 0.06, 0);
		box(g, dark, 0.07, 0.03, d * 0.4, sx * (w / 2 - 0.035), seatY + 0.26, -d * 0.04);
	}
	return g;
};

const stool: Build = (w, d, h, p) => {
	const g = new Group();
	const top = mat('wood', p.main);
	const legs = mat('wood', p.darkWood);
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
