import { box, cyl, disc, mat, shade } from './kit.ts';
import { fillPocket } from './fill.ts';
import {
	bands,
	BOARD,
	compartments,
	FRONT_T,
	GAP,
	type Plan,
	type Row,
	type Section
} from './plan.ts';

interface Cell {
	row: Row;
	index: number;
	col: number;
	cx: number;
	colW: number;
	y: number;
	h: number;
	rows: number;
}

const SLIDE_T = 0.012;
const SLIDE_OVERLAP = 0.03;

function patch(
	c: Plan,
	material: typeof c.dark,
	w: number,
	h: number,
	x: number,
	yCentre: number,
	z: number
): void {
	box(c.g, material, w, h, 0.002, x, yCentre - h / 2, z);
}

function panel(c: Plan, cx: number, y: number, wd: number, ht: number): void {
	const z = c.fz;
	const border = Math.min(0.045, wd * 0.2, ht * 0.3);
	if (!c.raised || border < 0.02) {
		box(c.g, c.fronts, wd, ht, FRONT_T, cx, y, z + FRONT_T / 2);
		return;
	}
	const fill = mat('wood', shade(c.p.light, -0.06));
	box(
		c.g,
		fill,
		wd - 2 * border + 0.004,
		ht - 2 * border + 0.004,
		0.01,
		cx,
		y + border - 0.002,
		z + 0.013
	);
	box(c.g, c.fronts, wd, border, FRONT_T, cx, y, z + FRONT_T / 2);
	box(c.g, c.fronts, wd, border, FRONT_T, cx, y + ht - border, z + FRONT_T / 2);
	for (const sx of [-1, 1]) {
		const x = cx + sx * (wd / 2 - border / 2);
		box(c.g, c.fronts, border, ht - 2 * border, FRONT_T, x, y + border, z + FRONT_T / 2);
	}
}

function handle(c: Plan, k: Cell, asDoor: boolean): void {
	const wd = k.colW - GAP;
	const top = k.y + k.h - GAP / 2;
	if (c.handle === 'none') return;
	if (c.handle === 'recessTop') {
		patch(c, c.dark, Math.max(0.04, wd - 0.04), 0.02, k.cx, top - 0.016, c.fz);
		return;
	}
	if (c.handle === 'hole') {
		const z = c.fz + (c.raised ? 0.008 : 0);
		disc(c.g, c.dark, 0.07, 0.022, 0.002, k.cx, top - Math.min(0.055, k.h * 0.25), z, 1, 14);
		return;
	}
	let hx = k.cx;
	let hy = k.y + k.h * (k.row.kind === 'flap' ? 5 / 6 : 0.62);
	let barW = Math.min(0.14, k.colW * 0.4);
	let barH = 0.012;
	if (asDoor) {
		const side = k.col + 0.5 < k.row.cols / 2 ? 1 : -1;
		hx = k.cx + side * (k.colW / 2 - 0.035);
		barW = 0.012;
		barH = Math.min(0.14, k.h * 0.3);
		hy = k.y + k.h * 0.5;
	}
	if (c.handle === 'knob') {
		cyl(c.g, c.handles, 0.03, c.lip, 0.03, hx, hy - c.lip / 2, c.fz - c.lip / 2, 1, 12).rotation.x =
			Math.PI / 2;
	} else {
		box(c.g, c.handles, barW, barH, c.lip, hx, hy - barH / 2, c.fz - c.lip / 2);
	}
}

function glass(c: Plan, k: Cell): void {
	const wd = k.colW - GAP;
	const ht = k.h - GAP;
	const y = k.y + GAP / 2;
	const rail = 0.03;
	const z = c.fz + FRONT_T / 2;
	for (const sx of [-1, 1]) {
		box(c.g, c.fronts, rail, ht, FRONT_T, k.cx + sx * (wd / 2 - rail / 2), y, z);
	}
	box(c.g, c.fronts, wd - 2 * rail, rail, FRONT_T, k.cx, y, z);
	box(c.g, c.fronts, wd - 2 * rail, rail, FRONT_T, k.cx, y + ht - rail, z);
	const pane = mat('frost', '#dde6ea');
	box(c.g, pane, wd - 2 * rail + 0.006, ht - 2 * rail + 0.006, 0.004, k.cx, y + rail - 0.003, z);
	handle(c, k, true);
}

function slide(c: Plan, k: Cell): void {
	const layer = k.col % 2;
	const z = c.fz + SLIDE_T * layer;
	const left = k.cx - k.colW / 2 - (k.col > 0 ? SLIDE_OVERLAP / 2 : 0);
	const right = k.cx + k.colW / 2 + (k.col < k.row.cols - 1 ? SLIDE_OVERLAP / 2 : 0);
	box(
		c.g,
		c.fronts,
		right - left,
		k.h - GAP,
		SLIDE_T,
		(left + right) / 2,
		k.y + GAP / 2,
		z + SLIDE_T / 2
	);
	const side = k.col + 0.5 < k.row.cols / 2 ? 1 : -1;
	const stripH = Math.min(0.5, k.h * 0.4);
	patch(c, c.handles, 0.014, stripH, k.cx + side * (k.colW / 2 - 0.05), k.y + k.h / 2, z);
}

function open(c: Plan, k: Cell): void {
	const n = compartments(k.row, k.h);
	const gap = k.h / n - BOARD;
	for (let i = 0; i < n; i++) {
		fillPocket(c, {
			left: k.cx - k.colW / 2 + (k.col > 0 ? BOARD / 2 : 0),
			right: k.cx + k.colW / 2 - (k.col < k.row.cols - 1 ? BOARD / 2 : 0),
			y: k.y + (k.h * i) / n + BOARD / 2,
			gap,
			col: k.col,
			level: k.rows - 1 - k.index
		});
	}
}

function cell(c: Plan, k: Cell): void {
	switch (k.row.kind) {
		case 'open':
			open(c, k);
			break;
		case 'slide':
			slide(c, k);
			break;
		case 'glass':
			glass(c, k);
			break;
		default:
			panel(c, k.cx, k.y + GAP / 2, k.colW - GAP, k.h - GAP);
			handle(c, k, k.row.kind === 'door');
	}
}

function section(c: Plan, s: Section): void {
	for (const { row, index, y, h } of bands(c, s.rows)) {
		const colW = s.w / row.cols;
		for (let col = 0; col < row.cols; col++) {
			cell(c, {
				row,
				index,
				col,
				cx: s.x - s.w / 2 + colW * (col + 0.5),
				colW,
				y,
				h,
				rows: s.rows.length
			});
		}
	}
}

export function fronts(c: Plan): void {
	for (const s of c.sections) section(c, s);
}
