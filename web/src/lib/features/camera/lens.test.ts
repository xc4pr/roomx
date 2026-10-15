import { describe, expect, it } from 'vitest';
import { pickLens, ultraWideDevice, ultraWideZoom } from './lens.ts';

const devices = [
	{ deviceId: 'f', label: 'Front Camera', kind: 'videoinput' },
	{ deviceId: 'b', label: 'Back Camera', kind: 'videoinput' },
	{ deviceId: 'u', label: 'Back Ultra Wide Camera', kind: 'videoinput' },
	{ deviceId: 'm', label: 'Microphone', kind: 'audioinput' }
];

describe('lens', () => {
	it('finds an ultra wide device by label', () => {
		expect(ultraWideDevice(devices)?.deviceId).toBe('u');
		expect(ultraWideDevice(devices.slice(0, 2))).toBeNull();
		expect(
			ultraWideDevice([{ deviceId: 'x', label: 'camera2 0,5x', kind: 'videoinput' }])
		).not.toBeNull();
	});

	it('uses zoom below 1 when available', () => {
		expect(ultraWideZoom({ min: 0.5, max: 10 })).toBe(0.5);
		expect(ultraWideZoom({ min: 0.6, max: 4 })).toBe(0.6);
		expect(ultraWideZoom({ min: 1, max: 4 })).toBeNull();
		expect(ultraWideZoom(undefined)).toBeNull();
	});

	it('prefers zoom over a separate device', () => {
		expect(pickLens(devices, { min: 0.5, max: 4 })).toEqual({ kind: 'zoom', zoom: 0.5 });
		expect(pickLens(devices, undefined)).toEqual({ kind: 'device', deviceId: 'u' });
		expect(pickLens(devices.slice(0, 2), { min: 1, max: 2 })).toBeNull();
	});
});
