import { rotate, type Vec } from '#lib/core/geometry.ts';

export type ArrowKey = 'up' | 'down' | 'left' | 'right';

// Maps an arrow key to a plan axis so that "up" moves away from the camera.
export function arrowVector(key: ArrowKey, view: Vec | null, roomRotation = 0): Vec {
	const forward = view ? rotate(view, -roomRotation) : { x: 0, y: 1 };
	const right = { x: forward.y, y: -forward.x };
	const base = {
		up: forward,
		down: { x: -forward.x, y: -forward.y },
		right,
		left: { x: -right.x, y: -right.y }
	}[key];
	return Math.abs(base.x) > Math.abs(base.y)
		? { x: Math.sign(base.x), y: 0 }
		: { x: 0, y: Math.sign(base.y) };
}
