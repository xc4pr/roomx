<script lang="ts">
	import { untrack } from 'svelte';
	import { checkRoomItems, type ItemIssue } from '#lib/core/checks.ts';
	import { SOCKET_WARN_DISTANCE } from '#lib/core/defaults.ts';
	import {
		centroid,
		doorSwing,
		itemFootprint,
		pointInPolygon,
		rotate,
		wallElementFootprint,
		walls,
		type Vec
	} from '#lib/core/geometry.ts';
	import { clearanceZone, freeElementShape } from '#lib/core/elements.ts';
	import { isFreeElement, isWallElement, type Item } from '#lib/core/schema.ts';
	import { formatLength } from '#lib/core/units.ts';
	import { connections } from '#lib/features/board/connections.svelte.ts';
	import { getViewport, type RoomLayerProps } from '#lib/features/board/viewport.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { activeFloorId, selectRoom, ui } from '#lib/state/ui.svelte.ts';
	import { dropTargets } from './targets.ts';
	import {
		addCatalogEntry,
		applyPlacement,
		itemLabel,
		previewPlacement,
		roomItems,
		selectItem,
		subjectOf,
		thresholdFor
	} from './actions.ts';
	import { ceilingClearance } from './ceiling.ts';
	import { socketLink } from './electric.ts';
	import { messages } from './i18n.ts';
	import { clearances, narrowPassages } from './passage.ts';
	import { session } from './session.svelte.ts';
	import { roomStairZones } from '#lib/features/stairs/logic.ts';
	import { computePlacement, snapRotation, type Guide } from './snap.ts';
	import { planLabel, type LabelPlan } from './labels.ts';
	import { isRound, symbolShapes } from './symbols.ts';

	interface Gesture {
		mode: 'move' | 'rotate' | 'twist';
		id: string;
		pointerId: number;
		startX: number;
		startY: number;
		grab: Vec;
		moved: boolean;
		snapped: boolean;
		rotation0: number;
		angle0: number;
	}

	let { room, interactive }: RoomLayerProps = $props();

	const viewport = getViewport();
	const pxPerMm = $derived(viewport?.pxPerMm || 0.1);
	const px = (n: number): number => n / pxPerMm;

	const items = $derived(store.roomItems(room.id));
	const suggestionElements = $derived(
		(store.activeVariant?.suggestions ?? [])
			.filter((suggestion) => suggestion.roomId === room.id)
			.map((suggestion) => suggestion.element)
	);
	const connected = $derived(connections.withNeighbourOpenings(room));
	const stairZones = $derived(roomStairZones(store.project, room));
	const issues = $derived(checkRoomItems(connected, items, suggestionElements, stairZones));
	const issueMap = $derived.by(() => {
		const map = new Map<string, ItemIssue[]>();
		for (const issue of issues) {
			for (const id of issue.itemIds) map.set(id, [...(map.get(id) ?? []), issue]);
		}
		return map;
	});
	const passages = $derived(narrowPassages(room, items));
	const selected = $derived(items.find((item) => item.id === ui.selectedItemId));
	const sorted = $derived(
		[...items].sort((a, b) => layer(a) - layer(b) || a.elevation - b.elevation)
	);
	const vanishing = $derived(session.vanishing.filter((item) => item.roomId === room.id));
	const floorPath = $derived(`M${room.polygon.map((point) => `${point.x} ${point.y}`).join('L')}Z`);

	let liveAngle = $state<number | null>(null);
	let flashLocked = $state<string | null>(null);

	function layer(item: Item): number {
		if (item.category === 'rug') return 0;
		if (item.mount === 'ceiling') return 4;
		if (item.mount === 'wall') return 2;
		return item.onItemId ? 3 : 1;
	}

	function tone(id: string): 'error' | 'warning' | null {
		const list = issueMap.get(id);
		if (!list) return null;
		if (list.some((issue) => issue.severity === 'error')) return 'error';
		return list.some((issue) => issue.code !== 'socketFar') ? 'warning' : null;
	}

	function format(mm: number): string {
		return formatLength(mm, settings.unit, locale.language);
	}

	function outline(item: Item): { fill: string; stroke: string; width: number; dash: string } {
		const state = tone(item.id);
		const isSelected = item.id === ui.selectedItemId;
		let fill = 'var(--color-item)';
		let opacity = item.category === 'rug' ? 0.16 : item.onItemId ? 0.55 : 0.3;
		let stroke = 'var(--color-item)';
		if (state === 'error') {
			fill = 'var(--color-danger)';
			stroke = 'var(--color-danger)';
			opacity = 0.3;
		} else if (state === 'warning') {
			stroke = 'var(--color-warning)';
		}
		if (isSelected) {
			if (!state) stroke = 'var(--color-accent)';
			if (!state) fill = 'var(--color-accent)';
			opacity = Math.max(opacity, 0.2);
		}
		const dash = item.mount === 'ceiling' ? '6 5' : item.category === 'rug' ? '10 6' : '';
		return {
			fill: `fill:${fill};fill-opacity:${opacity}`,
			stroke: `stroke:${stroke}`,
			width: isSelected ? 2.6 : item.mount === 'wall' ? 2 : 1.5,
			dash
		};
	}

	let measureContext: CanvasRenderingContext2D | null | undefined;

	function measure(text: string, size: number): number {
		if (measureContext === undefined) {
			measureContext = document.createElement('canvas').getContext('2d');
		}
		if (!measureContext) return text.length * size * 0.62;
		measureContext.font = `700 ${size}px Figtree Variable, Figtree, system-ui, sans-serif`;
		return measureContext.measureText(text).width + 2;
	}

	function labelFor(item: Item): LabelPlan | null {
		return planLabel({
			text: itemLabel(item),
			w: item.dims.w,
			d: item.dims.d,
			rotation: item.rotation,
			pxPerMm,
			measure
		});
	}

	function labelPriority(item: Item): number {
		if (item.id === ui.selectedItemId) return 0;
		if (item.category === 'rug') return 4;
		if (item.onItemId) return 3;
		if (item.mount === 'wall' || item.mount === 'ceiling') return 2;
		return 1;
	}

	const labelPlans = $derived.by(() => {
		const plans = new Map<string, LabelPlan>();
		const center = centroid(room.polygon);
		const reserve = { x: center.x, y: center.y, hw: px(72), hh: px(20) };
		const taken = [reserve];
		const order = [...items].sort(
			(a, b) => labelPriority(a) - labelPriority(b) || b.dims.w * b.dims.d - a.dims.w * a.dims.d
		);
		for (const item of order) {
			const plan = labelFor(item);
			if (!plan) continue;
			const radians = (plan.angle * Math.PI) / 180;
			const width = measure(plan.text, plan.size);
			const height = plan.size * 1.2;
			const box = {
				x: item.x,
				y: item.y,
				hw: px((width * Math.abs(Math.cos(radians)) + height * Math.abs(Math.sin(radians))) / 2),
				hh: px((width * Math.abs(Math.sin(radians)) + height * Math.abs(Math.cos(radians))) / 2)
			};
			const clash = taken.some(
				(other) =>
					Math.abs(other.x - box.x) < other.hw + box.hw &&
					Math.abs(other.y - box.y) < other.hh + box.hh
			);
			if (clash) continue;
			taken.push(box);
			plans.set(item.id, plan);
		}
		return plans;
	});

	function zoneFor(issue: ItemIssue): Vec[] | null {
		if (!issue.elementId) return null;
		const element = connected.elements.find((candidate) => candidate.id === issue.elementId);
		if (!element) return null;
		if (issue.code === 'fireZone' || issue.code === 'airflowBlocked') {
			return clearanceZone(connected, element)?.shape ?? null;
		}
		if (isFreeElement(element)) return freeElementShape(element);
		if (!isWallElement(element)) return null;
		if (element.kind === 'door' && element.swing === 'in') {
			return doorSwing(room.polygon, element)?.polygon ?? null;
		}
		const depth = element.kind === 'door' ? 600 : 'depth' in element ? element.depth + 100 : 150;
		return wallElementFootprint(room.polygon, element, depth);
	}

	const zones = $derived(
		issues.flatMap((issue) => {
			const shape = zoneFor(issue);
			return shape
				? [{ shape, severity: issue.severity, key: `${issue.itemIds[0]}-${issue.elementId}` }]
				: [];
		})
	);

	const links = $derived.by(() => {
		const elements = [...room.elements, ...suggestionElements];
		const result: { id: string; from: Vec; to: Vec; distance: number }[] = [];
		for (const item of items) {
			if (!item.power || item.power <= 0) continue;
			if (!ui.electricalLayer && item.id !== ui.selectedItemId) continue;
			const link = socketLink(room.polygon, item, elements);
			if (link && link.distance > 0) {
				result.push({ id: item.id, from: link.socket, to: link.target, distance: link.distance });
			}
		}
		return result;
	});

	const gaps = $derived(
		selected
			? clearances(
					room.polygon,
					selected,
					items.filter((item) => item.id !== selected.id)
				)
			: []
	);

	const ceilingTags = $derived.by(() => {
		const subjects = [...(selected ? [selected] : []), ...(ghost ? [ghost.probe] : [])];
		return subjects.flatMap((item) => {
			const clearance = ceilingClearance(room, item);
			if (!clearance) return [];
			const top = Math.max(...itemFootprint(item).map((corner) => corner.y));
			return [
				{
					id: item.id,
					at: { x: item.x, y: top + px(12) },
					text: t(messages, 'ceilingHere', { height: format(clearance.height) }),
					tooLow: clearance.tooLow
				}
			];
		});
	});

	const handle = $derived.by(() => {
		if (!selected || selected.locked) return null;
		const direction = rotate({ x: 0, y: 1 }, selected.rotation);
		const reach = selected.dims.d / 2 + px(30);
		return {
			edge: {
				x: selected.x + direction.x * (selected.dims.d / 2),
				y: selected.y + direction.y * (selected.dims.d / 2)
			},
			at: { x: selected.x + direction.x * reach, y: selected.y + direction.y * reach }
		};
	});

	const ghost = $derived.by(() => {
		const drag = session.drag;
		if (!drag || drag.over !== 'board' || !viewport) return null;
		const point = viewport.clientToRoom(room, drag.x, drag.y);
		if (!pointInPolygon(point, room.polygon, 450)) return null;
		const placement = previewPlacement(drag.entry, room, point, thresholdFor(pxPerMm));
		const probe: Item = {
			id: '__ghost',
			roomId: room.id,
			name: '',
			category: drag.entry.category,
			mount: drag.entry.mount,
			model: drag.entry.model,
			dims: drag.entry.dims,
			x: placement.x,
			y: placement.y,
			rotation: placement.rotation,
			elevation: placement.elevation,
			...(placement.onItemId ? { onItemId: placement.onItemId } : {})
		};
		const blocked = checkRoomItems(
			connected,
			[...items, probe],
			suggestionElements,
			stairZones
		).some((issue) => issue.itemIds.includes('__ghost') && issue.severity === 'error');
		return { placement, probe, valid: placement.inside && !blocked };
	});

	let gesture: Gesture | null = null;
	const touches = new Map<number, Vec>();

	function pointerRoom(roomId: string, x: number, y: number): Vec | null {
		const target = store.room(roomId);
		return target && viewport ? viewport.clientToRoom(target, x, y) : null;
	}

	function rotationContext(roomId: string, exclude: string) {
		const target = store.room(roomId);
		return {
			walls: target ? walls(target.polygon) : [],
			itemRotations: roomItems(roomId, exclude).map((other) => other.rotation)
		};
	}

	function secondFinger(event: PointerEvent): void {
		const current = gesture;
		if (
			!current ||
			current.mode !== 'move' ||
			event.pointerType === 'mouse' ||
			event.pointerId === current.pointerId ||
			touches.size !== 1
		) {
			return;
		}
		const item = store.item(current.id);
		if (!item) return;
		event.stopPropagation();
		touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		const angle = twistAngle();
		if (angle === null) return;
		current.mode = 'twist';
		current.angle0 = angle;
		current.rotation0 = item.rotation;
		current.moved = true;
	}

	function listen(): void {
		window.addEventListener('pointerdown', secondFinger, true);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
	}

	function unlisten(): void {
		window.removeEventListener('pointerdown', secondFinger, true);
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		window.removeEventListener('pointercancel', onUp);
	}

	function finish(): void {
		const current = gesture;
		gesture = null;
		touches.clear();
		unlisten();
		liveAngle = null;
		session.guides = null;
		if (current?.moved) store.sealHistory();
	}

	function twistAngle(): number | null {
		const points = [...touches.values()];
		if (points.length < 2) return null;
		return (Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x) * 180) / Math.PI;
	}

	function itemDown(event: PointerEvent, item: Item): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.stopPropagation();
		touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (gesture) finish();
		touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		selectItem(item);
		if (session.panelOpen && session.tab !== 'catalog') session.tab = 'item';
		if (item.locked) {
			flashLocked = item.id;
			setTimeout(() => (flashLocked = null), 600);
			navigator.vibrate?.(6);
			touches.clear();
			return;
		}
		const point = pointerRoom(item.roomId, event.clientX, event.clientY);
		if (!point) return;
		gesture = {
			mode: 'move',
			id: item.id,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			grab: { x: item.x - point.x, y: item.y - point.y },
			moved: false,
			snapped: false,
			rotation0: item.rotation,
			angle0: 0
		};
		listen();
	}

	function handleDown(event: PointerEvent): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.stopPropagation();
		if (!selected || gesture) return;
		touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		gesture = {
			mode: 'rotate',
			id: selected.id,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			grab: { x: 0, y: 0 },
			moved: false,
			snapped: false,
			rotation0: selected.rotation,
			angle0: 0
		};
		listen();
	}

	function onMove(event: PointerEvent): void {
		const current = gesture;
		if (!current) return;
		if (touches.has(event.pointerId))
			touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		const item = store.item(current.id);
		if (!item) {
			finish();
			return;
		}
		const key = `drag-${item.id}`;
		if (current.mode === 'twist') {
			const angle = twistAngle();
			if (angle === null) return;
			const snap = snapRotation(
				current.rotation0 - (angle - current.angle0),
				rotationContext(item.roomId, item.id)
			);
			liveAngle = snap.rotation;
			if (snap.rotation !== item.rotation) {
				store.transformItem(item.id, { rotation: snap.rotation }, { coalesce: key });
			}
			return;
		}
		if (event.pointerId !== current.pointerId) return;
		if (!current.moved) {
			const limit = event.pointerType === 'mouse' ? 4 : 7;
			if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < limit)
				return;
			current.moved = true;
		}
		if (current.mode === 'rotate') {
			const point = pointerRoom(item.roomId, event.clientX, event.clientY);
			if (!point) return;
			const raw = (Math.atan2(point.y - item.y, point.x - item.x) * 180) / Math.PI - 90;
			const snap = snapRotation(raw, rotationContext(item.roomId, item.id));
			liveAngle = snap.rotation;
			if (snap.rotation !== item.rotation) {
				store.transformItem(item.id, { rotation: snap.rotation }, { coalesce: key });
			}
			if (snap.kind && !current.snapped) navigator.vibrate?.(6);
			current.snapped = snap.kind !== null;
			return;
		}
		moveTo(current, item, event.clientX, event.clientY, key);
	}

	function moveTo(current: Gesture, item: Item, x: number, y: number, key: string): void {
		let target = store.room(item.roomId);
		if (!target || !viewport) return;
		if (!pointInPolygon(viewport.clientToRoom(target, x, y), target.polygon, 400)) {
			const other = dropTargets(
				store.project ?? { rooms: [] },
				activeFloorId(store.project),
				target
			).find((candidate) =>
				pointInPolygon(viewport.clientToRoom(candidate, x, y), candidate.polygon, 150)
			);
			if (other) target = other;
		}
		const switched = target.id !== item.roomId;
		const origin = store.room(item.roomId);
		const turn = switched && origin ? origin.boardPos.rot - target.boardPos.rot : 0;
		if (switched) current.grab = rotate(current.grab, turn);
		const pointer = viewport.clientToRoom(target, x, y);
		const placement = computePlacement(
			{ ...subjectOf(item), rotation: item.rotation + turn },
			{ x: pointer.x + current.grab.x, y: pointer.y + current.grab.y },
			{
				room: target,
				others: roomItems(target.id, item.id),
				threshold: thresholdFor(pxPerMm)
			}
		);
		if (placement.snapped && !current.snapped) navigator.vibrate?.(8);
		current.snapped = placement.snapped;
		session.guides = { roomId: target.id, list: placement.guides };
		if (
			switched ||
			placement.x !== item.x ||
			placement.y !== item.y ||
			placement.rotation !== item.rotation ||
			placement.elevation !== item.elevation ||
			placement.onItemId !== item.onItemId
		) {
			applyPlacement(item.id, target.id, placement, key);
			if (switched && ui.selectedRoomId !== target.id) selectRoom(target.id);
			if (switched) ui.selectedItemId = item.id;
		}
	}

	function onUp(event: PointerEvent): void {
		const current = gesture;
		if (!current) return;
		touches.delete(event.pointerId);
		if (current.mode === 'twist' || event.pointerId === current.pointerId) finish();
	}

	function floorDown(event: PointerEvent): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const startX = event.clientX;
		const startY = event.clientY;
		const done = (up: PointerEvent) => {
			if (up.pointerId !== event.pointerId) return;
			window.removeEventListener('pointerup', done);
			window.removeEventListener('pointercancel', done);
			if (
				up.type === 'pointerup' &&
				Math.hypot(up.clientX - startX, up.clientY - startY) < 8 &&
				ui.selectedItemId
			) {
				ui.selectedItemId = null;
			}
		};
		window.addEventListener('pointerup', done);
		window.addEventListener('pointercancel', done);
	}

	function handlers(item: Item) {
		return { onpointerdown: (event: PointerEvent) => itemDown(event, item) };
	}

	$effect(() => {
		const request = session.drop;
		if (!request || !viewport) return;
		untrack(() => {
			const point = viewport.clientToRoom(room, request.clientX, request.clientY);
			if (!pointInPolygon(point, room.polygon, 450)) return;
			session.drop = null;
			addCatalogEntry(request.entry, room, { raw: point, threshold: thresholdFor(pxPerMm) });
		});
	});

	$effect(() => () => {
		if (gesture) finish();
	});

	function guideList(): Guide[] {
		return session.guides?.roomId === room.id ? session.guides.list : [];
	}
