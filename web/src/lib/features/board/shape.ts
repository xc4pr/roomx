import { add, scale, sub, type Vec } from '#lib/core/geometry.ts';

function unitVector(from: Vec, to: Vec): Vec {
	const d = sub(to, from);
	const len = Math.hypot(d.x, d.y) || 1;
	return { x: d.x / len, y: d.y / len };
}

// Offsets every corner of a counter-clockwise polygon along its mitre; positive distance grows outward.
export function offsetPolygon(polygon: readonly Vec[], distance: number): Vec[] {
	const n = polygon.length;
	return polygon.map((corner, i) => {
		const before = unitVector(polygon[(i - 1 + n) % n], corner);
		const after = unitVector(corner, polygon[(i + 1) % n]);
		const n1 = { x: before.y, y: -before.x };
		const n2 = { x: after.y, y: -after.x };
		const denominator = Math.max(0.25, 1 + n1.x * n2.x + n1.y * n2.y);
		return add(corner, scale(add(n1, n2), distance / denominator));
	});
}

export function pathOf(points: readonly Vec[]): string {
	return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') + ' Z';
}

export function wallBandPath(polygon: readonly Vec[], thickness: number): string {
	return `${pathOf(offsetPolygon(polygon, thickness))} ${pathOf([...polygon].reverse())}`;
}

export function cornerLabelPosition(polygon: readonly Vec[], index: number, distance: number): Vec {
	return offsetPolygon(polygon, -distance)[index];
}

export function wallNormal(polygon: readonly Vec[], index: number): Vec {
	const a = polygon[index];
	const b = polygon[(index + 1) % polygon.length];
	const d = unitVector(a, b);
	return { x: -d.y, y: d.x };
}

export function wallMiddle(polygon: readonly Vec[], index: number): Vec {
	const a = polygon[index];
	const b = polygon[(index + 1) % polygon.length];
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
