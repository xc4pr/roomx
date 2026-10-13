import { Group, type Mesh } from 'three';
import { ball, box, cyl, lathe, luminance, mat, type Palette } from './kit.ts';

type Build = (w: number, d: number, h: number, p: Palette) => Group;

const BULB = '#ffe7b0';
const SHADE = '#efe6d2';

function markLight(mesh: Mesh): void {
	mesh.userData.light = true;
	mesh.castShadow = false;
}

function tones(p: Palette): { stand: string; shade: string } {
	const bright = luminance(p.main) > 0.6;
	return { stand: bright ? '#8a8d90' : p.main, shade: bright ? p.main : SHADE };
}

const floorLamp: Build = (w, d, h, p) => {
	const g = new Group();
	const { stand, shade } = tones(p);
	const metal = mat('metal', stand);
	const shadeH = Math.min(h * 0.22, w * 1.0);
	cyl(g, metal, w * 0.62, 0.025, d * 0.62, 0, 0, 0, 1, 24);
	cyl(g, metal, 0.022, h - shadeH, 0.022, 0, 0.025, 0, 1, 8);
	const lampShade = cyl(g, mat('shade', shade), w, shadeH, d, 0, h - shadeH, 0, 0.72, 24);
	lampShade.material = [mat('shade', shade), mat('shade', shade), mat('shade', '#fff4d8')];
	markLight(ball(g, mat('light', BULB), 0.07, 0.09, 0.07, 0, h - shadeH * 0.7, 0, false));
	return g;
};

const tableLamp: Build = (w, d, h, p) => {
	const g = new Group();
	const { stand, shade } = tones(p);
	const baseH = h * 0.42;
	const shadeH = h * 0.4;
	const body = mat('ceramic', stand);
	cyl(g, body, w * 0.5, baseH * 0.2, d * 0.5, 0, 0, 0, 0.6, 20);
	ball(g, body, w * 0.46, baseH * 0.9, d * 0.46, 0, baseH * 0.1, 0, false);
	cyl(g, mat('metal', '#8a8d90'), 0.016, h - baseH - shadeH + 0.04, 0.016, 0, baseH, 0, 1, 8);
	const lampShade = cyl(g, mat('shade', shade), w, shadeH, d, 0, h - shadeH, 0, 0.7, 24);
	lampShade.material = [mat('shade', shade), mat('shade', shade), mat('shade', '#fff4d8')];
	markLight(ball(g, mat('light', BULB), 0.055, 0.07, 0.055, 0, h - shadeH * 0.75, 0, false));
	return g;
};

const DOME: readonly (readonly [number, number])[] = [
	[1, 0],
	[0.99, 0.12],
	[0.94, 0.3],
	[0.83, 0.5],
	[0.65, 0.7],
	[0.4, 0.88],
	[0.12, 1]
];

const pendantLamp: Build = (w, d, h, p) => {
	const g = new Group();
	const { stand, shade } = tones(p);
	const shadeH = Math.min(w * 0.55, h * 0.72);
	lathe(g, mat('shade', shade), 'dome', DOME, w, shadeH, d, 0, 0, 0);
	markLight(ball(g, mat('light', BULB), w * 0.22, w * 0.26, d * 0.22, 0, shadeH * 0.18, 0, false));
	cyl(g, mat('metal', stand), 0.008, h - shadeH - 0.02, 0.008, 0, shadeH, 0, 1, 6);
	cyl(g, mat('metal', stand), 0.07, 0.02, 0.07, 0, h - 0.02, 0, 1, 16);
	return g;
};

const wallLamp: Build = (w, d, h, p) => {
	const g = new Group();
	const { stand, shade } = tones(p);
	const metal = mat('metal', stand);
	const shadeD = Math.min(w, d - 0.03);
	const shadeH = h * 0.5;
	box(g, metal, w, h * 0.55, 0.012, 0, 0, d / 2 - 0.006);
	const armY = h * 0.38;
	const zPlate = d / 2 - 0.012;
	const zShade = -d / 2 + shadeD / 2;
	box(g, metal, 0.02, 0.02, zPlate - zShade, 0, armY, (zPlate + zShade) / 2);
	const lampShade = cyl(
		g,
		mat('shade', shade),
		shadeD,
		shadeH,
		shadeD,
		0,
		h - shadeH,
		-d / 2 + shadeD / 2,
		0.7,
		20
	);
	lampShade.rotation.x = Math.PI;
	markLight(
		ball(
			g,
			mat('light', BULB),
			shadeD * 0.3,
			shadeD * 0.3,
			shadeD * 0.3,
			0,
			h - shadeH * 0.8,
			-d / 2 + shadeD / 2,
			false
		)
	);
	return g;
};

const ledStrip: Build = (w, d, h, p) => {
	const g = new Group();
	box(g, mat('plastic', p.main), w, h * 0.5, d, 0, 0, 0);
	markLight(box(g, mat('light', '#ffd9a0'), w, h * 0.5, d * 0.8, 0, h * 0.5, 0));
	return g;
};

export const lighting = { floorLamp, tableLamp, pendantLamp, wallLamp, ledStrip };
