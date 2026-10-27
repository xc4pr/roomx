<script lang="ts">
	import { onMount } from 'svelte';
	import { validateRoom } from '#lib/core/checks.ts';
	import { kitchenModuleSpans, kitchenUpperSpans } from '#lib/core/elements.ts';
	import { cornerLabel, walls, wallSlope } from '#lib/core/geometry.ts';
	import {
		isElectrical,
		isWallElement,
		type KitchenRun,
		type WallElement
	} from '#lib/core/schema.ts';
	import { formatLength } from '#lib/core/units.ts';
	import { connections } from '#lib/features/board/connections.svelte.ts';
	import { locale, t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import { messages } from './i18n.ts';
	import { kindColor } from './kinds.ts';
	import {
		alongToScreen,
		neighborSpans,
		screenDeltaToAlong,
		snapElevation,
		snapOffset,
		SNAP_PX,
		type SnapKind
	} from './logic.ts';
	import { resolvePills, pillWidth, type PillSpec } from './pills.ts';
	import { isFlatProfile, movingLimit, profileSegments, wallProfile } from './profile.ts';
	import { session } from './session.svelte.ts';

	let { roomId, wall: wallNumber }: { roomId: string; wall: number } = $props();

	const PAD_LEFT = 58;
	const PAD_RIGHT = 14;
	const PAD_TOP = 30;
	const PAD_BOTTOM = 44;
	const TAP = 44;

	const room = $derived(store.room(roomId));
	const target = $derived(room ? walls(room.polygon)[wallNumber - 1] : undefined);
	const length = $derived(Math.round(target?.length ?? 0));
	const height = $derived(room?.height ?? 0);

	let box: HTMLDivElement | undefined = $state();
	let boxWidth = $state(340);
	let zoom = $state('1');

	onMount(() => {
		session.elevationOpen = true;
		return () => {
			session.elevationOpen = false;
		};
	});

	$effect(() => {
		if (!box) return;
		const observer = new ResizeObserver(() => {
			boxWidth = box?.clientWidth || 340;
		});
		observer.observe(box);
		boxWidth = box.clientWidth || 340;
		return () => observer.disconnect();
	});

	const scale = $derived.by(() => {
		if (length <= 0 || height <= 0) return 0.1;
		const fit = (boxWidth - PAD_LEFT - PAD_RIGHT) / length;
		return Math.min(fit, 340 / height) * Number(zoom);
	});
	const svgWidth = $derived(PAD_LEFT + length * scale + PAD_RIGHT);
	const svgHeight = $derived(PAD_TOP + height * scale + PAD_BOTTOM);
	const X = (mm: number): number => alongToScreen(mm, length, scale, PAD_LEFT);
	const Y = (mm: number): number => PAD_TOP + (height - mm) * scale;

	const profile = $derived(room ? wallProfile(room, wallNumber) : []);
	const sloped = $derived(profile.length > 1 && !isFlatProfile(profile, height));
	const segments = $derived(room && sloped ? profileSegments(room, wallNumber) : []);
	const ownSlope = $derived(room ? wallSlope(room, wallNumber) : undefined);
	const startTop = $derived(sloped ? Y(profile[0].height) : Y(height));
	const endTop = $derived(sloped ? Y(profile[profile.length - 1].height) : Y(height));
	const profileOutline = $derived(
		profile.map((point) => `${X(point.along)},${Y(point.height)}`).join(' ')
	);
	const profileFill = $derived(`${X(0)},${Y(0)} ${profileOutline} ${X(length)},${Y(0)}`);

	const issueIds = $derived(
		new Set(
			room
				? validateRoom(room).flatMap((issue) =>
						issue.code === 'polygonInvalid' ? [] : issue.elementIds
					)
				: []
		)
	);

	const elements = $derived.by(() => {
		if (!room) return [];
		return room.elements
			.filter(isWallElement)
			.filter((element) => element.wall === wallNumber)
			.filter(
				(element) =>
					ui.electricalLayer || !isElectrical(element) || element.id === ui.selectedElementId
			)
			.sort((a, b) => {
				if (a.id === ui.selectedElementId) return 1;
				if (b.id === ui.selectedElementId) return -1;
				return b.width * b.height - a.width * a.height;
			});
	});

	const selected = $derived(elements.find((element) => element.id === ui.selectedElementId));

	const shared = $derived(
		connections
			.mirroredIn(roomId)
			.filter((entry) => entry.element.wall === wallNumber)
			.map((entry) => ({
				element: entry.element,
				room: store.room(entry.sourceRoomId)?.name ?? ''
			}))
	);
	const withShared = $derived(room ? connections.withNeighbourOpenings(room) : undefined);

	let dragging = $state(false);
	let snapNow = $state<{ x: SnapKind; y: SnapKind } | null>(null);
	let drag: {
		id: string;
		pointerId: number;
		clientX: number;
		clientY: number;
		offset: number;
		elevation: number;
		moved: boolean;
		axis: 'x' | 'y' | null;
	} | null = null;

	const hatchId = $derived(`elev-hatch-${roomId}`);

	const pills = $derived.by((): PillSpec[] => {
		const list: PillSpec[] = [];
		const sel = selected;
		if (sel) {
			const b = symbolBox(sel);
			const top = sel.elevation + sel.height;
			const fromEnd = length - sel.offset - sel.width;
			list.push({
				id: 'axis-level',
				x: PAD_LEFT - 29,
				y: Y(sel.elevation),
				text: format(sel.elevation),
				tone: 'accent',
				slide: true
			});
			list.push({
				id: 'axis-top',
				x: PAD_LEFT - 29,
				y: Y(top),
				text: format(top),
				tone: 'accent',
				slide: true
			});
			if (sel.offset * scale > 40) {
				list.push({
					id: 'offset',
					x: X(sel.offset / 2),
					y: b.cy,
					text: format(sel.offset),
					tone: sel.offset === 0 ? 'accent' : 'normal'
				});
			}
			if (fromEnd * scale > 40) {
				list.push({
					id: 'from-end',
					x: X(sel.offset + sel.width + fromEnd / 2),
					y: b.cy,
					text: format(fromEnd),
					tone: fromEnd === 0 ? 'accent' : 'normal'
				});
			}
			if (sel.elevation > 0 && sel.elevation * scale > 26) {
				list.push({
					id: 'below',
					x: b.cx,
					y: (Y(0) + Y(sel.elevation)) / 2,
					text: `${levelName(sel)} ${format(sel.elevation)}`,
					tone: 'accent'
				});
			}
			if (height - top > 0 && (height - top) * scale > 26) {
				list.push({
					id: 'above',
					x: b.cx,
					y: (Y(top) + Y(height)) / 2,
					text: format(height - top),
					tone: 'normal'
				});
			}
		}
		if (sloped) {
			if (!ownSlope) {
				for (const [index, point] of [profile[0], profile[profile.length - 1]].entries()) {
					if (point.height >= height - 1) continue;
					const text = format(point.height);
					const edge = X(point.along);
					const inward = edge < X(length / 2) ? 1 : -1;
					list.push({
						id: `profile-end-${index}`,
						x: edge + inward * (pillWidth(text) / 2 + 6),
						y: Y(point.height) + 16,
						text,
						tone: 'normal'
					});
				}
			}
			if (ownSlope) {
				const top = Math.max(...profile.map((point) => point.height));
				list.push({
					id: 'knee',
					x: X(length / 2),
					y: Y(top) - 18,
					text: t(messages, 'kneeAngle', {
						knee: format(ownSlope.kneeHeight),
						angle: Math.round(ownSlope.angle)
					}),
					tone: 'normal'
				});
			}
			for (const [index, segment] of segments.entries()) {
				if (ownSlope || !segment.slope) continue;
				if ((segment.to.along - segment.from.along) * scale < 44) continue;
				list.push({
					id: `slope-${index}`,
					x: X((segment.from.along + segment.to.along) / 2),
					y: Y((segment.from.height + segment.to.height) / 2) - 18,
					text: t(messages, 'slopeAngle', { angle: Math.round(segment.slope.angle) }),
					tone: 'normal'
				});
			}
		}
		list.push({
			id: 'total-height',
			x: PAD_LEFT - 29,
			y: Y(height / 2),
			text: format(height),
			tone: 'normal',
			slide: true
		});
		list.push({
			id: 'total-length',
			x: X(length / 2),
			y: Y(0) + 22,
			text: format(length),
			tone: 'normal'
		});
		return resolvePills(list);
	});

	function format(mm: number): string {
		return formatLength(mm, settings.unit, locale.language);
	}

	function restSpans(
		run: KitchenRun,
		spans: ReturnType<typeof kitchenModuleSpans>
	): ReturnType<typeof kitchenModuleSpans> {
		const from = spans.length > 0 ? spans[spans.length - 1].to : 0;
		if (from >= run.width) return [];
		return [{ module: { id: 'rest', kind: 'base', width: run.width - from }, from, to: run.width }];
	}

	function extentHeight(element: WallElement): number {
		if (element.kind !== 'kitchenRun') return element.height;
		const hasTall = element.modules.some((module) => module.kind === 'tall');
		const top = Math.max(
			hasTall ? element.tallHeight : element.height,
			element.upper ? element.upper.elevation + element.upper.height - element.elevation : 0
		);
		return top;
	}

	function symbolBox(element: WallElement) {
		const width = element.width * scale;
		const tall = extentHeight(element) * scale;
		const w = Math.max(width, 22);
		const h = Math.max(tall, 22);
		const cx = X(element.offset + element.width / 2);
		const cy = Y(element.elevation) - tall / 2;
		return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy };
	}

	function hitBox(element: WallElement) {
		const b = symbolBox(element);
		const w = Math.max(b.w, TAP);
		const h = Math.max(b.h, TAP);
		return { x: b.cx - w / 2, y: b.cy - h / 2, w, h };
	}

	function down(event: PointerEvent, element: WallElement): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.stopPropagation();
		ui.selectedElementId = element.id;
		ui.panelTab = 'elements';
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		drag = {
			id: element.id,
			pointerId: event.pointerId,
			clientX: event.clientX,
			clientY: event.clientY,
			offset: element.offset,
			elevation: element.elevation,
			moved: false,
			axis: null
		};
	}

	function move(event: PointerEvent): void {
		const current = drag;
		if (!current || event.pointerId !== current.pointerId || !room || scale <= 0) return;
		event.stopPropagation();
		const dx = event.clientX - current.clientX;
		const dy = event.clientY - current.clientY;
		if (!current.moved) {
			if (Math.hypot(dx, dy) < 4) return;
			current.moved = true;
			dragging = true;
		}
		const element = room.elements.find((candidate) => candidate.id === current.id);
		if (!element || !isWallElement(element)) return;
		if (event.shiftKey && !current.axis) current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
		if (!event.shiftKey) current.axis = null;
		const threshold = SNAP_PX / scale;
		const neighbors = (withShared ?? room).elements
			.filter(isWallElement)
			.filter((other) => other.wall === wallNumber && other.id !== element.id);
		const patch: Partial<Pick<WallElement, 'offset' | 'elevation'>> = {};
		let kindX: SnapKind = 'grid';
		let kindY: SnapKind = 'grid';
		let nextOffset = element.offset;
		if (current.axis !== 'y') {
			const snapped = snapOffset({
				offset: current.offset + screenDeltaToAlong(dx, scale),
				width: element.width,
				wallLength: length,
				neighbors: neighborSpans(withShared ?? room, wallNumber, element.id),
				threshold
			});
			patch.offset = snapped.value;
			nextOffset = snapped.value;
			kindX = snapped.kind;
		}
		if (current.axis !== 'x') {
			const snapped = snapElevation({
				elevation: current.elevation - dy / scale,
				height: element.height,
				roomHeight: Math.round(movingLimit(room, wallNumber, element, nextOffset, element.width)),
				neighbors,
				threshold
			});
			patch.elevation = snapped.value;
			kindY = snapped.kind;
		}
		snapNow = { x: kindX, y: kindY };
		const changed =
			(patch.offset !== undefined && patch.offset !== element.offset) ||
			(patch.elevation !== undefined && patch.elevation !== element.elevation);
		if (changed) {
			store.updateElement<WallElement>(room.id, element.id, patch, {
				coalesce: `drag-${element.id}`
			});
		}
	}

	function up(event: PointerEvent): void {
		if (!drag || event.pointerId !== drag.pointerId) return;
		event.stopPropagation();
		drag = null;
		dragging = false;
		snapNow = null;
		store.sealHistory();
	}

	function background(event: PointerEvent): void {
		event.stopPropagation();
		ui.selectedElementId = null;
	}

	function swallow(event: Event): void {
		event.stopPropagation();
	}

	function levelName(element: WallElement): string {
		return element.kind === 'window' ? t(messages, 'sill') : t(messages, 'lowerEdge');
	}

	const zoomItems = [
		{ value: '1', label: '1×' },
		{ value: '2', label: '2×' },
		{ value: '4', label: '4×' }
	];
