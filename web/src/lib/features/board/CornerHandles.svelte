<script lang="ts">
	import { boardToRoom, cornerLabel, interiorAngle, type Vec } from '#lib/core/geometry.ts';
	import type { BoardPos, Point, Room, RoomElement } from '#lib/core/schema.ts';
	import {
		reframeElements,
		remapAfterInsert,
		reframePolygon
	} from '#lib/features/room/polygonEdit.ts';
	import { gridForZoom, snapCorner } from '#lib/features/room/cornerSnap.ts';
	import { polygonProblem } from '#lib/features/room/walls.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { connections } from './connections.svelte.ts';
	import { gesture } from './gesture.svelte.ts';
	import { messages } from './i18n.ts';
	import { wallNormal } from './shape.ts';
	import { getViewport } from './viewport.ts';
	import { thicknessAt } from './wallBands.ts';

	let { room }: { room: Room } = $props();

	const viewport = getViewport();
	const u = $derived(1 / viewport.pxPerMm);
	const rot = $derived(room.boardPos.rot);
	const key = $derived(`corner-${room.id}`);
	const roomLinks = $derived(connections.roomLinks(room.id));

	interface Active {
		pointerId: number;
		index: number;
		polygon: Point[];
		boardPos: BoardPos;
		elements: RoomElement[];
	}

	let active = $state<Active | null>(null);
	let readout = $state<{ at: Vec; text: string; bad: boolean } | null>(null);

	function begin(event: PointerEvent, index: number, polygon: Point[]): void {
		event.stopPropagation();
		event.preventDefault();
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		gesture.active = true;
		active = {
			pointerId: event.pointerId,
			index,
			polygon,
			boardPos: { ...$state.snapshot(room.boardPos) },
			elements: $state.snapshot(room.elements) as RoomElement[]
		};
	}

	function grab(event: PointerEvent, index: number): void {
		begin(event, index, $state.snapshot(room.polygon) as Point[]);
	}

	function insert(event: PointerEvent, wallIndex: number): void {
		const polygon = $state.snapshot(room.polygon) as Point[];
		const a = polygon[wallIndex];
		const b = polygon[(wallIndex + 1) % polygon.length];
		const middle = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
		const next = [...polygon];
		next.splice(wallIndex + 1, 0, middle);
		const along = Math.round(Math.hypot(middle.x - a.x, middle.y - a.y));
		store.mutate(
			(project) => {
				const target = project.rooms.find((candidate) => candidate.id === room.id);
				if (!target) return;
				target.polygon = next;
				target.elements = remapAfterInsert(target.elements, wallIndex + 1, along);
			},
			{ coalesce: key }
		);
		begin(event, wallIndex + 1, next);
	}

	function move(event: PointerEvent): void {
		if (!active || event.pointerId !== active.pointerId) return;
		event.stopPropagation();
		const { index, polygon, boardPos, elements } = active;
		const n = polygon.length;
		const board = viewport.clientToBoard(event.clientX, event.clientY);
		const local = boardToRoom({ boardPos }, board);
		const snapped = snapCorner(local, {
			prev: polygon[(index - 1 + n) % n],
			before: polygon[(index - 2 + n) % n],
			others: polygon.filter((_, i) => i !== index),
			grid: gridForZoom(viewport.pxPerMm, event.altKey),
			angleStep: event.shiftKey ? 15 : 45,
			angleTolerance: event.altKey ? 0 : 6,
			tolerance: 12 / viewport.pxPerMm
		});
		const candidate = polygon.map((p, i) => (i === index ? snapped.point : p));
		const problem = polygonProblem(candidate);
		const angle = Math.round(interiorAngle(candidate as Point[], index) * 10) / 10;
		readout = { at: snapped.point, text: `${angle}°`, bad: problem !== undefined };
		if (problem) return;
		const framed = reframePolygon(boardPos, candidate);
		if (!framed) return;
		store.mutate(
			(project) => {
				const target = project.rooms.find((candidate) => candidate.id === room.id);
				if (!target) return;
				target.elements = reframeElements(elements, boardPos, framed.boardPos);
				target.polygon = framed.polygon;
				target.boardPos = framed.boardPos;
			},
			{ coalesce: key }
		);
	}

	function end(event: PointerEvent): void {
		if (!active || event.pointerId !== active.pointerId) return;
		active = null;
		readout = null;
		gesture.active = false;
		store.sealHistory();
	}
</script>

{#each room.polygon as corner, i (i)}
	{@const next = room.polygon[(i + 1) % room.polygon.length]}
	{@const length = Math.hypot(next.x - corner.x, next.y - corner.y)}
	{@const out = wallNormal(room.polygon, i)}
	{@const thickness = thicknessAt(roomLinks, i + 1, length / 2, 0)}
	{#if length * viewport.pxPerMm > 96}
		<g
			transform="translate({(corner.x + next.x) / 2 - (out.x * thickness) / 2} {(corner.y +
				next.y) /
				2 -
				(out.y * thickness) / 2}) rotate({-rot}) scale(1 -1)"
		>
			<circle
				r={22 * u}
				fill="transparent"
				class="cursor-copy"
				role="button"
				tabindex="-1"
				aria-label={t(messages, 'insertCorner')}
				onpointerdown={(event) => insert(event, i)}
				onpointermove={move}
				onpointerup={end}
				onpointercancel={end}
			/>
			<circle
				r={7.5 * u}
				class="fill-surface stroke-accent"
				stroke-width={1.6 * u}
				pointer-events="none"
			/>
			<path
				d="M{-3.6 * u} 0H{3.6 * u}M0 {-3.6 * u}V{3.6 * u}"
				class="stroke-accent"
				stroke-width={1.6 * u}
				stroke-linecap="round"
				pointer-events="none"
			/>
		</g>
	{/if}
{/each}

{#each room.polygon as corner, i (i)}
	{@const on = active?.index === i}
	<g transform="translate({corner.x} {corner.y}) rotate({-rot}) scale(1 -1)">
		<circle
			r={24 * u}
			fill="transparent"
			class="cursor-move"
			role="button"
			tabindex="-1"
			aria-label={t(messages, 'cornerHandle', { label: cornerLabel(i) })}
			onpointerdown={(event) => grab(event, i)}
			onpointermove={move}
			onpointerup={end}
			onpointercancel={end}
			data-testid="corner-{i}"
		/>
		<circle
			r={(on ? 11 : 8.5) * u}
			class="stroke-accent {on ? 'fill-accent' : 'fill-surface'}"
			stroke-width={2.2 * u}
			pointer-events="none"
		/>
	</g>
{/each}

{#if readout}
	<g
		transform="translate({readout.at.x} {readout.at.y}) rotate({-rot}) scale(1 -1)"
		pointer-events="none"
	>
		<g transform="translate(0 {-34 * u})">
			<rect
				x={-24 * u}
				y={-12 * u}
				width={48 * u}
				height={24 * u}
				rx={12 * u}
				class={readout.bad ? 'fill-danger' : 'fill-text'}
			/>
			<text
				text-anchor="middle"
				dominant-baseline="central"
				font-size={12 * u}
				font-weight="700"
				class="fill-accent-contrast tabular-nums"
			>
				{readout.text}
			</text>
		</g>
	</g>
{/if}
