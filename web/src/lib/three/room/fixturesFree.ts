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

function fireplace(draw: Draw, element: FreeElement, frame: Frame): void {
	const stone = spec(PALETTE.brick, element.status, { roughness: 0.95 });
	const dark = spec(PALETTE.stoveBlack, element.status, { roughness: 0.9 });
	const width = frame.b - frame.a;
	const height = frame.top - frame.bottom;
	cuboid(draw, stone, frame);
	const open = Math.min(0.62, height * 0.58);
	draw.box(
		dark,
		[frame.a + width * 0.2, frame.bottom + 0.12, -frame.depth],
		[frame.b - width * 0.2, frame.bottom + 0.12 + open, -frame.depth + 0.004]
	);
	draw.box(
		spec(PALETTE.obstacle, element.status),
		[frame.a + width * 0.17, frame.bottom + 0.12 + open, -frame.depth + 0.004],
		[frame.b - width * 0.17, frame.bottom + 0.12 + open + 0.05, -frame.depth + 0.004]
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
	draw.box(black, [frame.a, frame.bottom + legs, -frame.depth], [frame.b, frame.top, 0]);
	draw.box(
		glass,
		[
			frame.a + width * 0.15,
			frame.bottom + legs + (frame.top - frame.bottom - legs) * 0.2,
			-frame.depth
		],
		[
			frame.b - width * 0.15,
			frame.bottom + legs + (frame.top - frame.bottom - legs) * 0.7,
			-frame.depth + 0.003
		]
	);
	draw.box(
		spec(PALETTE.chrome, element.status, { metalness: 0.6, roughness: 0.3 }),
		[
			frame.b - width * 0.15 - 0.02,
			frame.bottom + legs + (frame.top - frame.bottom - legs) * 0.45,
			-frame.depth
		],
		[
			frame.b - width * 0.15,
			frame.bottom + legs + (frame.top - frame.bottom - legs) * 0.5,
			-frame.depth + 0.02
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
		draw.box(tile, [frame.a, frame.bottom, -frame.depth], [start, frame.bottom + bench, 0]);
		draw.box(
			spec('#8d6b4a', element.status),
			[frame.a, frame.bottom + bench - 0.03, -frame.depth],
			[start, frame.bottom + bench, 0]
		);
	}
	const rows = Math.max(1, Math.round((frame.top - frame.bottom) / TILE_ROW));
	const row = (frame.top - frame.bottom) / rows;
	for (let i = 0; i < rows; i++) {
		const inset = i % 2 === 0 ? 0 : TILE_INSET;
		draw.box(
			tile,
			[start + inset, frame.bottom + i * row, -frame.depth + inset],
			[frame.b - inset, frame.bottom + (i + 1) * row, -inset]
		);
	}
	const width = frame.b - start;
	const door = Math.min(0.4, (frame.top - frame.bottom) * 0.3);
	draw.box(
		dark,
		[start + width * 0.3, frame.bottom + row, -frame.depth],
		[frame.b - width * 0.3, frame.bottom + row + door, -frame.depth + 0.004]
	);
}

function acFloor(draw: Draw, element: FreeElement, frame: Frame): void {
	const white = spec(PALETTE.radiator, element.status, { roughness: 0.5 });
	const dark = spec(PALETTE.appliance, element.status, { roughness: 0.5 });
	cuboid(draw, white, frame);
	const width = frame.b - frame.a;
	const height = frame.top - frame.bottom;
	draw.box(
		dark,
		[frame.a + width * 0.1, frame.top - height * 0.2, -frame.depth],
		[frame.b - width * 0.1, frame.top - height * 0.08, -frame.depth + 0.004]
	);
	for (let i = 0; i < 4; i++) {
		const y = frame.bottom + height * (0.1 + i * 0.1);
		draw.box(
			dark,
			[frame.a + width * 0.15, y, -frame.depth],
			[frame.b - width * 0.15, y + height * 0.02, -frame.depth + 0.004]
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
