import { describe, expect, it } from 'vitest';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import { stripCover, wholeCover } from '#lib/core/outdoor.ts';
import { buildCover, inferCover, refitCover, stripReach } from './cover.ts';

const room = rectangleRoom('terrace', 4000, 3000);

describe('inferCover', () => {
	it('tells none, whole, strip and custom apart', () => {
		expect(inferCover(room)).toEqual({ mode: 'none' });
		expect(inferCover({ ...room, cover: wholeCover(room, 2400) })).toEqual({ mode: 'whole' });
		expect(inferCover({ ...room, cover: stripCover(room, 1, 1500, 2400) })).toEqual({
			mode: 'strip',
			wall: 1,
			depth: 1500
		});
		expect(inferCover({ ...room, cover: stripCover(room, 2, 900, 2400) })).toEqual({
			mode: 'strip',
			wall: 2,
			depth: 900
		});
		const odd = {
			polygon: [
				{ x: 0, y: 0 },
				{ x: 800, y: 0 },
				{ x: 0, y: 1200 }
			],
			height: 2400
		};
		expect(inferCover({ ...room, cover: odd })).toEqual({ mode: 'custom' });
	});
});

describe('buildCover', () => {
	it('limits a strip to the reach of the room', () => {
		expect(stripReach(room, 1)).toBe(3000);
		const cover = buildCover(room, { mode: 'strip', wall: 1, depth: 9000 }, 2400)!;
		expect(Math.max(...cover.polygon.map((p) => p.y))).toBe(3000);
		expect(buildCover(room, { mode: 'none' }, 2400)).toBeUndefined();
	});
});

describe('refitCover', () => {
	it('follows the new outline unless the cover was drawn by hand', () => {
		const wider = rectangleRoom('x', 6000, 3000).polygon;
		const whole = refitCover({ ...room, cover: wholeCover(room, 2400) }, wider)!;
		expect(whole.polygon).toEqual(wider);
		const strip = refitCover({ ...room, cover: stripCover(room, 1, 1500, 2300) }, wider)!;
		expect(strip.height).toBe(2300);
		expect(Math.max(...strip.polygon.map((p) => p.x))).toBe(6000);
		const custom = {
			polygon: [
				{ x: 0, y: 0 },
				{ x: 800, y: 0 },
				{ x: 0, y: 1200 }
			],
			height: 2400
		};
		expect(refitCover({ ...room, cover: custom }, wider)).toBe(custom);
		expect(refitCover(room, wider)).toBeUndefined();
	});
});