</script>

{#snippet pill(x: number, y: number, text: string, tone: 'normal' | 'accent' | 'warn' = 'normal')}
	{@const w = text.length * 6.6 + 12}
	<g style="pointer-events: none">
		<rect
			x={x - w / 2}
			y={y - 9.5}
			width={w}
			height={19}
			rx={9.5}
			style="fill: var(--color-surface); stroke: {tone === 'warn'
				? 'var(--color-danger)'
				: tone === 'accent'
					? 'var(--color-accent)'
					: 'var(--color-border)'}; stroke-width: 1"
		/>
		<text
			{x}
			{y}
			text-anchor="middle"
			dominant-baseline="central"
			font-size="11.5"
			style="fill: {tone === 'warn'
				? 'var(--color-danger)'
				: tone === 'accent'
					? 'var(--color-accent)'
					: 'var(--color-text)'}; font-weight: 600"
		>
			{text}
		</text>
	</g>
{/snippet}

{#snippet kitchen(run: KitchenRun)}
	{@const worktop = run.elevation + run.height}
	{@const line = 'stroke: var(--color-fixture); stroke-width: 1.5'}
	{@const thin = 'stroke: var(--color-fixture); stroke-width: 1'}
	{@const spans = kitchenModuleSpans(run)}
	{@const x = (mm: number) => X(run.offset + mm)}
	{@render kitchenBase(run, spans, x, worktop, line)}
	{#each spans as span (span.module.id)}
		{@const x0 = Math.min(x(span.from), x(span.to))}
		{@const x1 = Math.max(x(span.from), x(span.to))}
		{@const mw = x1 - x0}
		{#if span.module.kind === 'tall'}
			{@const top = Y(run.elevation + run.tallHeight)}
			<rect
				x={x0}
				y={top}
				width={mw}
				height={Y(run.elevation) - top}
				style="fill: var(--color-surface); {line}"
			/>
			{#each span.module.appliances ?? [] as appliance, i (appliance)}
				{@const fridge = appliance === 'fridge'}
				{@const h = (fridge ? 1450 : appliance === 'oven' ? 600 : 450) * scale}
				{@const y0 = fridge ? Y(run.elevation) - h : Y(run.elevation + 800 + i * 600) - h}
				<rect
					x={x0 + 3}
					y={y0 + 3}
					width={Math.max(0, mw - 6)}
					height={Math.max(0, h - 6)}
					rx={2}
					fill="none"
					style={thin}
				/>
				{#if fridge}
					<line
						x1={x1 - 8}
						y1={y0 + h * 0.25}
						x2={x1 - 8}
						y2={y0 + h * 0.55}
						style="stroke: var(--color-fixture); stroke-width: 2"
					/>
				{:else}
					<rect
						x={x0 + mw * 0.2}
						y={y0 + h * 0.3}
						width={mw * 0.6}
						height={h * 0.4}
						fill="none"
						style={thin}
					/>
				{/if}
			{/each}
		{/if}
	{/each}
	{#if run.upper}
		{@const upper = run.upper}
		{#each kitchenUpperSpans(run) as span (span.from)}
			{@const x0 = Math.min(x(span.from), x(span.to))}
			{@const x1 = Math.max(x(span.from), x(span.to))}
			{@const top = Y(upper.elevation + upper.height)}
			{@const count = Math.max(1, Math.round((span.to - span.from) / 600))}
			<rect
				x={x0}
				y={top}
				width={x1 - x0}
				height={upper.height * scale}
				style="fill: var(--color-surface); {line}"
			/>
			{#each Array.from({ length: count - 1 }, (_, i) => i + 1) as i (i)}
				<line
					x1={x0 + ((x1 - x0) * i) / count}
					y1={top}
					x2={x0 + ((x1 - x0) * i) / count}
					y2={top + upper.height * scale}
					style={thin}
				/>
			{/each}
		{/each}
	{/if}
{/snippet}

{#snippet kitchenBase(
	run: KitchenRun,
	spans: ReturnType<typeof kitchenModuleSpans>,
	x: (mm: number) => number,
	worktop: number,
	line: string
)}
	{@const thin = 'stroke: var(--color-fixture); stroke-width: 1'}
	{@const baseSpans = [
		...spans.filter((span) => span.module.kind !== 'tall'),
		...restSpans(run, spans)
	]}
	{#each baseSpans as span, index (index)}
		{@const x0 = Math.min(x(span.from), x(span.to))}
		{@const x1 = Math.max(x(span.from), x(span.to))}
		{@const mw = x1 - x0}
		{@const top = Y(worktop)}
		{@const bottom = Y(run.elevation)}
		{#if span.module.kind === 'table'}
			<rect
				x={x0}
				y={top}
				width={mw}
				height={40 * scale}
				style="fill: var(--color-fixture); fill-opacity: 0.35; {line}"
			/>
			<line x1={x0 + 3} y1={top + 40 * scale} x2={x0 + 3} y2={bottom} style={line} />
			<line x1={x1 - 3} y1={top + 40 * scale} x2={x1 - 3} y2={bottom} style={line} />
		{:else}
			<rect
				x={x0}
				y={top}
				width={mw}
				height={bottom - top}
				style="fill: var(--color-surface); {line}"
			/>
			<rect
				x={x0}
				y={top}
				width={mw}
				height={Math.max(2, 40 * scale)}
				style="fill: var(--color-fixture); fill-opacity: 0.5; {thin}"
			/>
			{#if span.module.kind === 'dishwasher'}
				<line
					x1={x0 + mw * 0.2}
					y1={top + (bottom - top) * 0.2}
					x2={x0 + mw * 0.8}
					y2={top + (bottom - top) * 0.2}
					style="stroke: var(--color-fixture); stroke-width: 2"
				/>
			{:else if span.module.kind === 'hob' || span.module.kind === 'base'}
				{#each span.module.appliances ?? [] as appliance (appliance)}
					<rect
						x={x0 + mw * 0.12}
						y={top + (bottom - top) * 0.22}
						width={mw * 0.76}
						height={(bottom - top) * 0.5}
						rx={2}
						fill="none"
						style={thin}
					/>
					<title>{appliance}</title>
				{/each}
				<line
					x1={x0 + mw * 0.3}
					y1={top + 5 + 40 * scale}
					x2={x0 + mw * 0.7}
					y2={top + 5 + 40 * scale}
					style="stroke: var(--color-fixture); stroke-width: 1.5"
				/>
			{:else if span.module.kind === 'sink'}
				<line x1={x0 + mw / 2} y1={top + 40 * scale} x2={x0 + mw / 2} y2={bottom} style={thin} />
			{/if}
		{/if}
	{/each}
{/snippet}

{#snippet glyph(element: WallElement, color: string)}
	{@const outline = `fill: var(--color-surface); stroke: ${color}; stroke-width: 2`}
	{@const b = symbolBox(element)}
	{#if element.kind === 'window'}
		<rect
			x={b.x}
			y={b.y}
			width={b.w}
			height={b.h}
			style="fill: {color}; fill-opacity: 0.16; stroke: {color}; stroke-width: 2"
		/>
		<rect
			x={b.x + 5}
			y={b.y + 5}
			width={Math.max(0, b.w - 10)}
			height={Math.max(0, b.h - 10)}
			fill="none"
			style="stroke: {color}; stroke-width: 1.25"
		/>
		{#if element.windowType === 'tiltTurn'}
			<polyline
				points="{b.x + 5},{b.y + 5} {b.x + b.w - 5},{b.cy} {b.x + 5},{b.y + b.h - 5}"
				fill="none"
				style="stroke: {color}; stroke-width: 1; stroke-dasharray: 4 3"
			/>
			<polyline
				points="{b.x + 5},{b.y + 5} {b.cx},{b.y + b.h - 5} {b.x + b.w - 5},{b.y + 5}"
				fill="none"
				style="stroke: {color}; stroke-width: 1; stroke-dasharray: 2 3"
			/>
		{:else if element.windowType === 'balconyDoor'}
			<polyline
				points="{b.x + 5},{b.y + 5} {b.x + b.w - 5},{b.cy} {b.x + 5},{b.y + b.h - 5}"
				fill="none"
				style="stroke: {color}; stroke-width: 1; stroke-dasharray: 4 3"
			/>
			<line
				x1={b.x + b.w / 2}
				y1={b.y + 5}
				x2={b.x + b.w / 2}
				y2={b.y + b.h - 5}
				style="stroke: {color}; stroke-width: 1.25"
			/>
		{:else if element.windowType === 'sliding'}
			<line
				x1={b.cx}
				y1={b.y + 5}
				x2={b.cx}
				y2={b.y + b.h - 5}
				style="stroke: {color}; stroke-width: 1.25"
			/>
			<line
				x1={b.cx - 14}
				y1={b.cy}
				x2={b.cx + 14}
				y2={b.cy}
				style="stroke: {color}; stroke-width: 1.5"
			/>
		{:else}
			<line
				x1={b.x + 5}
				y1={b.y + 5}
				x2={b.x + b.w - 5}
				y2={b.y + b.h - 5}
				style="stroke: {color}; stroke-width: 1"
			/>
			<line
				x1={b.x + 5}
				y1={b.y + b.h - 5}
				x2={b.x + b.w - 5}
				y2={b.y + 5}
				style="stroke: {color}; stroke-width: 1"
			/>
		{/if}
	{:else if element.kind === 'door'}
		{@const hingeLeft = element.hinge === 'end'}
		{@const hx = hingeLeft ? b.x : b.x + b.w}
		{@const kx = hingeLeft ? b.x + b.w : b.x}
		<rect
			x={b.x}
			y={b.y}
			width={b.w}
			height={b.h}
			style="fill: {color}; fill-opacity: 0.16; stroke: {color}; stroke-width: 2"
		/>
		{#if element.swing === 'sliding'}
			<line
				x1={b.x + 6}
				y1={b.cy}
				x2={b.x + b.w - 6}
				y2={b.cy}
				style="stroke: {color}; stroke-width: 1.5"
			/>
			<polyline
				points="{b.x + b.w - 14},{b.cy - 5} {b.x + b.w - 6},{b.cy} {b.x + b.w - 14},{b.cy + 5}"
				fill="none"
				style="stroke: {color}; stroke-width: 1.5"
			/>
		{:else}
			<polyline
				points="{kx},{b.y} {hx},{b.cy} {kx},{b.y + b.h}"
				fill="none"
				style="stroke: {color}; stroke-width: 1; stroke-dasharray: 4 3"
			/>
			<circle cx={hingeLeft ? b.x + b.w - 9 : b.x + 9} cy={b.cy} r={3} style="fill: {color}" />
		{/if}
	{:else if element.kind === 'builtin' || element.kind === 'obstacle' || element.kind === 'radiator'}
		<rect
			x={b.x}
			y={b.y}
			width={b.w}
			height={b.h}
			style="fill: url(#{hatchId}); stroke: var(--color-fixture); stroke-width: 2"
		/>
		{#if element.kind === 'builtin'}
			{#each Array.from({ length: Math.max(0, Math.round(element.width / 500) - 1) }, (_, i) => i + 1) as i (i)}
				<line
					x1={b.x + (b.w * i) / Math.round(element.width / 500)}
					y1={b.y}
					x2={b.x + (b.w * i) / Math.round(element.width / 500)}
					y2={b.y + b.h}
					style="stroke: var(--color-fixture); stroke-width: 1.25"
				/>
			{/each}
		{:else if element.kind === 'radiator'}
			{#each Array.from({ length: Math.max(0, Math.floor(b.w / 12) - 1) }, (_, i) => i + 1) as i (i)}
				<line
					x1={b.x + i * 12}
					y1={b.y + 4}
					x2={b.x + i * 12}
					y2={b.y + b.h - 4}
					style="stroke: var(--color-fixture); stroke-width: 1"
				/>
			{/each}
		{/if}
	{:else if element.kind === 'kitchenRun'}
		{@render kitchen(element)}
	{:else if element.kind === 'washbasin'}
		<rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} style={outline} />
		<path
			d="M {b.x + b.w * 0.12} {b.y + b.h * 0.18} Q {b.cx} {b.y + b.h * 0.46} {b.x +
				b.w * 0.88} {b.y + b.h * 0.18}"
			fill="none"
			style="stroke: {color}; stroke-width: 1.5"
		/>
		<line
			x1={b.cx}
			y1={b.y + b.h * 0.46}
			x2={b.cx}
			y2={b.y + b.h * 0.7}
			style="stroke: {color}; stroke-width: 1.25"
		/>
	{:else if element.kind === 'toilet'}
		<rect
			x={b.x + b.w * 0.05}
			y={b.y}
			width={b.w * 0.9}
			height={b.h * 0.5}
			rx={3}
			style={outline}
		/>
		<path
			d="M {b.x + b.w * 0.1} {b.y + b.h * 0.58} h {b.w * 0.8} v {b.h * 0.12} q 0 {b.h * 0.3} {-b.w *
				0.4} {b.h * 0.3} q {-b.w * 0.4} 0 {-b.w * 0.4} {-b.h * 0.3} Z"
			fill="none"
			style="stroke: {color}; stroke-width: 1.5"
		/>
	{:else if element.kind === 'shower'}
		<rect x={b.x} y={b.y} width={b.w} height={b.h} style={outline} />
		<line
			x1={b.x + 4}
			y1={b.y + 4}
			x2={b.x + b.w - 4}
			y2={b.y + b.h - 4}
			style="stroke: {color}; stroke-width: 1"
		/>
		<line
			x1={b.x + 4}
			y1={b.y + b.h - 4}
			x2={b.x + b.w - 4}
			y2={b.y + 4}
			style="stroke: {color}; stroke-width: 1"
		/>
		<circle
			cx={b.x + b.w * 0.5}
			cy={b.y + 7}
			r={4}
			fill="none"
			style="stroke: {color}; stroke-width: 1.5"
		/>
	{:else if element.kind === 'bathtub'}
		<rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} style={outline} />
		<line
			x1={b.x + 3}
			y1={b.y + b.h * 0.3}
			x2={b.x + b.w - 3}
			y2={b.y + b.h * 0.3}
			style="stroke: {color}; stroke-width: 1; stroke-dasharray: 4 3"
		/>
	{:else if element.kind === 'acWall'}
		<rect
			x={b.x}
			y={b.y}
			width={b.w}
			height={b.h}
			rx={5}
			style="fill: var(--color-surface); stroke: {color}; stroke-width: 2"
		/>
		{#each [0.55, 0.72, 0.89] as at (at)}
			<line
				x1={b.x + b.w * 0.08}
				y1={b.y + b.h * at}
				x2={b.x + b.w * 0.92}
				y2={b.y + b.h * at}
				style="stroke: {color}; stroke-width: 1.25"
			/>
		{/each}
	{:else if element.kind === 'socket'}
		<rect
			x={b.x}
			y={b.y}
			width={b.w}
			height={b.h}
			rx={5}
			style="fill: var(--color-surface); stroke: {color}; stroke-width: 2"
		/>
		{#each Array.from({ length: element.gang }, (_, i) => i) as i (i)}
			<circle
				cx={b.x + (b.w * (i + 0.5)) / element.gang}
				cy={b.cy}
				r={Math.min(b.h, b.w / element.gang) * 0.3}
				fill="none"
				style="stroke: {color}; stroke-width: 1.5"
			/>
		{/each}
	{:else if element.kind === 'switch'}
		<rect
			x={b.x}
			y={b.y}
			width={b.w}
			height={b.h}
			rx={5}
			style="fill: var(--color-surface); stroke: {color}; stroke-width: 2"
		/>
		<rect
			x={b.cx - b.w * 0.18}
			y={b.cy - b.h * 0.3}
			width={b.w * 0.36}
			height={b.h * 0.6}
			rx={2}
			style="fill: {color}; fill-opacity: 0.5; stroke: {color}; stroke-width: 1"
		/>
	{:else if element.kind === 'wallLamp'}
		<circle
			cx={b.cx}
			cy={b.cy}
			r={Math.min(b.w, b.h) / 2}
			style="fill: var(--color-surface); stroke: {color}; stroke-width: 2"
		/>
		<line
			x1={b.cx - b.w * 0.25}
			y1={b.cy - b.h * 0.25}
			x2={b.cx + b.w * 0.25}
			y2={b.cy + b.h * 0.25}
			style="stroke: {color}; stroke-width: 1.5"
		/>
		<line
			x1={b.cx - b.w * 0.25}
			y1={b.cy + b.h * 0.25}
			x2={b.cx + b.w * 0.25}
			y2={b.cy - b.h * 0.25}
			style="stroke: {color}; stroke-width: 1.5"
		/>
	{:else if element.kind === 'dataPort'}
		<rect
			x={b.x}
			y={b.y}
			width={b.w}
			height={b.h}
			rx={5}
			style="fill: var(--color-surface); stroke: {color}; stroke-width: 2"
		/>
		<rect
			x={b.cx - b.w * 0.22}
			y={b.cy - b.h * 0.2}
			width={b.w * 0.44}
			height={b.h * 0.4}
			rx={2}
			fill="none"
			style="stroke: {color}; stroke-width: 1.5"
		/>
	{/if}
{/snippet}

<div class="flex flex-col gap-3" data-testid="wall-elevation">
	<div class="flex items-center justify-between gap-3">
		<p class="min-w-0 text-sm font-semibold">
			{t(messages, 'wallTitle', {
				n: wallNumber,
				corners: target ? `${cornerLabel(target.startIndex)}–${cornerLabel(target.endIndex)}` : ''
			})}
			<span class="font-normal text-muted">· {format(length)} × {format(height)}</span>
		</p>
		<SegmentedControl items={zoomItems} bind:value={zoom} label={t(messages, 'zoom')} />
	</div>

	{#if !room || !target}
		<p class="text-sm text-muted">{t(messages, 'wallMissing')}</p>
	{:else}
		<div
			bind:this={box}
			class="no-scrollbar overflow-x-auto rounded-lg border border-border bg-surface"
		>
			<svg
				width={svgWidth}
				height={svgHeight}
				viewBox="0 0 {svgWidth} {svgHeight}"
				role="img"
				aria-label={t(messages, 'wallTitle', { n: wallNumber, corners: '' })}
				class="block"
				style="touch-action: pan-x pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none"
			>
				<defs>
					<pattern
						id={hatchId}
						patternUnits="userSpaceOnUse"
						width="7"
						height="7"
						patternTransform="rotate(45)"
					>
						<line
							x1="0"
							y1="0"
							x2="0"
							y2="7"
							style="stroke: var(--color-fixture); stroke-width: 1.2"
						/>
					</pattern>
				</defs>

				<rect
					x={X(length)}
					y={Y(height)}
					width={length * scale}
					height={height * scale}
					style="fill: {sloped ? 'transparent' : 'var(--color-surface-2)'}"
					onpointerdown={background}
					onclick={swallow}
					role="presentation"
				/>
				<line
					x1={X(0)}
					y1={Y(0)}
					x2={X(length)}
					y2={Y(0)}
					style="stroke: var(--color-text); stroke-width: 2.5"
				/>
				{#if sloped}
					<polygon
						points={profileFill}
						style="fill: var(--color-surface-2); pointer-events: none"
						data-testid="wall-profile"
					/>
					<line
						x1={X(0)}
						y1={Y(height)}
						x2={X(length)}
						y2={Y(height)}
						style="stroke: var(--color-muted); stroke-width: 1; stroke-dasharray: 5 4; pointer-events: none"
					/>
					<polyline
						points={profileOutline}
						fill="none"
						stroke-linejoin="round"
						style="stroke: var(--color-text); stroke-width: 2.5; pointer-events: none"
					/>
				{:else}
					<line
						x1={X(0)}
						y1={Y(height)}
						x2={X(length)}
						y2={Y(height)}
						style="stroke: var(--color-text); stroke-width: 2.5"
					/>
				{/if}
				<line
					x1={X(0)}
					y1={Y(0)}
					x2={X(0)}
					y2={startTop}
					style="stroke: var(--color-border); stroke-width: 1.5"
				/>
				<line
					x1={X(length)}
					y1={Y(0)}
					x2={X(length)}
					y2={endTop}
					style="stroke: var(--color-border); stroke-width: 1.5"
				/>

				<text
					x={X(0)}
					y={PAD_TOP - 12}
					text-anchor="middle"
					font-size="12"
					style="fill: var(--color-muted); font-weight: 700">{cornerLabel(target.startIndex)}</text
				>
				<text
					x={X(length)}
					y={PAD_TOP - 12}
					text-anchor="middle"
					font-size="12"
					style="fill: var(--color-muted); font-weight: 700">{cornerLabel(target.endIndex)}</text
				>

				<line
					x1={X(0)}
					y1={Y(0) + 22}
					x2={X(length)}
					y2={Y(0) + 22}
					style="stroke: var(--color-muted); stroke-width: 1.25"
				/>
				<line
					x1={X(0)}
					y1={Y(0) + 17}
					x2={X(0)}
					y2={Y(0) + 27}
					style="stroke: var(--color-muted); stroke-width: 1.25"
				/>
				<line
					x1={X(length)}
					y1={Y(0) + 17}
					x2={X(length)}
					y2={Y(0) + 27}
					style="stroke: var(--color-muted); stroke-width: 1.25"
				/>

				<line
					x1={PAD_LEFT - 29}
					y1={Y(0)}
					x2={PAD_LEFT - 29}
					y2={Y(height)}
					style="stroke: var(--color-muted); stroke-width: 1.25"
				/>
				<line
					x1={PAD_LEFT - 34}
					y1={Y(0)}
					x2={PAD_LEFT - 24}
					y2={Y(0)}
					style="stroke: var(--color-muted); stroke-width: 1.25"
				/>
				<line
					x1={PAD_LEFT - 34}
					y1={Y(height)}
					x2={PAD_LEFT - 24}
					y2={Y(height)}
					style="stroke: var(--color-muted); stroke-width: 1.25"
				/>

				{#each shared as entry (entry.element.id)}
					<g opacity="0.7" style="pointer-events: none" data-testid="wall-shared">
						{@render glyph(entry.element, kindColor(entry.element.kind))}
					</g>
				{/each}

				{#each elements as element (element.id)}
					{@const color =
						element.status === 'suggested' ? 'var(--color-suggested)' : kindColor(element.kind)}
					<g
						opacity={element.status === 'planned' ? 0.85 : 1}
						style={element.status === 'suggested' ? 'stroke-dasharray: 6 4' : ''}
					>
						{#if element.id === ui.selectedElementId}
							{@const b = symbolBox(element)}
							<rect
								x={b.x - 4}
								y={b.y - 4}
								width={b.w + 8}
								height={b.h + 8}
								rx={5}
								style="fill: {issueIds.has(element.id)
									? 'var(--color-danger)'
									: 'var(--color-accent)'}; fill-opacity: 0.16; stroke: {issueIds.has(element.id)
									? 'var(--color-danger)'
									: 'var(--color-accent)'}; stroke-width: 2.5; stroke-dasharray: none"
							/>
						{/if}
						{@render glyph(element, color)}
					</g>
				{/each}

				{#if selected}
					{@const b = symbolBox(selected)}
					{@const top = selected.elevation + selected.height}
					{@const fromEnd = length - selected.offset - selected.width}
					<line
						x1={X(0)}
						y1={Y(selected.elevation)}
						x2={X(length)}
						y2={Y(selected.elevation)}
						style="stroke: var(--color-accent); stroke-width: 1; stroke-dasharray: 4 4; pointer-events: none; opacity: {snapNow &&
						snapNow.y !== 'grid'
							? 1
							: 0.55}"
					/>
					<line
						x1={X(0)}
						y1={Y(top)}
						x2={X(length)}
						y2={Y(top)}
						style="stroke: var(--color-accent); stroke-width: 1; stroke-dasharray: 4 4; pointer-events: none; opacity: {snapNow &&
						snapNow.y !== 'grid'
							? 1
							: 0.55}"
					/>
					{#if selected.elevation > 0}
						<line
							x1={b.cx}
							y1={Y(0)}
							x2={b.cx}
							y2={Y(selected.elevation)}
							style="stroke: var(--color-accent); stroke-width: 1.25; pointer-events: none"
						/>
					{/if}
					{#if height - top > 0}
						<line
							x1={b.cx}
							y1={Y(top)}
							x2={b.cx}
							y2={Y(height)}
							style="stroke: var(--color-muted); stroke-width: 1.25; pointer-events: none"
						/>
					{/if}
					{#if selected.offset * scale > 8}
						<line
							x1={X(0)}
							y1={b.cy}
							x2={X(selected.offset)}
							y2={b.cy}
							style="stroke: var(--color-accent); stroke-width: 1.25; pointer-events: none"
						/>
					{/if}
					{#if fromEnd * scale > 8}
						<line
							x1={X(selected.offset + selected.width)}
							y1={b.cy}
							x2={X(length)}
							y2={b.cy}
							style="stroke: var(--color-accent); stroke-width: 1.25; pointer-events: none"
						/>
					{/if}
				{/if}

				{#each pills as entry (entry.id)}
					{@render pill(entry.x, entry.y, entry.text, entry.tone)}
				{/each}

				{#each shared as entry (entry.element.id)}
					{@const b = symbolBox(entry.element)}
					{@render pill(b.cx, b.y + b.h - 14, t(messages, 'fromRoom', { room: entry.room }))}
				{/each}

				{#each elements as element (element.id)}
					{@const h = hitBox(element)}
					<rect
						x={h.x}
						y={h.y}
						width={h.w}
						height={h.h}
						fill="transparent"
						style="cursor: {dragging ? 'grabbing' : 'grab'}; touch-action: none"
						data-hit={element.id}
						role="presentation"
						onpointerdown={(event) => down(event, element)}
						onpointermove={move}
						onpointerup={up}
						onpointercancel={up}
						onclick={swallow}
					/>
				{/each}
			</svg>
		</div>
		<p class="text-xs text-muted pointer-coarse:text-sm">
			{t(messages, 'viewFromInside', { n: wallNumber })}
			{t(messages, 'elevationHint')}
		</p>
	{/if}
</div>
