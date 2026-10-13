export const STEPPER_REPEAT_AFTER_MS = 400;

export function stepMultiplier(heldMs: number): number {
	if (heldMs < STEPPER_REPEAT_AFTER_MS) return 1;
	if (heldMs < 1500) return 1;
	if (heldMs < 3000) return 5;
	return 10;
}

export function repeatDelay(heldMs: number): number {
	if (heldMs < 1500) return 140;
	if (heldMs < 3000) return 100;
	return 70;
}

export function clampMm(value: number, min?: number, max?: number): number {
	let result = value;
	if (min !== undefined && result < min) result = min;
	if (max !== undefined && result > max) result = max;
	return result;
}

export function stepValue(
	current: number,
	direction: 1 | -1,
	step: number,
	heldMs: number,
	min?: number,
	max?: number
): number {
	const amount = step * stepMultiplier(heldMs);
	const grid =
		direction === 1 ? Math.ceil(current / step) * step : Math.floor(current / step) * step;
	const next = grid === current ? current + direction * amount : grid + direction * (amount - step);
	return clampMm(next, min, max);
}
