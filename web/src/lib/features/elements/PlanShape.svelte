<script lang="ts">
	import { WALL_THICKNESS } from '#lib/core/defaults.ts';
	import type { Wall } from '#lib/core/geometry.ts';
	import type { ClearanceZone } from '#lib/core/elements.ts';
	import {
		isFreeElement,
		isWallElement,
		type RoomElement,
		type WallElement
	} from '#lib/core/schema.ts';
	import { elementKindNames } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import FixtureSymbol from './FixtureSymbol.svelte';
	import { kindColor } from './kinds.ts';
	import { freeBounds, localBounds, symbolMetrics, type Bounds } from './shape.ts';

	type Look = 'existing' | 'planned' | 'suggested';

	interface Props {
		element: RoomElement;
		wall?: Wall;
		pxPerMm: number;
		hatchId: string;
		look: Look;
		selected?: boolean;
		warn?: boolean;
		shared?: boolean;
		thickness?: number;
		zone?: ClearanceZone;
		unfit?: boolean;
	}

	let {
		element,
		wall,
		pxPerMm,
		hatchId,
		look,
		selected = false,
		warn = false,
		shared = false,
		thickness = WALL_THICKNESS,
		zone,
		unfit = false
	}: Props = $props();

	const T = $derived(thickness);
	const px = (n: number): number => n / pxPerMm;

	const color = $derived(look === 'suggested' ? 'var(--color-suggested)' : kindColor(element.kind));
	const fillOpacity = $derived(look === 'existing' ? 0.3 : look === 'planned' ? 0.12 : 0.06);
	const dash = $derived(look === 'suggested' ? '6 4' : 'none');
	const strokeWidth = $derived(look === 'planned' ? 1.25 : 1.75);
	const frame = $derived(
		wall ? `translate(${wall.start.x} ${wall.start.y}) rotate(${wall.angleDeg})` : ''
	);
	const angle = $derived(wall?.angleDeg ?? 0);

	const metrics = $derived(symbolMetrics(element, pxPerMm));
	const radius = $derived(metrics.radius);
	const gang = $derived(metrics.gang);
	const total = $derived(metrics.total);

	const bounds = $derived(
		isWallElement(element)
			? localBounds(element, pxPerMm, T)
			: isFreeElement(element)
				? freeBounds(element)
				: undefined
	);
	const zoneColor = $derived(zone?.kind === 'fire' ? 'var(--color-danger)' : 'var(--color-item)');
	const labelVisible = $derived(
		isWallElement(element) && element.width * pxPerMm > 78 && hasLabel(element.kind)
	);

	function hasLabel(kind: RoomElement['kind']): boolean {
		return kind === 'builtin' || kind === 'obstacle' || kind === 'radiator';
	}

	function doorGeometry(door: Extract<WallElement, { kind: 'door' }>) {
		const sx = door.hinge === 'start' ? 1 : -1;
		const sy = door.swing === 'in' ? 1 : -1;
		const hingeX = door.hinge === 'start' ? door.offset : door.offset + door.width;
		return {
			hingeX,
			leafY: sy * door.width,
			arc: `M ${hingeX + sx * door.width} 0 A ${door.width} ${door.width} 0 0 ${sx * sy > 0 ? 1 : 0} ${hingeX} ${sy * door.width}`
		};
	}

	function socketCenters(centerX: number, count: number, size: number): number[] {
		const first = centerX - (size * (count - 1)) / 2;
		return Array.from({ length: count }, (_, i) => first + i * size);
	}
</script>

{#snippet halo(b: Bounds)}
	{@const pad = px(4)}
	<rect
		x={b.x0 - pad}
		y={b.y0 - pad}
		width={b.x1 - b.x0 + pad * 2}
		height={b.y1 - b.y0 + pad * 2}
		rx={px(5)}
		style="fill: {warn
			? 'var(--color-danger)'
			: 'var(--color-accent)'}; fill-opacity: 0.16; stroke: {warn
			? 'var(--color-danger)'
			: 'var(--color-accent)'}; stroke-width: 2.5; stroke-dasharray: none"
	/>
{/snippet}

