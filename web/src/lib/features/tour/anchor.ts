import { area, intersection, type Rect, type Size } from './box.ts';

export interface AnchorCandidate<T> {
	item: T;
	rect: Rect;
}

export interface PickedAnchor<T> {
	item: T;
	rect: Rect;
	clipped: Rect;
}

export function visibleFraction(rect: Rect, viewport: Size): number {
	const total = area(rect);
	if (total <= 0) return 0;
	const shown = intersection(rect, { x: 0, y: 0, width: viewport.width, height: viewport.height });
	return shown ? area(shown) / total : 0;
}

export function clipToViewport(rect: Rect, viewport: Size): Rect {
	return intersection(rect, { x: 0, y: 0, width: viewport.width, height: viewport.height }) ?? rect;
}

export function pickAnchor<T>(
	candidates: readonly AnchorCandidate<T>[],
	viewport: Size,
	exposed: (item: T, clipped: Rect) => boolean,
	minFraction = 0.5
): PickedAnchor<T> | null {
	for (const candidate of candidates) {
		if (candidate.rect.width <= 0 || candidate.rect.height <= 0) continue;
		if (visibleFraction(candidate.rect, viewport) < minFraction) continue;
		const clipped = clipToViewport(candidate.rect, viewport);
		if (exposed(candidate.item, clipped)) {
			return { item: candidate.item, rect: candidate.rect, clipped };
		}
	}
	return null;
}

export function scrollDelta(rect: Rect, port: Rect, margin = 16): number {
	const top = rect.y - (port.y + margin);
	const bottom = rect.y + rect.height - (port.y + port.height - margin);
	if (rect.height + margin * 2 >= port.height) return top;
	if (top < 0) return top;
	if (bottom > 0) return bottom;
	return 0;
}
