<script lang="ts">
	import { centroid, type Vec } from '#lib/core/geometry.ts';
	import { stairwellRailing } from '#lib/core/floors.ts';
	import type { Stair } from '#lib/core/schema.ts';
	import { getViewport } from '#lib/features/board/viewport.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { activeFloorId, selectRoom, ui } from '#lib/state/ui.svelte.ts';
	import { messages } from './i18n.ts';
	import {
		angleFromHandle,
		cutLine,
		handlePosition,
		snapAngle,
		stairsArrivingOn,
		stairsStartingOn
	} from './logic.ts';
	import { stairContext } from '#lib/core/floors.ts';

	let { k, interactive }: { k: number; interactive: boolean } = $props();

	const viewport = getViewport();
	const u = $derived(1 / k);
	const project = $derived(store.project);
	const floorId = $derived(activeFloorId(project));
	const lower = $derived.by(() => {
		if (!project || !floorId) return [];
		return stairsStartingOn(project, floorId).flatMap((stair) => {
			const context = stairContext(project, stair);
			return context ? [{ stair, context }] : [];
		});
	});
	const upper = $derived(project && floorId ? stairsArrivingOn(project, floorId) : []);

	const points = (polygon: readonly Vec[]): string => polygon.map((p) => `${p.x},${p.y}`).join(' ');

	function arrow(from: Vec, to: Vec): string {
		const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
		const dir = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
		const size = 14 * u;
		const base = { x: to.x - dir.x * size, y: to.y - dir.y * size };
		const left = { x: base.x - dir.y * size * 0.5, y: base.y + dir.x * size * 0.5 };
		const right = { x: base.x + dir.y * size * 0.5, y: base.y - dir.x * size * 0.5 };
		return points([to, left, right]);
	}

	interface Drag {
		pointerId: number;
		mode: 'move' | 'rotate';
		start: Vec;
		origin: Stair;
		moved: boolean;
	}

	let drag: Drag | null = null;

	function select(stair: Stair): void {
		if (ui.selectedRoomId !== null) selectRoom(null);
		ui.selectedStairId = stair.id;
	}

	function begin(event: PointerEvent, stair: Stair, mode: Drag['mode']): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.stopPropagation();
		select(stair);
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		drag = {
			pointerId: event.pointerId,
			mode,
			start: viewport.clientToBoard(event.clientX, event.clientY),
			origin: { ...stair },
			moved: false
		};
	}

	function move(event: PointerEvent): void {
		if (!drag || drag.pointerId !== event.pointerId) return;
		event.stopPropagation();
		const point = viewport.clientToBoard(event.clientX, event.clientY);
		const key = `stair-${drag.mode}-${drag.origin.id}`;
		if (drag.mode === 'move') {
			const dx = point.x - drag.start.x;
			const dy = point.y - drag.start.y;
			if (!drag.moved && Math.hypot(dx, dy) * k < 4) return;
			drag.moved = true;
			store.updateStair(
				drag.origin.id,
				{
					x: Math.round((drag.origin.x + dx) / 10) * 10,
					y: Math.round((drag.origin.y + dy) / 10) * 10
				},
				{ coalesce: key }
			);
		} else {
			const angle = angleFromHandle({ x: drag.origin.x, y: drag.origin.y }, point);
			drag.moved = true;
			store.updateStair(
				drag.origin.id,
				{ rotation: event.shiftKey ? Math.round(angle) : snapAngle(angle) },
				{ coalesce: key }
			);
		}
	}

	function end(event: PointerEvent): void {
		if (!drag || drag.pointerId !== event.pointerId) return;
		event.stopPropagation();
		if (drag.moved) store.sealHistory();
		drag = null;
	}
</script>

