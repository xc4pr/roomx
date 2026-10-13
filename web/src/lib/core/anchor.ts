import { add, normalizeDegrees, rotate, scale, wall, type Vec } from './geometry.ts';
import type { Anchor } from './plan.ts';
import type { Dims, Point } from './schema.ts';

export interface ResolvedPlacement {
	x: number;
	y: number;
	rotation: number;
}

export class AnchorError extends Error {
	readonly code: 'unknownWall';

	constructor(code: 'unknownWall') {
		super(code);
		this.code = code;
	}
}

function degrees(v: Vec): number {
	return (Math.atan2(v.y, v.x) * 180) / Math.PI;
}

// Rotation 0 means the front faces +y and the width runs along x.
// "left"/"right" are the item's sides as seen by someone standing in front of it, looking at the front:
// left is the local +x side, right the local -x side.
export function resolveAnchor(
	polygon: readonly Point[],
	dims: Pick<Dims, 'w' | 'd'>,
	anchor: Anchor
): ResolvedPlacement {
	const target = wall(polygon, anchor.wall);
	if (!target) throw new AnchorError('unknownWall');
	const side = anchor.side ?? 'back';
	const gap = anchor.gap ?? 0;
	const alongWall = side === 'back' ? dims.w : dims.d;
	const intoRoom = side === 'back' ? dims.d : dims.w;
	const center = add(
		add(target.start, scale(target.direction, anchor.offset + alongWall / 2)),
		scale(target.inward, gap + intoRoom / 2)
	);
	const inwardAngle = degrees(target.inward);
	const rotation =
		side === 'back' ? inwardAngle - 90 : side === 'left' ? inwardAngle + 180 : inwardAngle;
	return {
		x: Math.round(center.x),
		y: Math.round(center.y),
		rotation: normalizeDegrees(rotation)
	};
}

export function resolveOnTop(
	carrier: { x: number; y: number; rotation: number; dims: Pick<Dims, 'w' | 'd'> },
	dims: Pick<Dims, 'w' | 'd'>
): ResolvedPlacement {
	const back = Math.min(0, -(carrier.dims.d - dims.d) / 2);
	const center = add({ x: carrier.x, y: carrier.y }, rotate({ x: 0, y: back }, carrier.rotation));
	return {
		x: Math.round(center.x),
		y: Math.round(center.y),
		rotation: normalizeDegrees(carrier.rotation)
	};
}
