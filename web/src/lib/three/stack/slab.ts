import { BufferGeometry, ExtrudeGeometry, Group, Mesh, Path, Shape } from 'three';
import { floorRooms, roomFloorId } from '#lib/core/floors.ts';
import { distance, roomToBoard, type Vec } from '#lib/core/geometry.ts';
import { isOpenAir, type Project, type Room } from '#lib/core/schema.ts';
import { MM } from '../coords.ts';
import { wallFrames } from '../room/frames.ts';
import { PALETTE, type MaterialSet } from '../room/materials.ts';
import type { SceneContent } from '../types.ts';
import { holeToBoard, roomHoles } from './openings.ts';

const EDGE_TOLERANCE = 2;
// The slab stays this far (mm) below the upper floor and above the lower ceiling so that nothing flickers.
const SLAB_GAP = 3;

const SLAB_SPEC = { color: PALETTE.slab, roughness: 0.95 };

// A room on an upper storey stands on the slab of the storey below; open-air areas keep their own.
export function onSlab(project: Project, room: Room): boolean {
	if (isOpenAir(room)) return false;
	const floors = project.floors ?? [];
	const index = floors.findIndex((floor) => floor.id === roomFloorId(project, room));
	return index > 0 && floors[index - 1].slabThickness - 2 * SLAB_GAP > 0;
}

function sameVec(a: Vec, b: Vec): boolean {
	return distance(a, b) < EDGE_TOLERANCE;
}

// Outer boundary of a set of adjacent convex pieces: the edges that no other piece shares, chained
// into closed loops.
export function outlineLoops(pieces: readonly (readonly Vec[])[]): Vec[][] {
	interface Edge {
		from: Vec;
		to: Vec;
	}
	const all: Edge[] = pieces.flatMap((polygon) =>
		polygon.map((from, i) => ({ from, to: polygon[(i + 1) % polygon.length] }))
	);
	const free = all.filter(
		(edge, index) =>
			!all.some(
				(other, j) => j !== index && sameVec(edge.from, other.to) && sameVec(edge.to, other.from)
			)
	);
	const loops: Vec[][] = [];
	const used = new Set<Edge>();
	for (const start of free) {
		if (used.has(start)) continue;
		const loop: Vec[] = [start.from];
		let current = start;
		used.add(current);
		for (let guard = 0; guard < free.length; guard++) {
			const tip = current.to;
			if (sameVec(tip, start.from)) break;
			const next = free.find((edge) => !used.has(edge) && sameVec(edge.from, tip));
			if (!next) break;
			used.add(next);
			loop.push(next.from);
			current = next;
		}
		if (loop.length >= 3 && sameVec(current.to, start.from)) loops.push(simplify(loop));
	}
	return loops;
}

function simplify(loop: Vec[]): Vec[] {
	return loop.filter((point, i) => {
		const before = loop[(i + loop.length - 1) % loop.length];
		const after = loop[(i + 1) % loop.length];
		const cross =
			(point.x - before.x) * (after.y - point.y) - (point.y - before.y) * (after.x - point.x);
		return Math.abs(cross) > 1;
	});
}

function shapeOf(points: readonly Vec[]): Shape {
	const shape = new Shape();
	points.forEach((p, i) => {
		const x = p.x * MM;
		const y = p.y * MM;
		if (i === 0) shape.moveTo(x, y);
		else shape.lineTo(x, y);
	});
	shape.closePath();
	return shape;
}

// Plan points are board mm; rotating the flat shape about X maps its (x, y) to world (x, -y).
function slabGeometry(
	outline: readonly Vec[],
	holes: readonly (readonly Vec[])[],
	thickness: number
) {
	const shape = shapeOf(outline);
	for (const hole of holes) {
		const path = new Path();
		hole.forEach((p, i) => {
			if (i === 0) path.moveTo(p.x * MM, p.y * MM);
			else path.lineTo(p.x * MM, p.y * MM);
		});
		path.closePath();
		shape.holes.push(path);
	}
	const geometry: BufferGeometry = new ExtrudeGeometry(shape, {
		depth: thickness * MM,
		bevelEnabled: false
	});
	geometry.rotateX(-Math.PI / 2);
	return geometry;
}

export interface SlabInfo {
	floorId: string;
	roomId: string;
	holes: number;
}

// One plain slab under the rooms of every shown upper floor, cut open where a stair arrives.
export function buildSlabs(
	content: SceneContent,
	levels: ReadonlyMap<string, number>,
	materials: MaterialSet
): Group {
	const group = new Group();
	group.name = 'slabs';
	const project = content.project;
	const shown = new Set(content.roomIds);
	const material = materials.get(SLAB_SPEC);
	const floors = project.floors ?? [];
	floors.forEach((floor, index) => {
		if (index === 0) return;
		const level = levels.get(floor.id);
		const below = floors[index - 1];
		if (level === undefined || !below) return;
		const thickness = below.slabThickness - 2 * SLAB_GAP;
		if (thickness <= 0) return;
		for (const room of floorRooms(project, floor.id)) {
			if (!shown.has(room.id) || !onSlab(project, room)) continue;
			// Along the outer faces of the walls, like the base it replaces, also at sharp corners.
			const outline = wallFrames(room.polygon).map((frame) => roomToBoard(room, frame.outerStart));
			const holes = roomHoles(project, room).floor.map((hole) => holeToBoard(room, hole));
			const mesh = new Mesh(slabGeometry(outline, holes, thickness), material);
			mesh.position.y = (level - below.slabThickness + SLAB_GAP) * MM;
			mesh.name = `slab-${room.id}`;
			mesh.userData.part = 'slab';
			mesh.userData.slab = {
				floorId: floor.id,
				roomId: room.id,
				holes: holes.length
			} satisfies SlabInfo;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			group.add(mesh);
		}
	});
	return group;
}
