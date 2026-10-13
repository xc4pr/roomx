import { Box3, OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
	applyOrtho,
	boxCorners,
	farHalfPlane,
	fitOrtho,
	isoDirection,
	isoFitPoints,
	ISO_YAWS,
	TOP_VIEW
} from './camera.ts';

const room = new Box3(new Vector3(0, 0, -5), new Vector3(4, 2.5, 0));

function ndc(points: Vector3[], camera: OrthographicCamera): Vector3[] {
	return points.map((point) => point.clone().project(camera));
}

describe('fitOrtho', () => {
	it('frames the room from above with plan orientation', () => {
		const fit = fitOrtho(boxCorners(room), TOP_VIEW, 1, 0);
		expect(fit.up.z).toBeCloseTo(-1, 6);
		const camera = new OrthographicCamera();
		applyOrtho(camera, fit);
		const projected = ndc(boxCorners(room), camera);
		for (const p of projected) {
			expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-6);
			expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-6);
			expect(p.z).toBeGreaterThan(-1);
			expect(p.z).toBeLessThan(1);
		}
		const south = new Vector3(0, 0, 0).project(camera);
		const north = new Vector3(0, 0, -5).project(camera);
		expect(north.y).toBeGreaterThan(south.y);
		const west = new Vector3(0, 0, -2).project(camera);
		const east = new Vector3(4, 0, -2).project(camera);
		expect(east.x).toBeGreaterThan(west.x);
	});

	it('keeps a margin and honours the aspect ratio', () => {
		const fit = fitOrtho(boxCorners(room), isoDirection(45), 4 / 3, 0.1);
		expect((fit.right - fit.left) / (fit.top - fit.bottom)).toBeCloseTo(4 / 3, 6);
		const camera = new OrthographicCamera();
		applyOrtho(camera, fit);
		const projected = ndc(boxCorners(room), camera);
		const extent = Math.max(...projected.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
		expect(extent).toBeLessThan(1);
		expect(extent).toBeGreaterThan(0.85);
		for (const p of projected) {
			expect(p.z).toBeGreaterThan(-1);
			expect(p.z).toBeLessThan(1);
		}
	});

	it('fills a square frame for an elongated box', () => {
		const long = new Box3(new Vector3(-3, 0, -0.1), new Vector3(3, 0.1, 0.1));
		const camera = new OrthographicCamera();
		applyOrtho(camera, fitOrtho(boxCorners(long), isoDirection(135), 1, 0));
		const projected = ndc(boxCorners(long), camera);
		expect(Math.max(...projected.map((p) => Math.abs(p.x)))).toBeCloseTo(1, 6);
	});

	it('survives an empty point list', () => {
		const fit = fitOrtho([], isoDirection(45), 1);
		expect(Number.isFinite(fit.left)).toBe(true);
		expect(fit.right).toBeGreaterThan(fit.left);
	});
});

describe('isometric views', () => {
	it('uses four distinct diagonals above the floor', () => {
		const seen = new Set(
			ISO_YAWS.map((yaw) =>
				isoDirection(yaw)
					.toArray()
					.map((v) => v.toFixed(3))
					.join()
			)
		);
		expect(seen.size).toBe(4);
		for (const yaw of ISO_YAWS) {
			const direction = isoDirection(yaw);
			expect(direction.length()).toBeCloseTo(1, 6);
			expect(direction.y).toBeGreaterThan(0.5);
			expect(Math.abs(direction.x)).toBeCloseTo(Math.abs(direction.z), 6);
		}
	});

	it('keeps the far half of the room and drops the near half', () => {
		const centre = room.getCenter(new Vector3());
		for (const yaw of ISO_YAWS) {
			const toCamera = isoDirection(yaw);
			const plane = farHalfPlane(toCamera, centre);
			const near = centre.clone().add(new Vector3(toCamera.x, 0, toCamera.z).multiplyScalar(2));
			const far = centre.clone().sub(new Vector3(toCamera.x, 0, toCamera.z).multiplyScalar(2));
			expect(plane.distanceToPoint(near)).toBeLessThan(0);
			expect(plane.distanceToPoint(far)).toBeGreaterThan(0);
			expect(plane.distanceToPoint(centre)).toBeCloseTo(0, 6);
		}
	});

	it('lowers only near corners when fitting', () => {
		const toCamera = isoDirection(45);
		const points = isoFitPoints(room, toCamera, 0.3);
		const centre = room.getCenter(new Vector3());
		for (const point of points) {
			const near = toCamera.x * (point.x - centre.x) + toCamera.z * (point.z - centre.z) > 0;
			if (near) expect(point.y).toBeLessThanOrEqual(0.3);
		}
		expect(points.some((point) => point.y === room.max.y)).toBe(true);
	});
});
