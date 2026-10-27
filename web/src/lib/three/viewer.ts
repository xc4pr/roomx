import {
	AmbientLight,
	BoxGeometry,
	Color,
	DirectionalLight,
	EdgesGeometry,
	Group,
	HemisphereLight,
	LineBasicMaterial,
	LineSegments,
	Mesh,
	MeshBasicMaterial,
	NeutralToneMapping,
	PCFShadowMap,
	PerspectiveCamera,
	PlaneGeometry,
	PointLight,
	Plane,
	Quaternion,
	Raycaster,
	Scene,
	TOUCH,
	Vector2,
	Vector3,
	WebGLRenderer,
	type Object3D
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EYE_HEIGHT } from '#lib/core/defaults.ts';
import { stairContext } from '#lib/core/floors.ts';
import { ceilingHeightAt, pointInPolygon, rotate, type Vec } from '#lib/core/geometry.ts';
import type { Item } from '#lib/core/schema.ts';
import { lookup } from '#lib/catalog/index.ts';
import { degToRad, MM, toWorld } from './coords.ts';
import {
	applyWallHeight,
	setCeilingShown,
	setOverheadVisible,
	wallGroups,
	wallInfo
} from './room/index.ts';
import type { RoomInfo } from './room/index.ts';
import {
	buildItemHolder,
	buildScene,
	lampHeightFactor,
	type BuiltScene,
	type SceneLamp
} from './scene.ts';
import type {
	CameraMode,
	ContentSettings,
	FloorHit,
	FloorPickOptions,
	ItemHit,
	ItemTransform,
	SceneContent,
	SceneOptions,
	SceneViewer,
	ViewInsets
} from './types.ts';
import {
	floorSamples,
	loweredWalls,
	type FloorShape,
	type CutawayWall,
	type SightPoint
} from './viewer/cutaway.ts';
import { readCssColor } from './viewer/color.ts';
import {
	contextLost,
	contextRestored,
	contextTimeout,
	initialContext,
	lossIsRepeating,
	remainingMs,
	type ContextPhase,
	type ContextState
} from './viewer/context.ts';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic } from './viewer/easing.ts';
import { bestFitPose, shapeOfFootprints, type CameraPose, type FitShape } from './viewer/fit.ts';
import {
	clampedFloorAt,
	floorAt,
	footprintPoints,
	framesOnLevel,
	layoutBounds,
	roomToWorld,
	sceneVariant,
	worldToRoom,
	type RoomFrame,
	roomFrames
} from './viewer/layout.ts';
import { viewerClosed, viewerOpened } from './offscreen/renderer.ts';
import {
	isWeakDevice,
	pixelRatioFor,
	profileFor,
	QualityGovernor,
	type DeviceHints,
	type QualityTier
} from './viewer/quality.ts';
import {
	approach,
	bestStandPoint,
	buildWalkMap,
	moveOnMap,
	stickCurve,
	walkInputs,
	walkStep,
	type WalkMap
} from './viewer/walk.ts';

export interface ViewerStats {
	geometries: number;
	textures: number;
	programs: number;
	drawCalls: number;
	triangles: number;
	tier: QualityTier;
	pixelRatio: number;
	shadows: boolean;
}

export interface ViewerHooks {
	onContext?(phase: ContextPhase): void;
	onQuality?(tier: QualityTier): void;
}

// Walking on a storey of a project with floors. Without floors these do nothing.
export interface FloorWalking {
	// Storey to start walking on (null: the lowest shown one).
	setWalkFloor(floorId: string | null): void;
	walkFloorId(): string | undefined;
	// Moves the walker one storey up (1) or down (-1); returns the new floor id, undefined if none.
	stepWalkFloor(direction: 1 | -1): string | undefined;
}

export interface RoomxViewer extends SceneViewer, FloorWalking {
	stats(): ViewerStats;
}

interface WallState extends CutawayWall {
	roomId: string;
	group: Object3D;
	low: number;
	current: number;
	target: number;
	delay: number;
	grow: number;
}

interface Tween {
	from: CameraPose;
	to: CameraPose;
	start: number;
	duration: number;
}

interface ItemAnim {
	holder: Group;
	kind: 'pop' | 'vanish';
	start: number;
	duration: number;
	onDone?: () => void;
}

interface Flight {
	fromPosition: Vector3;
	toPosition: Vector3;
	fromQuaternion: Quaternion;
	toQuaternion: Quaternion;
	fromFov: number;
	toFov: number;
	start: number;
	duration: number;
	done: () => void;
}

const GROWTH_MS = 650;
const WALL_STAGGER_MS = 45;
const WALL_STAGGER_MAX_MS = 360;
const POP_MS = 340;
const VANISH_MS = 170;
const LOW_WALL_METERS = 0.1;
const MAX_LAMP_LIGHTS = 4;
const WALK_SPEED = 1.5;
const WALK_RADIUS = 0.22;
const EYE_CLEARANCE = 150;
const EYE_MIN = 600;
const WALK_ACCEL = 8;
const LOOK_SPEED = 0.0036;
const LOOK_FOLLOW = 22;
const TURN_SPEED = 1.7;
const FLIGHT_MS = 650;
const ORBIT_FOV = 40;
const WALK_FOV = 72;
const WALK_KEYS = new Map<string, 'forward' | 'back' | 'left' | 'right' | 'turnLeft' | 'turnRight'>(
	[
		['KeyW', 'forward'],
		['ArrowUp', 'forward'],
		['KeyS', 'back'],
		['ArrowDown', 'back'],
		['KeyA', 'left'],
		['KeyD', 'right'],
		['KeyQ', 'turnLeft'],
		['ArrowLeft', 'turnLeft'],
		['KeyE', 'turnRight'],
		['ArrowRight', 'turnRight']
	]
);

function reducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function deviceHints(): DeviceHints {
	const hints = navigator as Navigator & { deviceMemory?: number };
	return {
		deviceMemory: hints.deviceMemory,
		hardwareConcurrency: hints.hardwareConcurrency,
		coarsePointer: window.matchMedia('(pointer: coarse)').matches
	};
}

