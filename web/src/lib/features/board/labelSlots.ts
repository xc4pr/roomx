export interface Span {
	from: number;
	to: number;
}

function free(centre: number, half: number, occupied: readonly Span[]): boolean {
	return occupied.every((span) => centre + half <= span.from || centre - half >= span.to);
}

export function pickLabelAlong(
	length: number,
	occupied: readonly Span[],
	labelLength: number,
	margin = 0
): number | null {
	const half = labelLength / 2 + margin;
	const lo = half;
	const hi = length - half;
	if (lo > hi) return null;
	const mid = length / 2;
	if (free(mid, half, occupied)) return mid;
	const step = Math.max(labelLength / 4, 1);
	for (let distance = step; distance <= mid; distance += step) {
		for (const centre of [mid - distance, mid + distance]) {
			if (centre >= lo && centre <= hi && free(centre, half, occupied)) return centre;
		}
	}
	return null;
}
