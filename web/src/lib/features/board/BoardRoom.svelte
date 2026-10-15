<script lang="ts">
	import { WALL_THICKNESS } from '#lib/core/defaults.ts';
	import { areaMm2, boundingBox, centroid, cornerLabel, walls } from '#lib/core/geometry.ts';
	import { isWallElement, type Room } from '#lib/core/schema.ts';
	import { formatArea, formatLength } from '#lib/core/units.ts';
	import ElementsLayer from '#lib/features/elements/ElementsLayer.svelte';
	import FurnishLayer from '#lib/features/furnish/FurnishLayer.svelte';
	import { floorTint } from '#lib/features/room/colors.ts';
	import { fresh } from '#lib/features/room/fresh.svelte.ts';
	import { locale } from '#lib/i18n/index.svelte.ts';
	import { settings } from '#lib/state/settings.svelte.ts';
	import CornerHandles from './CornerHandles.svelte';
	import SlopeLayer from './SlopeLayer.svelte';
	import { pickLabelAlong, type Span } from './labelSlots.ts';
	import {
		cornerLabelPosition,
		offsetPolygon,
		pathOf,
		wallBandPath,
		wallMiddle,
		wallNormal
	} from './shape.ts';

	interface Props {
		room: Room;
		k: number;
		mode: 'build' | 'furnish';
		selected: boolean;
		focused: boolean;
		dimmed: boolean;
		lifted: boolean;
		shift?: { x: number; y: number };
		elementsInteractive: boolean;
		furnishInteractive: boolean;
		handles: boolean;
	}

	let {
		room,
		k,
		mode,
		selected,
		focused,
		dimmed,
		lifted,
		shift,
		elementsInteractive,
		furnishInteractive,
		handles
	}: Props = $props();

	const u = $derived(1 / k);
	const rot = $derived(room.boardPos.rot);
	const box = $derived(boundingBox(room.polygon));
	const smallest = $derived(Math.min(box.maxX - box.minX, box.maxY - box.minY) * k);
	const emphasised = $derived(selected || focused);
	const showCorners = $derived(mode === 'build' && smallest > (emphasised ? 70 : 150));
	const showLengths = $derived(mode === 'build' && smallest > (emphasised ? 70 : 190));
	const showName = $derived(smallest > 80);
	const floor = $derived(pathOf(room.polygon));
	const tint = $derived(floorTint(room.floorColor));
	const popping = $derived(fresh.roomId === room.id);
	const band = $derived(wallBandPath(room.polygon, WALL_THICKNESS));
	const outline = $derived(pathOf(offsetPolygon(room.polygon, WALL_THICKNESS)));
	const middle = $derived(centroid(room.polygon));
	const sides = $derived(walls(room.polygon));
	const area = $derived(formatArea(areaMm2(room.polygon), locale.language));
	function labelGap(inward: { x: number; y: number }, w: number, h: number): number {
		const rad = (rot * Math.PI) / 180;
		const rx = inward.x * Math.cos(rad) - inward.y * Math.sin(rad);
		const ry = inward.x * Math.sin(rad) + inward.y * Math.cos(rad);
		return 7 + (Math.abs(rx) * w) / 2 + (Math.abs(ry) * h) / 2;
	}
	function alongExtent(direction: { x: number; y: number }, w: number, h: number): number {
		const rad = (rot * Math.PI) / 180;
		const rx = direction.x * Math.cos(rad) - direction.y * Math.sin(rad);
		const ry = direction.x * Math.sin(rad) + direction.y * Math.cos(rad);
		return Math.abs(rx) * w + Math.abs(ry) * h + 8;
	}
	function occupiedSpans(wall: number): Span[] {
		const pad = 10 * u;
		return room.elements.flatMap((element) =>
			isWallElement(element) && element.wall === wall && element.kind !== 'window'
				? [{ from: element.offset - pad, to: element.offset + element.width + pad }]
				: []
		);
	}
	const title = $derived(room.name.length > 24 ? `${room.name.slice(0, 23)}…` : room.name);
</script>

<g
	transform="translate({room.boardPos.x + (shift?.x ?? 0)} {room.boardPos.y +
		(shift?.y ?? 0)}) rotate({rot})"
	opacity={dimmed ? 0.28 : 1}
	class="transition-opacity duration-(--duration-base) ease-soft"
	data-room-id={room.id}