export function createViewer(
	canvas: HTMLCanvasElement,
	initial: SceneOptions,
	hooks: ViewerHooks = {}
): RoomxViewer {
	const weak = isWeakDevice(deviceHints());
	viewerOpened();
	let renderer: WebGLRenderer;
	try {
		renderer = new WebGLRenderer({
			canvas,
			antialias: !weak,
			powerPreference: 'high-performance'
		});
	} catch (error) {
		viewerClosed();
		throw error;
	}
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFShadowMap;
	renderer.shadowMap.autoUpdate = false;
	renderer.toneMapping = NeutralToneMapping;

	const scene = new Scene();
	const camera = new PerspectiveCamera(ORBIT_FOV, 1, 0.2, 160);
	camera.position.set(4, 4, 6);
	const controls = new OrbitControls(camera, canvas);
	controls.enableDamping = true;
	controls.dampingFactor = 0.14;
	controls.screenSpacePanning = false;
	controls.rotateSpeed = 0.7;
	controls.zoomSpeed = 0.9;
	controls.minDistance = 0.8;
	controls.maxDistance = 30;
	controls.minPolarAngle = 0.03;
	controls.maxPolarAngle = Math.PI / 2 - 0.03;
	controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

	const hemisphere = new HemisphereLight(0xffffff, 0xcfc6b8, 1.7);
	const fill = new AmbientLight(0xffffff, 0.15);
	const sun = new DirectionalLight(0xfff6e8, 1.9);
	sun.castShadow = true;
	const startProfile = profileFor(0, weak);
	sun.shadow.mapSize.set(startProfile.shadowMapSize, startProfile.shadowMapSize);
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.03;
	sun.shadow.radius = 4;
	sun.shadow.blurSamples = 12;
	sun.shadow.intensity = 0.75;
	scene.add(hemisphere, fill, sun, sun.target);

	let options: SceneOptions = { ...initial };
	let content: SceneContent | null = null;
	let built: BuiltScene | null = null;
	let frames: RoomFrame[] = [];
	let walls: WallState[] = [];
	let lamps: SceneLamp[] = [];
	let lampLights: PointLight[] = [];
	let lampAnchor = new Vector3();
	let samples: SightPoint[] = [];
	let floors: FloorShape[][] = [];
	let walkMap: WalkMap | null = null;
	let walkLevel = 0;
	let walkPreferred: string | null = null;
	let mode: CameraMode = 'orbit';
	let controlsEnabled = true;
	let disposed = false;
	let rafId = 0;
	let lastTime = 0;
	let needsRender = true;
	let shadowDirty = true;
	let cameraDirty = true;
	let growth: { start: number } | null = null;
	let growthDone = true;
	let anims: ItemAnim[] = [];
	let tween: Tween | null = null;
	let flight: Flight | null = null;
	let selectedId: string | null = null;
	let selectionMark: Group | null = null;
	let layoutBox = layoutBounds([]);
	let fitShape: FitShape = shapeOfFootprints([], 2.5);
	let accent = new Color('#09845d');
	let insets: Required<ViewInsets> = { top: 0, right: 0, bottom: 0, left: 0 };
	let autoFit = true;
	let viewWidth = 1;
	let viewHeight = 1;
	let contextState: ContextState = initialContext();
	let contextTimer: ReturnType<typeof setTimeout> | undefined;
	const governor = new QualityGovernor();

	const walk = {
		yaw: 0,
		pitch: 0,
		yawTarget: 0,
		pitchTarget: 0,
		x: 0,
		z: 0,
		vForward: 0,
		vStrafe: 0,
		input: { forward: 0, strafe: 0 },
		keys: new Set<'forward' | 'back' | 'left' | 'right' | 'turnLeft' | 'turnRight'>(),
		saved: null as { pose: CameraPose; fov: number } | null,
		pointer: null as { id: number; x: number; y: number } | null
	};

	const raycaster = new Raycaster();
	const ndc = new Vector2();
	const floorPlane = new Plane(new Vector3(0, 1, 0), 0);
	const poseCamera = new PerspectiveCamera();

	function applyTheme(): void {
		renderer.setClearColor(readCssColor(canvas, '--color-bg', '#f6f5f2'));
		accent = readCssColor(canvas, '--color-accent', '#09845d');
		if (selectionMark) {
			setSelectedItem(selectedId);
		}
		needsRender = true;
	}

	function schedule(): void {
		if (!rafId && !disposed) rafId = requestAnimationFrame(frame);
	}

	function requestRender(): void {
		needsRender = true;
		schedule();
	}

	function applyViewport(): void {
		const inset = mode === 'walk' ? { top: 0, right: 0, bottom: 0, left: 0 } : insets;
		const visibleWidth = Math.max(80, viewWidth - inset.left - inset.right);
		const visibleHeight = Math.max(80, viewHeight - inset.top - inset.bottom);
		if (inset.top + inset.right + inset.bottom + inset.left === 0) {
			camera.clearViewOffset();
			camera.aspect = viewWidth / viewHeight;
		} else {
			camera.aspect = visibleWidth / visibleHeight;
			camera.setViewOffset(
				visibleWidth,
				visibleHeight,
				-inset.left,
				-inset.top,
				viewWidth,
				viewHeight
			);
		}
		camera.updateProjectionMatrix();
	}

	function resize(): void {
		const host = canvas.parentElement ?? canvas;
		viewWidth = Math.max(1, host.clientWidth);
		viewHeight = Math.max(1, host.clientHeight);
		renderer.setPixelRatio(
			pixelRatioFor(viewWidth, viewHeight, window.devicePixelRatio, profileFor(governor.tier, weak))
		);
		renderer.setSize(viewWidth, viewHeight, false);
		applyViewport();
		if (autoFit && mode === 'orbit' && !tween && content && !growth) {
			const pose = bestFitPose(fitShape, camera.fov, camera.aspect);
			setPose(pose);
		}
		requestRender();
	}

	function applyQuality(): void {
		const profile = profileFor(governor.tier, weak);
		if (profile.shadows) {
			if (!sun.castShadow || sun.shadow.mapSize.x !== profile.shadowMapSize) {
				sun.shadow.dispose();
				sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
				sun.castShadow = true;
				shadowDirty = true;
			}
		} else if (sun.castShadow) {
			sun.castShadow = false;
			sun.shadow.dispose();
		}
		resize();
	}

	function render(): void {
		if (shadowDirty) {
			renderer.shadowMap.needsUpdate = true;
			shadowDirty = false;
		}
		renderer.render(scene, camera);
	}

	function lowFactor(roomHeightM: number): number {
		return Math.min(1, LOW_WALL_METERS / Math.max(roomHeightM, 0.5));
	}

	function targetFor(state: WallState, lowered: Set<string> | null): number {
		if (mode === 'walk' || options.wallMode === 'up') return 1;
		if (options.wallMode === 'down') return state.low;
		return lowered?.has(state.key) ? state.low : 1;
	}

	function refreshTargets(snap = false): void {
		const lowered =
			options.wallMode === 'cutaway' && mode === 'orbit' && !flight
				? loweredWalls(walls, camera.position, 0.05, controls.target, samples, floors)
				: null;
		let changed = false;
		for (const state of walls) {
			const target = targetFor(state, lowered);
			if (target !== state.target) {
				state.target = target;
				changed = true;
			}
			if (snap) state.current = target;
		}
		if (changed || snap) requestRender();
	}

	function applyCeilings(): void {
		const shown = options.ceiling || mode === 'walk';
		for (const group of built?.roomGroups.values() ?? []) {
			if (group.children[0]) setCeilingShown(group.children[0], shown);
		}
		shadowDirty = true;
		needsRender = true;
	}

	function applyWalls(): void {
		const rooms = new Map<string, boolean>();
		for (const state of walls) {
			applyWallHeight(state.group, state.current * state.grow);
			if (state.current >= 0.95) rooms.set(state.roomId, true);
		}
		for (const group of built?.roomGroups.values() ?? []) {
			const info = group.children[0]?.userData as RoomInfo | undefined;
			if (!info) continue;
			const walled = wallGroups(group.children[0]).length > 0;
			const raised = walled ? rooms.get(info.roomId) === true : options.wallMode !== 'down';
			setOverheadVisible(group.children[0], growthDone && raised);
		}
		shadowDirty = true;
	}

	function stepWalls(now: number, dt: number): boolean {
		let busy = false;
		let moved = false;
		if (growth) {
			let pending = false;
			for (const state of walls) {
				const t = (now - growth.start - state.delay) / GROWTH_MS;
				state.grow = easeOutCubic(t);
				if (t < 1) pending = true;
			}
			if (!pending) {
				growth = null;
				growthDone = true;
				for (const state of walls) state.grow = 1;
			}
			busy = moved = true;
		}
		const blend = 1 - Math.exp(-dt * 12);
		for (const state of walls) {
			if (state.current === state.target) continue;
			const next = state.current + (state.target - state.current) * blend;
			state.current = Math.abs(next - state.target) < 0.002 ? state.target : next;
			moved = true;
			if (state.current !== state.target) busy = true;
		}
		if (moved) {
			applyWalls();
			needsRender = true;
		}
		return busy;
	}

	function stepItems(now: number): boolean {
		if (anims.length === 0) return false;
		let pending = false;
		const finished: ItemAnim[] = [];
		for (const anim of anims) {
			const t = (now - anim.start) / anim.duration;
			if (t >= 1) {
				finished.push(anim);
				continue;
			}
			pending = true;
			if (anim.kind === 'pop') {
				anim.holder.visible = t > 0;
				anim.holder.scale.setScalar(Math.max(0.0001, easeOutBack(t)));
			} else {
				anim.holder.scale.setScalar(Math.max(0.0001, 1 - easeInCubic(t)));
			}
		}
		if (finished.length > 0) {
			anims = anims.filter((anim) => !finished.includes(anim));
			for (const anim of finished) {
				if (anim.kind === 'pop') {
					anim.holder.scale.setScalar(1);
					anim.holder.visible = true;
				}
				anim.onDone?.();
			}
		}
		shadowDirty = true;
		needsRender = true;
		return pending;
	}

	function stepTween(now: number): boolean {
		if (!tween) return false;
		const t = clamp01((now - tween.start) / tween.duration);
		const eased = easeOutCubic(t);
		camera.position.lerpVectors(tween.from.position, tween.to.position, eased);
		controls.target.lerpVectors(tween.from.target, tween.to.target, eased);
		controls.update();
		if (t >= 1) tween = null;
		needsRender = true;
		return tween !== null;
	}

	function stepFlight(now: number): boolean {
		if (!flight) return false;
		const active = flight;
		const t = clamp01((now - active.start) / active.duration);
		const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
		camera.position.lerpVectors(active.fromPosition, active.toPosition, eased);
		camera.quaternion.slerpQuaternions(active.fromQuaternion, active.toQuaternion, eased);
		camera.fov = active.fromFov + (active.toFov - active.fromFov) * eased;
		camera.updateProjectionMatrix();
		needsRender = true;
		if (t >= 1) {
			flight = null;
			active.done();
			return false;
		}
		return true;
	}

	function currentPose(): CameraPose {
		return { position: camera.position.clone(), target: controls.target.clone() };
	}

	function setPose(pose: CameraPose): void {
		camera.position.copy(pose.position);
		controls.target.copy(pose.target);
		controls.update();
	}

	function poseQuaternion(pose: CameraPose): Quaternion {
		poseCamera.position.copy(pose.position);
		poseCamera.up.set(0, 1, 0);
		poseCamera.lookAt(pose.target);
		return poseCamera.quaternion.clone();
	}

	function fitCamera(animate: boolean, intro: boolean): void {
		const pose = bestFitPose(fitShape, camera.fov, camera.aspect);
		const radius = Math.max(4, layoutBox.getSize(new Vector3()).length());
		controls.maxDistance = Math.max(12, radius * 3);
		autoFit = true;
		if (reducedMotion() || (!animate && !intro)) {
			tween = null;
			setPose(pose);
		} else {
			const from: CameraPose = intro
				? {
						position: pose.target
							.clone()
							.add(pose.position.clone().sub(pose.target).multiplyScalar(1.45)),
						target: pose.target.clone()
					}
				: currentPose();
			setPose(from);
			tween = { from, to: pose, start: performance.now(), duration: intro ? 1250 : 600 };
		}
		cameraDirty = true;
		requestRender();
	}

	function clampTarget(): void {
		const margin = 1.5;
		const target = controls.target;
		const x = Math.min(layoutBox.max.x + margin, Math.max(layoutBox.min.x - margin, target.x));
		const z = Math.min(layoutBox.max.z + margin, Math.max(layoutBox.min.z - margin, target.z));
		const y = Math.min(Math.max(3, layoutBox.max.y), Math.max(0, target.y));
		const dx = x - target.x;
		const dy = y - target.y;
		const dz = z - target.z;
		if (dx === 0 && dy === 0 && dz === 0) return;
		target.add(new Vector3(dx, dy, dz));
		camera.position.add(new Vector3(dx, dy, dz));
	}

	function fitLights(): void {
		const center = layoutBox.isEmpty() ? new Vector3() : layoutBox.getCenter(new Vector3());
		const size = layoutBox.isEmpty() ? new Vector3(4, 2.5, 3) : layoutBox.getSize(new Vector3());
		const radius = Math.max(2, Math.hypot(size.x, size.y, size.z) / 2);
		sun.position
			.copy(center)
			.add(new Vector3(-0.45, 1.1, 0.8).normalize().multiplyScalar(radius * 2));
		sun.target.position.copy(center);
		const shadowCamera = sun.shadow.camera;
		shadowCamera.left = -radius;
		shadowCamera.right = radius;
		shadowCamera.top = radius;
		shadowCamera.bottom = -radius;
		shadowCamera.near = 0.1;
		shadowCamera.far = radius * 4.5;
		shadowCamera.updateProjectionMatrix();
		sun.target.updateMatrixWorld();
	}

	function eyeY(): number {
		for (const frame of walkFrames()) {
			const local = worldToRoom(frame, walk.x, walk.z);
			if (!pointInPolygon(local, frame.room.polygon)) continue;
			const clear = ceilingHeightAt(frame.room, local) - EYE_CLEARANCE;
			return (frame.level + Math.max(EYE_MIN, Math.min(EYE_HEIGHT, clear))) * MM;
		}
		return (walkLevel + EYE_HEIGHT) * MM;
	}

	function walkFrames(): RoomFrame[] {
		return framesOnLevel(frames, walkLevel);
	}

	function placeLamps(): void {
		const anchor = mode === 'walk' ? new Vector3(walk.x, eyeY(), walk.z) : controls.target;
		lampAnchor.copy(anchor);
		const ordered = [...lamps].sort(
			(a, b) =>
				(a.x - anchor.x) ** 2 +
				(a.z - anchor.z) ** 2 -
				((b.x - anchor.x) ** 2 + (b.z - anchor.z) ** 2)
		);
		ordered
			.slice(0, lampLights.length)
			.forEach((lamp, index) => lampLights[index].position.set(lamp.x, lamp.y, lamp.z));
	}

	function syncLights(): void {
		const lit = options.lightsOn;
		hemisphere.intensity = lit ? 0.5 : 1.7;
		hemisphere.color.set(lit ? 0xd3daf0 : 0xffffff);
		hemisphere.groundColor.set(lit ? 0x8f8378 : 0xcfc6b8);
		fill.intensity = lit ? 0.06 : 0.15;
		sun.intensity = lit ? 0.3 : 1.9;
		sun.color.set(lit ? 0xc4cffa : 0xfff6e8);
		const wanted = lit ? Math.min(MAX_LAMP_LIGHTS, lamps.length) : 0;
		while (lampLights.length > wanted) {
			const light = lampLights.pop();
			if (light) scene.remove(light);
		}
		while (lampLights.length < wanted) {
			const light = new PointLight(0xffc48c, 4.5, 0, 2);
			lampLights.push(light);
			scene.add(light);
		}
		placeLamps();
	}

	function clearSelection(): void {
		if (!selectionMark) return;
		selectionMark.traverse((object) => {
			const holder = object as Object3D & {
				geometry?: { dispose(): void };
				material?: { dispose(): void };
			};
			holder.geometry?.dispose();
			holder.material?.dispose();
		});
		selectionMark.removeFromParent();
		selectionMark = null;
	}

	function setSelectedItem(itemId: string | null): void {
		clearSelection();
		selectedId = itemId;
		const holder = itemId ? built?.itemObjects.get(itemId) : undefined;
		if (holder) {
			const dims = holder.userData.dims as { w: number; d: number; h: number };
			const w = dims.w * MM;
			const d = dims.d * MM;
			const h = dims.h * MM;
			const mark = new Group();
			mark.userData.noPick = true;
			const edges = new LineSegments(
				new EdgesGeometry(new BoxGeometry(w + 0.02, h + 0.02, d + 0.02)),
				new LineBasicMaterial({
					color: accent,
					transparent: true,
					opacity: 0.85,
					depthTest: false
				})
			);
			edges.position.y = h / 2;
			edges.renderOrder = 10;
			const decal = new Mesh(
				new PlaneGeometry(w + 0.06, d + 0.06),
				new MeshBasicMaterial({
					color: accent,
					transparent: true,
					opacity: 0.22,
					depthWrite: false,
					polygonOffset: true,
					polygonOffsetFactor: -2,
					polygonOffsetUnits: -2
				})
			);
			decal.rotation.x = -Math.PI / 2;
			decal.position.y = 0.01;
			decal.renderOrder = 9;
			for (const child of [edges, decal]) {
				child.raycast = () => {};
				mark.add(child);
			}
			holder.add(mark);
			selectionMark = mark;
		}
		requestRender();
	}

	function updateLayout(): void {
		frames = content ? roomFrames(content) : [];
		layoutBox = layoutBounds(frames);
		fitShape = shapeOfFootprints(
			footprintPoints(frames),
			Math.max(0, ...frames.map((frame) => frame.room.height * MM))
		);
		samples = frames.flatMap((frame) =>
			floorSamples(frame.room.polygon, (point) => {
				const world = roomToWorld(frame, point);
				return { x: world.x, z: world.z };
			}).map((sample) => ({ ...sample, y: (sample.y ?? 0) + frame.origin.y }))
		);
		floors = frames.map((frame) =>
			frame.room.polygon.map((point) => {
				const world = roomToWorld(frame, point);
				return { x: world.x, y: frame.origin.y, z: world.z };
			})
		);
		walkMap = null;
	}

	function activeItems(): Item[] {
		if (!content) return [];
		return sceneVariant(content)?.items ?? [];
	}

	function patchItems(patches: Map<string, Partial<Item>>): void {
		if (!content) return;
		const variant = sceneVariant(content);
		if (!variant) return;
		content = {
			...content,
			project: {
				...content.project,
				variants: content.project.variants.map((candidate) =>
					candidate.id === variant.id
						? {
								...candidate,
								items: candidate.items.map((item) =>
									patches.has(item.id) ? { ...item, ...patches.get(item.id) } : item
								)
							}
						: candidate
				)
			}
		};
	}

	function rebuild(settings: ContentSettings): void {
		const previous = new Map(walls.map((state) => [state.key, state.current]));
		const animate = settings.animate === true && !reducedMotion();
		governor.reset(performance.now());
		clearSelection();
		if (built) {
			scene.remove(built.root);
			built.dispose();
			built = null;
		}
		walls = [];
		anims = [];
		if (!content) return;
		built = buildScene(content, options, lookup, 1);
		scene.add(built.root);
		lamps = (built.root.userData.lamps as SceneLamp[] | undefined) ?? [];
		const axis = new Vector3(0, 1, 0);
		for (const frame of frames) {
			const group = built.roomGroups.get(frame.room.id);
			const roomObject = group?.children[0];
			if (!group || !roomObject) continue;
			for (const wall of wallGroups(roomObject)) {
				const info = wallInfo(wall);
				const center = group.localToWorld(new Vector3(info.center.x, 0, info.center.z));
				const outward = new Vector3(info.outward.x, 0, info.outward.z).applyAxisAngle(
					axis,
					frame.rotationY
				);
				const key = `${frame.room.id}:${info.wall}`;
				const state: WallState = {
					key,
					roomId: frame.room.id,
					group: wall,
					center: { x: center.x, z: center.z },
					outward: { x: outward.x, z: outward.z },
					half: info.half,
					height: info.height,
					base: frame.origin.y,
					low: lowFactor(frame.room.height * MM),
					current: previous.get(key) ?? 1,
					target: 1,
					delay: Math.min(walls.length * WALL_STAGGER_MS, WALL_STAGGER_MAX_MS),
					grow: 1
				};
				walls.push(state);
			}
		}
		refreshTargets();
		if (animate) {
			for (const state of walls) {
				state.current = state.target;
				state.grow = 0;
			}
			const start = performance.now();
			growth = { start };
			growthDone = false;
			const holders = [...built.itemObjects.values()].sort(
				(a, b) => a.position.y - b.position.y || a.position.x - b.position.x
			);
			const popStart = start + WALL_STAGGER_MAX_MS + GROWTH_MS * 0.55;
			const stagger = Math.min(55, 700 / Math.max(1, holders.length));
			holders.forEach((holder, index) => {
				holder.visible = false;
				holder.scale.setScalar(0.0001);
				anims.push({
					holder,
					kind: 'pop',
					start: popStart + index * stagger,
					duration: POP_MS + 60
				});
			});
		} else {
			growth = null;
			growthDone = true;
			for (const state of walls) {
				if (!previous.has(state.key)) state.current = state.target;
			}
		}
		applyCeilings();
		applyWalls();
		fitLights();
		syncLights();
		if (selectedId) setSelectedItem(selectedId);
		for (const id of settings.pop ?? []) popItem(id);
		shadowDirty = true;
		requestRender();
	}

	function popItem(itemId: string): void {
		const holder = built?.itemObjects.get(itemId);
		if (!holder || reducedMotion()) return;
		anims = anims.filter((anim) => anim.holder !== holder);
		holder.scale.setScalar(0.0001);
		anims.push({ holder, kind: 'pop', start: performance.now(), duration: POP_MS });
		requestRender();
	}

	function roomGroupFor(roomId: string): Group | undefined {
		return built?.roomGroups.get(roomId);
	}

	function lampFor(item: Item): { height: number } | null {
		const holder = built?.itemObjects.get(item.id);
		const model = holder?.userData.model as Parameters<typeof lampHeightFactor>[0] | undefined;
		const factor = model ? lampHeightFactor(model) : undefined;
		return factor === undefined ? null : { height: item.dims.h * MM * factor };
	}

	function updateLamp(item: Item, holder: Group): void {
		const lamp = lamps.find((candidate) => candidate.itemId === item.id);
		const group = holder.parent;
		if (!lamp || !group) return;
		const world = group.localToWorld(
			holder.position.clone().add(new Vector3(0, lamp.height ?? 0, 0))
		);
		lamp.x = world.x;
		lamp.y = world.y;
		lamp.z = world.z;
	}

	function setHolderTransform(holder: Group, transform: ItemTransform): void {
		holder.position.copy(toWorld({ x: transform.x, y: transform.y }, transform.elevation));
		holder.rotation.y = degToRad(transform.rotation);
		if (transform.roomId) {
			const group = roomGroupFor(transform.roomId);
			if (group && holder.parent !== group) group.add(holder);
		}
	}

	function moveItem(itemId: string, transform: ItemTransform): void {
		if (disposed || !built) return;
		const items = activeItems();
		const subject = items.find((candidate) => candidate.id === itemId);
		const holder = built.itemObjects.get(itemId);
		if (!subject || !holder) return;
		const patches = new Map<string, Partial<Item>>();
		const from = {
			x: subject.x,
			y: subject.y,
			rotation: subject.rotation,
			elevation: subject.elevation
		};
		const to = {
			x: transform.x,
			y: transform.y,
			rotation: transform.rotation,
			elevation: transform.elevation
		};
		const roomId = transform.roomId ?? subject.roomId;
		patches.set(itemId, {
			...to,
			roomId,
			...(transform.onItemId === undefined ? {} : { onItemId: transform.onItemId ?? undefined })
		});
		setHolderTransform(holder, { ...to, roomId });
		const carry = (carrierId: string): void => {
			for (const child of items.filter((candidate) => candidate.onItemId === carrierId)) {
				const local = rotate(
					{ x: child.x - from.x, y: child.y - from.y },
					to.rotation - from.rotation
				);
				const next = {
					x: to.x + local.x,
					y: to.y + local.y,
					rotation: child.rotation + to.rotation - from.rotation,
					elevation: child.elevation + to.elevation - from.elevation,
					roomId
				};
				patches.set(child.id, next);
				const childHolder = built?.itemObjects.get(child.id);
				if (childHolder) setHolderTransform(childHolder, next);
				carry(child.id);
			}
		};
		carry(itemId);
		patchItems(patches);
		for (const item of activeItems()) {
			if (!patches.has(item.id)) continue;
			const target = built.itemObjects.get(item.id);
			if (target) updateLamp(item, target);
		}
		if (lamps.some((lamp) => lamp.itemId && patches.has(lamp.itemId))) placeLamps();
		shadowDirty = true;
		requestRender();
	}

	function addItem(item: Item, settings: { pop?: boolean } = {}): void {
		if (disposed || !built || !content) return;
		const group = roomGroupFor(item.roomId);
		const variant = sceneVariant(content);
		if (!group || !variant || built.itemObjects.has(item.id)) return;
		const { holder } = buildItemHolder(item, lookup);
		group.add(holder);
		built.itemObjects.set(item.id, holder);
		content = {
			...content,
			project: {
				...content.project,
				variants: content.project.variants.map((candidate) =>
					candidate.id === variant.id
						? { ...candidate, items: [...candidate.items, item] }
						: candidate
				)
			}
		};
		const lamp = lampFor(item);
		if (lamp) {
			const world = group.localToWorld(holder.position.clone().add(new Vector3(0, lamp.height, 0)));
			lamps.push({ x: world.x, y: world.y, z: world.z, itemId: item.id, height: lamp.height });
			syncLights();
		}
		if (selectedId === item.id) setSelectedItem(item.id);
		if (settings.pop) popItem(item.id);
		shadowDirty = true;
		requestRender();
	}

	function removeItem(itemId: string, settings: { animate?: boolean } = {}): void {
		if (disposed || !built || !content) return;
		const holder = built.itemObjects.get(itemId);
		const variant = sceneVariant(content);
		if (!holder || !variant) return;
		built.itemObjects.delete(itemId);
		content = {
			...content,
			project: {
				...content.project,
				variants: content.project.variants.map((candidate) =>
					candidate.id === variant.id
						? { ...candidate, items: candidate.items.filter((item) => item.id !== itemId) }
						: candidate
				)
			}
		};
		if (selectedId === itemId) clearSelection();
		if (lamps.some((lamp) => lamp.itemId === itemId)) {
			lamps = lamps.filter((lamp) => lamp.itemId !== itemId);
			syncLights();
		}
		anims = anims.filter((anim) => anim.holder !== holder);
		const finish = () => {
			holder.removeFromParent();
			shadowDirty = true;
			requestRender();
		};
		if (settings.animate === false || reducedMotion()) finish();
		else {
			anims.push({
				holder,
				kind: 'vanish',
				start: performance.now(),
				duration: VANISH_MS,
				onDone: finish
			});
		}
		requestRender();
	}

	function standFrame(): RoomFrame | undefined {
		const lowest = Math.min(...frames.map((frame) => frame.level));
		const preferred = frames.filter((frame) => frame.floorId === walkPreferred);
		const pool = preferred.length > 0 ? preferred : framesOnLevel(frames, lowest);
		return (
			pool.find(
				(candidate) => floorAt([candidate], controls.target.x, controls.target.z) !== null
			) ?? pool[0]
		);
	}

	// Where the walker lands on the new storey (walkLevel is already the new one).
	function walkFloorSpot(
		fromId: string | undefined,
		toId: string | undefined,
		up: boolean
	): { x: number; z: number } | undefined {
		const candidates: Vec[] = [];
		for (const stair of content?.project.stairs ?? []) {
			const context = content ? stairContext(content.project, stair) : undefined;
			if (!context) continue;
			if (up && context.from.id === fromId && context.to.id === toId) {
				const { from, to } = context.layout.arrival;
				const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
				const last = context.layout.treads[context.layout.treads.length - 1].polygon;
				const back = {
					x: last.reduce((sum, p) => sum + p.x, 0) / last.length,
					y: last.reduce((sum, p) => sum + p.y, 0) / last.length
				};
				const length = Math.hypot(middle.x - back.x, middle.y - back.y) || 1;
				candidates.push({
					x: middle.x + ((middle.x - back.x) / length) * 500,
					y: middle.y + ((middle.y - back.y) / length) * 500
				});
			}
			if (!up && context.to.id === fromId && context.from.id === toId) {
				const behind = rotate({ x: 0, y: -500 }, stair.rotation);
				candidates.push({ x: stair.x + behind.x, y: stair.y + behind.y });
			}
		}
		const target = framesOnLevel(frames, walkLevel);
		for (const board of candidates) {
			const world = toWorld(board);
			if (floorAt(target, world.x, world.z)) return { x: world.x, z: world.z };
		}
		if (floorAt(target, walk.x, walk.z)) return { x: walk.x, z: walk.z };
		const frame = target[0];
		if (!frame) return undefined;
		const spot = bestStandPoint(frame.room.polygon, WALK_RADIUS / MM) ?? frame.room.polygon[0];
		const world = roomToWorld(frame, spot);
		return { x: world.x, z: world.z };
	}

	function enterWalk(): void {
		const frame = standFrame();
		if (!frame) return;
		walkLevel = frame.level;
		walkMap = null;
		const spot = bestStandPoint(frame.room.polygon, WALK_RADIUS / MM) ?? frame.room.polygon[0];
		const world = roomToWorld(frame, spot);
		walkMap ??= buildWalkMap(walkInputs(walkFrames(), content?.project), WALK_RADIUS);
		walk.saved = { pose: currentPose(), fov: camera.fov };
		walk.x = world.x;
		walk.z = world.z;
		walk.vForward = 0;
		walk.vStrafe = 0;
		const windowElement = frame.room.elements.find((element) => element.kind === 'window');
		const aimKey = `${frame.room.id}:${windowElement && 'wall' in windowElement ? windowElement.wall : 3}`;
		const aimWall = walls.find((state) => state.key === aimKey);
		const aim = aimWall?.center ?? { x: world.x, z: world.z - 1 };
		walk.yaw = Math.atan2(-(aim.x - world.x), -(aim.z - world.z));
		walk.pitch = 0;
		walk.yawTarget = walk.yaw;
		walk.pitchTarget = 0;
		const fromPosition = camera.position.clone();
		const fromQuaternion = camera.quaternion.clone();
		const fromFov = camera.fov;
		mode = 'walk';
		applyCeilings();
		autoFit = false;
		tween = null;
		controls.enabled = false;
		camera.near = 0.05;
		applyViewport();
		camera.rotation.order = 'YXZ';
		const toPosition = new Vector3(walk.x, eyeY(), walk.z);
		camera.position.copy(toPosition);
		camera.rotation.set(0, walk.yaw, 0, 'YXZ');
		const toQuaternion = camera.quaternion.clone();
		camera.position.copy(fromPosition);
		camera.quaternion.copy(fromQuaternion);
		if (reducedMotion()) {
			camera.fov = WALK_FOV;
			camera.updateProjectionMatrix();
			placeWalker();
		} else {
			flight = {
				fromPosition,
				toPosition,
				fromQuaternion,
				toQuaternion,
				fromFov,
				toFov: WALK_FOV,
				start: performance.now(),
				duration: FLIGHT_MS,
				done: () => placeWalker()
			};
		}
		placeLamps();
		refreshTargets();
		requestRender();
	}

	function leaveWalk(): void {
		const saved = walk.saved;
		mode = 'orbit';
		applyCeilings();
		walk.input = { forward: 0, strafe: 0 };
		walk.keys.clear();
		walk.pointer = null;
		walk.saved = null;
		const finish = () => {
			flight = null;
			camera.fov = saved?.fov ?? ORBIT_FOV;
			camera.near = 0.2;
			camera.rotation.order = 'XYZ';
			applyViewport();
			if (saved) setPose(saved.pose);
			controls.enabled = controlsEnabled;
			cameraDirty = true;
			placeLamps();
			refreshTargets();
			requestRender();
		};
		controls.enabled = false;
		refreshTargets();
		if (saved && !reducedMotion()) {
			flight = {
				fromPosition: camera.position.clone(),
				toPosition: saved.pose.position.clone(),
				fromQuaternion: camera.quaternion.clone(),
				toQuaternion: poseQuaternion(saved.pose),
				fromFov: camera.fov,
				toFov: saved.fov,
				start: performance.now(),
				duration: FLIGHT_MS,
				done: finish
			};
			requestRender();
		} else finish();
	}

	function placeWalker(): void {
		camera.position.set(walk.x, eyeY(), walk.z);
		camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
	}

	function walkInput(): { forward: number; strafe: number; turn: number } {
		const keys = walk.keys;
		const forward = (keys.has('forward') ? 1 : 0) - (keys.has('back') ? 1 : 0) + walk.input.forward;
		const strafe = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0) + walk.input.strafe;
		return {
			forward: Math.max(-1, Math.min(1, forward)),
			strafe: Math.max(-1, Math.min(1, strafe)),
			turn: (keys.has('turnLeft') ? 1 : 0) - (keys.has('turnRight') ? 1 : 0)
		};
	}

	function stepWalk(dt: number): boolean {
		if (mode !== 'walk' || flight) return false;
		walkMap ??= buildWalkMap(walkInputs(walkFrames(), content?.project), WALK_RADIUS);
		const input = walkInput();
		let busy = false;
		if (input.turn !== 0) {
			walk.yawTarget += input.turn * TURN_SPEED * dt;
			busy = true;
		}
		walk.vForward = approach(walk.vForward, input.forward, WALK_ACCEL, dt);
		walk.vStrafe = approach(walk.vStrafe, input.strafe, WALK_ACCEL, dt);
		if (walk.vForward !== 0 || walk.vStrafe !== 0) {
			const step = walkStep(
				walk.yaw,
				{ forward: walk.vForward, strafe: walk.vStrafe },
				WALK_SPEED,
				dt
			);
			const next = moveOnMap(
				walkMap,
				{ x: walk.x, y: walk.z },
				{ x: walk.x + step.x, y: walk.z + step.z },
				WALK_RADIUS
			);
			walk.x = next.x;
			walk.z = next.y;
			busy = true;
			if (Math.hypot(walk.x - lampAnchor.x, walk.z - lampAnchor.z) > 0.5) placeLamps();
		}
		if (walk.yaw !== walk.yawTarget || walk.pitch !== walk.pitchTarget) {
			walk.yaw = approach(walk.yaw, walk.yawTarget, LOOK_FOLLOW, dt);
			walk.pitch = approach(walk.pitch, walk.pitchTarget, LOOK_FOLLOW, dt);
			busy = true;
		}
		if (busy) {
			placeWalker();
			needsRender = true;
		}
		return busy;
	}

	function frame(now: number): void {
		rafId = 0;
		if (disposed) return;
		if (contextState.phase !== 'ok') {
			lastTime = 0;
			return;
		}
		const previous = lastTime;
		const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
		lastTime = now;
		let busy = false;
		if (tween) busy = stepTween(now) || busy;
		if (flight) busy = stepFlight(now) || busy;
		if (mode === 'orbit' && controls.enabled && !tween && !flight && controls.update()) busy = true;
		if (mode === 'walk') busy = stepWalk(dt) || busy;
		if (cameraDirty) {
			cameraDirty = false;
			refreshTargets();
		}
		busy = stepWalls(now, dt) || busy;
		busy = stepItems(now) || busy;
		if (needsRender || busy) {
			needsRender = false;
			render();
		}
		if (busy) {
			if (previous !== 0 && governor.sample(now - previous, now) !== null) {
				applyQuality();
				hooks.onQuality?.(governor.tier);
			}
			schedule();
		} else lastTime = 0;
	}

	function pointerRay(clientX: number, clientY: number): void {
		const rect = canvas.getBoundingClientRect();
		ndc.set(
			((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
			-((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
		);
		raycaster.setFromCamera(ndc, camera);
	}

	function onControlsChange(): void {
		clampTarget();
		cameraDirty = true;
		if (mode === 'orbit') placeLamps();
		requestRender();
	}

	function onControlsStart(): void {
		tween = null;
		autoFit = false;
	}

	function onPointerDown(event: PointerEvent): void {
		if (mode !== 'walk' || flight || !controlsEnabled || walk.pointer) return;
		walk.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
		canvas.setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent): void {
		const pointer = walk.pointer;
		if (!pointer || pointer.id !== event.pointerId) return;
		walk.yawTarget -= (event.clientX - pointer.x) * LOOK_SPEED;
		walk.pitchTarget = Math.max(
			-1.2,
			Math.min(1.2, walk.pitchTarget - (event.clientY - pointer.y) * LOOK_SPEED)
		);
		pointer.x = event.clientX;
		pointer.y = event.clientY;
		requestRender();
	}

	function onPointerUp(event: PointerEvent): void {
		if (walk.pointer?.id !== event.pointerId) return;
		walk.pointer = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
	}

	function editable(target: EventTarget | null): boolean {
		return (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		);
	}

	function onKeyDown(event: KeyboardEvent): void {
		const key = WALK_KEYS.get(event.code);
		if (
			mode !== 'walk' ||
			!key ||
			!controlsEnabled ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey ||
			editable(event.target)
		) {
			return;
		}
		event.preventDefault();
		walk.keys.add(key);
		schedule();
	}

	function onKeyUp(event: KeyboardEvent): void {
		const key = WALK_KEYS.get(event.code);
		if (key) walk.keys.delete(key);
	}

	function onBlur(): void {
		walk.keys.clear();
	}

	function onVisibility(): void {
		lastTime = 0;
		governor.reset(performance.now());
	}

	function setContext(next: ContextState): void {
		const changed = next.phase !== contextState.phase;
		contextState = next;
		if (changed) hooks.onContext?.(next.phase);
	}

	function onContextLost(event: Event): void {
		event.preventDefault();
		const now = performance.now();
		setContext(contextLost(contextState, now));
		clearTimeout(contextTimer);
		contextTimer = setTimeout(
			() => setContext(contextTimeout(contextState, performance.now())),
			remainingMs(contextState, now)
		);
	}

	function onContextRestored(): void {
		clearTimeout(contextTimer);
		const now = performance.now();
		const repeating = lossIsRepeating(contextState, now);
		setContext(contextRestored(contextState));
		if (repeating) governor.penalize(now);
		governor.reset(now);
		shadowDirty = true;
		cameraDirty = true;
		lastTime = 0;
		applyTheme();
		if (content) rebuild({});
		applyQuality();
		if (repeating) hooks.onQuality?.(governor.tier);
		requestRender();
	}

	const observer = new ResizeObserver(resize);
	observer.observe(canvas.parentElement ?? canvas);
	const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
	controls.addEventListener('change', onControlsChange);
	controls.addEventListener('start', onControlsStart);
	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointermove', onPointerMove);
	canvas.addEventListener('pointerup', onPointerUp);
	canvas.addEventListener('pointercancel', onPointerUp);
	canvas.addEventListener('webglcontextlost', onContextLost);
	canvas.addEventListener('webglcontextrestored', onContextRestored);
	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('keyup', onKeyUp);
	window.addEventListener('blur', onBlur);
	document.addEventListener('visibilitychange', onVisibility);
	colorScheme.addEventListener('change', applyTheme);
	applyTheme();
	resize();
	fitLights();
	syncLights();

	function sameIds(a: readonly string[], b: readonly string[]): boolean {
		return a.length === b.length && a.every((id, index) => id === b[index]);
	}

	function pickPoint(clientX: number, clientY: number, elevation: number): Vector3 | null {
		pointerRay(clientX, clientY);
		floorPlane.constant = -elevation * MM;
		return raycaster.ray.intersectPlane(floorPlane, new Vector3());
	}

	const viewer: RoomxViewer = {
		setContent(next, settings = {}) {
			if (disposed) return;
			const previous = content;
			const animate = settings.animate === true;
			const sameLayout =
				previous !== null &&
				previous.project.id === next.project.id &&
				sameIds(previous.roomIds, next.roomIds);
			content = next;
			if (mode === 'walk' && !sameLayout) leaveWalk();
			updateLayout();
			if (!sameLayout || animate) fitCamera(false, animate);
			rebuild(settings);
		},
		setOptions(patch) {
			if (disposed) return;
			const before = options;
			options = { ...options, ...patch };
			const geometryChanged =
				before.electrical !== options.electrical || before.lightsOn !== options.lightsOn;
			if (geometryChanged && content) rebuild({});
			else if (before.ceiling !== options.ceiling) applyCeilings();
			refreshTargets();
			requestRender();
		},
		setCameraMode(next) {
			if (disposed || next === mode) return;
			if (next === 'walk') enterWalk();
			else leaveWalk();
		},
		setWalkInput(move) {
			walk.input = {
				forward: stickCurve(Math.max(-1, Math.min(1, move.forward))),
				strafe: stickCurve(Math.max(-1, Math.min(1, move.strafe)))
			};
			schedule();
		},
		setWalkFloor(floorId) {
			walkPreferred = floorId;
		},
		walkFloorId() {
			return frames.find((frame) => frame.level === walkLevel)?.floorId;
		},
		stepWalkFloor(direction) {
			if (disposed || mode !== 'walk' || flight) return undefined;
			const levels = [...new Set(frames.map((frame) => frame.level))].sort((a, b) => a - b);
			const next = levels[levels.indexOf(walkLevel) + direction];
			if (next === undefined) return undefined;
			const fromId = viewer.walkFloorId();
			walkLevel = next;
			const toId = viewer.walkFloorId();
			const spot = walkFloorSpot(fromId, toId, direction > 0);
			if (!spot) {
				walkLevel = levels[levels.indexOf(next) - direction];
				return undefined;
			}
			walkMap = null;
			walk.x = spot.x;
			walk.z = spot.z;
			placeWalker();
			placeLamps();
			requestRender();
			return toId;
		},
		setSelectedItem,
		setControlsEnabled(enabled) {
			controlsEnabled = enabled;
			controls.enabled = enabled && mode === 'orbit' && !flight;
		},
		pickItem(clientX, clientY) {
			return viewer.pickItemHit(clientX, clientY)?.itemId ?? null;
		},
		pickItemHit(clientX, clientY): ItemHit | null {
			if (!built) return null;
			pointerRay(clientX, clientY);
			const hits = raycaster.intersectObjects([...built.itemObjects.values()], true);
			for (const hit of hits) {
				let object: Object3D | null = hit.object;
				while (object) {
					if (typeof object.userData.itemId === 'string') {
						return { itemId: object.userData.itemId, height: Math.max(0, hit.point.y / MM) };
					}
					object = object.parent;
				}
			}
			return null;
		},
		pickFloor(clientX, clientY, pick: FloorPickOptions = {}): FloorHit | null {
			const elevation = pick.elevation ?? 0;
			const levels = [...new Set(frames.map((frame) => frame.level))].sort((a, b) => a - b);
			if (levels.length === 0) levels.push(0);
			let best: { hit: FloorHit; distance: number } | null = null;
			for (const level of levels) {
				const point = pickPoint(clientX, clientY, elevation + level);
				const hit = point ? floorAt(framesOnLevel(frames, level), point.x, point.z) : null;
				if (!point || !hit) continue;
				const distance = point.distanceTo(raycaster.ray.origin);
				if (!best || distance < best.distance) best = { hit, distance };
			}
			if (best) return best.hit;
			if (!pick.clamp) return null;
			const level = frames.find((frame) => frame.room.id === pick.roomId)?.level ?? levels[0] ?? 0;
			let point = pickPoint(clientX, clientY, elevation + level);
			if (!point) {
				const direction = raycaster.ray.direction;
				const reach = new Vector3(direction.x, 0, direction.z).normalize().multiplyScalar(200);
				point = raycaster.ray.origin.clone().add(reach);
			}
			return clampedFloorAt(framesOnLevel(frames, level), point.x, point.z, pick.roomId);
		},
		moveItem,
		addItem,
		removeItem,
		popItem,
		setViewInsets(next) {
			if (disposed) return;
			const resolved = {
				top: Math.max(0, next.top ?? 0),
				right: Math.max(0, next.right ?? 0),
				bottom: Math.max(0, next.bottom ?? 0),
				left: Math.max(0, next.left ?? 0)
			};
			if (
				resolved.top === insets.top &&
				resolved.right === insets.right &&
				resolved.bottom === insets.bottom &&
				resolved.left === insets.left
			) {
				return;
			}
			insets = resolved;
			applyViewport();
			if (mode === 'orbit' && content) {
				const pose = bestFitPose(fitShape, camera.fov, camera.aspect);
				if (tween) tween.to = pose;
				else if (autoFit && !flight) {
					const from = currentPose();
					tween = {
						from,
						to: pose,
						start: performance.now(),
						duration: reducedMotion() ? 1 : 420
					};
				}
			}
			requestRender();
		},
		viewDirection() {
			const direction = camera.getWorldDirection(new Vector3());
			const length = Math.hypot(direction.x, direction.z) || 1;
			return { x: direction.x / length, y: -direction.z / length };
		},
		resetCamera() {
			if (mode === 'walk') leaveWalk();
			fitCamera(true, false);
		},
		requestRender,
		screenshot() {
			if (contextState.phase !== 'ok') return Promise.reject(new Error('screenshot failed'));
			render();
			return new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(blob) => (blob ? resolve(blob) : reject(new Error('screenshot failed'))),
					'image/png'
				);
			});
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			if (rafId) cancelAnimationFrame(rafId);
			clearTimeout(contextTimer);
			observer.disconnect();
			controls.removeEventListener('change', onControlsChange);
			controls.removeEventListener('start', onControlsStart);
			controls.dispose();
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('pointercancel', onPointerUp);
			canvas.removeEventListener('webglcontextlost', onContextLost);
			canvas.removeEventListener('webglcontextrestored', onContextRestored);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', onBlur);
			document.removeEventListener('visibilitychange', onVisibility);
			colorScheme.removeEventListener('change', applyTheme);
			clearSelection();
			if (built) {
				built.dispose();
				built = null;
			}
			for (const light of lampLights) scene.remove(light);
			scene.clear();
			sun.shadow.dispose();
			renderer.renderLists.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
			canvas.width = 1;
			canvas.height = 1;
			viewerClosed();
		},
		stats() {
			const { memory, render: info, programs } = renderer.info;
			return {
				geometries: memory.geometries,
				textures: memory.textures,
				programs: programs?.length ?? 0,
				drawCalls: info.calls,
				triangles: info.triangles,
				tier: governor.tier,
				pixelRatio: renderer.getPixelRatio(),
				shadows: sun.castShadow
			};
		}
	};
	return viewer;
}
