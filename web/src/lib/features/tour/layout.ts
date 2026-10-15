import { inflate, overlapArea, type Rect, type Size } from './box.ts';

export type CardSide = 'top' | 'bottom' | 'left' | 'right';

export interface Insets {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface PlaceInput {
	card: Size;
	viewport: Size;
	target: Rect | null;
	context?: Rect | null;
	avoid?: readonly Rect[];
	prefer?: readonly CardSide[];
	insets?: Partial<Insets>;
	margin?: number;
	gap?: number;
}

export interface CardPlacement {
	left: number;
	top: number;
	width: number;
	height: number;
	side: CardSide | null;
	centered: boolean;
	overlap: number;
}

const DEFAULT_ORDER: readonly CardSide[] = ['bottom', 'top', 'right', 'left'];
const TARGET_PAD = 6;
const DODGE_GAP = 8;
const CORNER_COST = 1500;
const TARGET_WEIGHT = 12;
const AVOID_WEIGHT = 3;

export function placeCard(input: PlaceInput): CardPlacement {
	const margin = input.margin ?? 12;
	const gap = input.gap ?? 16;
	const insets = { top: 0, right: 0, bottom: 0, left: 0, ...input.insets };
	const bounds: Rect = {
		x: margin + insets.left,
		y: margin + insets.top,
		width: Math.max(0, input.viewport.width - margin * 2 - insets.left - insets.right),
		height: Math.max(0, input.viewport.height - margin * 2 - insets.top - insets.bottom)
	};
	const width = Math.min(input.card.width, bounds.width);
	const height = Math.min(input.card.height, bounds.height);
	const clampX = (value: number): number =>
		Math.max(bounds.x, Math.min(value, bounds.x + bounds.width - width));
	const clampY = (value: number): number =>
		Math.max(bounds.y, Math.min(value, bounds.y + bounds.height - height));

	if (!input.target) {
		return {
			left: clampX(bounds.x + (bounds.width - width) / 2),
			top: clampY(bounds.y + (bounds.height - height) / 2),
			width,
			height,
			side: null,
			centered: true,
			overlap: 0
		};
	}

	const target = input.target;
	const reference = input.context ?? target;
	const guarded = inflate(target, TARGET_PAD);
	const avoid = input.avoid ?? [];
	const centreX = target.x + target.width / 2;
	const centreY = target.y + target.height / 2;
	const order = [
		...(input.prefer ?? []),
		...DEFAULT_ORDER.filter((side) => !input.prefer?.includes(side))
	];

	const score = (left: number, top: number): number => {
		const box: Rect = { x: left, y: top, width, height };
		return (
			overlapArea(box, guarded) * TARGET_WEIGHT +
			avoid.reduce((sum, other) => sum + overlapArea(box, other) * AVOID_WEIGHT, 0)
		);
	};

	const candidates = order.map((side, index) => {
		const sideways = side === 'left' || side === 'right';
		const fixed = sideways
			? clampX(side === 'left' ? reference.x - gap - width : reference.x + reference.width + gap)
			: clampY(side === 'top' ? reference.y - gap - height : reference.y + reference.height + gap);
		const base = sideways ? clampY(centreY - height / 2) : clampX(centreX - width / 2);
		const shifts = avoid.flatMap((box) =>
			sideways
				? [box.y - DODGE_GAP - height, box.y + box.height + DODGE_GAP]
				: [box.x - DODGE_GAP - width, box.x + box.width + DODGE_GAP]
		);
		const options = [base, ...shifts.map((value) => (sideways ? clampY(value) : clampX(value)))];
		return options
			.map((along) => {
				const left = sideways ? fixed : along;
				const top = sideways ? along : fixed;
				return {
					side: side as CardSide | null,
					left,
					top,
					cost: score(left, top) + Math.abs(along - base) + index
				};
			})
			.reduce((winner, next) => (next.cost < winner.cost ? next : winner));
	});

	const corners = [
		{ left: clampX(bounds.x), top: clampY(bounds.y) },
		{ left: clampX(bounds.x + bounds.width), top: clampY(bounds.y) },
		{ left: clampX(bounds.x), top: clampY(bounds.y + bounds.height) },
		{ left: clampX(bounds.x + bounds.width), top: clampY(bounds.y + bounds.height) }
	].map((corner, index) => ({
		side: null as CardSide | null,
		...corner,
		cost: score(corner.left, corner.top) + CORNER_COST + index
	}));

	const best = [...candidates, ...corners].reduce((winner, next) =>
		next.cost < winner.cost ? next : winner
	);

	return {
		left: best.left,
		top: best.top,
		width,
		height,
		side: best.side,
		centered: false,
		overlap: overlapArea({ x: best.left, y: best.top, width, height }, guarded)
	};
}
