import { Group } from 'three';
import { box, cyl, mat, metalMat, shade, type Palette } from './kit.ts';

type Build = (w: number, d: number, h: number, p: Palette) => Group;

const PLINTH = 0.1;
const WORKTOP = 0.038;
const LIP = 0.02;
const FRONT = 0.018;
const GAP = 0.004;
const WORKTOP_COLOR = '#8c867b';
const STEEL = '#b4b8bc';

function frontZ(d: number): number {
	return -d / 2 + LIP;
}

function carcass(g: Group, p: Palette, w: number, d: number, y0: number, y1: number): void {
	box(g, mat('matte', shade(p.main, -0.12)), w, y1 - y0, d - LIP, 0, y0, LIP / 2);
}

function panel(
	g: Group,
	p: Palette,
	d: number,
	x0: number,
	x1: number,
	y0: number,
	y1: number
): void {
	box(
		g,
		mat('matte', p.main),
		x1 - x0 - GAP,
		y1 - y0 - GAP,
		FRONT,
		(x0 + x1) / 2,
		y0 + GAP / 2,
		frontZ(d) + FRONT / 2
	);
}

function bar(
	g: Group,
	p: Palette,
	d: number,
	x: number,
	y: number,
	vertical: boolean,
	length: number
): void {
	const material = metalMat(p.metal);
	if (vertical) box(g, material, 0.014, length, LIP, x, y - length / 2, -d / 2 + LIP / 2);
	else box(g, material, length, 0.014, LIP, x, y - 0.007, -d / 2 + LIP / 2);
}

function doors(g: Group, p: Palette, w: number, d: number, y0: number, y1: number): void {
	const count = w > 0.7 ? 2 : 1;
	const width = w / count;
	for (let i = 0; i < count; i++) {
		const x0 = -w / 2 + i * width;
		panel(g, p, d, x0, x0 + width, y0, y1);
		const x = i === 0 ? x0 + width - 0.05 : x0 + 0.05;
		bar(
			g,
			p,
			d,
			x,
			(y0 + y1) / 2 + Math.min(0.07, (y1 - y0) / 4),
			true,
			Math.min(0.14, (y1 - y0) * 0.5)
		);
	}
}

function plinth(g: Group, p: Palette, w: number, d: number, height: number): void {
	box(g, mat('matte', shade(p.main, -0.5)), w, height, d - 0.06, 0, 0, 0.03);
}

function worktop(g: Group, w: number, d: number, h: number): void {
	box(g, mat('matte', WORKTOP_COLOR), w, WORKTOP, d, 0, h - WORKTOP, 0);
}

function cabinet(g: Group, p: Palette, w: number, d: number, h: number, drawers: boolean): void {
	const plinthH = Math.min(PLINTH, h * 0.15);
	const y1 = h - WORKTOP;
	plinth(g, p, w, d, plinthH);
	carcass(g, p, w, d, plinthH, y1);
	worktop(g, w, d, h);
	const drawerH = Math.min(0.2, (y1 - plinthH) / 3);
	if (drawers) {
		panel(g, p, d, -w / 2, w / 2, y1 - drawerH, y1);
		bar(g, p, d, 0, y1 - 0.04, false, Math.min(0.2, w * 0.5));
		doors(g, p, w, d, plinthH, y1 - drawerH);
	} else {
		doors(g, p, w, d, plinthH, y1);
	}
}

const kitchenBase: Build = (w, d, h, p) => {
	const g = new Group();
	cabinet(g, p, w, d, h, true);
	return g;
};

