import { Box3, PerspectiveCamera, Vector3 } from 'three';

export interface CameraPose {
	position: Vector3;
	target: Vector3;
}

export const DOLLHOUSE_AZIMUTH = (35 * Math.PI) / 180;
export const DOLLHOUSE_POLAR = (52 * Math.PI) / 180;

const FIT_FILL = 0.92;
const FIT_HEIGHT = 1.4;
const ALTERNATIVE_PENALTY = 1.18;

export function viewDirection(azimuth: number, polar: number): Vector3 {
	return new Vector3(
		Math.sin(polar) * Math.sin(azimuth),
		Math.cos(polar),
		Math.sin(polar) * Math.cos(azimuth)
	);
}

export function boxCorners(box: Box3, height: number): Vector3[] {
	const corners: Vector3[] = [];
	for (const x of [box.min.x, box.max.x]) {
		for (const z of [box.min.z, box.max.z]) {
			for (const y of [0, height]) corners.push(new Vector3(x, y, z));
		}
	}
	return corners;
}

function fits(
	camera: PerspectiveCamera,
	corners: readonly Vector3[],
	target: Vector3,
	direction: Vector3,
	distance: number
): boolean {
	camera.position.copy(direction).multiplyScalar(distance).add(target);
	camera.lookAt(target);
	camera.updateMatrixWorld(true);
	camera.updateProjectionMatrix();
	for (const corner of corners) {
		const local = corner.clone().applyMatrix4(camera.matrixWorldInverse);
		if (local.z > -0.05) return false;
		const ndc = corner.clone().project(camera);
		if (Math.abs(ndc.x) > FIT_FILL || Math.abs(ndc.y) > FIT_FILL) return false;
	}
	return true;
}

export interface FitShape {
	points: readonly Vector3[];
	center: Vector3;
	height: number;
}

export function shapeOfBox(box: Box3): FitShape {
	const area = box.isEmpty() ? new Box3(new Vector3(0, 0, -3), new Vector3(4, 2.5, 0)) : box;
	const height = Math.min(area.getSize(new Vector3()).y, FIT_HEIGHT);
	return { points: boxCorners(area, height), center: area.getCenter(new Vector3()), height };
}

// Footprint points (floor and fitting height) of rooms in world space; empty input falls back to a default box.
export function shapeOfFootprints(
	footprints: readonly (readonly { x: number; z: number }[])[],
	roomHeight: number
): FitShape {
	const height = Math.min(roomHeight, FIT_HEIGHT);
	const points: Vector3[] = [];
	const box = new Box3();
	for (const footprint of footprints) {
		for (const point of footprint) {
			points.push(new Vector3(point.x, 0, point.z), new Vector3(point.x, height, point.z));
			box.expandByPoint(new Vector3(point.x, 0, point.z));
		}
	}
	if (points.length === 0) return shapeOfBox(new Box3());
	return { points, center: box.getCenter(new Vector3()), height };
}

// Smallest distance along the viewing direction at which the shape is fully visible.
export function fitDistance(
	shape: FitShape,
	verticalFov: number,
	aspect: number,
	azimuth = DOLLHOUSE_AZIMUTH,
	polar = DOLLHOUSE_POLAR
): number {
	const camera = new PerspectiveCamera(verticalFov, Math.max(0.1, aspect), 0.05, 1000);
	const target = new Vector3(shape.center.x, shape.height * 0.35, shape.center.z);
	const corners = shape.points;
	const direction = viewDirection(azimuth, polar);
	let low = 0.3;
	let high = 800;
	if (!fits(camera, corners, target, direction, high)) return high;
	for (let i = 0; i < 32; i++) {
		const mid = (low + high) / 2;
		if (fits(camera, corners, target, direction, mid)) high = mid;
		else low = mid;
	}
	return high;
}

export function fitPose(
	shape: Box3 | FitShape,
	verticalFov: number,
	aspect: number,
	azimuth = DOLLHOUSE_AZIMUTH,
	polar = DOLLHOUSE_POLAR
): CameraPose {
	const resolved = shape instanceof Box3 ? shapeOfBox(shape) : shape;
	const target = new Vector3(resolved.center.x, resolved.height * 0.35, resolved.center.z);
	const distance = fitDistance(resolved, verticalFov, aspect, azimuth, polar);
	const position = viewDirection(azimuth, polar).multiplyScalar(distance).add(target);
	return { position, target };
}

// Tries the dollhouse view from several sides and keeps the one that fills the screen best.
export function bestFitPose(
	shape: Box3 | FitShape,
	verticalFov: number,
	aspect: number
): CameraPose {
	const resolved = shape instanceof Box3 ? shapeOfBox(shape) : shape;
	const base = DOLLHOUSE_AZIMUTH;
	const candidates = [base, base + Math.PI / 2, base - Math.PI / 2];
	let best = fitPose(resolved, verticalFov, aspect, base);
	let bestScore = best.position.distanceTo(best.target);
	for (const azimuth of candidates.slice(1)) {
		const pose = fitPose(resolved, verticalFov, aspect, azimuth);
		const score = pose.position.distanceTo(pose.target) * ALTERNATIVE_PENALTY;
		if (score < bestScore) {
			best = pose;
			bestScore = score;
		}
	}
	return best;
}