>
	<g class:room-pop={popping}>
		<path d={floor} class="fill-surface" />
		{#if tint}
			<path
				d={floor}
				fill={tint}
				opacity="0.3"
				pointer-events="none"
				class="transition-[fill] duration-(--duration-base) ease-soft"
			/>
		{/if}
		{#if selected}
			<path d={floor} class="fill-accent/7" pointer-events="none" />
		{/if}
		<path
			d={band}
			fill-rule="evenodd"
			style="fill: color-mix(in srgb, var(--color-text) 84%, var(--color-bg))"
			pointer-events="none"
		/>
		{#if selected}
			<path
				d={outline}
				class="fill-none stroke-accent"
				stroke-width={lifted ? 5 : 3}
				stroke-linejoin="round"
				vector-effect="non-scaling-stroke"
				pointer-events="none"
			/>
		{/if}

		<SlopeLayer {room} {k} />
		<ElementsLayer {room} interactive={elementsInteractive} />
		{#if mode === 'furnish'}
			<FurnishLayer {room} interactive={furnishInteractive} />
		{/if}

		{#if showName}
			<g
				transform="translate({middle.x} {middle.y}) rotate({-rot}) scale(1 -1)"
				pointer-events="none"
			>
				<text
					text-anchor="middle"
					y={-u * 2}
					font-size={15 * u}
					font-weight="700"
					class="fill-text stroke-surface [paint-order:stroke]"
					stroke-width={4 * u}
					stroke-linejoin="round"
				>
					{title}
				</text>
				<text
					text-anchor="middle"
					y={u * 16}
					font-size={12 * u}
					font-weight="600"
					class="fill-muted stroke-surface [paint-order:stroke]"
					stroke-width={4 * u}
					stroke-linejoin="round"
				>
					{area}
				</text>
			</g>
		{/if}

		{#if showLengths}
			{#each sides as side, i (i)}
				{#if side.length * k > 90}
					{@const inward = wallNormal(room.polygon, i)}
					{@const label = formatLength(Math.round(side.length), settings.unit, locale.language)}
					{@const gap = labelGap(inward, label.length * 6.8 + 6, 14)}
					{@const along = pickLabelAlong(
						side.length,
						occupiedSpans(i + 1),
						alongExtent(side.direction, label.length * 6.8 + 6, 14) * u
					)}
					{#if along !== null}
						{@const at = {
							x: side.start.x + side.direction.x * along,
							y: side.start.y + side.direction.y * along
						}}
						<g
							transform="translate({at.x + inward.x * gap * u} {at.y +
								inward.y * gap * u}) rotate({-rot}) scale(1 -1)"
							pointer-events="none"
						>
							<text
								text-anchor="middle"
								dominant-baseline="central"
								font-size={12 * u}
								font-weight="600"
								class="fill-muted stroke-surface tabular-nums [paint-order:stroke]"
								stroke-width={4 * u}
								stroke-linejoin="round"
							>
								{label}
							</text>
						</g>
					{/if}
				{/if}
			{/each}
		{/if}

		{#if showCorners}
			{#each room.polygon as _corner, i (i)}
				{@const at = cornerLabelPosition(room.polygon, i, 15 * u)}
				{#if !showName || Math.hypot(at.x - middle.x, at.y - middle.y) * k > 34}
					<g transform="translate({at.x} {at.y}) rotate({-rot}) scale(1 -1)" pointer-events="none">
						<circle r={9.5 * u} class="fill-surface-2 stroke-border" stroke-width={u * 1.2} />
						<text
							text-anchor="middle"
							dominant-baseline="central"
							font-size={11 * u}
							font-weight="700"
							class="fill-muted"
						>
							{cornerLabel(i)}
						</text>
					</g>
				{/if}
			{/each}
			{#each sides as _side, i (i)}
				{@const at = wallMiddle(room.polygon, i)}
				{@const inward = wallNormal(room.polygon, i)}
				<g
					transform="translate({at.x - inward.x * (WALL_THICKNESS + 15 * u)} {at.y -
						inward.y * (WALL_THICKNESS + 15 * u)}) rotate({-rot}) scale(1 -1)"
					pointer-events="none"
				>
					<circle r={9.5 * u} class={emphasised ? 'fill-accent' : 'fill-text'} opacity="0.9" />
					<text
						text-anchor="middle"
						dominant-baseline="central"
						font-size={11 * u}
						font-weight="700"
						class="fill-accent-contrast"
					>
						{i + 1}
					</text>
				</g>
			{/each}
		{/if}

		{#if handles}
			<CornerHandles {room} />
		{/if}
	</g>
</g>

<style>
	.room-pop {
		transform-box: fill-box;
		transform-origin: center;
		animation: room-pop var(--duration-slow) var(--ease-spring) both;
	}
	@keyframes room-pop {
		from {
			opacity: 0;
			transform: scale(0.82);
		}
		60% {
			opacity: 1;
			transform: scale(1.04);
		}
	}
</style>
