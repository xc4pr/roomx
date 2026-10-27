import type { CeilingLamp, DataPort, Socket, Switch, WallLamp } from '#lib/core/schema.ts';
import { MM } from '../coords.ts';
import type { WallContext } from './fixtures.ts';
import { PALETTE, type MaterialSpec } from './materials.ts';
import { tinted, type Parts } from './parts.ts';

export interface LampSink {
	push(u: number, y: number, z: number): void;
}

const BEZEL = 0.007;
const PLATE = 0.013;
const SIZE = 0.1;

function backing(
	parts: Parts,
	status: Socket['status'],
	cu: number,
	cy: number,
	width: number,
	height: number,
	color: string = PALETTE.plate
): void {
	parts.box(
		tinted({ color: PALETTE.electric, roughness: 0.5 }, status),
		[cu - width / 2 - BEZEL, cy - height / 2 - BEZEL, -0.006],
		[cu + width / 2 + BEZEL, cy + height / 2 + BEZEL, 0]
	);
	parts.box(
		tinted({ color, roughness: 0.4 }, status),
		[cu - width / 2, cy - height / 2, -PLATE],
		[cu + width / 2, cy + height / 2, -0.006]
	);
}

export function addSocket(ctx: WallContext, element: Socket): void {
	const { parts } = ctx;
	const cu = (element.offset + element.width / 2) * MM;
	const cy = (element.elevation + element.height / 2) * MM;
	const pitch = Math.max(SIZE, (element.width * MM) / element.gang);
	const dark = tinted({ color: PALETTE.dark }, element.status);
	const white = tinted({ color: PALETTE.plate, roughness: 0.4 }, element.status);
	for (let i = 0; i < element.gang; i++) {
		const u = cu + (i - (element.gang - 1) / 2) * pitch;
		backing(parts, element.status, u, cy, SIZE, SIZE);
		parts.cylinder(dark, [u, cy, -PLATE - 0.001], 0.032, 0.002, 'z', 16);
		parts.cylinder(white, [u, cy, -PLATE - 0.0025], 0.027, 0.002, 'z', 16);
		parts.box(
			dark,
			[u - 0.0175, cy - 0.006, -PLATE - 0.0045],
			[u - 0.0115, cy + 0.006, -PLATE - 0.0025]
		);
		parts.box(
			dark,
			[u + 0.0115, cy - 0.006, -PLATE - 0.0045],
			[u + 0.0175, cy + 0.006, -PLATE - 0.0025]
		);
		parts.box(
			dark,
			[u - 0.004, cy + 0.016, -PLATE - 0.0045],
			[u + 0.004, cy + 0.023, -PLATE - 0.0025]
		);
		if (element.usb) {
			parts.box(
				tinted({ color: PALETTE.usb }, element.status),
				[u - 0.017, cy - 0.046, -PLATE - 0.002],
				[u + 0.017, cy - 0.036, -PLATE]
			);
		}
	}
}

export function addSwitch(ctx: WallContext, element: Switch): void {
	const { parts } = ctx;
	const cu = (element.offset + element.width / 2) * MM;
	const cy = (element.elevation + element.height / 2) * MM;
	backing(parts, element.status, cu, cy, SIZE, SIZE);
	parts.box(
		tinted({ color: '#e0ddd5', roughness: 0.5 }, element.status),
		[cu - 0.032, cy - 0.036, -PLATE - 0.008],
		[cu + 0.032, cy + 0.036, -PLATE]
	);
	parts.box(
		tinted({ color: PALETTE.dark }, element.status),
		[cu - 0.006, cy + 0.02, -PLATE - 0.0095],
		[cu + 0.006, cy + 0.026, -PLATE - 0.008]
	);
}

export function addDataPort(ctx: WallContext, element: DataPort): void {
	const { parts } = ctx;
	const cu = (element.offset + element.width / 2) * MM;
	const cy = (element.elevation + element.height / 2) * MM;
	const dark = tinted({ color: PALETTE.dark }, element.status);
	const metal = tinted({ color: '#b8bcc2', roughness: 0.3, metalness: 0.6 }, element.status);
	const both = element.portType === 'both';
	const width = both ? SIZE * 1.5 : SIZE;
	backing(parts, element.status, cu, cy, width, SIZE, '#e8eef5');
	const lan = (u: number) => {
		parts.box(dark, [u - 0.014, cy - 0.011, -PLATE - 0.0025], [u + 0.014, cy + 0.011, -PLATE]);
		parts.box(
			metal,
			[u - 0.01, cy - 0.006, -PLATE - 0.0045],
			[u + 0.01, cy + 0.006, -PLATE - 0.0025]
		);
	};
	const tv = (u: number) => {
		parts.cylinder(metal, [u, cy, -PLATE - 0.002], 0.018, 0.004, 'z', 16);
		parts.cylinder(dark, [u, cy, -PLATE - 0.0045], 0.008, 0.003, 'z', 12);
	};
	if (both) {
		tv(cu - SIZE * 0.3);
		lan(cu + SIZE * 0.3);
	} else if (element.portType === 'tv') tv(cu);
	else lan(cu);
}

export function addWallLamp(
	ctx: WallContext,
	element: WallLamp,
	lit: boolean,
	lamps: LampSink
): void {
	const { parts } = ctx;
	const cu = (element.offset + element.width / 2) * MM;
	const cy = (element.elevation + element.height / 2) * MM;
	const radius = Math.min(0.09, Math.max(0.05, (element.width * MM) / 2));
	const length = Math.min(0.24, Math.max(0.12, element.height * MM));
	parts.box(
		tinted({ color: PALETTE.electric, roughness: 0.5 }, element.status),
		[cu - 0.045, cy - 0.045, -0.006],
		[cu + 0.045, cy + 0.045, 0]
	);
	parts.box(
		tinted({ color: PALETTE.handle, metalness: 0.4, roughness: 0.4 }, element.status),
		[cu - 0.03, cy - 0.03, -0.045],
		[cu + 0.03, cy + 0.03, -0.006]
	);
	const shade: MaterialSpec = lit
		? {
				color: PALETTE.lampShade,
				emissive: PALETTE.lampGlow,
				emissiveIntensity: 1.3,
				roughness: 0.6
			}
		: { color: PALETTE.lampShade, roughness: 0.6 };
	parts.cylinder(tinted(shade, element.status), [cu, cy, -0.045 - radius], radius, length, 'y', 16);
	lamps.push(cu, cy, -0.045 - radius);
}

export function addCeilingLamp(
	parts: Parts,
	element: CeilingLamp,
	height: number,
	lit: boolean,
	lamps: LampSink
): void {
	const x = element.x * MM;
	const z = -element.y * MM;
	const shade: MaterialSpec = lit
		? {
				color: PALETTE.lampShade,
				emissive: PALETTE.lampGlow,
				emissiveIntensity: 1.5,
				roughness: 0.6
			}
		: { color: PALETTE.lampShade, roughness: 0.6 };
	parts.cylinder(
		tinted({ color: PALETTE.electric, roughness: 0.5 }, element.status),
		[x, height - 0.06, z],
		0.215,
		0.01,
		'y',
		24
	);
	parts.cylinder(tinted(shade, element.status), [x, height - 0.03, z], 0.2, 0.06, 'y', 24);
	parts.cylinder(
		tinted({ color: PALETTE.handle }, element.status),
		[x, height - 0.012, z],
		0.025,
		0.024,
		'y',
		10
	);
	lamps.push(x, height - 0.12, z);
}
