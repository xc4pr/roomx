import { Matrix4 } from 'three';
import { freeElementTop } from '#lib/core/elements.ts';
import { ceilingHeightAt } from '#lib/core/geometry.ts';
import type { FreeElement, Room } from '#lib/core/schema.ts';
import { degToRad, MM } from '../coords.ts';
import { drawOf, type Draw } from './draw.ts';
import { PALETTE, type MaterialSpec } from './materials.ts';
import { tinted, type Parts } from './parts.ts';

const BENCH_MIN_WIDTH = 1.6;
const BENCH_WIDTH = 0.6;
const BENCH_HEIGHT = 0.45;
const TILE_ROW = 0.2;
const TILE_INSET = 0.004;
const MANTEL_DEPTH = 0.03;
const MANTEL_HEIGHT = 0.05;
// Doors, glass and grilles stand this far out of the front.
const RELIEF = 0.006;

interface Frame {
	a: number;
	b: number;
	depth: number;
	bottom: number;
	top: number;
}

function spec(color: string, status: FreeElement['status'], extra: Partial<MaterialSpec> = {}) {
	return tinted({ color, roughness: 0.8, ...extra }, status);
}

function cuboid(draw: Draw, material: MaterialSpec, frame: Frame): void {
	draw.box(material, [frame.a, frame.bottom, -frame.depth], [frame.b, frame.top, 0]);
}

// Details touch the body instead of lying in its faces: faces in one plane flicker (z-fighting).
// The fire chamber is a recess with a dark back, the mantel stands out of the front.
function fireplace(draw: Draw, element: FreeElement, frame: Frame): void {
	const stone = spec(PALETTE.brick, element.status, { roughness: 0.95 });
	const dark = spec(PALETTE.stoveBlack, element.status, { roughness: 0.9 });
	const width = frame.b - frame.a;
	const height = frame.top - frame.bottom;
	if (frame.depth < 0.1 || height < 0.3) {
		cuboid(draw, stone, frame);
		return;
	}
	const front = -frame.depth + MANTEL_DEPTH;
	const left = frame.a + width * 0.2;
	const right = frame.b - width * 0.2;
	const hearth = frame.bottom + Math.min(0.12, height * 0.15);
	const lintel = Math.min(hearth + Math.min(0.62, height * 0.58), frame.top - MANTEL_HEIGHT);
	const back = front + Math.min(0.3, (frame.depth - MANTEL_DEPTH) * 0.6);
	draw.box(stone, [frame.a, frame.bottom, front], [left, frame.top, 0]);
	draw.box(stone, [right, frame.bottom, front], [frame.b, frame.top, 0]);
	draw.box(stone, [left, frame.bottom, front], [right, hearth, 0]);
	draw.box(stone, [left, lintel, front], [right, frame.top, 0]);
	draw.box(dark, [left, hearth, back], [right, lintel, 0]);
	draw.box(
		spec(PALETTE.obstacle, element.status),
		[frame.a + width * 0.17, lintel, -frame.depth],
		[frame.b - width * 0.17, lintel + MANTEL_HEIGHT, front]
	);
}

function stove(draw: Draw, element: FreeElement, room: Room, frame: Frame): void {
	const black = spec(PALETTE.stoveBlack, element.status, { roughness: 0.6, metalness: 0.3 });
	const glass = spec('#6f7378', element.status, { opacity: 0.45, roughness: 0.1 });
	const width = frame.b - frame.a;
	const mid = (frame.a + frame.b) / 2;
	const legs = Math.min(0.15, (frame.top - frame.bottom) * 0.15);
	for (const u of [frame.a + 0.03, frame.b - 0.03]) {
		for (const z of [-0.03, -frame.depth + 0.03]) {
			draw.box(
				black,
				[u - 0.02, frame.bottom, z - 0.02],
				[u + 0.02, frame.bottom + legs, z + 0.02]
			);
		}
	}
	const front = -frame.depth + 2 * RELIEF;
	draw.box(black, [frame.a, frame.bottom + legs, front], [frame.b, frame.top, 0]);
	draw.box(
		glass,
		[
			frame.a + width * 0.15,
			frame.bottom + legs + (frame.top - frame.bottom - legs) * 0.2,
			front - RELIEF
		],
		[frame.b - width * 0.15, frame.bottom + legs + (frame.top - frame.bottom - legs) * 0.7, front]
	);
	draw.box(
		spec(PALETTE.chrome, element.status, { metalness: 0.6, roughness: 0.3 }),
		[
			frame.b - width * 0.15 + 0.01,
			frame.bottom + legs + (frame.top - frame.bottom - legs) * 0.45,
			-frame.depth
		],
		[
			frame.b - width * 0.15 + 0.03,
			frame.bottom + legs + (frame.top - frame.bottom - legs) * 0.5,
			front
		]
	);
	const ceiling = ceilingHeightAt(room, { x: element.x, y: element.y }) * MM;
	const pipe = Math.max(0, ceiling - frame.top);
	if (pipe > 0.01) {
		draw.cylinder(black, [mid, frame.top + pipe / 2, -frame.depth / 2], 0.075, pipe, 'y', 12);
	}
}

