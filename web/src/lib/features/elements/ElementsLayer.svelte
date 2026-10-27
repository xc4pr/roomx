<script lang="ts">
	import { untrack } from 'svelte';
	import { validateRoom } from '#lib/core/checks.ts';
	import {
		boundingBox,
		centroid,
		dot,
		pointInPolygon,
		sub,
		wallPoint,
		walls,
		type Vec,
		type Wall
	} from '#lib/core/geometry.ts';
	import { newId } from '#lib/core/ids.ts';
	import { clearanceZone, elementFitsRoom } from '#lib/core/elements.ts';
	import {
		isElectrical,
		isFreeElement,
		isRoofWindow,
		isWallElement,
		type CeilingLamp,
		type FreeElement,
		type RoofWindow,
		type RoomElement,
		type WallElement
	} from '#lib/core/schema.ts';
	import { formatLength } from '#lib/core/units.ts';
	import { connections, originalId } from '#lib/features/board/connections.svelte.ts';
	import { getViewport, type RoomLayerProps } from '#lib/features/board/viewport.ts';
	import { elementKindNames } from '#lib/i18n/common.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { selectRoom, ui } from '#lib/state/ui.svelte.ts';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import Dimension from './Dimension.svelte';
	import { messages } from './i18n.ts';
	import {
		MIN_WIDTH,
		clamp,
		clampOffset,
		dragOffset,
		neighborSpans,
		nudgeDelta,
		pickWall,
		placementAt,
		roundStep,
		snapCeilingPoint,
		snapOffset,
		thresholdMm
	} from './logic.ts';
	import { dragFree } from './free.ts';
	import PlanShape from './PlanShape.svelte';
	import { clampToProfile } from './profile.ts';
	import { clampRoofOffset, roofWindowOutline } from './roof.ts';
	import { session } from './session.svelte.ts';
	import { thicknessAt } from '#lib/features/board/wallBands.ts';
	import { freeBounds, hitBounds, lateralMeasure, localBounds, symbolMetrics } from './shape.ts';

	type Look = 'existing' | 'planned' | 'suggested';
	type DragMode = 'move' | 'start' | 'end';

	interface Drawable {
		element: RoomElement;
		look: Look;
		suggestion: boolean;
		area: number;
		source?: string;
	}

	interface Drag {
		id: string;
		pointerId: number;
		mode: DragMode;
		clientX: number;
		clientY: number;
		moved: boolean;
		startWall: number;
		startOffset: number;
		startWidth: number;
		startAlong: number;
		grab: number;
		lastWall: number;
		grabX: number;
		grabY: number;
	}

	let { room, interactive }: RoomLayerProps = $props();

	const viewport = getViewport();
	const pxPerMm = $derived(viewport?.pxPerMm || 0.1);
	const px = (n: number): number => n / pxPerMm;

	const wallList = $derived(walls(room.polygon));
	const roomLinks = $derived(connections.roomLinks(room.id));
	function thicknessOf(element: RoomElement): number {
		return isWallElement(element)
			? thicknessAt(roomLinks, element.wall, element.offset, element.width)
			: thicknessAt(roomLinks, 0, 0, 0);
	}
	const hatchId = $derived(`hatch-${room.id}`);
	const isTarget = $derived(interactive && ui.selectedRoomId === room.id);
	const issueIds = $derived(
		new Set(
			validateRoom(room).flatMap((issue) =>
				issue.code === 'polygonInvalid' ? [] : issue.elementIds
			)
		)
	);

	function visible(element: RoomElement): boolean {
		return ui.electricalLayer || !isElectrical(element) || element.id === ui.selectedElementId;
	}

	function areaOf(element: RoomElement): number {
		if (isFreeElement(element)) return element.width * element.depth;
		if (!isWallElement(element)) return 1;
		const b = localBounds(element, pxPerMm, thicknessOf(element));
		return (b.x1 - b.x0) * (b.y1 - b.y0);
	}

	const suggestions = $derived(
		(store.activeVariant?.suggestions ?? [])
			.filter((suggestion) => suggestion.roomId === room.id)
			.map((suggestion) => suggestion.element)
	);

	const drawables = $derived.by(() => {
		const list: Drawable[] = [];
		for (const element of room.elements) {
			if (visible(element)) {
				list.push({ element, look: element.status, suggestion: false, area: areaOf(element) });
			}
		}
		for (const entry of connections.mirroredIn(room.id)) {
			list.push({
				element: entry.element,
				look: entry.element.status,
				suggestion: false,
				area: areaOf(entry.element),
				source: entry.sourceRoomId
			});
		}
		for (const element of suggestions) {
			if (visible(element)) {
				list.push({ element, look: 'suggested', suggestion: true, area: areaOf(element) });
			}
		}
		const selectedId = ui.selectedElementId;
		return list.sort((a, b) => {
			if (a.element.id === selectedId) return 1;
			if (b.element.id === selectedId) return -1;
			return b.area - a.area;
		});
	});

	const selected = $derived(drawables.find((entry) => entry.element.id === ui.selectedElementId));
	const placingKind = $derived(isTarget ? ui.placingKind : null);

	let tapPoint = $state<Vec | null>(null);
	let tapPointer: number | null = null;
	let dragging = $state(false);
	let settled = $state<string | null>(null);
	let settleTimer: ReturnType<typeof setTimeout> | undefined;

	function settle(id: string): void {
		clearTimeout(settleTimer);
		settled = id;
		settleTimer = setTimeout(() => (settled = null), 420);
	}
	let drag: Drag | null = null;
	let nudgeTimer: ReturnType<typeof setTimeout> | undefined;

	function ghostIds(): () => string {
		let count = 0;
		return () => (count++ === 0 ? 'ghost' : `ghost-${count}`);
	}

	const ghostKind = $derived(
		placingKind ?? (session.dragRoomId === room.id ? session.dragKind : null)
	);
	const ghostPoint = $derived.by((): Vec | null => {
		if (!ghostKind || !viewport) return null;
		if (placingKind && tapPoint) return tapPoint;
		if (session.dragKind && session.dragRoomId === room.id && session.pointer) {
			return viewport.clientToRoom(room, session.pointer.clientX, session.pointer.clientY);
		}
		return null;
	});
	const ghost = $derived(
		ghostKind && ghostPoint
			? placementAt(ghostKind, room, ghostPoint, ghostIds(), thresholdMm(pxPerMm))
			: undefined
	);

	const measured = $derived(
		ghost && isWallElement(ghost)
			? ghost
			: !ghost && selected && isWallElement(selected.element)
				? selected.element
				: undefined
	);
	const measuredWall = $derived(measured ? wallList[measured.wall - 1] : undefined);

	const catcher = $derived.by(() => {
		const box = boundingBox(room.polygon);
		const margin = 1500;
		return {
			x: box.minX - margin,
			y: box.minY - margin,
			width: box.maxX - box.minX + margin * 2,
			height: box.maxY - box.minY + margin * 2
		};
	});

	function frame(target: Wall | undefined): string {
		return target
			? `translate(${target.start.x} ${target.start.y}) rotate(${target.angleDeg})`
			: '';
	}

	function format(mm: number): string {
		return formatLength(mm, settings.unit, locale.language);
	}

	function tone(value: number): 'normal' | 'snap' | 'warn' {
		if (value < 0) return 'warn';
		return value === 0 ? 'snap' : 'normal';
	}

	function nearRoom(point: Vec): boolean {
		return (
			point.x >= catcher.x &&
			point.x <= catcher.x + catcher.width &&
			point.y >= catcher.y &&
			point.y <= catcher.y + catcher.height
		);
	}

	function place(kind: RoomElement['kind'], point: Vec): void {
		const element = placementAt(kind, room, point, newId, thresholdMm(pxPerMm));
		if (!element) return;
		store.addElement(room.id, element);
		settle(element.id);
		ui.selectedElementId = element.id;
		ui.placingKind = null;
		ui.panelTab = 'elements';
		if (isElectrical(element)) ui.electricalLayer = true;
	}

	function startDrag(event: PointerEvent, element: RoomElement, mode: DragMode, editable: boolean) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.stopPropagation();
		if (ui.selectedRoomId !== room.id) selectRoom(room.id);
		ui.selectedElementId = element.id;
		ui.panelTab = 'elements';
		if (!editable || !viewport) return;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		const point = viewport.clientToRoom(room, event.clientX, event.clientY);
		let along = 0;
		let grab = 0;
		let startWall = 0;
		let startOffset = 0;
		let startWidth = 0;
		if (isWallElement(element) || isRoofWindow(element)) {
			const target = wallList[element.wall - 1];
			if (target) along = dot(sub(point, target.start), target.direction);
			startWall = element.wall;
			startOffset = element.offset;
			startWidth = element.width;
			grab = along - (mode === 'end' ? element.offset + element.width : element.offset);
		}
		drag = {
			id: element.id,
			pointerId: event.pointerId,
			mode,
			clientX: event.clientX,
			clientY: event.clientY,
			moved: false,
			startWall,
			startOffset,
			startWidth,
			startAlong: along,
			grab,
			lastWall: startWall,
			grabX: element.kind === 'ceilingLamp' || isFreeElement(element) ? point.x - element.x : 0,
			grabY: element.kind === 'ceilingLamp' || isFreeElement(element) ? point.y - element.y : 0
		};
	}

	function moveDrag(event: PointerEvent): void {
		const current = drag;
		if (!current || event.pointerId !== current.pointerId || !viewport) return;
		event.stopPropagation();
		if (!current.moved) {
			if (Math.hypot(event.clientX - current.clientX, event.clientY - current.clientY) < 4) return;
			current.moved = true;
			dragging = true;
		}
		const element = room.elements.find((candidate) => candidate.id === current.id);
		if (!element) return;
		const point = viewport.clientToRoom(room, event.clientX, event.clientY);
		const threshold = thresholdMm(pxPerMm);
		const options = { coalesce: `drag-${element.id}` };

		if (element.kind === 'ceilingLamp') {
			const next = snapCeilingPoint(
				{ x: point.x - current.grabX, y: point.y - current.grabY },
				centroid(room.polygon),
				threshold
			);
			if (!pointInPolygon(next, room.polygon, 1)) return;
			if (next.x !== element.x || next.y !== element.y) {
				store.updateElement<CeilingLamp>(room.id, element.id, { x: next.x, y: next.y }, options);
			}
			return;
		}
		if (isFreeElement(element)) {
			const next = dragFree(
				room.polygon,
				element,
				point,
				{ x: current.grabX, y: current.grabY },
				threshold
			);
			if (next && (next.x !== element.x || next.y !== element.y)) {
				store.updateElement<FreeElement>(room.id, element.id, next, options);
			}
			return;
		}
		if (isRoofWindow(element)) {
			const target = wallList[element.wall - 1];
			if (!target) return;
			const along = dot(sub(point, target.start), target.direction);
			const raw = current.startOffset + (along - current.startAlong);
			const offset = clampRoofOffset(room, element.wall, roundStep(raw), element.width);
			if (offset !== element.offset) {
				store.updateElement<RoofWindow>(room.id, element.id, { offset }, options);
			}
			return;
		}
		if (!isWallElement(element)) return;

		if (current.mode === 'move') {
			const hit = pickWall(room.polygon, point, current.lastWall, px(36));
			if (!hit) return;
			current.lastWall = hit.wall.number;
			const raw = dragOffset({
				startOffset: current.startOffset,
				startAlong: current.startAlong,
				along: hit.along,
				width: element.width,
				sameWall: hit.wall.number === current.startWall
			});
			const snapped = snapOffset({
				offset: raw,
				width: element.width,
				wallLength: hit.wall.length,
				neighbors: neighborSpans(room, hit.wall.number, element.id),
				threshold
			});
			if (snapped.value !== element.offset || hit.wall.number !== element.wall) {
				store.updateElement<WallElement>(
					room.id,
					element.id,
					{ wall: hit.wall.number, offset: snapped.value },
					options
				);
			}
			return;
		}

		const target = wallList[element.wall - 1];
		if (!target) return;
		const edge = dot(sub(point, target.start), target.direction) - current.grab;
		const snapped = snapOffset({
			offset: edge,
			width: 0,
			wallLength: target.length,
			neighbors: neighborSpans(room, element.wall, element.id),
			threshold
		});
		const length = Math.round(target.length);
		if (current.mode === 'start') {
			const end = current.startOffset + current.startWidth;
			const offset = clamp(snapped.value, 0, end - MIN_WIDTH);
			if (offset !== element.offset) {
				store.updateElement<WallElement>(
					room.id,
					element.id,
					{ offset, width: end - offset },
					options
				);
			}
		} else {
			const end = clamp(snapped.value, current.startOffset + MIN_WIDTH, length);
			const width = end - current.startOffset;
			if (width !== element.width) {
				store.updateElement<WallElement>(room.id, element.id, { width }, options);
			}
		}
	}

	function endDrag(event: PointerEvent): void {
		if (!drag || event.pointerId !== drag.pointerId) return;
		event.stopPropagation();
		if (drag.moved) settle(drag.id);
		drag = null;
		dragging = false;
		store.sealHistory();
	}

	function swallow(event: Event): void {
		event.stopPropagation();
	}

	function pickSource(event: PointerEvent, entry: Drawable): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.stopPropagation();
		if (!entry.source) return;
		selectRoom(entry.source);
		ui.selectedElementId = originalId(entry.element.id);
		ui.panelTab = 'elements';
	}

	function handlers(element: RoomElement, mode: DragMode, editable: boolean) {
		return {
			onpointerdown: (event: PointerEvent) => startDrag(event, element, mode, editable),
			onpointermove: moveDrag,
			onpointerup: endDrag,
			onpointercancel: endDrag,
			onclick: swallow
		};
	}

	function catcherDown(event: PointerEvent): void {
		if (!viewport || !placingKind) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.stopPropagation();
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		tapPointer = event.pointerId;
		tapPoint = viewport.clientToRoom(room, event.clientX, event.clientY);
	}

	function catcherMove(event: PointerEvent): void {
		if (!viewport) return;
		if (tapPointer === null && event.pointerType !== 'mouse') return;
		if (tapPointer !== null && event.pointerId !== tapPointer) return;
		event.stopPropagation();
		tapPoint = viewport.clientToRoom(room, event.clientX, event.clientY);
	}

	function catcherUp(event: PointerEvent): void {
		if (tapPointer === null || event.pointerId !== tapPointer) return;
		event.stopPropagation();
		const point = tapPoint;
		const kind = placingKind;
		tapPointer = null;
		tapPoint = null;
		if (point && kind) place(kind, point);
	}

	function catcherCancel(event: PointerEvent): void {
		if (event.pointerId !== tapPointer) return;
		tapPointer = null;
		tapPoint = null;
	}

	function catcherLeave(): void {
		if (tapPointer === null) tapPoint = null;
	}

	$effect(() => {
		const request = session.drop;
		if (!request || request.roomId !== room.id || !viewport) return;
		untrack(() => {
			session.drop = null;
			const point = viewport.clientToRoom(room, request.clientX, request.clientY);
			if (nearRoom(point)) place(request.kind, point);
		});
	});

	function isTyping(target: EventTarget | null): boolean {
		return (
			target instanceof Element &&
			target.closest(
				'input, textarea, select, [contenteditable="true"], [role="radio"], [role="tab"], [role="slider"], [role="option"], [role="menuitem"], [role="spinbutton"], [role="listbox"], dialog'
			) !== null
		);
	}

	function removeSelected(element: RoomElement): void {
		store.removeElement(room.id, element.id);
		ui.selectedElementId = null;
		toasts.show({
			message: t(messages, 'deleted', { name: t(elementKindNames, element.kind) }),
			actionLabel: t(messages, 'undo'),
			onaction: () => store.undo()
		});
	}

	function onKey(event: KeyboardEvent): void {
		if (!isTarget || event.defaultPrevented) return;
		if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
		if (event.key === 'Escape') {
			if (ui.placingKind) ui.placingKind = null;
			else if (ui.selectedElementId) ui.selectedElementId = null;
			else return;
			event.preventDefault();
			return;
		}
		const element = room.elements.find((candidate) => candidate.id === ui.selectedElementId);
		if (!element) return;
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			removeSelected(element);
			return;
		}
		const delta = nudgeDelta(event.key, event.shiftKey, session.elevationOpen);
		if (!delta) return;
		event.preventDefault();
		const options = { coalesce: `nudge-${element.id}` };
		if (element.kind === 'ceilingLamp' || isFreeElement(element)) {
			const step = event.shiftKey ? 100 : 10;
			const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
			const dy = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
			const next = { x: element.x + dx, y: element.y + dy };
			if (pointInPolygon(next, room.polygon, 1))
				store.updateElement<CeilingLamp | FreeElement>(room.id, element.id, next, options);
		} else if (isRoofWindow(element)) {
			store.updateElement<RoofWindow>(
				room.id,
				element.id,
				{
					offset: clampRoofOffset(room, element.wall, element.offset + delta.along, element.width)
				},
				options
			);
		} else if (isWallElement(element)) {
			const target = wallList[element.wall - 1];
			if (!target) return;
			store.updateElement<WallElement>(
				room.id,
				element.id,
				{
					offset: clampOffset(element.offset + delta.along, element.width, target.length),
					elevation: clampToProfile(
						room,
						element.wall,
						clampOffset(element.offset + delta.along, element.width, target.length),
						element.width,
						element.elevation + delta.up,
						element.height
					)
				},
				options
			);
		}
		clearTimeout(nudgeTimer);
		nudgeTimer = setTimeout(() => store.sealHistory(), 600);
	}

	function handlePositions(element: RoomElement) {
		if (!isWallElement(element)) return undefined;
		if (
			![
				'door',
				'window',
				'builtin',
				'obstacle',
				'radiator',
				'washbasin',
				'toilet',
				'shower',
				'bathtub',
				'kitchenRun',
				'acWall'
			].includes(element.kind)
		)
			return undefined;
		if (element.width * pxPerMm < 70) return undefined;
		const b = localBounds(element, pxPerMm, thicknessOf(element));
		const y = (b.y0 + b.y1) / 2;
		return { start: { x: b.x0, y }, end: { x: b.x1, y } };
	}
