import { box, mat, shade } from './kit.ts';
import { bands, BOARD, compartments, type Plan } from './plan.ts';

function solid(c: Plan): void {
	const front = c.fz + (c.slide ? 0.026 : 0.012);
	const seam = mat('matte', shade(c.p.main, -0.3));
	box(c.g, c.body, c.cw, c.yT - c.lift, c.backZ - front, 0, c.lift, (c.backZ + front) / 2);
	if (c.plinthH > 0) {
		box(c.g, mat('matte', c.p.darkWood), c.w - 0.04, c.plinthH, c.d - 0.06, 0, 0, 0);
	}
	box(
		c.g,
		seam,
		c.cw - 0.006,
		c.yT - c.yB - 0.006,
		0.01,
		0,
		c.yB + 0.003,
		c.fz + (c.raised ? 0.0175 : 0.009)
	);
}

function ladder(c: Plan): void {
	const t = c.sideT;
	const height = c.yT - c.lift;
	const depth = c.backZ - c.fz;
	const rungs = Math.max(2, Math.round(height / 0.22));
	for (const sx of [-1, 1]) {
		const x = sx * (c.cw / 2 - t / 2);
		box(c.g, c.body, t, height, t, x, c.lift, c.fz + t / 2);
		box(c.g, c.body, t, height, t, x, c.lift, c.backZ - t / 2);
		for (let i = 0; i <= rungs; i++) {
			const y = c.lift + ((height - 0.02) * i) / rungs;
			box(c.g, c.body, t, 0.02, depth - 2 * t, x, y, (c.fz + c.backZ) / 2);
		}
	}
}

function hollow(c: Plan): void {
	const t = c.sideT;
	const height = c.yT - c.lift;
	const zc = (c.fz + c.backZ) / 2;
	if (c.ladder) {
		ladder(c);
	} else {
		for (const sx of [-1, 1]) {
			box(c.g, c.body, t, height, c.backZ - c.fz, sx * (c.cw / 2 - t / 2), c.lift, zc);
		}
		const back = mat('matte', shade(c.look.bodyColor ?? c.p.main, -0.1));
		box(c.g, back, c.span, height, 0.008, 0, c.lift, c.backZ - 0.004);
	}
	boards(c);
}

function boards(c: Plan): void {
	const depth = c.backZ - c.boardZ;
	const zc = (c.boardZ + c.backZ) / 2;
	const board = (y: number, x: number, w: number): void => {
		box(c.g, c.body, w, BOARD, depth, x, y - BOARD / 2, zc);
	};
	board(c.yB + BOARD / 2, 0, c.span);
	if (c.slabT === 0) board(c.yT - BOARD / 2, 0, c.span);
	for (const s of c.sections.slice(1)) {
		const x = s.x - s.w / 2;
		box(c.g, c.body, BOARD, c.yT - c.yB - BOARD, depth, x, c.yB + BOARD / 2, zc);
	}
	for (const s of c.sections) {
		for (const { row, y, h } of bands(c, s.rows)) {
			if (y > c.yB + 1e-6) board(y, s.x, s.w);
			const n = compartments(row, h);
			for (let k = 1; k < n; k++) board(y + (h * k) / n, s.x, s.w);
			if (row.kind !== 'open') continue;
			for (let i = 1; i < row.cols; i++) {
				const x = s.x - s.w / 2 + (s.w * i) / row.cols;
				box(c.g, c.body, BOARD, h - BOARD, depth, x, y + BOARD / 2, zc);
			}
		}
	}
}

function slab(c: Plan): void {
	if (c.slabT <= 0) return;
	const top = mat('wood', c.look.accentColor ?? c.p.main);
	box(c.g, top, c.w, c.slabT, c.d, 0, c.h - c.slabT, 0);
}

export function carcass(c: Plan): void {
	if (c.hollow) hollow(c);
	else solid(c);
	slab(c);
}