<g data-testid="stair-layer" pointer-events={interactive ? undefined : 'none'}>
	{#each upper as context (context.stair.id)}
		<g data-testid="stairwell" data-stair={context.stair.id} pointer-events="none">
			{#each context.opening as tread, i (i)}
				<polygon
					points={points(tread.polygon)}
					fill="var(--color-fixture)"
					fill-opacity="0.14"
					stroke="var(--color-muted)"
					stroke-width="1"
					stroke-dasharray="5 4"
					vector-effect="non-scaling-stroke"
				/>
			{/each}
			{#each stairwellRailing(context) as edge, i (i)}
				<line
					x1={edge.from.x}
					y1={edge.from.y}
					x2={edge.to.x}
					y2={edge.to.y}
					stroke="var(--color-text)"
					stroke-width="3"
					stroke-linecap="round"
					vector-effect="non-scaling-stroke"
					data-testid="stairwell-railing"
				>
					<title>{t(messages, 'railingLabel')}</title>
				</line>
			{/each}
		</g>
	{/each}

	{#each lower as { stair, context } (stair.id)}
		{@const selected = ui.selectedStairId === stair.id}
		{@const treads = context.layout.treads}
		{@const centres = treads.map((tread) => centroid(tread.polygon))}
		{@const cut = cutLine(context)}
		{@const stroke = selected ? 'var(--color-accent)' : 'var(--color-text)'}
		<g data-testid="stair" data-stair={stair.id} data-selected={selected}>
			{#each treads as tread, i (i)}
				<polygon
					points={points(tread.polygon)}
					fill="var(--color-surface)"
					fill-opacity="0.88"
					{stroke}
					stroke-width={selected ? 1.6 : 1.1}
					stroke-dasharray={cut && i >= cut.above ? '6 4' : undefined}
					stroke-linejoin="round"
					vector-effect="non-scaling-stroke"
					class={interactive ? 'cursor-grab' : ''}
					role="button"
					tabindex="-1"
					aria-label={t(messages, 'stairLabel')}
					onpointerdown={interactive ? (event) => begin(event, stair, 'move') : undefined}
					onpointermove={interactive ? move : undefined}
					onpointerup={interactive ? end : undefined}
					onpointercancel={interactive ? end : undefined}
				/>
			{/each}
			{#if centres.length > 1}
				<polyline
					points={points(centres)}
					fill="none"
					{stroke}
					stroke-width="1.4"
					stroke-linejoin="round"
					vector-effect="non-scaling-stroke"
					pointer-events="none"
				/>
				<polygon
					points={arrow(centres[centres.length - 2], centres[centres.length - 1])}
					fill={stroke}
					pointer-events="none"
				/>
			{/if}
			{#if centres.length > 0}
				<circle cx={centres[0].x} cy={centres[0].y} r={4 * u} fill={stroke} pointer-events="none" />
			{/if}
			{#if cut}
				<line
					x1={cut.line.from.x}
					y1={cut.line.from.y}
					x2={cut.line.to.x}
					y2={cut.line.to.y}
					{stroke}
					stroke-width="2.2"
					stroke-linecap="round"
					vector-effect="non-scaling-stroke"
					pointer-events="none"
					data-testid="stair-cut"
				/>
			{/if}
			{#if interactive && selected}
				{@const handle = handlePosition(stair, 300 + 22 * u)}
				<line
					x1={stair.x}
					y1={stair.y}
					x2={handle.x}
					y2={handle.y}
					stroke="var(--color-accent)"
					stroke-width="1.2"
					vector-effect="non-scaling-stroke"
					pointer-events="none"
				/>
				<circle
					cx={handle.x}
					cy={handle.y}
					r={22 * u}
					fill="transparent"
					class="cursor-grab"
					role="slider"
					tabindex="-1"
					aria-label={t(messages, 'rotateHandle')}
					aria-valuenow={Math.round(stair.rotation)}
					onpointerdown={(event) => begin(event, stair, 'rotate')}
					onpointermove={move}
					onpointerup={end}
					onpointercancel={end}
					data-testid="stair-rotate"
				/>
				<circle
					cx={handle.x}
					cy={handle.y}
					r={9 * u}
					fill="var(--color-accent)"
					stroke="var(--color-surface)"
					stroke-width="2"
					vector-effect="non-scaling-stroke"
					pointer-events="none"
				/>
			{/if}
		</g>
	{/each}
</g>
