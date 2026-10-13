import { describe, expect, it } from 'vitest';
import { placeBubble } from './placement.ts';

const viewport = { width: 1000, height: 700 };
const bubble = { width: 300, height: 140 };

describe('placeBubble', () => {
	it('prefers below the anchor and centres on it', () => {
		const result = placeBubble({ x: 450, y: 100, width: 100, height: 40 }, bubble, viewport);
		expect(result.side).toBe('bottom');
		expect(result.top).toBe(154);
		expect(result.left).toBe(350);
		expect(result.arrow).toBe(150);
	});

	it('goes above when there is no room below', () => {
		const result = placeBubble({ x: 450, y: 620, width: 100, height: 40 }, bubble, viewport);
		expect(result.side).toBe('top');
		expect(result.top).toBe(620 - 14 - 140);
	});

	it('honours the preferred side when it fits', () => {
		const result = placeBubble({ x: 600, y: 300, width: 100, height: 40 }, bubble, viewport, {
			prefer: ['left']
		});
		expect(result.side).toBe('left');
		expect(result.left).toBe(600 - 14 - 300);
	});

	it('slides sideways to keep clear of an avoided box', () => {
		const panel = { x: 700, y: 60, width: 280, height: 600 };
		const result = placeBubble({ x: 900, y: 10, width: 80, height: 40 }, bubble, viewport, {
			avoid: [panel]
		});
		expect(result.side).toBe('bottom');
		expect(result.left + bubble.width).toBeLessThanOrEqual(panel.x - 14 + 0.001);
		expect(result.aimed).toBe(false);
	});

	it('stays inside the viewport at the edges', () => {
		const result = placeBubble({ x: 960, y: 20, width: 30, height: 30 }, bubble, viewport);
		expect(result.left + bubble.width).toBeLessThanOrEqual(viewport.width - 12);
		expect(result.arrow).toBeLessThanOrEqual(bubble.width - 20);
		expect(result.arrow).toBeGreaterThanOrEqual(20);
	});

	it('uses the side with the most space for tall anchors', () => {
		const result = placeBubble({ x: 20, y: 10, width: 200, height: 680 }, bubble, viewport);
		expect(result.side).toBe('right');
		expect(result.left).toBe(234);
	});
});
