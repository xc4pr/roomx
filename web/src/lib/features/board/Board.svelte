<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import Focus from '@lucide/svelte/icons/focus';
	import Maximize from '@lucide/svelte/icons/maximize';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import Minus from '@lucide/svelte/icons/minus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { untrack } from 'svelte';
	import type { Vec } from '#lib/core/geometry.ts';
	import { distance, roomToBoard } from '#lib/core/geometry.ts';
	import { WALL_THICKNESS } from '#lib/core/defaults.ts';
	import type { BoardPos } from '#lib/core/schema.ts';
	import {
		createRoomAndSelect,
		deleteRoom,
		duplicateAndSelect,
		rotateRoomBy
	} from '#lib/features/room/actions.ts';
	import { common } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { selectRoom, ui } from '#lib/state/ui.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import ConfirmDialog from '#lib/ui/ConfirmDialog.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Fab from '#lib/ui/Fab.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import { WIDE_QUERY } from '#lib/ui/layout.ts';
	import { longpress } from '#lib/ui/longpress.ts';
	import Menu, { type MenuItem } from '#lib/ui/Menu.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import BoardRoom from './BoardRoom.svelte';
	import {
		boardToScreen,
		easeOutCubic,
		fitBox,
		gridSteps,
		isInRegion,
		lerpCamera,
		panBy,
		pinchStep,
		screenToBoard,
		zoomAt,
		type Camera,
		type Insets,
		type PointerPair
	} from './camera.ts';
	import { gesture } from './gesture.svelte.ts';
	import { coverInsets } from './insets.ts';
	import { panel } from './panel.svelte.ts';
	import { messages } from './i18n.ts';
	import {
		boardCentroid,
		boardPolygon,
		hitRoom,
		roomBox,
		roomsBox,
		snapToCentimetre
	} from './rooms.ts';
	import { connections } from './connections.svelte.ts';
	import DockMarks from './DockMarks.svelte';
	import LinkMarks from './LinkMarks.svelte';
	import {
		keptThicknesses,
		magnetRange,
		magnetSnap,
		slideDecay,
		type MagnetContact
	} from './magnet.ts';
	import { setViewport } from './viewport.ts';

	let { mode }: { mode: 'build' | 'furnish' } = $props();

	const uid = $props.id();
	const build = $derived(mode === 'build');

	let svg: SVGSVGElement | undefined = $state();
	let width = $state(0);
	let height = $state(0);
	let wide = $state(typeof matchMedia === 'undefined' ? false : matchMedia(WIDE_QUERY).matches);
	let cam = $state<Camera>({ x: -1000, y: 3500, k: 0.15 });
	let contacts = $state<MagnetContact[]>([]);
	let flash = $state<MagnetContact[]>([]);
	let pulse = $state(0);
	let slide = $state<{ roomId: string; x: number; y: number } | null>(null);
	let draggingRoomId = $state<string | null>(null);
	let grabbing = $state(false);

	let menuOpen = $state(false);
	let menuX = $state(0);
	let menuY = $state(0);
	let menuRoomId = $state<string | null>(null);
	let renameOpen = $state(false);
	let renameValue = $state('');
	let confirmOpen = $state(false);
	let confirmRoomId = $state<string | null>(null);

	const rooms = $derived(store.project?.rooms ?? []);
	const ordered = $derived(
		ui.selectedRoomId
			? [
					...rooms.filter((room) => room.id !== ui.selectedRoomId),
					...rooms.filter((room) => room.id === ui.selectedRoomId)
				]
			: rooms
	);
	const size = $derived({ width, height });
	const placing = $derived(ui.placingKind !== null);
	const gridMinor = $derived(gridSteps(cam.k).minor);
	const gridMajor = $derived(gridSteps(cam.k).major);

	const sheetFull = $derived(build && !wide && ui.selectedRoomId !== null && panel.snap === 'full');
	const fabVisible = $derived(build && rooms.length > 0 && !placing && !sheetFull);
	const insets = $derived.by((): Insets =>
		coverInsets({
			width,
			height,
			wide,
			panelOpen: ui.selectedRoomId !== null,
			panelWidth: panel.width,
			snap: panel.snap,
			fab: fabVisible
		})
	);

	setViewport({
		get pxPerMm() {
			return cam.k;
		},
		clientToBoard(clientX, clientY) {
			const rect = svg?.getBoundingClientRect();
			return screenToBoard(cam, { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) });
		},
		clientToRoom(room, clientX, clientY) {
			const rect = svg?.getBoundingClientRect();
			const board = screenToBoard(cam, {
				x: clientX - (rect?.left ?? 0),
				y: clientY - (rect?.top ?? 0)
			});
			return fromBoard(room.boardPos, board);
		},
		roomToClient(room, point) {
			const rect = svg?.getBoundingClientRect();
			const screen = boardToScreen(cam, roomToBoard(room, point));
			return { x: screen.x + (rect?.left ?? 0), y: screen.y + (rect?.top ?? 0) };
		}
	});

	function fromBoard(pos: BoardPos, point: Vec): Vec {
		const dx = point.x - pos.x;
		const dy = point.y - pos.y;
		const rad = (-pos.rot * Math.PI) / 180;
		return {
			x: dx * Math.cos(rad) - dy * Math.sin(rad),
			y: dx * Math.sin(rad) + dy * Math.cos(rad)
		};
	}

	$effect(() => {
		const query = matchMedia(WIDE_QUERY);
		wide = query.matches;
		const listener = (event: MediaQueryListEvent) => (wide = event.matches);
		query.addEventListener('change', listener);
		return () => query.removeEventListener('change', listener);
	});

	let motion = 0;
	let inertia = 0;

	function stopMotion(): void {
		if (motion) cancelAnimationFrame(motion);
		if (inertia) cancelAnimationFrame(inertia);
		motion = 0;
		inertia = 0;
	}

	function flyTo(target: Camera, duration = 340): void {
		stopMotion();
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced || duration <= 0) {
			cam = target;
			return;
		}
		const from = cam;
		const frame = { ...size };
		const started = performance.now();
		const step = (now: number) => {
			const t01 = Math.min(1, (now - started) / duration);
			cam = lerpCamera(from, target, easeOutCubic(t01), frame);
			motion = t01 < 1 ? requestAnimationFrame(step) : 0;
		};
		motion = requestAnimationFrame(step);
	}

	function fitRoom(roomId: string, duration?: number): void {
		const room = store.room(roomId);
		if (!room || width < 50) return;
		flyTo(fitBox(roomBox(room), size, insets, { margin: 64, maxK: 0.5 }), duration);
	}

	function fitAll(duration?: number): void {
		const box = roomsBox(rooms) ?? { minX: 0, minY: 0, maxX: 4000, maxY: 3000 };
		flyTo(fitBox(box, size, insets, { margin: 56, maxK: 0.16 }), duration);
	}

	let fittedFor = '';
	$effect(() => {
		const project = store.project;
		if (!project || width < 50 || height < 50) return;
		if (fittedFor === project.id) return;
		fittedFor = project.id;
		untrack(() => {
			const box = roomsBox(project.rooms) ?? { minX: 0, minY: 0, maxX: 4000, maxY: 3000 };
			cam = fitBox(box, size, insets, { margin: 56, maxK: 0.16 });
		});
	});

	let lastSelected: string | null = null;
	let revealTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const id = ui.selectedRoomId;
		if (id === lastSelected) return;
		lastSelected = id;
		clearTimeout(revealTimer);
		if (!id) return;
		revealTimer = setTimeout(() => untrack(() => reveal(id)), 260);
	});

	let shapeTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const id = ui.selectedRoomId;
		const room = id ? store.room(id) : undefined;
		if (!id || !room) return;
		void room.polygon.map((p) => p.x + p.y).join();
		void room.boardPos.x;
		void room.boardPos.y;
		clearTimeout(shapeTimer);
		shapeTimer = setTimeout(() => untrack(() => reveal(id)), 420);
		return () => clearTimeout(shapeTimer);
	});

	let lastSnap = panel.snap;
	let lastPanelWidth = panel.settledWidth;
	$effect(() => {
		const snap = panel.snap;
		const panelWidth = panel.settledWidth;
		if (snap === lastSnap && panelWidth === lastPanelWidth) return;
		lastSnap = snap;
		lastPanelWidth = panelWidth;
		const id = untrack(() => ui.selectedRoomId);
		if (!id) return;
		clearTimeout(revealTimer);
		revealTimer = setTimeout(() => untrack(() => reveal(id)), 260);
	});

	function reveal(id: string): void {
		const room = store.room(id);
		if (!room || width < 50 || ui.focusRoomId || drag || gesture.active) return;
		const box = roomBox(room, WALL_THICKNESS);
		const corners = [
			{ x: box.minX, y: box.minY },
			{ x: box.maxX, y: box.maxY }
		];
		if (corners.every((corner) => isInRegion(cam, size, insets, corner, 20))) return;
		const fitted = fitBox(box, size, insets, { margin: 40, maxK: cam.k });
		if (fitted.k >= cam.k - 1e-9 || !isInRegion(cam, size, insets, boardCentroid(room), 0)) {
			flyTo(fitted);
		}
	}

	function pick(id: string): void {
		lastSelected = id;
		if (ui.selectedRoomId !== id) selectRoom(id);
	}

	let focusedBefore: string | null = null;
	let savedCamera: Camera | null = null;
	$effect(() => {
		const id = ui.focusRoomId;
		if (id === focusedBefore) return;
		untrack(() => {
			clearTimeout(revealTimer);
			if (id) {
				if (!focusedBefore) savedCamera = cam;
				fitRoom(id);
			} else if (focusedBefore) {
				if (savedCamera) flyTo(savedCamera);
				else fitAll();
				savedCamera = null;
			}
			focusedBefore = id;
		});
	});

	function focusRoom(id: string): void {
		lastSelected = id;
		selectRoom(id);
		ui.focusRoomId = id;
	}

	function addRoom(): void {
		const id = createRoomAndSelect();
		if (!id) return;
		lastSelected = id;
		clearTimeout(revealTimer);
		fitRoom(id);
	}

	interface DragState {
		id: number;
		start: Vec;
		last: Vec;
		lastTime: number;
		startTime: number;
		roomId: string | null;
		kind: 'room' | 'pan';
		moved: boolean;
		origin: BoardPos | null;
		velocity: Vec;
	}

	const pointers = new Map<number, Vec>();
	let drag: DragState | null = null;
	let pinch: PointerPair | null = null;
	let lastTap: { roomId: string; time: number; at: Vec } | null = null;

	function localPoint(event: { clientX: number; clientY: number }): Vec {
		const rect = svg?.getBoundingClientRect();
		return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
	}

	function pairOf(): PointerPair | null {
		const points = [...pointers.values()];
		return points.length >= 2 ? { a: points[0], b: points[1] } : null;
	}

	function canMoveRooms(): boolean {
		return build && !placing && !ui.focusRoomId;
	}

	function finishRoomDrag(): void {
		if (drag?.kind === 'room' && drag.moved) store.sealHistory();
		if (contacts.length > 0) {
			flash = contacts;
			clearTimeout(flashTimer);
			flashTimer = setTimeout(() => (flash = []), 1100);
		}
		contacts = [];
		heldKeys = [];
		keptThickness = new Map();
		lastDelta = { x: 0, y: 0 };
		draggingRoomId = null;
	}

	let heldKeys: string[] = [];
	let keptThickness: ReadonlyMap<string, number> = new Map();
	let lastDelta: Vec = { x: 0, y: 0 };
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	let slideFrame = 0;
	let slideTime = 0;

	function slideStep(now: number): void {
		const current = slide;
		if (!current) {
			slideFrame = 0;
			return;
		}
		const next = slideDecay(current, Math.min(0.05, (now - slideTime) / 1000));
		slideTime = now;
		if (next.x === 0 && next.y === 0) {
			slide = null;
			slideFrame = 0;
			return;
		}
		slide = { roomId: current.roomId, ...next };
		slideFrame = requestAnimationFrame(slideStep);
	}

	function glide(roomId: string, jump: Vec): void {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		slide = {
			roomId,
			x: (slide?.roomId === roomId ? slide.x : 0) - jump.x,
			y: (slide?.roomId === roomId ? slide.y : 0) - jump.y
		};
		if (slideFrame === 0) {
			slideTime = performance.now();
			slideFrame = requestAnimationFrame(slideStep);
		}
	}

	function onpointerdown(event: PointerEvent): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		stopMotion();
		svg?.setPointerCapture(event.pointerId);
		const point = localPoint(event);
		pointers.set(event.pointerId, point);
		if (pointers.size >= 2) {
			finishRoomDrag();
			drag = null;
			pinch = pairOf();
			grabbing = true;
			return;
		}
		const board = screenToBoard(cam, point);
		const room = placing ? undefined : hitRoom(ordered, board, Math.max(150, 10 / cam.k));
		const movable = room !== undefined && canMoveRooms();
		if (movable && room) keptThickness = keptThicknesses(connections.roomLinks(room.id));
		drag = {
			id: event.pointerId,
			start: point,
			last: point,
			lastTime: performance.now(),
			startTime: performance.now(),
			roomId: room?.id ?? null,
			kind: movable ? 'room' : 'pan',
			moved: false,
			origin: movable && room ? { ...$state.snapshot(room.boardPos) } : null,
			velocity: { x: 0, y: 0 }
		};
	}

	function onpointermove(event: PointerEvent): void {
		if (!pointers.has(event.pointerId)) return;
		const point = localPoint(event);
		pointers.set(event.pointerId, point);
		if (pinch) {
			const next = pairOf();
			if (next) {
				cam = pinchStep(cam, pinch, next);
				pinch = next;
			}
			return;
		}
		if (!drag || drag.id !== event.pointerId) return;
		const now = performance.now();
		if (!drag.moved) {
			if (distance(point, drag.start) < 6) return;
			drag.moved = true;
			grabbing = true;
			if (drag.kind === 'room' && drag.roomId) {
				pick(drag.roomId);
				draggingRoomId = drag.roomId;
			}
		}
		if (drag.kind === 'room' && drag.roomId && drag.origin) {
			moveRoomTo(drag.roomId, drag.origin, point, drag.start);
		} else {
			const dx = point.x - drag.last.x;
			const dy = point.y - drag.last.y;
			cam = panBy(cam, dx, dy);
			const dt = Math.max(1, now - drag.lastTime);
			drag.velocity = {
				x: drag.velocity.x * 0.6 + (dx / dt) * 0.4,
				y: drag.velocity.y * 0.6 + (dy / dt) * 0.4
			};
		}
		drag.last = point;
		drag.lastTime = now;
	}

	function moveRoomTo(roomId: string, origin: BoardPos, point: Vec, start: Vec): void {
		const room = store.room(roomId);
		if (!room) return;
		const candidate: BoardPos = {
			...origin,
			x: snapToCentimetre(origin.x + (point.x - start.x) / cam.k),
			y: snapToCentimetre(origin.y - (point.y - start.y) / cam.k)
		};
		const neighbours = rooms
			.filter((other) => other.id !== roomId)
			.map((other) => ({ id: other.id, polygon: boardPolygon(other) }));
		const moving = boardPolygon({ boardPos: candidate, polygon: room.polygon });
		const snap = magnetSnap(moving, neighbours, {
			range: magnetRange(cam.k),
			held: heldKeys,
			thickness: keptThickness
		});
		const final: BoardPos = {
			...candidate,
			x: Math.round(candidate.x + snap.delta.x),
			y: Math.round(candidate.y + snap.delta.y)
		};
		if (snap.held.join() !== heldKeys.join()) {
			glide(roomId, { x: snap.delta.x - lastDelta.x, y: snap.delta.y - lastDelta.y });
			if (heldKeys.length === 0) {
				navigator.vibrate?.(8);
				pulse++;
			}
		}
		heldKeys = snap.held;
		lastDelta = snap.delta;
		contacts = snap.contacts;
		store.moveRoom(roomId, final, { coalesce: `move-${roomId}` });
	}

	function onpointerup(event: PointerEvent): void {
		if (!pointers.has(event.pointerId)) return;
		pointers.delete(event.pointerId);
		if (svg?.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
		if (pinch) {
			if (pointers.size < 2) {
				pinch = null;
				const [rest] = [...pointers.entries()];
				if (rest) {
					drag = {
						id: rest[0],
						start: rest[1],
						last: rest[1],
						lastTime: performance.now(),
						startTime: performance.now(),
						roomId: null,
						kind: 'pan',
						moved: true,
						origin: null,
						velocity: { x: 0, y: 0 }
					};
				} else grabbing = false;
			}
			return;
		}
		const current = drag;
		if (!current || current.id !== event.pointerId) return;
		drag = null;
		grabbing = false;
		if (current.moved) {
			if (current.kind === 'room') finishRoomDrag();
			else if (performance.now() - current.lastTime < 90) startInertia(current.velocity);
			return;
		}
		if (event.type === 'pointerup') tap(current.roomId, localPoint(event));
	}

	function startInertia(initial: Vec): void {
		let velocity = initial;
		if (Math.hypot(velocity.x, velocity.y) < 0.3) return;
		let previous = performance.now();
		const step = (now: number) => {
			const dt = Math.min(32, now - previous);
			previous = now;
			cam = panBy(cam, velocity.x * dt, velocity.y * dt);
			const decay = Math.exp(-dt / 240);
			velocity = { x: velocity.x * decay, y: velocity.y * decay };
			inertia = Math.hypot(velocity.x, velocity.y) > 0.02 ? requestAnimationFrame(step) : 0;
		};
		inertia = requestAnimationFrame(step);
	}

	function tap(roomId: string | null, at: Vec): void {
		if (placing) return;
		if (roomId) {
			const now = performance.now();
			if (
				lastTap &&
				lastTap.roomId === roomId &&
				now - lastTap.time < 380 &&
				distance(lastTap.at, at) < 32
			) {
				lastTap = null;
				focusRoom(roomId);
				return;
			}
			lastTap = { roomId, time: now, at };
			if (ui.focusRoomId && ui.focusRoomId !== roomId) focusRoom(roomId);
			else if (ui.selectedRoomId !== roomId) selectRoom(roomId);
			return;
		}
		lastTap = null;
		if (ui.focusRoomId) ui.focusRoomId = null;
		else selectRoom(null);
	}

	function wheel(node: HTMLElement) {
		const handler = (event: WheelEvent) => {
			event.preventDefault();
			stopMotion();
			const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
			const strength = event.ctrlKey ? 0.012 : 0.0018;
			const factor = Math.exp(Math.max(-120, Math.min(120, -event.deltaY * unit)) * strength);
			cam = zoomAt(cam, factor, localPoint(event));
		};
		node.addEventListener('wheel', handler, { passive: false });
		return { destroy: () => node.removeEventListener('wheel', handler) };
	}

	function zoomStep(factor: number): void {
		flyTo(zoomAt(cam, factor, { x: width / 2, y: height / 2 }), 180);
	}

	function onlongpress(point: Vec): void {
		if (!build || placing || (drag?.moved ?? false) || pinch) return;
		const board = screenToBoard(cam, localPoint({ clientX: point.x, clientY: point.y }));
		const room = hitRoom(ordered, board, Math.max(150, 10 / cam.k));
		if (!room) return;
		finishRoomDrag();
		drag = null;
		pick(room.id);
		navigator.vibrate?.(12);
		menuRoomId = room.id;
		menuX = point.x;
		menuY = point.y;
		menuOpen = true;
	}

	const menuItems = $derived.by((): MenuItem[] => {
		const id = menuRoomId;
		if (!id) return [];
		return [
			{ label: t(messages, 'menuFocus'), icon: Focus, onselect: () => focusRoom(id) },
			{
				label: t(messages, 'menuRename'),
				icon: Pencil,
				onselect: () => {
					renameValue = store.room(id)?.name ?? '';
					renameOpen = true;
				}
			},
			{
				label: t(messages, 'menuDuplicate'),
				icon: Copy,
				onselect: () => {
					const copy = duplicateAndSelect(id);
					if (copy) {
						lastSelected = copy;
						fitRoom(copy);
					}
				}
			},
			{ label: t(messages, 'menuRotate'), icon: RotateCw, onselect: () => rotateRoomBy(id, 90) },
			{
				label: t(messages, 'menuDelete'),
				icon: Trash2,
				danger: true,
				separatorBefore: true,
				onselect: () => askDelete(id)
			}
		];
	});

	function askDelete(id: string): void {
		confirmRoomId = id;
		confirmOpen = true;
	}

	function saveRename(): void {
		const id = menuRoomId;
		const name = renameValue.trim();
		if (id && name) store.updateRoom(id, { name });
		renameOpen = false;
	}

	let sealTimer: ReturnType<typeof setTimeout> | undefined;

	function nudge(dx: number, dy: number): void {
		const id = ui.selectedRoomId;
		const room = id ? store.room(id) : undefined;
		if (!id || !room) return;
		store.moveRoom(
			id,
			{ ...room.boardPos, x: room.boardPos.x + dx, y: room.boardPos.y + dy },
			{ coalesce: `nudge-${id}` }
		);
		clearTimeout(sealTimer);
		sealTimer = setTimeout(() => store.sealHistory(), 500);
	}

	function onkeydown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement | null;
		if (
			target?.closest(
				'input, textarea, select, [contenteditable], [role="tab"], [role="slider"], [role="radio"], [role="menu"], [role="dialog"]'
			)
		) {
			return;
		}
		if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
		const key = event.key;
		if (
			ui.placingKind ||
			(ui.selectedElementId && (ui.panelTab === 'elements' || ui.focusRoomId))
		) {
			if (key === '+' || key === '=') zoomStep(1.4);
			else if (key === '-') zoomStep(1 / 1.4);
			else if (key === '0') fitAll();
			return;
		}
		if (key === 'Escape') {
			if (ui.focusRoomId) ui.focusRoomId = null;
			else if (ui.selectedRoomId) selectRoom(null);
			return;
		}
		if (key === '+' || key === '=') zoomStep(1.4);
		else if (key === '-') zoomStep(1 / 1.4);
		else if (key === '0') fitAll();
		if (!build || placing || !ui.selectedRoomId) return;
		const id = ui.selectedRoomId;
		const step = event.shiftKey ? 100 : 10;
		if (key === 'Delete' || key === 'Backspace') {
			event.preventDefault();
			askDelete(id);
		} else if (key === 'r' || key === 'R') {
			event.preventDefault();
			rotateRoomBy(id, event.shiftKey ? -90 : 90);
		} else if (key === 'ArrowLeft') {
			event.preventDefault();
			nudge(-step, 0);
		} else if (key === 'ArrowRight') {
			event.preventDefault();
			nudge(step, 0);
		} else if (key === 'ArrowUp') {
			event.preventDefault();
			nudge(0, step);
		} else if (key === 'ArrowDown') {
			event.preventDefault();
			nudge(0, -step);
		}
	}

	const confirmName = $derived(confirmRoomId ? (store.room(confirmRoomId)?.name ?? '') : '');
	const selectedId = $derived(ui.selectedRoomId);
	const cursor = $derived(
		!build
			? 'cursor-default'
			: grabbing
				? 'cursor-grabbing'
				: placing
					? 'cursor-crosshair'
					: 'cursor-grab'
	);
