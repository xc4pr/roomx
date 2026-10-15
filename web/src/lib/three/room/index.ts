import {
	BufferGeometry,
	ExtrudeGeometry,
	Float32BufferAttribute,
	Group,
	LineBasicMaterial,
	LineSegments,
	Mesh,
	Shape,
	ShapeGeometry,
	Vector2,
	type Object3D
} from 'three';
import { ceilingHeightAt, doorSwing, wallElements, wallSlope } from '#lib/core/geometry.ts';
import type { Room } from '#lib/core/schema.ts';
import { MM } from '../coords.ts';
import type { RoomBuilder, RoomBuildOptions } from '../types.ts';
import { GeometryBuilder } from './builder.ts';
import {
	addCeilingLamp,
	addDataPort,
	addSocket,
	addSwitch,
	addWallLamp,
	type LampSink
} from './electrical.ts';
import {
	addBuiltin,
	addDoor,
	addObstacle,
	addRadiator,
	addWindow,
	type WallContext
} from './fixtures.ts';
import { fullThicknessAt, wallFrames, wallOpenings, type WallFrame } from './frames.ts';
import { MaterialSet, PALETTE } from './materials.ts';
import { Parts } from './parts.ts';
import { profileMax, roomHasSlopes, wallProfile } from './profile.ts';
import { roofEdges, roofSurface, type RoofEdge, type RoofTriangle } from './roof.ts';
import { buildWallGeometry } from './wallBody.ts';

export interface WallInfo {
	wall: number;
	center: { x: number; z: number };
	outward: { x: number; z: number };
	half: number;
	height: number;
}

export interface RoomInfo {
	roomId: string;
	height: number;
	lamps: { x: number; y: number; z: number }[];
}

const FLOOR_MARK_HEIGHT = 0.004;
const GHOST_OPACITY = 0.36;
const EDGE_COLOR = '#80796b';
const BASE_DEPTH = 0.06;

export function applyWallHeight(wall: Object3D, factor: number): void {
	const clamped = Math.max(0, Math.min(1, factor));
	wall.visible = clamped > 0.002;
	wall.scale.y = Math.max(clamped, 0.001);
	const fixtures = wall.getObjectByProperty('name', 'fixtures');
	if (fixtures) fixtures.visible = clamped > 0.35;
}

export function wallGroups(room: Object3D): Group[] {
	return room.children.filter(
		(child): child is Group => child instanceof Group && typeof child.userData.wall === 'number'
	);
}

export function wallInfo(wall: Object3D): WallInfo {
	return wall.userData as WallInfo;
}

export function setCeilingShown(room: Object3D, shown: boolean): void {
	const overhead = room.getObjectByProperty('name', 'overhead');
	for (const wall of wallGroups(room)) {
		for (const child of wall.children) {
			if (child.userData.part === 'slopeEdges') child.visible = !shown;
		}
	}
	for (const child of overhead?.children ?? []) {
		switch (child.userData.part) {
			case 'ceiling':
			case 'slope':
				child.visible = shown;
				break;
			case 'slopeGhost':
			case 'slopeEdges':
				child.visible = !shown;
				break;
		}
	}
}

export function setOverheadVisible(room: Object3D, visible: boolean): void {
	const overhead = room.getObjectByProperty('name', 'overhead');
	if (overhead) overhead.visible = visible;
}

function polygonShape(points: readonly { x: number; y: number }[]): Shape {
	return new Shape(points.map((point) => new Vector2(point.x * MM, point.y * MM)));
}