</script>

{#snippet glyph(item: Item, ghosted: boolean, validGhost: boolean)}
	{@const w = item.dims.w}
	{@const d = item.dims.d}
	{@const style = outline(item)}
	{@const round = isRound(item.model)}
	{@const shapes = symbolShapes(item.model, w, d)}
	{@const fillStyle = ghosted
		? `fill:${validGhost ? 'var(--color-accent)' : 'var(--color-danger)'};fill-opacity:0.2`
		: style.fill}
	{@const strokeStyle = ghosted
		? `stroke:${validGhost ? 'var(--color-accent)' : 'var(--color-danger)'}`
		: style.stroke}
	{@const dash = ghosted ? '7 5' : style.dash}
	{#if round}
		<ellipse
			rx={w / 2}
			ry={d / 2}
			style="{fillStyle};{strokeStyle};stroke-width:{style.width}px;vector-effect:non-scaling-stroke"
			stroke-dasharray={dash || undefined}
		/>
	{:else}
		<rect
			x={-w / 2}
			y={-d / 2}
			width={w}
			height={d}
			rx={Math.min(40, Math.min(w, d) * 0.08)}
			style="{fillStyle};{strokeStyle};stroke-width:{style.width}px;vector-effect:non-scaling-stroke"
			stroke-dasharray={dash || undefined}
		/>
	{/if}
	{#each shapes as shape, i (i)}
		{#if shape.t === 'rect'}
			<rect
				x={shape.x}
				y={shape.y}
				width={shape.w}
				height={shape.h}
				rx={shape.r}
				style="fill:none;{strokeStyle};stroke-width:1px;vector-effect:non-scaling-stroke;stroke-opacity:0.7"
			/>
		{:else if shape.t === 'ellipse'}
			<ellipse
				cx={shape.cx}
				cy={shape.cy}
				rx={shape.rx}
				ry={shape.ry}
				style="fill:none;{strokeStyle};stroke-width:1px;vector-effect:non-scaling-stroke;stroke-opacity:0.7"
			/>
		{:else}
			<line
				x1={shape.x1}
				y1={shape.y1}
				x2={shape.x2}
				y2={shape.y2}
				style="{strokeStyle};stroke-width:1px;vector-effect:non-scaling-stroke;stroke-opacity:0.7"
			/>
		{/if}
	{/each}
	<line
		x1={-w * 0.28}
		y1={d / 2}
		x2={w * 0.28}
		y2={d / 2}
		style="{strokeStyle};stroke-width:3.2px;vector-effect:non-scaling-stroke;stroke-linecap:round"
	/>
{/snippet}

<g class="furnish" style:pointer-events="none">
	{#if interactive}
		<path
			d={floorPath}
			fill="transparent"
			style="pointer-events: all"
			role="presentation"
			{...{ onpointerdown: floorDown }}
		/>
	{/if}

	{#each zones as zone (zone.key)}
		<polygon
			points={zone.shape.map((point) => `${point.x},${point.y}`).join(' ')}
			style="fill:{zone.severity === 'error'
				? 'var(--color-danger)'
				: 'var(--color-warning)'};fill-opacity:0.18;pointer-events:none"
		/>
	{/each}

	{#each sorted as item (item.id)}
		<g transform="translate({item.x} {item.y}) rotate({item.rotation})" data-item={item.id}>
			<g class={session.placedId === item.id ? 'plop' : ''}>
				{@render glyph(item, false, true)}
			</g>
		</g>
	{/each}

	{#each vanishing as item (item.id)}
		<g transform="translate({item.x} {item.y}) rotate({item.rotation})" style="pointer-events:none">
			<g class="vanish">
				{@render glyph(item, false, true)}
			</g>
		</g>
	{/each}

	{#each sorted as item (item.id)}
		{@const plan = labelPlans.get(item.id) ?? null}
		{#if plan || item.locked}
			<g
				transform="translate({item.x} {item.y}) scale(1 -1) rotate({plan ? -plan.angle : 0})"
				style="pointer-events:none"
			>
				{#if plan}
					<text
						text-anchor="middle"
						dominant-baseline="central"
						y={item.locked ? -px(plan.size * 0.5) : 0}
						font-size={px(plan.size)}
						font-weight="700"
						class="fill-text stroke-surface [paint-order:stroke]"
						stroke-width={px(3.5)}
						stroke-linejoin="round"
					>
						{plan.text}
					</text>
				{/if}
				{#if item.locked}
					{@const s = px(1)}
					<g transform="translate(0 {plan ? px(plan.size * 0.7) : 0})">
						<g class={flashLocked === item.id ? 'shake' : ''} style="--shake:{px(4)}px">
							<rect
								x={-5 * s}
								y={-1 * s}
								width={10 * s}
								height={8 * s}
								rx={1.6 * s}
								class="fill-muted"
							/>
							<path
								d="M{-3 * s} {-1 * s}V{-3.2 * s}a{3 * s} {3 * s} 0 0 1 {6 * s} 0V{-1 * s}"
								fill="none"
								class="stroke-muted"
								stroke-width={1.6 * s}
							/>
						</g>
					</g>
				{/if}
			</g>
		{/if}
	{/each}

	{#each links as link (link.id)}
		{@const far = link.distance > SOCKET_WARN_DISTANCE}
		<line
			x1={link.from.x}
			y1={link.from.y}
			x2={link.to.x}
			y2={link.to.y}
			style="stroke:{far
				? 'var(--color-warning)'
				: 'var(--color-electric)'};stroke-width:2px;vector-effect:non-scaling-stroke"
			stroke-dasharray={far ? '5 4' : '2 4'}
			stroke-linecap="round"
		/>
		<circle
			cx={link.from.x}
			cy={link.from.y}
			r={px(4)}
			style="fill:var(--color-electric);stroke:var(--color-text);stroke-width:1px;vector-effect:non-scaling-stroke"
		/>
		{#if link.distance * pxPerMm > 34}
			<g
				transform="translate({(link.from.x + link.to.x) / 2} {(link.from.y + link.to.y) /
					2}) scale(1 -1)"
			>
				<text
					text-anchor="middle"
					dominant-baseline="central"
					y={-px(9)}
					font-size={px(10.5)}
					font-weight="700"
					class={far ? 'fill-warning' : 'fill-text'}
					style="stroke:var(--color-surface);paint-order:stroke"
					stroke-width={px(3.5)}
					stroke-linejoin="round"
				>
					{format(link.distance)}
				</text>
			</g>
		{/if}
	{/each}

	{#each passages as passage, i (i)}
		<line
			x1={passage.a.x}
			y1={passage.a.y}
			x2={passage.b.x}
			y2={passage.b.y}
			style="stroke:var(--color-warning);stroke-width:2px;vector-effect:non-scaling-stroke;opacity:0.75"
			stroke-dasharray="3 3"
		/>
		{#if passage.gap * pxPerMm > 30}
			<g
				transform="translate({(passage.a.x + passage.b.x) / 2} {(passage.a.y + passage.b.y) /
					2}) scale(1 -1)"
			>
				<text
					text-anchor="middle"
					dominant-baseline="central"
					font-size={px(10.5)}
					font-weight="700"
					class="fill-warning"
					style="stroke:var(--color-surface);paint-order:stroke"
					stroke-width={px(3.5)}
					stroke-linejoin="round"
				>
					{format(passage.gap)}
				</text>
			</g>
		{/if}
	{/each}

	{#each guideList() as guide, i (i)}
		<line
			x1={guide.a.x}
			y1={guide.a.y}
			x2={guide.b.x}
			y2={guide.b.y}
			style="stroke:var(--color-accent);stroke-width:2.5px;vector-effect:non-scaling-stroke"
			stroke-dasharray="6 5"
			stroke-linecap="round"
		/>
	{/each}

	{#if selected && interactive}
		{#each gaps as gap (gap.side)}
			<line
				x1={gap.from.x}
				y1={gap.from.y}
				x2={gap.to.x}
				y2={gap.to.y}
				style="stroke:var(--color-accent);stroke-width:1.5px;vector-effect:non-scaling-stroke;opacity:0.85"
				stroke-dasharray="4 3"
			/>
			<circle cx={gap.to.x} cy={gap.to.y} r={px(2.5)} style="fill:var(--color-accent)" />
			{#if gap.distance * pxPerMm > 26}
				<g
					transform="translate({(gap.from.x + gap.to.x) / 2} {(gap.from.y + gap.to.y) /
						2}) scale(1 -1)"
				>
					<text
						text-anchor="middle"
						dominant-baseline="central"
						font-size={px(11)}
						font-weight="700"
						class="fill-accent"
						style="stroke:var(--color-surface);paint-order:stroke"
						stroke-width={px(4)}
						stroke-linejoin="round"
					>
						{format(gap.distance)}
					</text>
				</g>
			{/if}
		{/each}
	{/if}

	{#each ceilingTags as tag (tag.id)}
		<g transform="translate({tag.at.x} {tag.at.y}) scale(1 -1)" style="pointer-events:none">
			<text
				text-anchor="middle"
				dominant-baseline="central"
				font-size={px(11)}
				font-weight="700"
				class={tag.tooLow ? 'fill-danger' : 'fill-text'}
				style="stroke:var(--color-surface);paint-order:stroke"
				stroke-width={px(4)}
				stroke-linejoin="round"
			>
				{tag.text}
			</text>
		</g>
	{/each}

	{#if ghost}
		<g transform="translate({ghost.probe.x} {ghost.probe.y}) rotate({ghost.probe.rotation})">
			{@render glyph(ghost.probe, true, ghost.valid)}
		</g>
	{/if}

	{#if interactive}
		{#each sorted as item (item.id)}
			{@const hx = Math.max(item.dims.w / 2, px(22))}
			{@const hy = Math.max(item.dims.d / 2, px(22))}
			<g transform="translate({item.x} {item.y}) rotate({item.rotation})">
				<rect
					x={-hx}
					y={-hy}
					width={hx * 2}
					height={hy * 2}
					fill="transparent"
					style="pointer-events: all; touch-action: none; cursor: {item.locked
						? 'not-allowed'
						: 'grab'}"
					data-hit={item.id}
					{...handlers(item)}
				/>
			</g>
		{/each}

		{#if selected && handle}
			<line
				x1={handle.edge.x}
				y1={handle.edge.y}
				x2={handle.at.x}
				y2={handle.at.y}
				style="stroke:var(--color-accent);stroke-width:2px;vector-effect:non-scaling-stroke"
			/>
			<circle
				cx={handle.at.x}
				cy={handle.at.y}
				r={px(13)}
				style="fill:var(--color-surface);stroke:var(--color-accent);stroke-width:2.5px;vector-effect:non-scaling-stroke"
			/>
			<g transform="translate({handle.at.x} {handle.at.y}) scale(1 -1)" style="pointer-events:none">
				<path
					d="M{px(-5)} {px(1)}a{px(5)} {px(5)} 0 1 1 {px(2)} {px(4.2)}M{px(-6.5)} {px(-3.5)}v{px(
						4.5
					)}h{px(4.5)}"
					fill="none"
					style="stroke:var(--color-accent);stroke-width:1.8px;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round"
				/>
			</g>
			<circle
				cx={handle.at.x}
				cy={handle.at.y}
				r={px(24)}
				fill="transparent"
				style="pointer-events: all; touch-action: none; cursor: grab"
				data-handle="rotate"
				aria-label={t(messages, 'rotateHandle')}
				{...{ onpointerdown: handleDown }}
			/>
			{#if liveAngle !== null}
				<g
					transform="translate({handle.at.x} {handle.at.y}) scale(1 -1)"
					style="pointer-events:none"
				>
					<rect
						x={px(-24)}
						y={px(-44)}
						width={px(48)}
						height={px(22)}
						rx={px(11)}
						class="fill-accent"
					/>
					<text
						text-anchor="middle"
						dominant-baseline="central"
						y={px(-33)}
						font-size={px(12)}
						font-weight="700"
						class="fill-accent-contrast"
					>
						{Math.round(liveAngle)}°
					</text>
				</g>
			{/if}
		{/if}
	{/if}
</g>

<style>
	.plop {
		animation: plop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
		transform-box: fill-box;
		transform-origin: center;
	}

	.vanish {
		animation: vanish 200ms cubic-bezier(0.4, 0, 1, 1) both;
		transform-box: fill-box;
		transform-origin: center;
	}

	.shake {
		animation: shake 420ms ease-in-out;
	}

	@keyframes vanish {
		0% {
			opacity: 1;
			transform: scale(1);
		}
		100% {
			opacity: 0;
			transform: scale(0.6);
		}
	}

	@keyframes plop {
		0% {
			opacity: 0;
			transform: scale(0.55);
		}
		60% {
			opacity: 1;
			transform: scale(1.08);
		}
		100% {
			transform: scale(1);
		}
	}

	@keyframes shake {
		0%,
		100% {
			transform: translateX(0);
		}
		25% {
			transform: translateX(calc(var(--shake) * -1));
		}
		75% {
			transform: translateX(var(--shake));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.plop,
		.vanish,
		.shake {
			animation: none;
		}
	}
</style>