</script>

<svelte:window onkeydown={onKey} />

<g class="elements" style:pointer-events={interactive ? undefined : 'none'}>
	<defs>
		<pattern
			id={hatchId}
			patternUnits="userSpaceOnUse"
			width={px(7)}
			height={px(7)}
			patternTransform="rotate(45)"
		>
			<line
				x1="0"
				y1="0"
				x2="0"
				y2={px(7)}
				style="stroke: var(--color-fixture); stroke-width: {px(1.3)}"
			/>
		</pattern>
	</defs>

	{#each drawables as entry (entry.element.id)}
		<g class:snap-in={settled === entry.element.id}>
			<PlanShape
				element={entry.element}
				wall={isWallElement(entry.element) ? wallList[entry.element.wall - 1] : undefined}
				{pxPerMm}
				{hatchId}
				look={entry.look}
				selected={entry.element.id === ui.selectedElementId}
				warn={issueIds.has(entry.element.id)}
				shared={connections.sharedIds.has(entry.element.id)}
				thickness={thicknessOf(entry.element)}
				zone={clearanceZone(room, entry.element)}
				unfit={!entry.suggestion && !entry.source && !elementFitsRoom(room, entry.element)}
				roof={isRoofWindow(entry.element) ? roofWindowOutline(room, entry.element) : undefined}
			/>
		</g>
	{/each}

	{#if ghost}
		{#if isWallElement(ghost) && measuredWall}
			<line
				x1={measuredWall.start.x}
				y1={measuredWall.start.y}
				x2={measuredWall.end.x}
				y2={measuredWall.end.y}
				style="stroke: var(--color-accent); stroke-width: 4; stroke-opacity: 0.45; vector-effect: non-scaling-stroke; pointer-events: none"
			/>
		{/if}
		<g style="pointer-events: none" opacity="0.85">
			<PlanShape
				element={ghost}
				wall={isWallElement(ghost) ? wallList[ghost.wall - 1] : undefined}
				{pxPerMm}
				{hatchId}
				look="suggested"
				selected
				thickness={thicknessOf(ghost)}
				roof={isRoofWindow(ghost) ? roofWindowOutline(room, ghost) : undefined}
			/>
		</g>
	{/if}

	{#if measured && measuredWall}
		{@const lateral = lateralMeasure(measured, pxPerMm, thicknessOf(measured))}
		{@const fromEnd = Math.round(measuredWall.length) - measured.offset - measured.width}
		<Dimension
			a={wallPoint(measuredWall, 0, lateral)}
			b={wallPoint(measuredWall, measured.offset, lateral)}
			text={format(measured.offset)}
			tone={tone(measured.offset)}
			{pxPerMm}
		/>
		<Dimension
			a={wallPoint(measuredWall, measured.offset + measured.width, lateral)}
			b={wallPoint(measuredWall, measuredWall.length, lateral)}
			text={format(fromEnd)}
			tone={tone(fromEnd)}
			{pxPerMm}
		/>
	{/if}

	{#if interactive}
		{#each drawables as entry (entry.element.id)}
			{@const element = entry.element}
			{@const editable = !entry.suggestion}
			{#if isWallElement(element)}
				{@const hb = hitBounds(element, pxPerMm, 44, thicknessOf(element))}
				<g transform={frame(wallList[element.wall - 1])}>
					<rect
						x={hb.x0}
						y={hb.y0}
						width={hb.x1 - hb.x0}
						height={hb.y1 - hb.y0}
						fill="transparent"
						style="cursor: {entry.source
							? 'pointer'
							: dragging
								? 'grabbing'
								: 'grab'}; touch-action: none"
						data-hit={element.id}
						{...entry.source
							? {
									onpointerdown: (event: PointerEvent) => pickSource(event, entry),
									onclick: swallow
								}
							: handlers(element, 'move', editable)}
					/>
				</g>
			{:else if isFreeElement(element)}
				{@const fb = freeBounds(element)}
				{@const reach = Math.max(0, px(22) - Math.min(element.width, element.depth) / 2)}
				<g transform="translate({element.x} {element.y}) rotate({element.rotation})">
					<rect
						x={fb.x0 - reach}
						y={fb.y0 - reach}
						width={fb.x1 - fb.x0 + reach * 2}
						height={fb.y1 - fb.y0 + reach * 2}
						fill="transparent"
						style="cursor: {dragging ? 'grabbing' : 'grab'}; touch-action: none"
						data-hit={element.id}
						{...handlers(element, 'move', editable)}
					/>
				</g>
			{:else if isRoofWindow(element)}
				{@const outline = roofWindowOutline(room, element)}
				{#if outline}
					<polygon
						points={outline.corners.map((p) => `${p.x},${p.y}`).join(' ')}
						fill="transparent"
						stroke="transparent"
						stroke-width={px(30)}
						stroke-linejoin="round"
						style="cursor: {dragging ? 'grabbing' : 'grab'}; touch-action: none"
						data-hit={element.id}
						{...entry.source
							? {
									onpointerdown: (event: PointerEvent) => pickSource(event, entry),
									onclick: swallow
								}
							: handlers(element, 'move', editable)}
					/>
				{/if}
			{:else if element.kind === 'ceilingLamp'}
				{@const lamp = symbolMetrics(element, pxPerMm)}
				<circle
					cx={element.x}
					cy={element.y}
					r={Math.max(lamp.radius, px(22))}
					fill="transparent"
					style="cursor: {dragging ? 'grabbing' : 'grab'}; touch-action: none"
					data-hit={element.id}
					{...handlers(element, 'move', editable)}
				/>
			{/if}
		{/each}

		{#if selected && !selected.suggestion && isTarget}
			{@const handles = handlePositions(selected.element)}
			{#if handles && isWallElement(selected.element)}
				<g transform={frame(wallList[selected.element.wall - 1])}>
					{#each [{ key: 'start', p: handles.start }, { key: 'end', p: handles.end }] as const as handle (handle.key)}
						<circle
							cx={handle.p.x}
							cy={handle.p.y}
							r={px(7)}
							style="fill: var(--color-surface); stroke: var(--color-accent); stroke-width: 2.5; vector-effect: non-scaling-stroke; pointer-events: none"
						/>
						<circle
							cx={handle.p.x}
							cy={handle.p.y}
							r={px(22)}
							fill="transparent"
							style="cursor: ew-resize; touch-action: none"
							data-handle={handle.key}
							{...handlers(selected.element, handle.key, true)}
						/>
					{/each}
				</g>
			{/if}
		{/if}

		{#if placingKind}
			<rect
				x={catcher.x}
				y={catcher.y}
				width={catcher.width}
				height={catcher.height}
				fill="transparent"
				data-catcher
				role="presentation"
				style="cursor: crosshair; touch-action: none"
				onpointerdown={catcherDown}
				onpointermove={catcherMove}
				onpointerup={catcherUp}
				onpointercancel={catcherCancel}
				onpointerleave={catcherLeave}
				{...{ onclick: swallow }}
			/>
		{/if}
	{/if}
</g>

<style>
	.snap-in {
		transform-box: fill-box;
		transform-origin: center;
		animation: snap-in var(--duration-slow) var(--ease-spring) both;
	}
	@keyframes snap-in {
		from {
			transform: scale(1.22);
		}
		55% {
			transform: scale(0.95);
		}
	}
</style>