function buildWall(
	room: Room,
	frame: WallFrame,
	options: RoomBuildOptions,
	materials: MaterialSet,
	lamps: RoomInfo['lamps']
): Group {
	const group = new Group();
	group.name = `wall-${frame.number}`;
	group.position.set(frame.start.x * MM, 0, -frame.start.y * MM);
	group.rotation.y = Math.atan2(frame.direction.y, frame.direction.x);

	const openings = wallOpenings(room, frame, options.shared?.covered);
	const profile = wallProfile(room, frame);
	const wallTop = profileMax(profile);
	const wallColor = room.wallColor ?? PALETTE.wall;
	const body = new Mesh(buildWallGeometry(frame, openings, profile), [
		materials.get({ color: wallColor, roughness: 0.95 }),
		materials.get({ color: PALETTE.wallOuter, roughness: 0.95, push: true }),
		materials.get({ color: PALETTE.wallTop, roughness: 0.9 }),
		materials.get({ color: wallColor, roughness: 0.95 }),
		materials.get({ color: wallColor, roughness: 0.95, push: true })
	]);
	body.name = 'body';
	body.userData.part = 'wallBody';
	body.castShadow = true;
	body.receiveShadow = true;
	group.add(body);

	if (wallSlope(room, frame.number)) {
		const positions: number[] = [];
		for (let i = 1; i < profile.length; i++) {
			positions.push(
				profile[i - 1].u * MM,
				profile[i - 1].h * MM,
				0,
				profile[i].u * MM,
				profile[i].h * MM,
				0
			);
		}
		const kneeGeometry = new BufferGeometry();
		kneeGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
		const knee = new LineSegments(kneeGeometry, new LineBasicMaterial({ color: EDGE_COLOR }));
		knee.userData.part = 'slopeEdges';
		knee.renderOrder = 2;
		knee.visible = !options.ceiling;
		group.add(knee);
	}

	const fixtures = new Group();
	fixtures.name = 'fixtures';
	const parts = new Parts(materials);
	const wallCtx: WallContext = {
		parts,
		length: frame.length,
		thickness: frame.thickness * MM,
		height: wallTop * MM
	};
	const sink: LampSink = {
		push(u, y, z) {
			const along = u / MM;
			const out = z / MM;
			lamps.push({
				x: (frame.start.x + frame.direction.x * along - frame.inward.x * out) * MM,
				y,
				z: -(frame.start.y + frame.direction.y * along - frame.inward.y * out) * MM
			});
		}
	};
	for (const element of wallElements(room, frame.number)) {
		if (options.shared?.silent.has(element.id)) continue;
		const ctx: WallContext = {
			...wallCtx,
			thickness: fullThicknessAt(frame, element.offset + element.width / 2) * MM
		};
		switch (element.kind) {
			case 'door':
				addDoor(ctx, element);
				break;
			case 'window':
				addWindow(ctx, element);
				break;
			case 'builtin':
				addBuiltin(ctx, element);
				break;
			case 'obstacle':
				addObstacle(ctx, element);
				break;
			case 'radiator':
				addRadiator(ctx, element);
				break;
			case 'socket':
				if (options.electrical) addSocket(ctx, element);
				break;
			case 'switch':
				if (options.electrical) addSwitch(ctx, element);
				break;
			case 'dataPort':
				if (options.electrical) addDataPort(ctx, element);
				break;
			case 'wallLamp':
				if (options.electrical) addWallLamp(ctx, element, options.lightsOn, sink);
				break;
		}
	}
	parts.attach(fixtures, 'fixture');
	group.add(fixtures);

	const info: WallInfo = {
		wall: frame.number,
		center: {
			x: (frame.start.x + frame.direction.x * (frame.length / 2)) * MM,
			z: -(frame.start.y + frame.direction.y * (frame.length / 2)) * MM
		},
		outward: { x: -frame.inward.x, z: frame.inward.y },
		half: (frame.length / 2) * MM,
		height: wallTop * MM
	};
	Object.assign(group.userData, info);
	return group;
}

function buildDoorMarks(
	room: Room,
	materials: MaterialSet,
	silent: ReadonlySet<string> | undefined
): Group {
	const group = new Group();
	group.name = 'floorMarks';
	const parts = new GeometryBuilder(2);
	for (const element of room.elements) {
		if (element.kind !== 'door' || silent?.has(element.id)) continue;
		const swing = doorSwing(room.polygon, element, 16);
		if (!swing) continue;
		const outline = swing.polygon;
		const at = (point: { x: number; y: number }, scale = 1): [number, number, number] => [
			(swing.hinge.x + (point.x - swing.hinge.x) * scale) * MM,
			FLOOR_MARK_HEIGHT,
			-(swing.hinge.y + (point.y - swing.hinge.y) * scale) * MM
		];
		const arc = outline.slice(1);
		for (let i = 0; i < arc.length - 1; i++) {
			parts.triangle(0, at(swing.hinge), at(arc[i]), at(arc[i + 1]), [0, 1, 0]);
			const innerScale = Math.max(0, 1 - 0.025 / (swing.radius * MM));
			parts.quad(
				1,
				at(arc[i], innerScale),
				at(arc[i + 1], innerScale),
				at(arc[i + 1]),
				at(arc[i]),
				[0, 1, 0]
			);
		}
	}
	const geometry = parts.build();
	if (!geometry) return group;
	const mesh = new Mesh(geometry, [
		materials.get({ color: '#d9741a', opacity: 0.22, side: 'double' }),
		materials.get({ color: '#d9741a', opacity: 0.7, side: 'double' })
	]);
	mesh.renderOrder = 1;
	mesh.userData.part = 'doorSwing';
	group.add(mesh);
	return group;
}

function roofGeometry(triangles: readonly RoofTriangle[]): BufferGeometry | undefined {
	if (triangles.length === 0) return undefined;
	const builder = new GeometryBuilder(1);
	for (const [a, b, c] of triangles) {
		const at = (p: RoofTriangle[number]): [number, number, number] => [
			p.x * MM,
			p.h * MM,
			-p.y * MM
		];
		builder.triangle(0, at(a), at(b), at(c), [0, 1, 0]);
	}
	return builder.build();
}

