export type SheetSnap = 'peek' | 'half' | 'full';

export const SHEET_SNAPS: readonly SheetSnap[] = ['peek', 'half', 'full'];

export const SHEET_FRACTIONS: Record<SheetSnap, number> = {
	peek: 0.3,
	half: 0.58,
	full: 0.92
};

export const SHEET_MIN_FRACTION = 0.12;
export const SHEET_MAX_FRACTION = 0.96;

export function clampFraction(fraction: number): number {
	return Math.min(SHEET_MAX_FRACTION, Math.max(SHEET_MIN_FRACTION, fraction));
}

export function resolveSnap(
	fraction: number,
	velocity: number,
	closable: boolean
): SheetSnap | 'close' {
	const projected = fraction + velocity * 0.18;
	const lowest = SHEET_FRACTIONS.peek;
	if (closable && projected < lowest - 0.1) return 'close';
	let best: SheetSnap = 'peek';
	let distance = Infinity;
	for (const snap of SHEET_SNAPS) {
		const d = Math.abs(SHEET_FRACTIONS[snap] - projected);
		if (d < distance) {
			best = snap;
			distance = d;
		}
	}
	return best;
}

export function nextSnap(current: SheetSnap): SheetSnap {
	const index = SHEET_SNAPS.indexOf(current);
	return SHEET_SNAPS[(index + 1) % SHEET_SNAPS.length];
}
