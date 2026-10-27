<script lang="ts">
	import { kitchenModuleSpans, kitchenUpperSpans } from '#lib/core/elements.ts';
	import type { RoomElement } from '#lib/core/schema.ts';

	interface Props {
		element: RoomElement;
		w: number;
		d: number;
		px: (n: number) => number;
		hatchId: string;
		suggested: boolean;
		color: string;
	}

	let { element, w, d, px, hatchId, suggested, color }: Props = $props();

	const body = $derived(suggested ? 'none' : 'var(--color-surface)');
	const hatch = $derived(suggested ? 'none' : `url(#${hatchId})`);
	const tint = $derived(suggested ? 'none' : color);

	function tileLines(count: number, size: number): number[] {
		return Array.from({ length: Math.max(0, count - 1) }, (_, i) => ((i + 1) * size) / count);
	}
</script>

{#if element.kind === 'toilet'}
	{@const tank = Math.min(d * 0.3, 200)}
	<rect x={w * 0.06} y={0} width={w * 0.88} height={tank} rx={px(2)} style="fill: {body}" />
	<ellipse
		cx={w / 2}
		cy={tank + (d - tank) / 2}
		rx={w * 0.46}
		ry={(d - tank) / 2}
		style="fill: {body}"
	/>
	<ellipse
		cx={w / 2}
		cy={tank + (d - tank) * 0.52}
		rx={w * 0.3}
		ry={(d - tank) * 0.34}
		fill="none"
	/>
{:else if element.kind === 'washbasin'}
	<rect x={0} y={0} width={w} height={d} rx={px(3)} style="fill: {body}" />
	<ellipse cx={w / 2} cy={d * 0.56} rx={w * 0.34} ry={d * 0.32} fill="none" />
	<circle
		cx={w / 2}
		cy={d * 0.16}
		r={Math.max(px(2.5), Math.min(w, d) * 0.04)}
		style="fill: {tint}"
	/>
{:else if element.kind === 'shower'}
	<rect x={0} y={0} width={w} height={d} style="fill: {body}" />
	<line x1={0} y1={0} x2={w} y2={d} />
	<line x1={0} y1={d} x2={w} y2={0} />
	<circle cx={w / 2} cy={d / 2} r={Math.max(px(3), Math.min(w, d) * 0.05)} style="fill: {body}" />
	{#if element.screen}
		<line x1={0} y1={d} x2={w} y2={d} style="stroke-width: 4" />
	{/if}
{:else if element.kind === 'bathtub'}
	{@const inset = Math.min(w, d) * 0.1}
	<rect x={0} y={0} width={w} height={d} rx={px(4)} style="fill: {body}" />
	<rect
		x={inset}
		y={inset}
		width={w - inset * 2}
		height={d - inset * 2}
		rx={(d - inset * 2) * 0.45}
		fill="none"
	/>
	<circle cx={w - inset * 2.4} cy={d / 2} r={Math.max(px(2.5), d * 0.04)} style="fill: {tint}" />
{:else if element.kind === 'kitchenRun'}
	{@const run = element}
	<rect x={0} y={0} width={w} height={d} style="fill: {body}" />
	{#each kitchenModuleSpans(run) as span (span.module.id)}
		{@const mw = span.to - span.from}
		{@const mx = span.from}
		<line x1={mx} y1={0} x2={mx} y2={d} />
		{#if span.module.kind === 'sink'}
			<rect
				x={mx + mw * 0.12}
				y={d * 0.18}
				width={mw * 0.76}
				height={d * 0.58}
				rx={px(3)}
				fill="none"
			/>
			<circle cx={mx + mw / 2} cy={d * 0.1} r={Math.max(px(2.5), d * 0.03)} style="fill: {tint}" />
		{:else if span.module.kind === 'hob'}
			{@const r = Math.min(mw * 0.2, d * 0.2)}
			{#each [0.28, 0.72] as cx (cx)}
				{#each [0.3, 0.7] as cy (cy)}
					<circle cx={mx + mw * cx} cy={d * cy} {r} fill="none" />
				{/each}
			{/each}
		{:else if span.module.kind === 'tall'}
			<rect x={mx} y={0} width={mw} height={d} style="fill: {hatch}" />
			<line x1={mx} y1={0} x2={mx + mw} y2={d} />
			<line x1={mx} y1={d} x2={mx + mw} y2={0} />
		{:else if span.module.kind === 'dishwasher'}
			<rect
				x={mx + mw * 0.1}
				y={d * 0.12}
				width={mw * 0.8}
				height={d * 0.76}
				fill="none"
				style="stroke-dasharray: 5 3"
			/>
		{:else if span.module.kind === 'table'}
			<rect
				x={mx + mw * 0.06}
				y={d * 0.06}
				width={mw * 0.88}
				height={d * 0.88}
				rx={px(3)}
				fill="none"
			/>
			<line x1={mx + mw * 0.06} y1={d * 0.5} x2={mx + mw * 0.94} y2={d * 0.5} />
		{/if}
	{/each}
	{#if run.upper}
		{#each kitchenUpperSpans(run) as span (span.from)}
			<rect
				x={span.from}
				y={0}
				width={span.to - span.from}
				height={run.upper.depth}
				fill="none"
				style="stroke-dasharray: 7 4"
			/>
		{/each}
	{/if}
{:else if element.kind === 'acWall' || element.kind === 'acFloor'}
	<rect x={0} y={0} width={w} height={d} rx={px(3)} style="fill: {body}" />
	{#each [0.4, 0.58, 0.76] as at (at)}
		<line x1={w * 0.08} y1={d * at} x2={w * 0.92} y2={d * at} />
	{/each}
{:else if element.kind === 'column'}
	{#if element.shape === 'round'}
		<ellipse cx={w / 2} cy={d / 2} rx={w / 2} ry={d / 2} style="fill: {tint}; fill-opacity: 0.55" />
	{:else}
		<rect x={0} y={0} width={w} height={d} style="fill: {tint}; fill-opacity: 0.55" />
	{/if}
{:else if element.kind === 'freeObstacle'}
	<rect x={0} y={0} width={w} height={d} style="fill: {hatch}" />
	<line x1={0} y1={0} x2={w} y2={d} />
	<line x1={0} y1={d} x2={w} y2={0} />
{:else if element.kind === 'fireplace'}
	<rect x={0} y={0} width={w} height={d} style="fill: {body}" />
	<rect
		x={w * 0.18}
		y={d * 0.4}
		width={w * 0.64}
		height={d * 0.6}
		style="fill: {suggested
			? 'none'
			: 'var(--color-danger)'}; fill-opacity: 0.18; stroke: var(--color-danger)"
	/>
	<line x1={0} y1={d} x2={w} y2={d} style="stroke-width: 3" />
{:else if element.kind === 'stove'}
	<rect x={0} y={0} width={w} height={d} rx={px(3)} style="fill: {body}" />
	<circle cx={w / 2} cy={d * 0.55} r={Math.min(w, d) * 0.28} fill="none" />
	<circle
		cx={w / 2}
		cy={d * 0.15}
		r={Math.max(px(2.5), Math.min(w, d) * 0.06)}
		style="fill: {tint}"
	/>
{:else if element.kind === 'tiledStove'}
	<rect x={0} y={0} width={w} height={d} style="fill: {body}" />
	{#each tileLines(Math.max(2, Math.round(w / 200)), w) as x (x)}
		<line x1={x} y1={0} x2={x} y2={d} style="stroke-opacity: 0.55" />
	{/each}
	{#each tileLines(Math.max(2, Math.round(d / 200)), d) as y (y)}
		<line x1={0} y1={y} x2={w} y2={y} style="stroke-opacity: 0.55" />
	{/each}
	<rect
		x={w * 0.3}
		y={d * 0.55}
		width={w * 0.4}
		height={d * 0.45}
		style="fill: {suggested ? 'none' : 'var(--color-surface)'}; stroke: var(--color-danger)"
	/>
{/if}
