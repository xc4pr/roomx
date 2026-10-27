import {
	BufferGeometry,
	ExtrudeGeometry,
	Float32BufferAttribute,
	Group,
	LineBasicMaterial,
	LineSegments,
	Matrix4,
	Mesh,
	Shape,
	Vector2
} from 'three';
import type { Vec } from '#lib/core/geometry.ts';
import type { RailingRun } from '#lib/core/outdoor.ts';
import type { Room } from '#lib/core/schema.ts';
import { MM } from '../coords.ts';
import { wallFrames } from './frames.ts';
import { MaterialSet, PALETTE, type MaterialSpec } from './materials.ts';
import { Parts } from './parts.ts';

const SLAB_DEPTH: Record<string, number> = { balcony: 0.14, terrace: 0.05, garden: 0.1 };
const COVER_THICKNESS = 0.06;
// The cover stays this far (mm) inside its outline: where it ends at the wall of the house next
// door, its edge would otherwise lie in the face of that wall.
const COVER_INSET = 2;
const GHOST_OPACITY = 0.3;
const PAVING_STEP = 600;
const JOINT_HEIGHT = 0.003;

function shapeOf(points: readonly Vec[]): Shape {
	return new Shape(points.map((point) => new Vector2(point.x * MM, point.y * MM)));
}

export function outdoorFloorColor(room: Pick<Room, 'type' | 'floorColor'>): string {
	if (room.floorColor) return room.floorColor;
	switch (room.type) {
		case 'balcony':
			return PALETTE.slab;
		case 'terrace':
			return PALETTE.paving;
		case 'garden':
			return PALETTE.lawn;
		default:
			return PALETTE.floor;
	}
}

// The slab below an open-air area: a plain edge, no walls.
export function buildSlab(room: Room, materials: MaterialSet): Mesh {
	const depth = SLAB_DEPTH[room.type] ?? 0.1;
	const geometry = new ExtrudeGeometry(shapeOf(room.polygon), { depth, bevelEnabled: false });
	geometry.rotateX(-Math.PI / 2);
	geometry.translate(0, -depth - 0.002, 0);
	const color = room.type === 'garden' ? PALETTE.soil : PALETTE.slabEdge;
	const slab = new Mesh(geometry, materials.get({ color, roughness: 0.95 }));
	slab.name = 'base';
	slab.receiveShadow = true;
	return slab;
}

function crossings(polygon: readonly Vec[], at: number, axis: 'x' | 'y'): number[] {
	const other = axis === 'x' ? 'y' : 'x';
	const result: number[] = [];
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		if (a[axis] === b[axis] || a[axis] <= at === b[axis] <= at) continue;
		const t = (at - a[axis]) / (b[axis] - a[axis]);
		result.push(a[other] + (b[other] - a[other]) * t);
	}
	return result.sort((x, y) => x - y);
}

// Paving joints of a terrace as thin lines on the floor, clipped to the outline.
export function buildPavingJoints(room: Room): LineSegments | undefined {
	const xs = room.polygon.map((p) => p.x);
	const ys = room.polygon.map((p) => p.y);
	const positions: number[] = [];
	const push = (x0: number, y0: number, x1: number, y1: number) => {
		positions.push(x0 * MM, JOINT_HEIGHT, -y0 * MM, x1 * MM, JOINT_HEIGHT, -y1 * MM);
	};
	const first = (min: number) => Math.ceil((min + 1) / PAVING_STEP) * PAVING_STEP;
	for (let x = first(Math.min(...xs)); x < Math.max(...xs); x += PAVING_STEP) {
		const hits = crossings(room.polygon, x, 'x');
		for (let i = 0; i + 1 < hits.length; i += 2) push(x, hits[i], x, hits[i + 1]);
	}
	for (let y = first(Math.min(...ys)); y < Math.max(...ys); y += PAVING_STEP) {
		const hits = crossings(room.polygon, y, 'y');
		for (let i = 0; i + 1 < hits.length; i += 2) push(hits[i], y, hits[i + 1], y);
	}
	if (positions.length === 0) return undefined;
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	const lines = new LineSegments(geometry, new LineBasicMaterial({ color: PALETTE.paveJoint }));
	lines.userData.part = 'paving';
	return lines;
}

const POST_SPACING = 1100;
// The railing ends in the wall of the house next door; pushed back in depth, the wall wins there.
const RAIL: MaterialSpec = { color: PALETTE.railing, roughness: 0.5, metalness: 0.4, push: true };
const PANE: MaterialSpec = {
	color: PALETTE.railingGlass,
	opacity: 0.3,
	roughness: 0.1,
	push: true
};

// Posts, handrail, base rail and a glass infill along the free edges.
export function buildRailing(
	room: Room,
	runs: readonly RailingRun[],
	materials: MaterialSet
): Group {
	const group = new Group();
	group.name = 'railing';
	const height = (room.railing?.height ?? 0) * MM;
	if (height <= 0 || runs.length === 0) return group;
	const frames = wallFrames(room.polygon);
	const parts = new Parts(materials);
	for (const run of runs) {
		const frame = frames[run.wall - 1];
		if (!frame || run.to <= run.from) continue;
		const placement = new Matrix4()
			.makeTranslation(frame.start.x * MM, 0, -frame.start.y * MM)
			.multiply(new Matrix4().makeRotationY(Math.atan2(frame.direction.y, frame.direction.x)));
		const a = run.from * MM;
		const b = run.to * MM;
		const count = Math.max(1, Math.ceil((b - a) / (POST_SPACING * MM)));
		for (let i = 0; i <= count; i++) {
			const u = a + ((b - a) * i) / count;
			parts.box(RAIL, [u - 0.02, 0, -0.07], [u + 0.02, height, -0.03], placement);
		}
		parts.box(RAIL, [a - 0.02, height - 0.04, -0.075], [b + 0.02, height, -0.025], placement);
		parts.box(RAIL, [a, 0.04, -0.06], [b, 0.08, -0.04], placement);
		parts.box(PANE, [a, 0.08, -0.054], [b, height - 0.04, -0.046], placement);
	}
	parts.attach(group, 'railing');
	return group;
}

export interface CoverModel {
	solid: Mesh;
	ghost: Mesh;
}

// A thin slab at cover.height above cover.polygon. Shown with the ceiling, as a faint ghost without it.
export function buildCover(room: Room, materials: MaterialSet): CoverModel | undefined {
	const cover = room.cover;
	if (!cover || cover.polygon.length < 3) return undefined;
	// Mirrored at its corner, the outer corner of a wall of COVER_INSET gives the inner corner.
	const outline = wallFrames(cover.polygon, COVER_INSET).map((frame) => ({
		x: 2 * frame.start.x - frame.outerStart.x,
		y: 2 * frame.start.y - frame.outerStart.y
	}));
	const geometry = new ExtrudeGeometry(shapeOf(outline), {
		depth: COVER_THICKNESS,
		bevelEnabled: false
	});
	geometry.rotateX(-Math.PI / 2);
	geometry.translate(0, cover.height * MM, 0);
	// Pushed back: a column up to the cover or a house wall as high as the cover ends in its plane.
	const solid = new Mesh(
		geometry,
		materials.get({ color: PALETTE.cover, roughness: 0.95, push: true })
	);
	solid.userData.part = 'slope';
	solid.castShadow = true;
	const ghost = new Mesh(
		geometry,
		materials.get({
			color: PALETTE.cover,
			roughness: 0.95,
			opacity: GHOST_OPACITY,
			side: 'double',
			push: true
		})
	);
	ghost.userData.part = 'slopeGhost';
	ghost.renderOrder = 1;
	return { solid, ghost };
}
