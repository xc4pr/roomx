export type PillTone = 'normal' | 'accent' | 'warn';

export interface PillSpec {
	id: string;
	x: number;
	y: number;
	text: string;
	tone: PillTone;
	slide?: boolean;
}

export const PILL_HEIGHT = 19;

export function pillWidth(text: string): number {
	return text.length * 6.6 + 12;
}

function overlaps(a: PillSpec, b: PillSpec, gap: number): boolean {
	const dx = Math.abs(a.x - b.x);
	const dy = Math.abs(a.y - b.y);
	return dx < (pillWidth(a.text) + pillWidth(b.text)) / 2 + gap && dy < PILL_HEIGHT + gap;
}

export function resolvePills(specs: readonly PillSpec[], gap = 3): PillSpec[] {
	const placed: PillSpec[] = [];
	const step = PILL_HEIGHT + gap;
	for (const spec of specs) {
		const shifts = spec.slide ? [0, step, -step, 2 * step, -2 * step] : [0];
		for (const shift of shifts) {
			const candidate = { ...spec, y: spec.y + shift };
			if (placed.some((other) => overlaps(candidate, other, gap))) continue;
			placed.push(candidate);
			break;
		}
	}
	return placed;
}
