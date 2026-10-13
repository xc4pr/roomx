export interface LabelPlan {
	text: string;
	size: number;
	angle: number;
}

export interface LabelInput {
	text: string;
	w: number;
	d: number;
	rotation: number;
	pxPerMm: number;
	measure: (text: string, size: number) => number;
	minSize?: number;
	maxSize?: number;
}

const PADDING = 8;
const LINE = 1.3;

export function uprightAngle(degrees: number): number {
	const wrapped = ((((degrees + 90) % 180) + 180) % 180) - 90;
	return wrapped;
}

// Fits an item name onto the item's footprint: along its long side, shortened with an ellipsis, hidden if it cannot fit.
export function planLabel(input: LabelInput): LabelPlan | null {
	const { text, w, d, rotation, pxPerMm, measure } = input;
	if (text.trim() === '') return null;
	const wide = w >= d;
	const long = (wide ? w : d) * pxPerMm;
	const short = (wide ? d : w) * pxPerMm;
	const size = Math.max(input.minSize ?? 9, Math.min(input.maxSize ?? 13, short * 0.32));
	if (size * LINE > short - 4) return null;
	const available = long - PADDING;
	const angle = uprightAngle(wide ? rotation : rotation + 90);
	if (measure(text, size) <= available) return { text, size, angle };
	let count = text.length - 1;
	while (count >= 2 && measure(`${text.slice(0, count).trimEnd()}…`, size) > available) count--;
	if (count < 2) return null;
	return { text: `${text.slice(0, count).trimEnd()}…`, size, angle };
}