function edgeGeometry(edges: readonly RoofEdge[]): BufferGeometry | undefined {
	if (edges.length === 0) return undefined;
	const positions: number[] = [];
	for (const { from, to } of edges) {
		positions.push(from.x * MM, from.h * MM, -from.y * MM, to.x * MM, to.h * MM, -to.y * MM);
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	return geometry;
}

function addRoof(overhead: Group, room: Room, materials: MaterialSet, ceilingShown: boolean): void {
	const surface = roofSurface(room);
	const flat = roofGeometry(surface.flat);
	if (flat) {
		const ceiling = new Mesh(
			flat,
			materials.get({ color: PALETTE.wallTop, roughness: 0.95, side: 'back' })
		);
		ceiling.userData.part = 'ceiling';
		ceiling.visible = ceilingShown;
		overhead.add(ceiling);
	}
	const sloped = roofGeometry(surface.sloped);
	if (!sloped) return;
	const color = room.wallColor ?? PALETTE.wall;
	const solid = new Mesh(sloped, materials.get({ color, roughness: 0.95, side: 'back' }));
	solid.userData.part = 'slope';
	solid.visible = ceilingShown;
	overhead.add(solid);
	const ghost = new Mesh(
		sloped,
		materials.get({ color, roughness: 0.95, opacity: GHOST_OPACITY, side: 'double' })
	);
	ghost.userData.part = 'slopeGhost';
	ghost.renderOrder = 1;
	ghost.visible = !ceilingShown;
	overhead.add(ghost);
	const lines = edgeGeometry(roofEdges(room));
	if (lines) {
		const edges = new LineSegments(lines, new LineBasicMaterial({ color: EDGE_COLOR }));
		edges.userData.part = 'slopeEdges';
		edges.renderOrder = 2;
		edges.visible = !ceilingShown;
		overhead.add(edges);
	}
}

export const buildRoom: RoomBuilder = (room: Room, options: RoomBuildOptions) => {
	const materials = new MaterialSet();
	const root = new Group();
	root.name = `room-${room.id}`;
	const lamps: RoomInfo['lamps'] = [];
	const height = room.height * MM;

	const shape = polygonShape(room.polygon);
	const floorGeometry = new ShapeGeometry(shape);
	floorGeometry.rotateX(-Math.PI / 2);
	const floor = new Mesh(
		floorGeometry,
		materials.get({ color: room.floorColor ?? PALETTE.floor, roughness: 0.85 })
	);
	floor.name = 'floor';
	floor.userData.part = 'floor';
	floor.receiveShadow = true;
	root.add(floor);

	const frames = wallFrames(room.polygon, undefined, options.sections);
	const outerShape = polygonShape(frames.map((frame) => frame.outerStart));
	const baseGeometry = new ExtrudeGeometry(outerShape, { depth: BASE_DEPTH, bevelEnabled: false });
	baseGeometry.rotateX(-Math.PI / 2);
	baseGeometry.translate(0, -BASE_DEPTH - 0.002, 0);
	const base = new Mesh(baseGeometry, materials.get({ color: PALETTE.base, roughness: 0.95 }));
	base.name = 'base';
	base.receiveShadow = true;
	root.add(base);

	root.add(buildDoorMarks(room, materials, options.shared?.silent));

	for (const frame of frames) {
		const wall = buildWall(room, frame, options, materials, lamps);
		applyWallHeight(wall, options.wallHeightFactor);
		root.add(wall);
	}

	const overhead = new Group();
	overhead.name = 'overhead';
	const roofMaterial = { color: PALETTE.wallTop, roughness: 0.95, side: 'back' } as const;
	if (roomHasSlopes(room)) {
		addRoof(overhead, room, materials, options.ceiling);
	} else {
		const ceiling = new Mesh(floorGeometry, materials.get(roofMaterial));
		ceiling.position.y = height;
		ceiling.userData.part = 'ceiling';
		ceiling.visible = options.ceiling;
		overhead.add(ceiling);
	}
	if (options.electrical) {
		const parts = new Parts(materials);
		const sink: LampSink = { push: (x, y, z) => lamps.push({ x, y, z }) };
		for (const element of room.elements) {
			if (element.kind === 'ceilingLamp') {
				const lampHeight = ceilingHeightAt(room, { x: element.x, y: element.y }) * MM;
				addCeilingLamp(parts, element, lampHeight, options.lightsOn, sink);
			}
		}
		parts.attach(overhead, 'ceilingLamp');
	}
	overhead.visible = options.wallHeightFactor >= 0.95;
	root.add(overhead);

	const info: RoomInfo = { roomId: room.id, height, lamps };
	Object.assign(root.userData, info);
	return root;
};
