import { Group } from 'three';
import { accent, ball, box, cyl, disc, mat, split, type Palette } from './kit.ts';

type Build = (w: number, d: number, h: number, p: Palette) => Group;

const SCREEN = '#16202c';

const monitor: Build = (w, d, h, p) => {
	const g = new Group();
	const body = mat('plastic', p.main);
	const metal = mat('metal', p.darkMetal);
	const panelThickness = 0.025;
	const panelBottom = h * 0.24;
	const panelZ = d / 2 - 0.05;
	box(g, metal, w * 0.36, 0.012, d, 0, 0, 0);
	box(g, metal, Math.min(0.06, w * 0.1), panelBottom, 0.03, 0, 0.006, panelZ + 0.005);
	box(g, body, w, h - panelBottom, panelThickness, 0, panelBottom, panelZ);
	box(
		g,
		body,
		w * 0.4,
		(h - panelBottom) * 0.6,
		d / 2 - (panelZ + panelThickness / 2),
		0,
		panelBottom + (h - panelBottom) * 0.2,
		(d / 2 + panelZ + panelThickness / 2) / 2
	);
	box(
		g,
		mat('screen', SCREEN),
		w - 0.02,
		h - panelBottom - 0.02,
		0.004,
		0,
		panelBottom + 0.01,
		panelZ - panelThickness / 2 + 0.0015
	);
	return g;
};

const tv: Build = (w, d, h, p) => {
	const g = new Group();
	const body = mat('plastic', p.main);
	const metal = mat('metal', p.darkMetal);
	const wall = d < 0.1;
	const thickness = wall ? d : Math.min(0.045, d * 0.25);
	const feet = wall ? 0 : Math.min(0.05, h * 0.07);
	if (!wall) {
		for (const sx of [-1, 1]) box(g, metal, w * 0.1, 0.012, d, sx * w * 0.32, 0, 0);
		for (const sx of [-1, 1])
			box(g, metal, w * 0.04, feet, 0.03, sx * w * 0.32, 0.012, d / 2 - 0.1);
	}
	box(g, body, w, h - feet, thickness, 0, feet, d / 2 - thickness / 2);
	box(
		g,
		mat('screen', SCREEN),
		w - 0.02,
		h - feet - 0.02,
		0.004,
		0,
		feet + 0.01,
		d / 2 - thickness + 0.0015
	);
	return g;
};

const pc: Build = (w, d, h, p) => {
	const g = new Group();
	const body = mat('plastic', p.main);
	const dark = mat('plastic', accent(p.main, 0.25));
	const lit = mat('light', '#5fd48a');
	const lip = 0.006;
	box(g, body, w, h, d - lip, 0, 0, lip / 2);
	box(g, dark, w * 0.84, h * 0.84, lip, 0, h * 0.08, -d / 2 + lip / 2);
	const compact = h < 0.1;
	if (compact) {
		box(g, lit, w * 0.08, h * 0.12, 0.003, w * 0.3, h * 0.45, -d / 2 + lip * 0.4);
		return g;
	}
	for (let i = 0; i < 6; i++) {
		box(g, body, w * 0.7, 0.006, 0.004, 0, h * 0.18 + i * 0.016, -d / 2 + 0.002);
	}
	box(g, mat('matte', '#0c0d0f'), w * 0.7, 0.02, 0.004, 0, h * 0.65, -d / 2 + 0.002);
	cyl(
		g,
		mat('metal', p.metal),
		0.025,
		0.006,
		0.025,
		0,
		h * 0.78,
		-d / 2 + 0.002,
		1,
		12
	).rotation.x = Math.PI / 2;
	ball(g, lit, 0.008, 0.008, 0.008, w * 0.3, h * 0.68, -d / 2 + 0.001, false);
	box(g, mat('glass', '#7a8a99'), 0.002, h * 0.7, d * 0.65, w / 2 - 0.001, h * 0.15, 0.02);
	return g;
};

const printer: Build = (w, d, h, p) => {
	const g = new Group();
	const body = mat('plastic', p.main);
	const dark = mat('plastic', accent(p.main, 0.35));
	const paper = mat('matte', '#fbfaf6');
	const lowerH = h * 0.58;
	box(g, body, w, lowerH, d, 0, 0, 0);
	box(g, body, w * 0.96, h * 0.3, d * 0.9, 0, lowerH, d * 0.03);
	box(
		g,
		mat('screen', SCREEN),
		w * 0.96 - 0.01,
		0.002,
		d * 0.9 - 0.02,
		0,
		lowerH + h * 0.3 - 0.002,
		d * 0.03
	);
	box(g, dark, w * 0.72, lowerH * 0.2, 0.01, 0, lowerH * 0.52, -d / 2 + 0.005);
	box(g, paper, w * 0.62, 0.004, d * 0.28, 0, lowerH * 0.52, -d / 2 + d * 0.14);
	box(g, dark, w * 0.3, h * 0.1, d * 0.2, -w * 0.3, lowerH + h * 0.3, -d * 0.2);
	box(
		g,
		mat('screen', SCREEN),
		w * 0.14,
		0.003,
		d * 0.1,
		-w * 0.3,
		lowerH + h * 0.3 + h * 0.1 - 0.001,
		-d * 0.2
	);
	box(g, paper, w * 0.62, h * 0.12, 0.004, 0, lowerH + h * 0.3 - 0.001, d / 2 - 0.1);
	return g;
};

