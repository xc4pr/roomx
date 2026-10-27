import { slopeRun } from '#lib/core/geometry.ts';
import type { Room, Slope } from '#lib/core/schema.ts';
import { STANDING_HEIGHT } from '#lib/core/export.ts';

export const DEFAULT_SLOPE = { kneeHeight: 1000, angle: 45 } as const;
export const SLOPE_ANGLES = [30, 35, 40, 45, 60] as const;
export const MIN_ANGLE = 5;
export const MAX_ANGLE = 85;

export type SlopeInfo =
	| { kind: 'none' }
	| { kind: 'full'; full: number }
	| { kind: 'standingAtWall'; full: number }
	| { kind: 'standing'; full: number; standing: number };

export function slopeInfo(room: Pick<Room, 'height'>, slope: Slope): SlopeInfo {
	const full = Math.round(slopeRun(room, slope));
	if (full < 1) return { kind: 'none' };
	if (STANDING_HEIGHT > room.height) return { kind: 'full', full };
	if (slope.kneeHeight >= STANDING_HEIGHT) return { kind: 'standingAtWall', full };
	const tangent = Math.tan((slope.angle * Math.PI) / 180);
	return {
		kind: 'standing',
		full,
		standing: Math.round((STANDING_HEIGHT - slope.kneeHeight) / tangent)
	};
}

export function defaultSlope(room: Pick<Room, 'height'>): { kneeHeight: number; angle: number } {
	return {
		kneeHeight: Math.min(DEFAULT_SLOPE.kneeHeight, Math.max(0, room.height - 100)),
		angle: DEFAULT_SLOPE.angle
	};
}

export function clampAngle(angle: number): number {
	return Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, Math.round(angle * 10) / 10));
}

// An angle in degrees with the decimal separator of the language, e.g. 43,6 in German.
export function formatAngle(angle: number, language: 'de' | 'en'): string {
	const text = String(Math.round(angle * 10) / 10);
	return language === 'de' ? text.replace('.', ',') : text;
}
