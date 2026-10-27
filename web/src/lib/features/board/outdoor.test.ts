import { describe, expect, it } from 'vitest';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import { stripCover } from '#lib/core/outdoor.ts';
import type { Room } from '#lib/core/schema.ts';
import { coverMark, railingLines } from './outdoor.ts';

function dockedPair(): { house: Room; balcony: Room } {
	const house = rectangleRoom('house', 4000, 3000);
	const balcony: Room = {
		...rectangleRoom('balcony', 4000, 1500),
		type: 'balcony',
		railing: { height: 1000 },
		boardPos: { x: 0, y: 3150, rot: 0 }
	};
	return { house, balcony };
}

describe('railingLines', () => {
	it('runs along the edges that do not border the house', () => {
		const { house, balcony } = dockedPair();
		const lines = railingLines([house, balcony], balcony);
		expect(lines).toHaveLength(3);
		const total = lines.reduce((sum, l) => sum + Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y), 0);
		expect(Math.round(total)).toBe(1500 + 4000 + 1500);
	});

	it('draws nothing without a railing', () => {
		const { house, balcony } = dockedPair();
		const { railing: _railing, ...bare } = balcony;
		expect(railingLines([house, bare], bare)).toEqual([]);
	});
});

describe('coverMark', () => {
	it('puts the label under the name for a whole cover and into the strip otherwise', () => {
		const room = rectangleRoom('t', 4000, 3000);
		const whole = { ...room, cover: { polygon: room.polygon, height: 2400 } };
		expect(coverMark(whole)).toMatchObject({ whole: true, label: { x: 2000, y: 1500 } });
		const strip = { ...room, cover: stripCover(room, 1, 1000, 2400) };
		expect(coverMark(strip)).toMatchObject({ whole: false, label: { x: 2000, y: 500 } });
		expect(coverMark(room)).toBeUndefined();
	});
});
