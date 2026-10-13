import { rotate, walls, type Vec } from '#lib/core/geometry.ts';
import type { Item } from '#lib/core/schema.ts';
import { store } from '#lib/state/project.svelte.ts';
import { ui } from '#lib/state/ui.svelte.ts';
import type { SceneViewer } from '#lib/three/types.ts';
import { applyPlacement, roomItems, selectItem, subjectOf, thresholdFor } from './actions.ts';
import { session } from './session.svelte.ts';
import { computePlacement, snapRotation } from './snap.ts';

const TAP_LIMIT = 8;
const DRAG_LIMIT = 5;
const PROBE_PX = 12;
const PICK_PATTERN: readonly (readonly [number, number])[] = [
	[0, 0],
	[26, 0],
	[-26, 0],
	[0, 26],
	[0, -26]
];

interface Gesture {
	mode: 'move' | 'twist';
	id: string;
	pointerId: number;
	startX: number;
	startY: number;
	grab: Vec;
	plane: number;
	roomId: string;
	moved: boolean;
	snapped: boolean;
	rotation0: number;
	angle0: number;
}

export interface Interaction3d {
	isWalking(): boolean;
}

export function attach3d(host: HTMLElement, viewer: SceneViewer, state: Interaction3d): () => void {
	let gesture: Gesture | null = null;
	let tap: { pointerId: number; x: number; y: number } | null = null;
	const touches = new Map<number, Vec>();

	function clearListeners(): void {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', up);
		window.removeEventListener('pointercancel', up);
	}

	function end(): void {
		const moved = gesture?.moved ?? false;
		gesture = null;
		touches.clear();
		clearListeners();
		host.style.cursor = '';
		viewer.setControlsEnabled(true);
		if (moved) store.sealHistory();
	}

	function twistAngle(): number | null {
		const points = [...touches.values()];
		if (points.length < 2) return null;
		return (Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x) * 180) / Math.PI;
	}

	function pushToViewer(item: Item): void {
		viewer.moveItem(item.id, {
			x: item.x,
			y: item.y,
			rotation: item.rotation,
			elevation: item.elevation,
			roomId: item.roomId,
			onItemId: item.onItemId ?? null
		});
	}

	function beginTwist(item: Item): void {
		const angle = twistAngle();
		if (angle === null) return;
		viewer.setControlsEnabled(false);
		if (!gesture) {
			gesture = {
				mode: 'twist',
				id: item.id,
				pointerId: -1,
				startX: 0,
				startY: 0,
				grab: { x: 0, y: 0 },
				plane: 0,
				roomId: item.roomId,
				moved: true,
				snapped: false,
				rotation0: item.rotation,
				angle0: angle
			};
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
			window.addEventListener('pointercancel', up);
		}
		gesture.mode = 'twist';
		gesture.angle0 = angle;
		gesture.rotation0 = item.rotation;
		gesture.moved = true;
		tap = null;
	}

	function secondFinger(event: PointerEvent): boolean {
		if (event.pointerType === 'mouse') return false;
		touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (touches.size !== 2) return false;
		const selected = ui.selectedItemId ? store.item(ui.selectedItemId) : undefined;
		if (!selected || selected.locked) return false;
		const onItem = [...touches.values()].some((point) =>
			PICK_PATTERN.some(([dx, dy]) => viewer.pickItem(point.x + dx, point.y + dy) === selected.id)
		);
		if (!gesture && !onItem) return false;
		if (gesture && gesture.id !== selected.id) return false;
		event.stopPropagation();
		beginTwist(selected);
		return true;
	}

	function down(event: PointerEvent): void {
		if (state.isWalking()) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const target = event.target as Element | null;
		if (target && target.tagName !== 'CANVAS') return;
		if (secondFinger(event)) return;
		if (gesture) return;
		if (event.pointerType !== 'mouse') {
			touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		}
		const hit = viewer.pickItemHit(event.clientX, event.clientY);
		const item = hit ? store.item(hit.itemId) : undefined;
		if (!hit || !item) {
			tap = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
			window.addEventListener('pointerup', up);
			window.addEventListener('pointercancel', up);
			return;
		}
		selectItem(item);
		if (session.panelOpen && session.tab !== 'catalog') session.tab = 'item';
		if (item.locked) return;
		const plane = hit.height;
		const floor = viewer.pickFloor(event.clientX, event.clientY, {
			clamp: true,
			roomId: item.roomId,
			elevation: plane
		});
		if (!floor) return;
		const sameRoom = floor.roomId === item.roomId;
		viewer.setControlsEnabled(false);
		host.style.cursor = 'grabbing';
		gesture = {
			mode: 'move',
			id: item.id,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			grab: sameRoom ? { x: item.x - floor.x, y: item.y - floor.y } : { x: 0, y: 0 },
			plane,
			roomId: item.roomId,
			moved: false,
			snapped: false,
			rotation0: item.rotation,
			angle0: 0
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', up);
	}

	function millimetresPerPixel(x: number, y: number, current: Gesture): number | null {
		const options = { clamp: true, roomId: current.roomId, elevation: current.plane };
		const a = viewer.pickFloor(x, y, options);
		const b = viewer.pickFloor(x + PROBE_PX, y, options);
		if (!a || !b || a.roomId !== b.roomId) return null;
		return Math.hypot(a.x - b.x, a.y - b.y) / PROBE_PX;
	}

	function twist(current: Gesture, item: Item): void {
		const angle = twistAngle();
		if (angle === null) return;
		const room = store.room(item.roomId);
		const snap = snapRotation(current.rotation0 - (angle - current.angle0), {
			walls: room ? walls(room.polygon) : [],
			itemRotations: roomItems(item.roomId, item.id).map((other) => other.rotation)
		});
		if (snap.rotation === item.rotation) return;
		if (snap.kind && !current.snapped) navigator.vibrate?.(6);
		current.snapped = snap.kind !== null;
		store.transformItem(item.id, { rotation: snap.rotation }, { coalesce: `drag3d-${item.id}` });
		const updated = store.item(item.id);
		if (updated) pushToViewer(updated);
	}

	function drag(current: Gesture, item: Item, event: PointerEvent): void {
		const floor = viewer.pickFloor(event.clientX, event.clientY, {
			clamp: true,
			roomId: current.roomId,
			elevation: current.plane
		});
		const room = floor ? store.room(floor.roomId) : undefined;
		if (!floor || !room) return;
		const switched = floor.roomId !== item.roomId;
		const origin = store.room(item.roomId);
		const turn = switched && origin ? origin.boardPos.rot - room.boardPos.rot : 0;
		if (switched) current.grab = rotate(current.grab, turn);
		const perPixel = millimetresPerPixel(event.clientX, event.clientY, current);
		const threshold = thresholdFor(perPixel ? 1 / perPixel : 0.1);
		const placement = computePlacement(
			{ ...subjectOf(item), rotation: item.rotation + turn },
			{ x: floor.x + current.grab.x, y: floor.y + current.grab.y },
			{ room, others: roomItems(room.id, item.id), threshold }
		);
		if (placement.snapped && !current.snapped) navigator.vibrate?.(8);
		current.snapped = placement.snapped;
		const changed =
			switched ||
			placement.x !== item.x ||
			placement.y !== item.y ||
			placement.rotation !== item.rotation ||
			placement.elevation !== item.elevation ||
			placement.onItemId !== item.onItemId;
		if (!changed) return;
		applyPlacement(item.id, room.id, placement, `drag3d-${item.id}`);
		current.roomId = room.id;
		if (switched) ui.selectedRoomId = room.id;
		const updated = store.item(item.id);
		if (updated) pushToViewer(updated);
	}

	function move(event: PointerEvent): void {
		const current = gesture;
		if (!current) return;
		if (touches.has(event.pointerId)) {
			touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		}
		const item = store.item(current.id);
		if (!item) {
			end();
			return;
		}
		if (current.mode === 'twist') {
			twist(current, item);
			return;
		}
		if (event.pointerId !== current.pointerId) return;
		if (!current.moved) {
			if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_LIMIT) {
				return;
			}
			current.moved = true;
		}
		drag(current, item, event);
	}

	function up(event: PointerEvent): void {
		touches.delete(event.pointerId);
		if (tap && event.pointerId === tap.pointerId) {
			const moved = Math.hypot(event.clientX - tap.x, event.clientY - tap.y);
			tap = null;
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', up);
			if (event.type === 'pointerup' && moved < TAP_LIMIT) ui.selectedItemId = null;
			return;
		}
		const current = gesture;
		if (!current) return;
		if (current.mode === 'twist') {
			if (touches.size === 0) end();
		} else if (event.pointerId === current.pointerId) end();
	}

	let hoverFrame = 0;
	let hoverEvent: PointerEvent | null = null;

	function hover(event: PointerEvent): void {
		if (event.pointerType !== 'mouse' || gesture || event.buttons !== 0) return;
		hoverEvent = event;
		if (hoverFrame) return;
		hoverFrame = requestAnimationFrame(() => {
			hoverFrame = 0;
			const latest = hoverEvent;
			if (!latest || state.isWalking()) return;
			const id = viewer.pickItem(latest.clientX, latest.clientY);
			const item = id ? store.item(id) : undefined;
			host.style.cursor = item ? (item.locked ? 'not-allowed' : 'grab') : '';
		});
	}

	host.addEventListener('pointerdown', down, true);
	host.addEventListener('pointermove', hover);
	return () => {
		host.removeEventListener('pointerdown', down, true);
		host.removeEventListener('pointermove', hover);
		cancelAnimationFrame(hoverFrame);
		host.style.cursor = '';
		if (gesture) end();
		tap = null;
		touches.clear();
		window.removeEventListener('pointerup', up);
		window.removeEventListener('pointercancel', up);
	};
}
