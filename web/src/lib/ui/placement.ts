export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Size {
	width: number;
	height: number;
}

export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface Placement {
	side: Side;
	left: number;
	top: number;
	arrow: number;
	aimed: boolean;
}

const GAP = 14;

export function placeBubble(
	anchor: Box,
	bubble: Size,
	viewport: Size,
	options: { margin?: number; gap?: number; prefer?: readonly Side[]; avoid?: readonly Box[] } = {}
): Placement {
	const margin = options.margin ?? 12;
	const gap = options.gap ?? GAP;
	const room: Record<Side, number> = {
		bottom: viewport.height - (anchor.y + anchor.height) - margin,
		top: anchor.y - margin,
		right: viewport.width - (anchor.x + anchor.width) - margin,
		left: anchor.x - margin
	};
	const need = (side: Side): number =>
		side === 'top' || side === 'bottom' ? bubble.height + gap : bubble.width + gap;
	const defaults: Side[] = ['bottom', 'top', 'right', 'left'];
	const order = [
		...(options.prefer ?? []),
		...defaults.filter((side) => !options.prefer?.includes(side))
	];
	const side =
		order.find((candidate) => room[candidate] >= need(candidate)) ??
		order.reduce((best, candidate) => (room[candidate] > room[best] ? candidate : best));
	const clampX = (value: number): number =>
		Math.max(margin, Math.min(value, viewport.width - bubble.width - margin));
	const clampY = (value: number): number =>
		Math.max(margin, Math.min(value, viewport.height - bubble.height - margin));
	const centreX = anchor.x + anchor.width / 2;
	const centreY = anchor.y + anchor.height / 2;
	const avoid = options.avoid ?? [];
	const hits = (left: number, top: number): boolean =>
		avoid.some(
			(box) =>
				left < box.x + box.width &&
				left + bubble.width > box.x &&
				top < box.y + box.height &&
				top + bubble.height > box.y
		);
	const dodge = (
		start: number,
		limit: number,
		extent: number,
		blocked: (value: number) => boolean,
		spans: readonly (readonly [number, number])[]
	): number => {
		if (!blocked(start)) return start;
		const options = spans
			.flatMap(([from, to]) => [from - gap - extent, to + gap])
			.map((value) => Math.max(margin, Math.min(value, limit)))
			.filter((value) => !blocked(value))
			.sort((a, b) => Math.abs(a - start) - Math.abs(b - start));
		return options[0] ?? start;
	};
	if (side === 'top' || side === 'bottom') {
		const top = clampY(
			side === 'bottom' ? anchor.y + anchor.height + gap : anchor.y - gap - bubble.height
		);
		const left = dodge(
			clampX(centreX - bubble.width / 2),
			viewport.width - bubble.width - margin,
			bubble.width,
			(value) => hits(value, top),
			avoid.map((box) => [box.x, box.x + box.width] as const)
		);
		const raw = centreX - left;
		return {
			side,
			left,
			top,
			arrow: Math.max(20, Math.min(raw, bubble.width - 20)),
			aimed: raw >= 20 && raw <= bubble.width - 20
		};
	}
	const left = clampX(
		side === 'right' ? anchor.x + anchor.width + gap : anchor.x - gap - bubble.width
	);
	const top = dodge(
		clampY(centreY - bubble.height / 2),
		viewport.height - bubble.height - margin,
		bubble.height,
		(value) => hits(left, value),
		avoid.map((box) => [box.y, box.y + box.height] as const)
	);
	const raw = centreY - top;
	return {
		side,
		left,
		top,
		arrow: Math.max(20, Math.min(raw, bubble.height - 20)),
		aimed: raw >= 20 && raw <= bubble.height - 20
	};
}
