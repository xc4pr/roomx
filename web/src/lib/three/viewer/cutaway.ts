import { pointInPolygon, pointOnSegmentDistance, type Vec } from '#lib/core/geometry.ts';

export interface CutawayWall {
	key: string;
	center: { x: number; z: number };
	outward: { x: number; z: number };
	half?: number;
	height?: number;
}

export interface SightPoint {
	x: number;
	y?: number;
	z: number;
}

function blocksSight(wall: CutawayWall, from: SightPoint, to: SightPoint): boolean {
	if (wall.half === undefined) return false;
	const tangent = { x: -wall.outward.z, z: wall.outward.x };
	const a = {
		x: wall.center.x - tangent.x * wall.half,
		z: wall.center.z - tangent.z * wall.half
	};
	const dx = to.x - from.x;
	const dz = to.z - from.z;
	const ex = tangent.x * 2 * wall.half;
	const ez = tangent.z * 2 * wall.half;
	const denominator = dx * ez - dz * ex;
	if (Math.abs(denominator) < 1e-9) return false;
	const s = ((a.x - from.x) * ez - (a.z - from.z) * ex) / denominator;
	const u = ((a.x - from.x) * dz - (a.z - from.z) * dx) / denominator;
	if (s < 0 || s > 1 || u < 0 || u > 1) return false;
	const height = (from.y ?? 0) + ((to.y ?? 0) - (from.y ?? 0)) * s;
	return height <= (wall.height ?? Infinity);
}

export interface FloorShape {
	x: number;
	z: number;
}

const WALL_PROBES = [0.1, 0.3, 0.5, 0.7, 0.9];
const FLOOR_STEPS = [0.4, 0.7, 1];
const MIN_HIDING_PROBES = 2;

// True when the wall, seen from the camera, stands in front of floor area of a room.
function hidesFloor(
	wall: CutawayWall,
	camera: SightPoint,
	floors: readonly (readonly FloorShape[])[]
): boolean {
	if (wall.half === undefined) return true;
	const cameraHeight = camera.y ?? 0;
	const top = wall.height ?? 2.5;
	if (cameraHeight <= top + 0.01) return true;
	const tangent = { x: -wall.outward.z, z: wall.outward.x };
	const scale = cameraHeight / (cameraHeight - top);
	const polygons = floors.map((floor) => floor.map((point) => ({ x: point.x, y: point.z })));
	let hiding = 0;
	for (const probe of WALL_PROBES) {
		const along = (probe * 2 - 1) * wall.half;
		const base = { x: wall.center.x + tangent.x * along, z: wall.center.z + tangent.z * along };
		const ground = {
			x: camera.x + (base.x - camera.x) * scale,
			z: camera.z + (base.z - camera.z) * scale
		};
		for (const step of FLOOR_STEPS) {
			const point = {
				x: base.x + (ground.x - base.x) * step,
				y: base.z + (ground.z - base.z) * step
			};
			if (polygons.some((polygon) => pointInPolygon(point, polygon))) {
				hiding++;
				break;
			}
		}
	}
	return hiding >= MIN_HIDING_PROBES;
}

// A wall is lowered when the camera stands on its outer side and the wall hides floor of a room (without floors: always),
// or when the line of sight to the target or to any floor sample crosses it below its top.
export function loweredWalls(
	walls: readonly CutawayWall[],
	camera: SightPoint,
	margin = 0.05,
	target?: SightPoint,
	samples: readonly SightPoint[] = [],
	floors?: readonly (readonly FloorShape[])[]
): Set<string> {
	const lowered = new Set<string>();
	for (const wall of walls) {
		const side =
			(camera.x - wall.center.x) * wall.outward.x + (camera.z - wall.center.z) * wall.outward.z;
		if (
			(side > margin && (!floors || hidesFloor(wall, camera, floors))) ||
			(target && blocksSight(wall, camera, target)) ||
			samples.some((sample) => blocksSight(wall, camera, sample))
		) {
			lowered.add(wall.key);
		}
	}
	return lowered;
}

const SAMPLE_HEIGHT = 0.35;
const SAMPLE_INSET = 300;
const SAMPLE_BUDGET = 48;

// Points on the floor inside a polygon (room mm), kept away from the walls, to test what the camera can see.
export function floorSamples(
	polygon: readonly Vec[],
	toWorld: (point: Vec) => { x: number; z: number }
): SightPoint[] {
	if (polygon.length < 3) return [];
	const xs = polygon.map((point) => point.x);
	const ys = polygon.map((point) => point.y);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const width = Math.max(...xs) - minX;
	const height = Math.max(...ys) - minY;
	const step = Math.max(500, Math.sqrt((width * height) / SAMPLE_BUDGET));
	const points: SightPoint[] = [];
	for (let x = minX + step / 2; x < minX + width; x += step) {
		for (let y = minY + step / 2; y < minY + height; y += step) {
			const point = { x, y };
			if (!pointInPolygon(point, polygon)) continue;
			let clear = true;
			for (let i = 0; i < polygon.length && clear; i++) {
				clear =
					pointOnSegmentDistance(point, polygon[i], polygon[(i + 1) % polygon.length]) >=
					SAMPLE_INSET;
			}
			if (!clear) continue;
			const world = toWorld(point);
			points.push({ x: world.x, y: SAMPLE_HEIGHT, z: world.z });
		}
	}
	return points;
}