function tiledStove(draw: Draw, element: FreeElement, frame: Frame): void {
	const tile = spec(PALETTE.tile, element.status, { roughness: 0.35 });
	const dark = spec(PALETTE.stoveBlack, element.status, { roughness: 0.6 });
	const wide = frame.b - frame.a >= BENCH_MIN_WIDTH;
	const start = wide ? frame.a + BENCH_WIDTH : frame.a;
	if (wide) {
		const bench = Math.min(BENCH_HEIGHT, frame.top - frame.bottom);
		const seat = Math.min(0.03, bench / 2);
		draw.box(tile, [frame.a, frame.bottom, -frame.depth], [start, frame.bottom + bench - seat, 0]);
		draw.box(
			spec('#8d6b4a', element.status),
			[frame.a, frame.bottom + bench - seat, -frame.depth],
			[start, frame.bottom + bench, 0]
		);
	}
	const front = -frame.depth + RELIEF;
	const rows = Math.max(1, Math.round((frame.top - frame.bottom) / TILE_ROW));
	const row = (frame.top - frame.bottom) / rows;
	for (let i = 0; i < rows; i++) {
		const inset = i % 2 === 0 ? 0 : TILE_INSET;
		draw.box(
			tile,
			[start + inset, frame.bottom + i * row, front + inset],
			[frame.b - inset, frame.bottom + (i + 1) * row, -inset]
		);
	}
	const width = frame.b - start;
	const door = Math.min(0.4, (frame.top - frame.bottom) * 0.3);
	draw.box(
		dark,
		[start + width * 0.3, frame.bottom + row, -frame.depth],
		[frame.b - width * 0.3, frame.bottom + row + door, front]
	);
}

function acFloor(draw: Draw, element: FreeElement, frame: Frame): void {
	const white = spec(PALETTE.radiator, element.status, { roughness: 0.5 });
	const dark = spec(PALETTE.appliance, element.status, { roughness: 0.5 });
	const front = -frame.depth + RELIEF;
	draw.box(white, [frame.a, frame.bottom, front], [frame.b, frame.top, 0]);
	const width = frame.b - frame.a;
	const height = frame.top - frame.bottom;
	draw.box(
		dark,
		[frame.a + width * 0.1, frame.top - height * 0.2, -frame.depth],
		[frame.b - width * 0.1, frame.top - height * 0.08, front]
	);
	for (let i = 0; i < 4; i++) {
		const y = frame.bottom + height * (0.1 + i * 0.1);
		draw.box(
			dark,
			[frame.a + width * 0.15, y, -frame.depth],
			[frame.b - width * 0.15, y + height * 0.02, front]
		);
	}
}

export function addFreeElement(parts: Parts, room: Room, element: FreeElement): void {
	const width = element.width * MM;
	const depth = element.depth * MM;
	const top = freeElementTop(room, element) * MM;
	const frame: Frame = { a: 0, b: width, depth, bottom: element.elevation * MM, top };
	const placement = new Matrix4()
		.makeTranslation(element.x * MM, 0, -element.y * MM)
		.multiply(new Matrix4().makeRotationY(degToRad(element.rotation)))
		.multiply(new Matrix4().makeTranslation(-width / 2, 0, depth / 2));
	const draw = drawOf(parts, placement);
	switch (element.kind) {
		case 'column':
			if (element.shape === 'square') {
				cuboid(draw, spec(PALETTE.obstacle, element.status), frame);
			} else {
				const round = new Matrix4()
					.makeTranslation(element.x * MM, 0, -element.y * MM)
					.multiply(new Matrix4().makeRotationY(degToRad(element.rotation)))
					.multiply(new Matrix4().makeScale(1, 1, element.depth / element.width));
				drawOf(parts, round).cylinder(
					spec(PALETTE.obstacle, element.status),
					[0, (frame.bottom + top) / 2, 0],
					width / 2,
					top - frame.bottom,
					'y',
					16
				);
			}
			break;
		case 'freeObstacle':
			cuboid(draw, spec(PALETTE.obstacle, element.status), frame);
			break;
		case 'fireplace':
			fireplace(draw, element, frame);
			break;
		case 'stove':
			stove(draw, element, room, frame);
			break;
		case 'tiledStove':
			tiledStove(draw, element, frame);
			break;
		case 'acFloor':
			acFloor(draw, element, frame);
			break;
	}
}
