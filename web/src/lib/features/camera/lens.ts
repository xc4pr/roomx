export interface DeviceLike {
	deviceId: string;
	label: string;
	kind?: string;
}

export interface ZoomRange {
	min: number;
	max: number;
}

export type LensChoice =
	{ kind: 'zoom'; zoom: number } | { kind: 'device'; deviceId: string } | null;

const ULTRA_WIDE = /ultra[\s-]?wide|ultraweit|0[.,]5\s?x|ultra[\s-]?grand|超广角|超廣角/i;
const BACK = /back|rear|environment|rück|arrière|trasera|posteriore|后置|後置/i;

export function ultraWideDevice(devices: readonly DeviceLike[]): DeviceLike | null {
	const cameras = devices.filter((device) => (device.kind ?? 'videoinput') === 'videoinput');
	const wide = cameras.filter((device) => ULTRA_WIDE.test(device.label));
	return wide.find((device) => BACK.test(device.label)) ?? wide[0] ?? null;
}

export function ultraWideZoom(range: ZoomRange | undefined): number | null {
	if (!range || !(range.min < 1) || !(range.max >= 1)) return null;
	return Math.max(range.min, 0.5);
}

export function pickLens(devices: readonly DeviceLike[], range: ZoomRange | undefined): LensChoice {
	const zoom = ultraWideZoom(range);
	if (zoom !== null) return { kind: 'zoom', zoom };
	const device = ultraWideDevice(devices);
	return device ? { kind: 'device', deviceId: device.deviceId } : null;
}