const smallDevice: Build = (w, d, h, p) => {
	const g = new Group();
	const body = mat('plastic', p.main);
	const inset = mat('plastic', accent(p.main, 0.1));
	const edge = Math.min(0.01, h * 0.3);
	box(g, body, w, h - 0.001, d, 0, 0, 0);
	box(g, inset, w - edge * 2, 0.001, d - edge * 2, 0, h - 0.001, 0);
	box(
		g,
		mat('light', '#5fd48a'),
		Math.min(0.012, w * 0.06),
		Math.min(0.006, h * 0.3),
		0.002,
		w * 0.3,
		h * 0.4,
		-d / 2 + 0.001
	);
	if (h >= 0.05) {
		box(g, mat('matte', '#16181b'), w * 0.5, h * 0.12, 0.002, -w * 0.1, h * 0.4, -d / 2 + 0.001);
	}
	return g;
};

const speaker: Build = (w, d, h, p) => {
	const g = new Group();
	const body = mat('plastic', p.main);
	const grille = mat('fabric', accent(p.main, 0.4));
	const driver = mat('plastic', '#101214');
	const ring = mat('metal', p.metal);
	const lip = 0.008;
	const soundbar = w > h * 3 && w > d * 3;
	box(g, body, w, h, d - lip, 0, 0, lip / 2);
	if (soundbar) {
		box(g, grille, w - 0.03, h - 0.02, lip, 0, 0.01, -d / 2 + lip / 2);
		box(g, mat('light', '#8fd1ff'), 0.012, 0.004, 0.002, w / 2 - 0.03, h - 0.014, -d / 2 + 0.001);
		return g;
	}
	const tower = h > w * 2.2;
	const woofer = Math.min(w, h) * 0.6;
	const tweeter = woofer * 0.4;
	const woofers = tower ? [h * 0.28, h * 0.52] : [h * 0.34];
	for (const y of woofers) {
		disc(g, ring, woofer, woofer, lip, 0, y, -d / 2 + lip / 2 + 0.002, 1, 20);
		disc(g, driver, woofer * 0.82, woofer * 0.82, lip, 0, y, -d / 2 + lip / 2, 1, 20);
	}
	const topY = tower ? h * 0.82 : h * 0.78;
	disc(g, ring, tweeter, tweeter, lip, 0, topY, -d / 2 + lip / 2 + 0.002, 1, 16);
	disc(g, driver, tweeter * 0.7, tweeter * 0.7, lip, 0, topY, -d / 2 + lip / 2, 1, 16);
	return g;
};

const monitorArm: Build = (w, d, h, p) => {
	const g = new Group();
	const metal = mat('metal', p.main);
	const dark = mat('plastic', accent(p.main, 0.2));
	const poleZ = d / 2 - 0.035;
	const clampTop = Math.min(0.07, h * 0.15);
	box(g, metal, w, 0.012, 0.07, 0, 0, poleZ);
	box(g, metal, w, 0.012, 0.07, 0, clampTop - 0.012, poleZ);
	box(g, metal, w * 0.3, clampTop, 0.014, 0, 0, d / 2 - 0.014 / 2 - 0.01);
	cyl(g, metal, 0.032, h - clampTop, 0.032, 0, clampTop, poleZ, 1, 8);
	const armY = h * 0.78;
	box(g, dark, 0.04, 0.03, poleZ + d / 2 - 0.05, 0, armY, (poleZ + -d / 2 + 0.05) / 2);
	cyl(g, metal, 0.05, 0.035, 0.05, 0, armY - 0.004, poleZ, 1, 8);
	const plate = Math.min(w, h - armY + 0.05);
	box(g, dark, w, plate, 0.01, 0, Math.min(armY - 0.02, h - plate), -d / 2 + 0.005);
	box(g, dark, 0.03, 0.03, 0.03, 0, armY, -d / 2 + 0.025);
	return g;
};

const powerStrip: Build = (w, d, h, p) => {
	const g = new Group();
	const body = mat('plastic', p.main);
	const socket = mat('matte', accent(p.main, 0.45));
	box(g, body, w, h - 0.001, d, 0, 0, 0);
	const sockets = Math.max(2, Math.round((w - 0.05) / 0.06));
	const pitch = (w - 0.07) / sockets;
	const size = Math.min(pitch * 0.7, d * 0.8, 0.04);
	for (const x of split(w - 0.07, sockets)) {
		box(g, socket, size, 0.001, Math.min(d * 0.7, 0.035), x - 0.02, h - 0.001, 0);
	}
	box(g, mat('light', '#ff8a3d'), 0.012, 0.001, 0.012, w / 2 - 0.02, h - 0.001, 0);
	return g;
};

export const devices = { monitor, tv, pc, printer, smallDevice, speaker, monitorArm, powerStrip };