const kitchenSink: Build = (w, d, h, p) => {
	const g = new Group();
	const plinthH = Math.min(PLINTH, h * 0.15);
	const y1 = h - WORKTOP;
	plinth(g, p, w, d, plinthH);
	carcass(g, p, w, d, plinthH, y1);
	doors(g, p, w, d, plinthH, y1);
	const top = mat('matte', WORKTOP_COLOR);
	const basinW = Math.min(w - 0.12, 0.78);
	const basinD = Math.max(0.1, d - 0.2);
	const side = (w - basinW) / 2;
	const back = d / 2 - 0.07;
	const frontEdge = back - basinD;
	box(g, top, w, WORKTOP, frontEdge + d / 2, 0, y1, (frontEdge - d / 2) / 2);
	box(g, top, w, WORKTOP, d / 2 - back, 0, y1, (back + d / 2) / 2);
	box(g, top, side, WORKTOP, basinD, -w / 2 + side / 2, y1, (frontEdge + back) / 2);
	box(g, top, side, WORKTOP, basinD, w / 2 - side / 2, y1, (frontEdge + back) / 2);
	box(g, mat('metal', STEEL), basinW, WORKTOP * 0.9, basinD, 0, y1 - 0.06, (frontEdge + back) / 2);
	return g;
};

const kitchenWall: Build = (w, d, h, p) => {
	const g = new Group();
	carcass(g, p, w, d, 0, h);
	const count = Math.max(1, Math.round(w / 0.6));
	const width = w / count;
	for (let i = 0; i < count; i++) {
		const x0 = -w / 2 + i * width;
		panel(g, p, d, x0, x0 + width, 0, h);
		const x = i % 2 === 0 ? x0 + width - 0.05 : x0 + 0.05;
		bar(g, p, d, x, 0.18, true, 0.14);
	}
	return g;
};

const kitchenTall: Build = (w, d, h, p) => {
	const g = new Group();
	const plinthH = Math.min(PLINTH, h * 0.08);
	plinth(g, p, w, d, plinthH);
	carcass(g, p, w, d, plinthH, h);
	const split = plinthH + (h - plinthH) * 0.55;
	panel(g, p, d, -w / 2, w / 2, plinthH, split);
	panel(g, p, d, -w / 2, w / 2, split, h);
	bar(g, p, d, w / 2 - 0.05, split - 0.1, true, 0.3);
	bar(g, p, d, w / 2 - 0.05, split + 0.4, true, 0.3);
	return g;
};

const hob: Build = (w, d, h) => {
	const g = new Group();
	box(g, mat('screen', '#121417'), w, h, d, 0, 0, 0);
	const radius = Math.min(0.09, w / 4.6, d / 4.6);
	const zone = mat('plastic', '#6b7078');
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			cyl(
				g,
				zone,
				radius * 2,
				0.001,
				radius * 2,
				sx * radius * 1.15,
				h - 0.0005,
				sz * radius * 1.15,
				1,
				12
			);
		}
	}
	return g;
};

const oven: Build = (w, d, h, p) => {
	const g = new Group();
	const body = mat('plastic', p.main);
	const dark = mat('screen', '#121417');
	box(g, body, w, h, d, 0, 0, 0);
	box(g, dark, w - 0.1, h * 0.55, 0.003, 0, h * 0.12, -d / 2 - 0.0015);
	box(g, metalMat(STEEL), w - 0.12, 0.016, 0.03, 0, h * 0.84, -d / 2 - 0.015);
	for (const x of [-0.2, 0, 0.2].map((k) => k * w)) {
		cyl(g, metalMat(STEEL), 0.03, 0.015, 0.03, x, h * 0.93, -d / 2 - 0.007, 1, 10);
	}
	return g;
};

const fridge: Build = (w, d, h, p) => {
	const g = new Group();
	const plinthH = Math.min(0.06, h * 0.04);
	plinth(g, p, w, d, plinthH);
	carcass(g, p, w, d, plinthH, h);
	const split = plinthH + (h - plinthH) * 0.3;
	panel(g, p, d, -w / 2, w / 2, plinthH, split);
	panel(g, p, d, -w / 2, w / 2, split, h);
	bar(g, p, d, w / 2 - 0.05, split - 0.05, true, 0.3);
	bar(g, p, d, w / 2 - 0.05, split + 0.7, true, 0.5);
	return g;
};

export const kitchen = {
	kitchenBase,
	kitchenWall,
	kitchenTall,
	kitchenSink,
	hob,
	oven,
	fridge
};
