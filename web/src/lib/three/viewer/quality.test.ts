import { describe, expect, it } from 'vitest';
import {
	DEFAULT_GOVERNOR,
	isWeakDevice,
	pixelRatioFor,
	profileFor,
	QualityGovernor,
	type QualityTier
} from './quality.ts';

const FAST = 1000 / 60;
const SLOW = 1000 / 15;

function feed(
	governor: QualityGovernor,
	deltaMs: number,
	frames: number,
	start = 10_000,
	stopOnChange = false
): { tier: QualityTier; changes: QualityTier[]; end: number } {
	const changes: QualityTier[] = [];
	let now = start;
	for (let index = 0; index < frames; index++) {
		now += deltaMs;
		const next = governor.sample(deltaMs, now);
		if (next === null) continue;
		changes.push(next);
		if (stopOnChange) break;
	}
	return { tier: governor.tier, changes, end: now };
}

describe('weak device detection', () => {
	it('flags devices with very little memory or few cores', () => {
		expect(isWeakDevice({ deviceMemory: 2, coarsePointer: false })).toBe(true);
		expect(isWeakDevice({ hardwareConcurrency: 2, coarsePointer: false })).toBe(true);
	});

	it('flags small phones and tablets but not a four core desktop', () => {
		expect(isWeakDevice({ deviceMemory: 4, coarsePointer: true })).toBe(true);
		expect(isWeakDevice({ hardwareConcurrency: 4, coarsePointer: true })).toBe(true);
		expect(isWeakDevice({ hardwareConcurrency: 4, deviceMemory: 8, coarsePointer: false })).toBe(
			false
		);
	});

	it('treats unknown values as capable', () => {
		expect(isWeakDevice({ coarsePointer: true })).toBe(false);
		expect(isWeakDevice({ coarsePointer: false })).toBe(false);
		expect(isWeakDevice({ deviceMemory: 8, hardwareConcurrency: 8, coarsePointer: true })).toBe(
			false
		);
	});
});

describe('quality profiles', () => {
	it('caps the pixel ratio at 2 and at 1.5 on weak devices', () => {
		expect(profileFor(0, false).maxPixelRatio).toBe(2);
		expect(profileFor(0, true).maxPixelRatio).toBe(1.5);
	});

	it('switches shadows off from the second tier on', () => {
		expect(profileFor(0, false).shadows).toBe(true);
		expect(profileFor(1, false).shadows).toBe(false);
		expect(profileFor(2, false).shadows).toBe(false);
	});

	it('lowers the pixel ratio with every tier', () => {
		for (const weak of [false, true]) {
			const ratios = ([0, 1, 2] as const).map((tier) => profileFor(tier, weak).maxPixelRatio);
			expect(ratios[0]).toBeGreaterThan(ratios[1]);
			expect(ratios[1]).toBeGreaterThan(ratios[2]);
		}
	});
});

describe('pixelRatioFor', () => {
	it('follows the device pixel ratio up to the cap', () => {
		const profile = profileFor(0, false);
		expect(pixelRatioFor(800, 600, 1, profile)).toBe(1);
		expect(pixelRatioFor(800, 600, 2, profile)).toBe(2);
		expect(pixelRatioFor(800, 600, 3, profile)).toBe(2);
	});

	it('applies the lower cap on weak devices', () => {
		expect(pixelRatioFor(390, 700, 3, profileFor(0, true))).toBe(1.5);
	});

	it('shrinks the ratio on very large canvases', () => {
		const profile = profileFor(0, false);
		const ratio = pixelRatioFor(3840, 2160, 2, profile);
		expect(ratio).toBeLessThan(2);
		expect(3840 * 2160 * ratio * ratio).toBeLessThanOrEqual(profile.maxPixels * 1.01);
	});

	it('never goes below half resolution and ignores bad input', () => {
		expect(pixelRatioFor(100_000, 100_000, 2, profileFor(2, true))).toBe(0.5);
		expect(pixelRatioFor(800, 600, Number.NaN, profileFor(0, false))).toBe(1);
		expect(pixelRatioFor(0, 0, 1, profileFor(0, false))).toBe(1);
	});
});

