import { describe, expect, it } from 'vitest';
import { overlapArea, type Rect } from './box.ts';
import { placeCard } from './layout.ts';

const box = (x: number, y: number, width: number, height: number): Rect => ({
	x,
	y,
	width,
	height
});
const rect = (placed: { left: number; top: number; width: number; height: number }): Rect =>
	box(placed.left, placed.top, placed.width, placed.height);

const wide = { width: 1180, height: 820 };
const phone = { width: 390, height: 844 };
const card = { width: 384, height: 260 };

describe('placeCard', () => {
	it('centres the card without a target', () => {
		const placed = placeCard({ card, viewport: wide, target: null });
		expect(placed.centered).toBe(true);
		expect(placed.left).toBe((1180 - 384) / 2);
		expect(placed.top).toBe((820 - 260) / 2);
		expect(placed.side).toBeNull();
	});

	it('keeps the card inside the viewport', () => {
		const placed = placeCard({ card, viewport: phone, target: box(300, 20, 60, 40) });
		expect(placed.left).toBeGreaterThanOrEqual(12);
		expect(placed.left + placed.width).toBeLessThanOrEqual(390 - 12);
		expect(placed.top).toBeGreaterThanOrEqual(12);
		expect(placed.top + placed.height).toBeLessThanOrEqual(844 - 12);
	});

	it('never covers the target when there is room', () => {
		const target = box(500, 300, 120, 60);
		const placed = placeCard({ card, viewport: wide, target });
		expect(overlapArea(rect(placed), target)).toBe(0);
		expect(placed.centered).toBe(false);
		expect(placed.overlap).toBe(0);
	});

	it('follows the preferred side when it fits', () => {
		const target = box(700, 400, 100, 50);
		expect(placeCard({ card, viewport: wide, target, prefer: ['left'] }).side).toBe('left');
		expect(placeCard({ card, viewport: wide, target, prefer: ['top'] }).side).toBe('top');
	});

	it('falls back when the preferred side is out of room', () => {
		const target = box(10, 400, 100, 50);
		const placed = placeCard({ card, viewport: wide, target, prefer: ['left'] });
		expect(placed.side).not.toBe('left');
		expect(overlapArea(rect(placed), target)).toBe(0);
	});

	it('stays clear of avoided controls', () => {
		const target = box(100, 700, 60, 60);
		const header = box(0, 0, 1180, 60);
		const panel = box(790, 70, 380, 740);
		const placed = placeCard({
			card,
			viewport: wide,
			target,
			avoid: [header, panel],
			prefer: ['top']
		});
		expect(overlapArea(rect(placed), header)).toBe(0);
		expect(overlapArea(rect(placed), panel)).toBe(0);
		expect(overlapArea(rect(placed), target)).toBe(0);
	});

	it('places the card beside the panel that holds the target', () => {
		const panel = box(790, 70, 380, 740);
		const target = box(870, 520, 220, 120);
		const placed = placeCard({
			card,
			viewport: wide,
			target,
			context: panel,
			avoid: [panel],
			prefer: ['left']
		});
		expect(placed.side).toBe('left');
		expect(placed.left + placed.width).toBeLessThanOrEqual(790);
		expect(overlapArea(rect(placed), panel)).toBe(0);
	});

	it('dodges a control next to the preferred spot', () => {
		const panel = box(790, 70, 380, 740);
		const fab = box(700, 736, 64, 64);
		const target = box(870, 560, 220, 120);
		const placed = placeCard({
			card,
			viewport: wide,
			target,
			context: panel,
			avoid: [panel, fab],
			prefer: ['left']
		});
		expect(placed.side).toBe('left');
		expect(overlapArea(rect(placed), fab)).toBe(0);
		expect(placed.top).toBeLessThanOrEqual(620);
		expect(placed.top + placed.height).toBeGreaterThanOrEqual(620);
	});

	it('goes above a bottom sheet on a phone', () => {
		const sheet = box(0, 430, 390, 414);
		const header = box(0, 0, 390, 100);
		const target = box(24, 600, 340, 90);
		const placed = placeCard({
			card: { width: 366, height: 250 },
			viewport: phone,
			target,
			context: sheet,
			avoid: [header, sheet],
			prefer: ['top']
		});
		expect(placed.side).toBe('top');
		expect(placed.top + placed.height).toBeLessThanOrEqual(430);
		expect(placed.top).toBeGreaterThanOrEqual(100);
	});

	it('respects safe-area insets', () => {
		const placed = placeCard({
			card,
			viewport: phone,
			target: null,
			insets: { top: 50, bottom: 34 }
		});
		expect(placed.top).toBeGreaterThanOrEqual(62);
		expect(placed.top + placed.height).toBeLessThanOrEqual(844 - 34 - 12);
	});

	it('shrinks to the available space', () => {
		const placed = placeCard({
			card: { width: 600, height: 900 },
			viewport: phone,
			target: null
		});
		expect(placed.width).toBe(366);
		expect(placed.height).toBe(820);
	});
});
