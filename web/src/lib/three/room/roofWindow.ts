import { DirectionalLight, Group, Vector3 } from 'three';
import { MM } from '../coords.ts';
import { GeometryBuilder, type V3 } from './builder.ts';
import { MaterialSet, PALETTE } from './materials.ts';
import { Mesh } from 'three';
import type { RoofPoint, RoofWindowShape } from './roof.ts';

const FRAME_WIDTH = 70;
const DAYLIGHT_COLOR = 0xe8f1ff;
const DAYLIGHT_INTENSITY = 0.55;
const DAYLIGHT_DISTANCE = 4;
const BUCKET_FRAME = 0;
const BUCKET_GLASS = 1;

function world(point: RoofPoint): V3 {
	return [point.x * MM, point.h * MM, -point.y * MM];
}

function lerp(a: V3, b: V3, t: number): V3 {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function spot(corners: readonly V3[], u: number, v: number): V3 {
	return lerp(lerp(corners[0], corners[1], u), lerp(corners[3], corners[2], u), v);
}

function frameBorder(window: RoofWindowShape): { u: number; v: number } {
	const { width, length } = window.element;
	return { u: Math.min(0.3, FRAME_WIDTH / width), v: Math.min(0.3, FRAME_WIDTH / length) };
}

// Frame and glass of every roof window lie in the slope plane; the hole itself is cut out of the
// roof surface (see roofModel).
export function buildRoofWindows(
	windows: readonly RoofWindowShape[],
	materials: MaterialSet
): Mesh | undefined {
	if (windows.length === 0) return undefined;
	const builder = new GeometryBuilder(2);
	const up: V3 = [0, 1, 0];
	for (const window of windows) {
		const corners = window.corners.map(world);
		const { u: bu, v: bv } = frameBorder(window);
		const ring: [number, number][] = [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1]
		];
		const inner: [number, number][] = [
			[bu, bv],
			[1 - bu, bv],
			[1 - bu, 1 - bv],
			[bu, 1 - bv]
		];
		for (let i = 0; i < 4; i++) {
			const j = (i + 1) % 4;
			builder.quad(
				BUCKET_FRAME,
				spot(corners, ...ring[i]),
				spot(corners, ...ring[j]),
				spot(corners, ...inner[j]),
				spot(corners, ...inner[i]),
				up
			);
		}
		// Two panes beside the mullion: glass under it would share its plane and flicker.
		for (const [from, to] of [
			[bu, 0.5 - bu / 4],
			[0.5 + bu / 4, 1 - bu]
		]) {
			builder.quad(
				BUCKET_GLASS,
				spot(corners, from, bv),
				spot(corners, to, bv),
				spot(corners, to, 1 - bv),
				spot(corners, from, 1 - bv),
				up
			);
		}
		builder.quad(
			BUCKET_FRAME,
			spot(corners, 0.5 - bu / 4, bv),
			spot(corners, 0.5 + bu / 4, bv),
			spot(corners, 0.5 + bu / 4, 1 - bv),
			spot(corners, 0.5 - bu / 4, 1 - bv),
			up
		);
	}
	const geometry = builder.build();
	if (!geometry) return undefined;
	const mesh = new Mesh(geometry, [
		materials.get({ color: PALETTE.frame, roughness: 0.6, side: 'double' }),
		materials.get({
			color: PALETTE.glass,
			opacity: 0.3,
			emissive: '#d6ebff',
			emissiveIntensity: 0.55,
			roughness: 0.1,
			side: 'double'
		})
	]);
	mesh.userData.part = 'roofWindow';
	mesh.renderOrder = 1;
	return mesh;
}

// One weak directional light per room, shining through the roof windows into the room.
export function buildDaylight(windows: readonly RoofWindowShape[]): Group | undefined {
	if (windows.length === 0) return undefined;
	const centre = new Vector3();
	const normal = new Vector3();
	for (const window of windows) {
		const [c0, c1, c2, c3] = window.corners.map((corner) => new Vector3(...world(corner)));
		centre.add(c0.clone().add(c2).multiplyScalar(0.5));
		const across = c1.clone().sub(c0);
		const along = c3.clone().sub(c0);
		const facing = across.cross(along).normalize();
		normal.add(facing.y < 0 ? facing.negate() : facing);
	}
	centre.divideScalar(windows.length);
	normal.normalize();
	const group = new Group();
	group.name = 'daylight';
	const light = new DirectionalLight(DAYLIGHT_COLOR, DAYLIGHT_INTENSITY);
	light.position.copy(centre).addScaledVector(normal, DAYLIGHT_DISTANCE);
	light.target.position.copy(centre);
	group.add(light, light.target);
	return group;
}
