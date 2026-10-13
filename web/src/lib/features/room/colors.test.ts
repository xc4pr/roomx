import { describe, expect, it } from 'vitest';
import { FLOOR_PRESETS, WALL_PRESETS, findPreset, floorTint, isHexColor } from './colors.ts';

describe('colors', () => {
	it('keeps every preset a valid, unique hex', () => {
		for (const list of [FLOOR_PRESETS, WALL_PRESETS]) {
			const hexes = list.map((preset) => preset.hex.toLowerCase());
			expect(new Set(hexes).size).toBe(hexes.length);
			expect(new Set(list.map((preset) => preset.id)).size).toBe(list.length);
			for (const hex of hexes) expect(isHexColor(hex)).toBe(true);
		}
	});

	it('finds presets case-insensitively', () => {
		expect(findPreset(FLOOR_PRESETS, FLOOR_PRESETS[2].hex.toUpperCase())?.id).toBe('walnut');
		expect(findPreset(WALL_PRESETS, '#123456')).toBeUndefined();
		expect(findPreset(WALL_PRESETS, undefined)).toBeUndefined();
	});

	it('only tints with valid hex values', () => {
		expect(floorTint('#c39a63')).toBe('#c39a63');
		expect(floorTint('red')).toBeUndefined();
		expect(floorTint(undefined)).toBeUndefined();
	});
});