</script>

<svelte:window {onkeydown} />

<div
	class="absolute inset-0 overflow-hidden bg-bg"
	style:--panel-width="{panel.width}px"
	bind:clientWidth={width}
	bind:clientHeight={height}
	data-testid="board"
>
	<div
		class="absolute inset-0"
		use:longpress={{ onlongpress, disabled: !build || placing }}
		use:wheel
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<svg
			bind:this={svg}
			role="application"
			aria-label={t(messages, 'boardLabel')}
			class="block size-full touch-none select-none [-webkit-touch-callout:none] {cursor}"
			{onpointerdown}
			{onpointermove}
			{onpointerup}
			onpointercancel={onpointerup}
			onlostpointercapture={(event) => {
				if (
					event.target === svg &&
					pointers.has(event.pointerId) &&
					!svg?.hasPointerCapture(event.pointerId)
				) {
					onpointerup(event);
				}
			}}
		>
			<defs>
				<pattern
					id="minor-{uid}"
					width={gridMinor * cam.k}
					height={gridMinor * cam.k}
					x={-cam.x * cam.k}
					y={cam.y * cam.k}
					patternUnits="userSpaceOnUse"
				>
					<path
						d="M0 0H{gridMinor * cam.k}M0 0V{gridMinor * cam.k}"
						class="stroke-border"
						fill="none"
						stroke-width="1"
						opacity="0.55"
					/>
				</pattern>
				<pattern
					id="major-{uid}"
					width={gridMajor * cam.k}
					height={gridMajor * cam.k}
					x={-cam.x * cam.k}
					y={cam.y * cam.k}
					patternUnits="userSpaceOnUse"
				>
					<path
						d="M0 0H{gridMajor * cam.k}M0 0V{gridMajor * cam.k}"
						class="stroke-border"
						fill="none"
						stroke-width="1.2"
					/>
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill="url(#minor-{uid})" pointer-events="none" />
			<rect width="100%" height="100%" fill="url(#major-{uid})" pointer-events="none" />

			<g transform="matrix({cam.k} 0 0 {-cam.k} {-cam.x * cam.k} {cam.y * cam.k})">
				{#each ordered as room (room.id)}
					{@const isSelected = selectedId === room.id}
					{@const isFocused = ui.focusRoomId === room.id}
					<BoardRoom
						{room}
						k={cam.k}
						{mode}
						selected={isSelected}
						focused={isFocused}
						dimmed={ui.focusRoomId !== null && !isFocused}
						lifted={draggingRoomId === room.id}
						shift={slide?.roomId === room.id ? slide : undefined}
						elementsInteractive={build && isSelected && (isFocused || ui.panelTab === 'elements')}
						furnishInteractive={!build && isSelected}
						handles={build && isSelected && !placing && draggingRoomId === null}
					/>
				{/each}
				<LinkMarks {rooms} k={cam.k} dimmed={ui.focusRoomId !== null || draggingRoomId !== null} />
				{#if contacts.length > 0}
					<DockMarks {contacts} k={cam.k} {pulse} />
				{:else if flash.length > 0}
					<DockMarks contacts={flash} k={cam.k} {pulse} fading />
				{/if}
			</g>
		</svg>
	</div>

	<div
		class="pointer-events-none absolute top-[max(0.75rem,var(--safe-top))] left-[max(0.75rem,var(--safe-left))] z-10 flex flex-col gap-2 {sheetFull
			? 'invisible'
			: ''}"
	>
		<div
			class="pointer-events-auto flex flex-col rounded-full border border-border bg-surface/90 p-1 shadow-soft backdrop-blur"
			data-testid="zoom-controls"
		>
			<IconButton
				icon={Plus}
				label={t(messages, 'zoomIn')}
				onclick={() => zoomStep(1.5)}
				data-testid="zoom-in"
			/>
			<IconButton
				icon={Minus}
				label={t(messages, 'zoomOut')}
				onclick={() => zoomStep(1 / 1.5)}
				data-testid="zoom-out"
			/>
			<IconButton
				icon={Maximize}
				label={t(messages, 'fitAll')}
				onclick={() => fitAll()}
				data-testid="fit-all"
			/>
			{#if selectedId && !ui.focusRoomId}
				<IconButton
					icon={Focus}
					label={t(messages, 'focusRoom')}
					onclick={() => focusRoom(selectedId)}
					data-testid="focus-room"
				/>
			{/if}
		</div>
	</div>

	{#if ui.focusRoomId}
		<div
			class="pointer-events-none absolute top-[max(0.75rem,var(--safe-top))] left-1/2 z-10 -translate-x-1/2 animate-rise-in"
		>
			<Button
				variant="secondary"
				size="sm"
				icon={Minimize2}
				class="pointer-events-auto rounded-full"
				onclick={() => (ui.focusRoomId = null)}
				data-testid="leave-focus"
			>
				{t(messages, 'leaveFocus')}
			</Button>
		</div>
	{/if}

	{#if rooms.length === 0 && store.project}
		<div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
			<div class="pointer-events-auto">
				{#if build}
					<EmptyState
						title={t(messages, 'emptyTitle')}
						description={t(messages, 'emptyText')}
						actionLabel={t(messages, 'addRoom')}
						onaction={addRoom}
						data-testid="empty-add"
					/>
				{:else}
					<EmptyState
						title={t(messages, 'emptyFurnishTitle')}
						description={t(messages, 'emptyFurnishText')}
					/>
				{/if}
			</div>
		</div>
	{/if}

	{#if fabVisible}
		<Fab
			label={t(messages, 'addRoom')}
			position="absolute"
			onclick={addRoom}
			data-testid="add-room"
			class={selectedId === null
				? ''
				: wide
					? 'right-[calc(var(--panel-width)+2.25rem)]!'
					: 'top-3! right-3! bottom-auto!'}
		/>
	{/if}
</div>

<Menu bind:open={menuOpen} x={menuX} y={menuY} items={menuItems} label={t(messages, 'menuLabel')} />

<Dialog
	bind:open={renameOpen}
	title={t(messages, 'renameTitle')}
	size="sm"
	closeLabel={t(common, 'close')}
>
	<TextField
		label={t(messages, 'renameLabel')}
		bind:value={renameValue}
		autofocus
		maxlength={60}
		onenter={saveRename}
		data-testid="rename-input"
	/>
	{#snippet actions()}
		<Button variant="ghost" onclick={() => (renameOpen = false)}>{t(common, 'cancel')}</Button>
		<Button variant="primary" onclick={saveRename}>{t(messages, 'renameSave')}</Button>
	{/snippet}
</Dialog>

<ConfirmDialog
	bind:open={confirmOpen}
	danger
	title={t(messages, 'deleteTitle', { name: confirmName })}
	message={t(messages, 'deleteMessage')}
	confirmLabel={t(common, 'delete')}
	cancelLabel={t(common, 'cancel')}
	closeLabel={t(common, 'close')}
	onconfirm={() => confirmRoomId && deleteRoom(confirmRoomId)}
/>
