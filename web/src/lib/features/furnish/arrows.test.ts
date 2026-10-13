import { describe, expect, it } from 'vitest';
import { arrowVector } from './arrows.ts';

describe('arrowVector', () => {
	it('follows the plan axes without a camera', () => {
		expect(arrowVector('up', null)).toEqual({ x: 0, y: 1 });
		expect(arrowVector('down', null)).toEqual({ x: 0, y: -1 });
		expect(arrowVector('right', null)).toEqual({ x: 1, y: 0 });
		expect(arrowVector('left', null)).toEqual({ x: -1, y: 0 });
	});

	it('keeps up pointing away from a camera that looks north-west', () => {
		const view = { x: -0.57, y: 0.82 };
		expect(arrowVector('up', view)).toEqual({ x: 0, y: 1 });
		expect(arrowVector('right', view)).toEqual({ x: 1, y: 0 });
	});

	it('turns with a camera looking east or south', () => {
		expect(arrowVector('up', { x: 1, y: 0 })).toEqual({ x: 1, y: 0 });
		expect(arrowVector('right', { x: 1, y: 0 })).toEqual({ x: 0, y: -1 });
		expect(arrowVector('up', { x: 0, y: -1 })).toEqual({ x: 0, y: -1 });
		expect(arrowVector('left', { x: 0, y: -1 })).toEqual({ x: 1, y: 0 });
	});

	it('converts into the local axes of a rotated room', () => {
		expect(arrowVector('up', { x: 0, y: 1 }, 90)).toEqual({ x: 1, y: 0 });
		expect(arrowVector('up', { x: 0, y: 1 }, 180)).toEqual({ x: 0, y: -1 });
	});
});