describe('QualityGovernor', () => {
	it('stays put at a healthy frame rate', () => {
		const governor = new QualityGovernor();
		governor.reset(0);
		const result = feed(governor, FAST, 600);
		expect(result.changes).toEqual([]);
		expect(governor.tier).toBe(0);
	});

	it('does not mistake a device capped at 30 fps for a slow one', () => {
		const governor = new QualityGovernor();
		governor.reset(0);
		expect(feed(governor, 1000 / 30, 600).changes).toEqual([]);
	});

	it('treats a very slow but steady frame rate as slow, not as idle', () => {
		const governor = new QualityGovernor();
		governor.reset(0);
		expect(feed(governor, 400, DEFAULT_GOVERNOR.minSlowSamples).changes).toEqual([1]);
	});

	it('steps down one tier at a time on a sustained low frame rate', () => {
		const governor = new QualityGovernor();
		governor.reset(0);
		const first = feed(governor, SLOW, DEFAULT_GOVERNOR.minSamples);
		expect(first.changes).toEqual([1]);
		const second = feed(governor, SLOW, 200, first.end + DEFAULT_GOVERNOR.warmupMs);
		expect(second.changes).toEqual([2]);
		const third = feed(governor, SLOW, 400, second.end + DEFAULT_GOVERNOR.warmupMs);
		expect(third.changes).toEqual([]);
		expect(governor.tier).toBe(2);
	});

	it('needs a full set of samples before it decides', () => {
		const governor = new QualityGovernor();
		governor.reset(0);
		expect(feed(governor, 50, DEFAULT_GOVERNOR.minSamples - 1).changes).toEqual([]);
	});

	it('ignores samples during the warm-up after a reset', () => {
		const governor = new QualityGovernor();
		governor.reset(10_000);
		const result = feed(governor, SLOW, 100, 10_000 - 100 * SLOW);
		expect(result.changes).toEqual([]);
		expect(governor.sample(SLOW, 10_000 + DEFAULT_GOVERNOR.warmupMs - 1)).toBeNull();
	});

	it('ignores idle gaps and invalid deltas', () => {
		const governor = new QualityGovernor();
		governor.reset(0);
		expect(feed(governor, DEFAULT_GOVERNOR.maxDeltaMs + 1, 200).changes).toEqual([]);
		expect(feed(governor, 0, 200).changes).toEqual([]);
		expect(feed(governor, Number.NaN, 200).changes).toEqual([]);
	});

	it('is not tipped over by a single stall', () => {
		const governor = new QualityGovernor();
		governor.reset(0);
		feed(governor, FAST, 100);
		expect(governor.sample(250, 100_000)).toBeNull();
		expect(feed(governor, FAST, 100, 100_000).changes).toEqual([]);
	});

	it('steps back up only after a long stretch of smooth frames', () => {
		const governor = new QualityGovernor({}, 1);
		governor.reset(0);
		const early = feed(governor, FAST, DEFAULT_GOVERNOR.raiseAfterSamples - 1);
		expect(early.changes).toEqual([]);
		const later = feed(governor, FAST, 100, early.end);
		expect(later.changes).toEqual([0]);
	});

	it('does not go up while the frame rate is only middling', () => {
		const governor = new QualityGovernor({}, 1);
		governor.reset(0);
		expect(feed(governor, 1000 / 40, 1000).changes).toEqual([]);
		expect(governor.tier).toBe(1);
	});

	it('locks a tier out once going back up failed', () => {
		const governor = new QualityGovernor();
		governor.reset(0);
		let clock = feed(governor, SLOW, 400, 10_000, true);
		expect(governor.tier).toBe(1);
		clock = feed(governor, FAST, 2000, clock.end + DEFAULT_GOVERNOR.warmupMs, true);
		expect(governor.tier).toBe(0);
		clock = feed(governor, SLOW, 400, clock.end, true);
		expect(governor.tier).toBe(1);
		const after = feed(governor, FAST, 3000, clock.end + DEFAULT_GOVERNOR.warmupMs);
		expect(after.changes).toEqual([]);
		expect(governor.tier).toBe(1);
	});

	it('keeps a tier it has held up for a while', () => {
		const governor = new QualityGovernor();
		governor.reset(0);
		let clock = feed(governor, SLOW, 400, 10_000, true);
		clock = feed(governor, FAST, 2000, clock.end + DEFAULT_GOVERNOR.warmupMs, true);
		expect(governor.tier).toBe(0);
		clock = feed(governor, FAST, 400, clock.end);
		clock = feed(governor, SLOW, 400, clock.end, true);
		expect(governor.tier).toBe(1);
		const back = feed(governor, FAST, 2000, clock.end + DEFAULT_GOVERNOR.warmupMs, true);
		expect(back.changes).toEqual([0]);
	});

	it('penalize lowers one tier and forbids going back up', () => {
		const governor = new QualityGovernor();
		expect(governor.penalize(0)).toBe(1);
		governor.reset(0);
		expect(feed(governor, FAST, 2000).changes).toEqual([]);
		expect(governor.tier).toBe(1);
	});

	it('penalize at the lowest tier changes nothing', () => {
		const governor = new QualityGovernor({}, 2);
		expect(governor.penalize(0)).toBeNull();
		expect(governor.tier).toBe(2);
	});
});
