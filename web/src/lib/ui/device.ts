export const PHONE_SHORT_SIDE = 600;

export interface DeviceProbe {
	coarse: boolean;
	shortSide: number;
}

export function isPhoneLike(probe: DeviceProbe): boolean {
	return probe.coarse && probe.shortSide < PHONE_SHORT_SIDE;
}

export function readProbe(): DeviceProbe {
	if (typeof window === 'undefined' || typeof matchMedia === 'undefined') {
		return { coarse: false, shortSide: Infinity };
	}
	return {
		coarse: matchMedia('(pointer: coarse)').matches,
		shortSide: Math.min(window.screen.width, window.screen.height)
	};
}

export function keyboardLikely(): boolean {
	return !isPhoneLike(readProbe());
}
