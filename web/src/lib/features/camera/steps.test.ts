import { describe, expect, it } from 'vitest';
import { firstOpenPos, isRoomComplete, nextOpenPos, roomProgress, sequence } from './steps.ts';

const steps = [
	{ key: 'a', optional: false },
	{ key: 'o1', optional: true },
	{ key: 'b', optional: false },
	{ key: 'c', optional: false }
];

describe('steps', () => {
	it('puts required steps first', () => {
		expect(sequence(steps)).toEqual([0, 2, 3, 1]);
	});

	it('finds the first open step', () => {
		expect(firstOpenPos(steps, new Set(['a']))).toBe(1);
		expect(firstOpenPos(steps, new Set(['a', 'b', 'c']))).toBe(3);
		expect(firstOpenPos(steps, new Set(['a', 'b', 'c', 'o1']))).toBe(0);
	});

	it('moves on to the next open step and wraps to skipped ones', () => {
		expect(nextOpenPos(steps, new Set(['a']), 0)).toBe(1);
		expect(nextOpenPos(steps, new Set(['o1', 'b', 'c']), 2)).toBe(0);
		expect(nextOpenPos(steps, new Set(['a', 'b', 'c', 'o1']), 0)).toBeNull();
	});

	it('counts required photos from the computer and the phone', () => {
		const progress = roomProgress(steps, ['a'], ['b', 'a', 'o1']);
		expect(progress).toEqual({ done: 1, total: 3, onPhone: 1 });
		expect(isRoomComplete(progress)).toBe(false);
		expect(isRoomComplete(roomProgress(steps, ['a'], ['b', 'c']))).toBe(true);
	});
});
