import { beforeEach, describe, expect, it } from 'vitest';
import { panelLayout } from './panelWidth.svelte.ts';

describe('panelLayout', () => {
	beforeEach(() => {
		panelLayout.setWindowWidth(1440);
		panelLayout.reset();
	});

	it('starts at the default width', () => {
		expect(panelLayout.width).toBe(380);
		expect(panelLayout.dragging).toBe(false);
	});

	it('follows the drag live but keeps the settled width until the end', () => {
		panelLayout.begin();
		panelLayout.drag(500);
		expect(panelLayout.width).toBe(500);
		expect(panelLayout.settledWidth).toBe(380);
		panelLayout.drag(520);
		expect(panelLayout.settledWidth).toBe(380);
		panelLayout.end();
		expect(panelLayout.settledWidth).toBe(520);
		expect(panelLayout.dragging).toBe(false);
	});

	it('clamps to the window and recovers when the window grows again', () => {
		panelLayout.set(700);
		expect(panelLayout.width).toBe(700);
		panelLayout.setWindowWidth(1000);
		expect(panelLayout.width).toBe(600);
		expect(panelLayout.bounds.max).toBe(600);
		panelLayout.setWindowWidth(1440);
		expect(panelLayout.width).toBe(700);
	});

	it('resets to the default width', () => {
		panelLayout.set(600);
		panelLayout.reset();
		expect(panelLayout.width).toBe(380);
	});

	it('ignores end without a started drag', () => {
		panelLayout.end();
		expect(panelLayout.dragging).toBe(false);
	});
});
