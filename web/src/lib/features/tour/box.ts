export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Size {
	width: number;
	height: number;
}

export function area(rect: Rect): number {
	return Math.max(0, rect.width) * Math.max(0, rect.height);
}

export function intersection(a: Rect, b: Rect): Rect | null {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const right = Math.min(a.x + a.width, b.x + b.width);
	const bottom = Math.min(a.y + a.height, b.y + b.height);
	return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

export function overlapArea(a: Rect, b: Rect): number {
	const common = intersection(a, b);
	return common ? area(common) : 0;
}

export function inflate(rect: Rect, by: number): Rect {
	return {
		x: rect.x - by,
		y: rect.y - by,
		width: rect.width + by * 2,
		height: rect.height + by * 2
	};
}

export function sameRect(a: Rect | null, b: Rect | null, tolerance = 0.5): boolean {
	if (!a || !b) return a === b;
	return (
		Math.abs(a.x - b.x) <= tolerance &&
		Math.abs(a.y - b.y) <= tolerance &&
		Math.abs(a.width - b.width) <= tolerance &&
		Math.abs(a.height - b.height) <= tolerance
	);
}
