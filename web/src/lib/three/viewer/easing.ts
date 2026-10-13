export function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export function easeInOutCubic(t: number): number {
	const x = clamp01(t);
	return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - clamp01(t), 3);
}

export function easeOutBack(t: number): number {
	const x = clamp01(t);
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function easeInCubic(t: number): number {
	const x = clamp01(t);
	return x * x * x;
}
