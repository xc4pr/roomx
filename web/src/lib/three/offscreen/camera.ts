import { Box3, OrthographicCamera, Plane, Vector3 } from 'three';

export interface OrthoFit {
	position: Vector3;
	target: Vector3;
	up: Vector3;
	left: number;
	right: number;
	top: number;
	bottom: number;
	near: number;
	far: number;
}

export const ISO_ELEVATION = 35.264;
export const ISO_YAWS = [45, 135, 225, 315] as const;
export const TOP_VIEW = new Vector3(0, 1, 0);

export function isoDirection(yawDegrees: number, elevationDegrees = ISO_ELEVATION): Vector3 {
	const yaw = (yawDegrees * Math.PI) / 180;
	const elevation = (elevationDegrees * Math.PI) / 180;
	return new Vector3(
		Math.sin(yaw) * Math.cos(elevation),
		Math.sin(elevation),
		Math.cos(yaw) * Math.cos(elevation)
	);
}

export function boxCorners(box: Box3): Vector3[] {
	const corners: Vector3[] = [];
	for (const x of [box.min.x, box.max.x]) {
		for (const y of [box.min.y, box.max.y]) {
			for (const z of [box.min.z, box.max.z]) corners.push(new Vector3(x, y, z));
		}
	}
	return corners;
}

function horizontal(direction: Vector3): Vector3 {
	const flat = new Vector3(direction.x, 0, direction.z);
	return flat.lengthSq() < 1e-9 ? new Vector3(0, 0, 1) : flat.normalize();
}

export function fitOrtho(
	points: readonly Vector3[],
	toCamera: Vector3,
	aspect: number,
	margin = 0.06
): OrthoFit {
	const back = toCamera.clone().normalize();
	const forward = back.clone().negate();
	const hint = Math.abs(forward.y) > 0.999 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
	const right = new Vector3().crossVectors(forward, hint).normalize();
	const up = new Vector3().crossVectors(right, forward).normalize();
	let minR = Infinity;
	let maxR = -Infinity;
	let minU = Infinity;
	let maxU = -Infinity;
	let minF = Infinity;
	let maxF = -Infinity;
	for (const point of points) {
		const r = point.dot(right);
		const u = point.dot(up);
		const f = point.dot(forward);
		minR = Math.min(minR, r);
		maxR = Math.max(maxR, r);
		minU = Math.min(minU, u);
		maxU = Math.max(maxU, u);
		minF = Math.min(minF, f);
		maxF = Math.max(maxF, f);
	}
	if (!Number.isFinite(minR)) {
		minR = minU = minF = -1;
		maxR = maxU = maxF = 1;
	}
	let halfW = Math.max((maxR - minR) / 2, 1e-4);
	let halfH = Math.max((maxU - minU) / 2, 1e-4);
	if (halfW / halfH < aspect) halfW = halfH * aspect;
	else halfH = halfW / aspect;
	halfW *= 1 + margin;
	halfH *= 1 + margin;
	const centreR = (minR + maxR) / 2;
	const centreU = (minU + maxU) / 2;
	const centreF = (minF + maxF) / 2;
	const halfDepth = Math.max((maxF - minF) / 2, 1e-3);
	const target = new Vector3()
		.addScaledVector(right, centreR)
		.addScaledVector(up, centreU)
		.addScaledVector(forward, centreF);
	return {
		position: target.clone().addScaledVector(back, halfDepth + 1),
		target,
		up,
		left: -halfW,
		right: halfW,
		top: halfH,
		bottom: -halfH,
		near: 0.05,
		far: halfDepth * 2 + 2
	};
}

export function applyOrtho(camera: OrthographicCamera, fit: OrthoFit): void {
	camera.left = fit.left;
	camera.right = fit.right;
	camera.top = fit.top;
	camera.bottom = fit.bottom;
	camera.near = fit.near;
	camera.far = fit.far;
	camera.up.copy(fit.up);
	camera.position.copy(fit.position);
	camera.lookAt(fit.target);
	camera.updateProjectionMatrix();
	camera.updateMatrixWorld(true);
}

export function farHalfPlane(toCamera: Vector3, centre: Vector3): Plane {
	const flat = horizontal(toCamera);
	return new Plane(flat.clone().negate(), flat.dot(centre));
}

export function isoFitPoints(
	box: Box3,
	toCamera: Vector3,
	lowTop: number,
	centre = box.getCenter(new Vector3())
): Vector3[] {
	const flat = horizontal(toCamera);
	return boxCorners(box).map((corner) => {
		const near = flat.dot(corner.clone().sub(centre)) > 1e-6;
		return near ? new Vector3(corner.x, Math.min(corner.y, lowTop), corner.z) : corner;
	});
}

export function emptyBox(): Box3 {
	return new Box3(new Vector3(-2, 0, -2), new Vector3(2, 2.5, 2));
}
