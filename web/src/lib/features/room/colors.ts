export interface ColorPreset {
	id: string;
	hex: string;
}

export const FLOOR_PRESETS = [
	{ id: 'oakLight', hex: '#dcc59d' },
	{ id: 'oakNatural', hex: '#c39a63' },
	{ id: 'walnut', hex: '#6e4b34' },
	{ id: 'concrete', hex: '#a5a5a1' },
	{ id: 'tileLight', hex: '#ddd9d0' },
	{ id: 'carpetGrey', hex: '#8a8d90' },
	{ id: 'tileDark', hex: '#494c50' },
	{ id: 'terracotta', hex: '#b8765a' }
] as const satisfies readonly ColorPreset[];

export const WALL_PRESETS = [
	{ id: 'white', hex: '#f6f5f1' },
	{ id: 'warmWhite', hex: '#efe6d4' },
	{ id: 'sand', hex: '#d9c4a1' },
	{ id: 'sage', hex: '#b3c0a4' },
	{ id: 'mistBlue', hex: '#b6c5d3' },
	{ id: 'rose', hex: '#e2c6bf' },
	{ id: 'terracotta', hex: '#c88a6e' },
	{ id: 'anthracite', hex: '#4b5056' }
] as const satisfies readonly ColorPreset[];

export type FloorPresetId = (typeof FLOOR_PRESETS)[number]['id'];
export type WallPresetId = (typeof WALL_PRESETS)[number]['id'];

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
	return typeof value === 'string' && HEX.test(value);
}

export function findPreset<T extends ColorPreset>(
	presets: readonly T[],
	hex: string | undefined
): T | undefined {
	if (!hex) return undefined;
	const wanted = hex.toLowerCase();
	return presets.find((preset) => preset.hex.toLowerCase() === wanted);
}

export function floorTint(hex: string | undefined): string | undefined {
	return isHexColor(hex) ? hex : undefined;
}