{#snippet warnOutline(b: Bounds)}
	<rect
		x={b.x0}
		y={b.y0}
		width={b.x1 - b.x0}
		height={b.y1 - b.y0}
		fill="none"
		style="stroke: var(--color-danger); stroke-width: 2; stroke-dasharray: 3 3"
	/>
{/snippet}

{#snippet unfitOutline(b: Bounds)}
	<rect
		x={b.x0 - px(3)}
		y={b.y0 - px(3)}
		width={b.x1 - b.x0 + px(6)}
		height={b.y1 - b.y0 + px(6)}
		fill="none"
		style="stroke: var(--color-warning); stroke-width: 2; stroke-dasharray: 5 3"
		data-unfit
	/>
{/snippet}

<g
	class="shape"
	data-element={element.id}
	data-look={look}
	style="stroke: {color}; stroke-width: {strokeWidth}; stroke-dasharray: {dash}; fill: none"
	opacity={look === 'planned' ? 0.9 : 1}
>
	{#if zone}
		<polygon
			points={zone.shape.map((p) => `${p.x},${p.y}`).join(' ')}
			style="fill: {zoneColor}; fill-opacity: 0.1; stroke: {zoneColor}; stroke-width: 1.5; stroke-dasharray: 7 4"
			data-zone={zone.kind}
		/>
	{/if}
	{#if element.kind === 'ceilingLamp'}
		<g transform="translate({element.x} {element.y})">
			{#if selected}
				<circle
					r={radius + px(5)}
					style="fill: var(--color-accent); fill-opacity: 0.16; stroke: var(--color-accent); stroke-width: 2.5; stroke-dasharray: none"
				/>
			{/if}
			<circle
				r={radius}
				style="fill: var(--color-surface); stroke: {warn ? 'var(--color-danger)' : color}"
			/>
			<circle r={radius * 0.5} fill="none" />
			<line x1={-radius * 0.72} y1={-radius * 0.72} x2={radius * 0.72} y2={radius * 0.72} />
			<line x1={-radius * 0.72} y1={radius * 0.72} x2={radius * 0.72} y2={-radius * 0.72} />
		</g>
	{:else if isFreeElement(element)}
		<g transform="translate({element.x} {element.y}) rotate({element.rotation})">
			{#if selected && bounds}
				{@render halo(bounds)}
			{:else if warn && bounds}
				{@render warnOutline(bounds)}
			{/if}
			{#if unfit && bounds}
				{@render unfitOutline(bounds)}
			{/if}
			<g transform="translate({-element.width / 2} {-element.depth / 2})">
				<FixtureSymbol
					{element}
					w={element.width}
					d={element.depth}
					{px}
					{hatchId}
					suggested={look === 'suggested'}
					{color}
				/>
			</g>
		</g>
	{:else}
		<g transform={frame}>
			{#if selected && bounds}
				{@render halo(bounds)}
			{:else if warn && bounds}
				{@render warnOutline(bounds)}
			{/if}

			{#if unfit && bounds}
				{@render unfitOutline(bounds)}
			{/if}

			{#if element.kind === 'window'}
				<rect
					x={element.offset}
					y={-T}
					width={element.width}
					height={T}
					style="fill: {color}; fill-opacity: {fillOpacity}"
				/>
				{#if element.windowType === 'sliding'}
					<line
						x1={element.offset}
						y1={-T * 0.7}
						x2={element.offset + element.width * 0.6}
						y2={-T * 0.7}
					/>
					<line
						x1={element.offset + element.width * 0.4}
						y1={-T * 0.3}
						x2={element.offset + element.width}
						y2={-T * 0.3}
					/>
				{:else if element.windowType === 'fixed'}
					<line x1={element.offset} y1={-T / 2} x2={element.offset + element.width} y2={-T / 2} />
				{:else}
					<line
						x1={element.offset}
						y1={-T * 0.35}
						x2={element.offset + element.width}
						y2={-T * 0.35}
					/>
					<line
						x1={element.offset}
						y1={-T * 0.65}
						x2={element.offset + element.width}
						y2={-T * 0.65}
					/>
				{/if}
				{#if element.windowType === 'balconyDoor'}
					<line
						x1={element.offset}
						y1={0}
						x2={element.offset + element.width}
						y2={0}
						style="stroke-width: {strokeWidth * 2.2}"
					/>
				{/if}
			{:else if element.kind === 'door'}
				{@const geo = doorGeometry(element)}
				<rect
					x={element.offset}
					y={-T}
					width={element.width}
					height={T}
					style="fill: {color}; fill-opacity: {fillOpacity}"
				/>
				{#if element.swing === 'sliding'}
					<line
						x1={element.offset}
						y1={-T * 0.7}
						x2={element.offset + element.width * 0.6}
						y2={-T * 0.7}
						style="stroke-width: {strokeWidth * 1.6}"
					/>
					<line
						x1={element.offset + element.width * 0.4}
						y1={-T * 0.3}
						x2={element.offset + element.width}
						y2={-T * 0.3}
						style="stroke-width: {strokeWidth * 1.6}"
					/>
				{:else if !shared || element.swing === 'in'}
					<line
						x1={geo.hingeX}
						y1={0}
						x2={geo.hingeX}
						y2={geo.leafY}
						style="stroke-width: {strokeWidth * 1.6}"
					/>
					<path
						d={geo.arc}
						style="stroke-dasharray: {look === 'suggested' ? '6 4' : '4 3'}; stroke-width: 1.25"
					/>
				{/if}
			{:else if element.kind === 'builtin' || element.kind === 'obstacle' || element.kind === 'radiator'}
				{@const depth =
					element.kind === 'radiator' ? Math.max(element.depth, px(5)) : element.depth}
				<rect
					x={element.offset}
					y={0}
					width={element.width}
					height={depth}
					style="fill: {look === 'suggested' ? 'none' : `url(#${hatchId})`}; stroke: {look ===
					'suggested'
						? color
						: 'var(--color-fixture)'}"
				/>
				{#if element.kind === 'obstacle'}
					<line x1={element.offset} y1={0} x2={element.offset + element.width} y2={depth} />
					<line x1={element.offset} y1={depth} x2={element.offset + element.width} y2={0} />
				{/if}
				{#if element.kind === 'builtin'}
					<line
						x1={element.offset + element.width / 2}
						y1={0}
						x2={element.offset + element.width / 2}
						y2={depth}
					/>
				{/if}
			{:else if element.kind === 'socket'}
				{@const c = element.offset + element.width / 2}
				<rect
					x={c - total / 2}
					y={0}
					width={total}
					height={radius * 2}
					rx={radius * 0.45}
					style="fill: var(--color-surface); stroke: {warn ? 'var(--color-danger)' : color}"
				/>
				{#each socketCenters(c, gang, radius * 2) as cx (cx)}
					<circle {cx} cy={radius} r={radius * 0.62} />
					<circle cx={cx - radius * 0.24} cy={radius} r={radius * 0.1} style="fill: {color}" />
					<circle cx={cx + radius * 0.24} cy={radius} r={radius * 0.1} style="fill: {color}" />
				{/each}
				{#if element.usb}
					<rect
						x={c - radius * 0.35}
						y={radius * 2 + px(2)}
						width={radius * 0.7}
						height={radius * 0.5}
						rx={radius * 0.1}
						style="fill: {color}; stroke: none"
					/>
				{/if}
			{:else if element.kind === 'switch'}
				{@const c = element.offset + element.width / 2}
				<circle
					cx={c}
					cy={radius}
					r={radius * 0.95}
					style="fill: var(--color-surface); stroke: {warn ? 'var(--color-danger)' : color}"
				/>
				<line x1={c} y1={radius} x2={c + radius * 0.6} y2={radius * 1.7} />
				<circle cx={c} cy={radius} r={radius * 0.18} style="fill: {color}" />
			{:else if element.kind === 'wallLamp'}
				{@const c = element.offset + element.width / 2}
				<path
					d="M {c - radius} 0 A {radius} {radius} 0 0 0 {c + radius} 0 Z"
					style="fill: var(--color-surface); stroke: {warn ? 'var(--color-danger)' : color}"
				/>
				<line x1={c} y1={radius * 1.25} x2={c} y2={radius * 1.8} />
				<line x1={c - radius * 0.9} y1={radius * 0.95} x2={c - radius * 1.3} y2={radius * 1.35} />
				<line x1={c + radius * 0.9} y1={radius * 0.95} x2={c + radius * 1.3} y2={radius * 1.35} />
			{:else if element.kind === 'dataPort'}
				{@const c = element.offset + element.width / 2}
				<rect
					x={c - radius}
					y={0}
					width={radius * 2}
					height={radius * 2}
					rx={radius * 0.3}
					style="fill: var(--color-surface); stroke: {warn ? 'var(--color-danger)' : color}"
				/>
				{#if element.portType !== 'lan'}
					<path
						d="M {c - radius * 0.5} {radius * 0.45} L {c - radius * 0.5} {radius * 1.55} L {c +
							radius * 0.35} {radius} Z"
						style="fill: {color}; stroke: none"
					/>
				{/if}
				{#if element.portType !== 'tv'}
					<rect
						x={element.portType === 'both' ? c + radius * 0.3 : c - radius * 0.4}
						y={radius * 0.6}
						width={element.portType === 'both' ? radius * 0.4 : radius * 0.8}
						height={radius * 0.8}
						rx={radius * 0.1}
					/>
				{/if}
			{:else if element.kind === 'washbasin' || element.kind === 'toilet' || element.kind === 'shower' || element.kind === 'bathtub' || element.kind === 'kitchenRun' || element.kind === 'acWall'}
				<g transform="translate({element.offset} 0)">
					<FixtureSymbol
						{element}
						w={element.width}
						d={element.depth}
						{px}
						{hatchId}
						suggested={look === 'suggested'}
						{color}
					/>
				</g>
			{/if}

			{#if labelVisible && bounds}
				<g
					transform="translate({(bounds.x0 + bounds.x1) / 2} {(bounds.y0 + bounds.y1) / 2 +
						(bounds.y1 - bounds.y0 < px(16) ? px(12) : 0)}) rotate({-angle}) scale(1 -1)"
				>
					<text
						text-anchor="middle"
						dominant-baseline="central"
						font-size={px(11)}
						style="fill: var(--color-text); stroke: none; font-weight: 600"
					>
						{t(elementKindNames, element.kind)}
					</text>
				</g>
			{/if}
		</g>
	{/if}
</g>

<style>
	.shape :global(*) {
		vector-effect: non-scaling-stroke;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
</style>
